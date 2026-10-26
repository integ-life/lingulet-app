// Deployment-controlled only. Never accept an API URL, token or redirect from
// the embedding page, postMessage, query string or fragment.
const local = ['127.0.0.1', 'localhost'].includes(location.hostname);
export const apiBase = local ? 'http://127.0.0.1:8792/api/v1' : 'https://lang-api.integ.life/api/v1';
export const loginURL = local ? 'http://127.0.0.1:8792/test-login' : 'https://lang-api.integ.life/api/v1/auth/integ/start?returnTo=%2Ftoday';
