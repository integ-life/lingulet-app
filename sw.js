/* global self, caches, fetch, URL, AbortController, setTimeout, clearTimeout, Response */
const CACHE_VERSION = "lingulet-shell-v2";
const scopeRoot = new URL("./", self.registration.scope).href;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_VERSION).then((cache) => cache.add(scopeRoot)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("lingulet-") && key !== CACHE_VERSION).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

function withTimeout(request, milliseconds) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), milliseconds);
  return fetch(request, { signal: controller.signal }).finally(() => clearTimeout(timeout));
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || url.pathname.includes("/api/")) return;

  if (request.mode === "navigate") {
    event.respondWith(withTimeout(request, 3000).then((response) => {
      if (response.ok) caches.open(CACHE_VERSION).then((cache) => cache.put(scopeRoot, response.clone()));
      return response;
    }).catch(async () => (await caches.match(scopeRoot)) || Response.error()));
    return;
  }

  const cacheableAsset = ["script", "style", "image", "font"].includes(request.destination);
  if (!cacheableAsset) return;
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
    if (response.ok && response.type === "basic") caches.open(CACHE_VERSION).then((cache) => cache.put(request, response.clone()));
    return response;
  })));
});
