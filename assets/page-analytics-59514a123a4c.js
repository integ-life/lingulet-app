/* global window, location, document */
// Page routes only: user-entered text, account identifiers and URL queries stay local.
(() => {
  if (location.hostname !== 'lang.integ.life' || window.top !== window.self || window.integAnalyticsStarted) return;
  window.integAnalyticsStarted = true;
  const exactPaths = new Set(['/', '/login', '/privacy', '/auth/consume', '/auth/extension', '/auth/mcp', '/onboarding', '/course-preview', '/course-overview', '/english-mastery', '/today', '/learn/course', '/learn/course/placement', '/learn/course/unit', '/learn/course/recall', '/learn/course/reinforcement', '/learn/course/mixed-production', '/generate', '/review', '/word-imports', '/dictionary', '/profiles', '/settings/languages', '/settings/notifications', '/admin']);
  const templates = [
    [/^\/articles\/[^/]+$/, '/articles/:id'],
    [/^\/onboarding\/growth\/[^/]+$/, '/onboarding/growth/:profileId'],
    [/^\/onboarding\/assessment\/[^/]+$/, '/onboarding/assessment/:sessionId'],
    [/^\/foundation\/[^/]+$/, '/foundation/:unitId'],
    [/^\/profiles\/[^/]+\/capability-test\/english$/, '/profiles/:profileId/capability-test/english'],
  ];
  const safePath = () => {
    const path = location.pathname.replace(/\/$/, '') || '/';
    if (exactPaths.has(path)) return path;
    for (const [pattern, template] of templates) if (pattern.test(path)) return template;
    if (/^\/share\/(en|zh-CN|es|fr|de|id|vi|th|ja|ko)\/(en|de|es|fr|id|it|pt-BR|ru|vi|zh-CN)(\/(10|[1-9]))?\/(lesson|capability)(\/index\.html)?$/.test(path)) return path.replace(/\/index\.html$/, '');
    if (/^\/learn\/(en|zh-CN|es|fr|de|id|vi|th|ja|ko)\/(en|de|es|fr|id|it|pt-BR|ru|vi|zh-CN)(\/index\.html)?$/.test(path)) return path.replace(/\/index\.html$/, '');
    return '/not-found';
  };
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  const page = () => ({page_location: `https://lang.integ.life${safePath()}`, page_title: 'Lingulet', page_referrer: ''});
  gtag('js', new Date());
  gtag('config', 'G-9YQMKJLGYB', {...page(), send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false});
  let previous;
  const track = () => {
    if (previous === location.pathname) return;
    previous = location.pathname;
    gtag('set', page());
    gtag('event', 'page_view', {...page(), send_to: 'G-9YQMKJLGYB'});
  };
  for (const method of ['pushState', 'replaceState']) {
    const original = window.history[method];
    window.history[method] = function(...args) { original.apply(this, args); track(); };
  }
  window.addEventListener('popstate', track);
  track();
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://www.googletagmanager.com/gtag/js?id=G-9YQMKJLGYB';
  document.head.append(script);
})();
