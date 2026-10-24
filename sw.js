/* global self, caches, fetch, URL, Request, Response, AbortController, setTimeout, clearTimeout */
// Lingulet service worker: an offline app shell plus a bounded cache of the
// current release's static files.
//
// Policy
// - Only same-origin GET requests inside the registration scope are handled.
//   Cross-origin requests (the API at lang-api.integ.life, metrics, fonts) and
//   same-origin /api/, /mcp, release metadata and the worker itself always go
//   to the network untouched, so API, auth and user data are never cached.
// - Navigations are network-first; on network failure (or after a timeout,
//   when a shell is cached) the release's precached index.html is served.
//   Navigation responses are never written at runtime, so the cached shell
//   always matches the release's precached entry files.
// - Scripts and styles under assets/ are content-hashed and cache-first.
//   Images and fonts use a separate per-release cache capped at MAX_MEDIA_ENTRIES.
// - Only status-200 "basic" responses without Cache-Control: no-store are stored;
//   errors, redirects and opaque responses are passed through, never cached.
// - Each release has its own caches. Activation keeps the current release and
//   the previous release's script cache (so an open tab of the previous release
//   can still lazy-load its hashed chunks) and deletes everything else.
// - A new worker activates immediately but the page never reloads itself, so a
//   lesson in progress keeps running; the new release is used on the next load.
//
// scripts/generate-service-worker.mjs replaces the BUILD line at build time.
const BUILD = {"release":"1b2e65dcf8f17f39","entry":"/assets/index-BtZByu76.js","precache":["assets/index-BtZByu76.js","assets/index-CgCgHZR0.css","assets/page-analytics-59514a123a4c.js"]};

const CACHE_PREFIX = "lingulet-";
const RELEASE_CACHE_PREFIX = "lingulet-release-";
const MEDIA_CACHE_PREFIX = "lingulet-media-";
const RELEASE_CACHE = RELEASE_CACHE_PREFIX + BUILD.release;
const MEDIA_CACHE = MEDIA_CACHE_PREFIX + BUILD.release;
const MAX_MEDIA_ENTRIES = 80;
const MAX_REPORTED_URLS = 200;
const NAVIGATION_TIMEOUT_MS = 3000;
const LOADED_ASSETS_MESSAGE = "lingulet:cache-loaded-assets";

const scope = new URL(self.registration.scope);
const shellUrl = new URL("./", scope).href;
const assetsPath = `${scope.pathname}assets/`;
const excludedPaths = [`${scope.pathname}api/`, `${scope.pathname}mcp`, `${scope.pathname}sw.js`, `${scope.pathname}release.json`, `${scope.pathname}build-version.json`];
const mediaExtension = /\.(?:avif|gif|ico|jpe?g|png|svg|webp|woff2?)$/i;
const assetExtension = /\.(?:css|js|mjs)$/i;

/** Which cache, if any, a URL may live in: "navigate", "asset", "media" or null. */
function classifyUrl(url, destination, mode) {
  if (url.origin !== self.location.origin || !url.pathname.startsWith(scope.pathname)) return null;
  if (excludedPaths.some((path) => url.pathname.startsWith(path))) return null;
  if (mode === "navigate") return "navigate";
  // Query strings are cache busters or dynamic requests; hashed files never need them.
  if (url.search) return null;
  if ((destination === "script" || destination === "style") && url.pathname.startsWith(assetsPath)) return "asset";
  if (destination === "image" || destination === "font") return "media";
  return null;
}

function classifyRequest(request) {
  if (request.method !== "GET" || request.headers.has("range")) return null;
  return classifyUrl(new URL(request.url), request.destination, request.mode);
}

/** Classifies a URL the page reports as already loaded (no request destination is known). */
function classifyReportedUrl(value) {
  let url;
  try { url = new URL(value, scope); } catch { return null; }
  if (url.hash) url.hash = "";
  if (assetExtension.test(url.pathname) && url.pathname.startsWith(assetsPath)) return { url, kind: classifyUrl(url, "script", "no-cors") };
  if (mediaExtension.test(url.pathname)) return { url, kind: classifyUrl(url, "image", "no-cors") };
  return null;
}

function isCacheableResponse(response) {
  if (!response || response.status !== 200 || response.type !== "basic") return false;
  const cacheControl = response.headers.get("cache-control") || "";
  const vary = response.headers.get("vary") || "";
  return !/no-store/i.test(cacheControl) && vary.trim() !== "*";
}

function cacheNameFor(kind) {
  return kind === "media" ? MEDIA_CACHE : RELEASE_CACHE;
}

async function trimMediaCache() {
  const cache = await caches.open(MEDIA_CACHE);
  const keys = await cache.keys();
  // Cache keys are returned in insertion order: drop the oldest entries.
  await Promise.all(keys.slice(0, Math.max(0, keys.length - MAX_MEDIA_ENTRIES)).map((key) => cache.delete(key)));
}

async function store(kind, request, copy) {
  const cache = await caches.open(cacheNameFor(kind));
  await cache.put(request, copy);
  if (kind === "media") await trimMediaCache();
}

// Static files are identified by URL alone. Servers send Vary: Origin, and module
// scripts carry an Origin header that precached requests lack, so Vary is ignored.
const matchOptions = { ignoreVary: true };

async function matchCached(request, kind) {
  const current = await (await caches.open(cacheNameFor(kind))).match(request, matchOptions);
  if (current || kind !== "asset") return current;
  // Hashed file names are content-addressed, so a previous release's copy is identical.
  for (const name of await caches.keys()) {
    if (!name.startsWith(RELEASE_CACHE_PREFIX) || name === RELEASE_CACHE) continue;
    const previous = await (await caches.open(name)).match(request, matchOptions);
    if (previous) return previous;
  }
  return undefined;
}

function cachedShell() {
  return caches.open(RELEASE_CACHE).then((cache) => cache.match(shellUrl, matchOptions));
}

/** Network-first navigation that falls back to the cached shell when offline or slow. */
function respondToNavigation(request) {
  return new Promise((resolve) => {
    const controller = new AbortController();
    let settled = false;
    const finish = (response) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(response);
    };
    const serveShell = async (abortNetwork) => {
      const shell = await cachedShell().catch(() => undefined);
      if (!shell || settled) return Boolean(shell);
      if (abortNetwork) controller.abort();
      finish(shell);
      return true;
    };
    // Without a cached shell keep waiting for the network instead of failing a slow load.
    const timer = setTimeout(() => { void serveShell(true); }, NAVIGATION_TIMEOUT_MS);
    fetch(request, { signal: controller.signal }).then(finish, async () => {
      if (!(await serveShell(false))) finish(Response.error());
    });
  });
}

function respondToStaticFile(event, kind) {
  const request = event.request;
  let stored = Promise.resolve();
  const response = matchCached(request, kind).catch(() => undefined).then((cached) => cached || fetch(request).then((network) => {
    if (isCacheableResponse(network)) {
      // Clone synchronously, before the page can start reading the body.
      const copy = network.clone();
      stored = store(kind, request, copy).catch(() => undefined);
    }
    return network;
  }));
  event.respondWith(response);
  event.waitUntil(response.then(() => stored, () => undefined));
}

async function fetchForCache(url, cacheMode) {
  const response = await fetch(new Request(url, { cache: cacheMode, credentials: "same-origin" }));
  if (!isCacheableResponse(response)) throw new Error(`Cannot cache ${url}: ${response.status} ${response.type}`);
  return response;
}

async function precacheRelease() {
  // Bypass the HTTP cache so an index.html from an older release is never pinned.
  const shell = await fetchForCache(shellUrl, "reload");
  if (BUILD.entry && !(await shell.clone().text()).includes(BUILD.entry)) {
    throw new Error("index.html does not belong to this release");
  }
  // Hashed files are immutable, so the HTTP cache copy the page just used is fine.
  const files = await Promise.all(BUILD.precache.map(async (path) => {
    const url = new URL(path, scope).href;
    return [url, await fetchForCache(url, "default")];
  }));
  const cache = await caches.open(RELEASE_CACHE);
  await Promise.all([cache.put(shellUrl, shell), ...files.map(([url, response]) => cache.put(url, response))]);
}

/** Cache names to keep on activation: this release plus the previous release's scripts. */
function cachesToKeep(keys) {
  const keep = new Set([RELEASE_CACHE, MEDIA_CACHE]);
  const previous = keys.filter((key) => key.startsWith(RELEASE_CACHE_PREFIX) && key !== RELEASE_CACHE).pop();
  if (previous) keep.add(previous);
  return keep;
}

async function activateRelease() {
  const keys = await caches.keys();
  const keep = cachesToKeep(keys);
  await Promise.all(keys.filter((key) => key.startsWith(CACHE_PREFIX) && !keep.has(key)).map((key) => caches.delete(key)));
  await self.clients.claim();
}

/** Workers registered before per-release caching reload their pages on takeover; let those tabs close first. */
function replacesLegacyWorker() {
  const active = self.registration.active;
  return Boolean(active && /[?&]v=lingulet-shell-v\d+/.test(active.scriptURL));
}

async function cacheReportedUrls(values) {
  const entries = values.slice(0, MAX_REPORTED_URLS).map((value) => typeof value === "string" ? classifyReportedUrl(value) : null).filter((entry) => entry && entry.kind);
  await Promise.all(entries.map(async ({ url, kind }) => {
    const request = new Request(url.href, { credentials: "same-origin" });
    if (await matchCached(request, kind)) return;
    const response = await fetch(request).catch(() => undefined);
    if (!isCacheableResponse(response)) return;
    await (await caches.open(cacheNameFor(kind))).put(request, response);
  }));
  if (entries.some((entry) => entry.kind === "media")) await trimMediaCache();
}

self.addEventListener("install", (event) => {
  event.waitUntil(precacheRelease().then(() => (replacesLegacyWorker() ? undefined : self.skipWaiting())));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(activateRelease());
});

self.addEventListener("message", (event) => {
  const data = event.data;
  if (!data || data.type !== LOADED_ASSETS_MESSAGE || !Array.isArray(data.urls)) return;
  // Files the page fetched before this worker controlled it, so the first visit works offline.
  event.waitUntil(cacheReportedUrls(data.urls).catch(() => undefined));
});

self.addEventListener("fetch", (event) => {
  const kind = classifyRequest(event.request);
  if (kind === "navigate") event.respondWith(respondToNavigation(event.request));
  else if (kind) respondToStaticFile(event, kind);
});
