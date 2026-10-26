import { protocol, acceptedMessage, safeURL, validWord, languages } from './core.js';
import { apiBase } from './config.js';

const params = new URLSearchParams(location.hash.slice(1));
const channel = params.get('channel');
let parentOrigin;
try {
  const candidate = params.get('parent');
  parentOrigin = safeURL(candidate).origin;
  if (parentOrigin !== candidate || !/^[a-zA-Z0-9-]{16,80}$/.test(channel || '') || parent === window) throw new Error('Invalid embedding context');
} catch { throw new Error('Invalid embedding context'); }
history.replaceState(null, '', location.pathname);
let active, run = 0;
const reply = data => parent.postMessage({ protocol, channel, ...data }, parentOrigin);
window.addEventListener('message', async event => {
  if (!acceptedMessage(event, parent, parentOrigin, channel)) return;
  const data = event.data;
  if (data.type === 'cancel') { ++run; active?.abort(); return; }
  if (data.type !== 'lookup' || typeof data.id !== 'string' || data.id.length > 80 || !validWord(data.word) || !languages.includes(data.language) || !languages.includes(data.explanationLanguage)) return;
  const current = ++run; active?.abort(); active = new AbortController();
  const controller = active;
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const query = new URLSearchParams({ word: data.word, language: data.language, explanationLanguage: data.explanationLanguage });
    const response = await fetch(`${apiBase}/dictionary/public?${query}`, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: active.signal, cache: 'no-store' });
    if (!response.ok) throw new Error('Unavailable');
    const result = await response.json();
    if (!Array.isArray(result.items)) throw new Error('Invalid response');
    if (current === run) reply({ type: 'result', id: data.id, items: result.items.slice(0, 20).map(item => ({ gloss: String(item.gloss || '').slice(0, 10000) })) });
  } catch {
    if (current === run) reply({ type: 'result', id: data.id, error: 'unavailable' });
  } finally { clearTimeout(timeout); }
});
window.addEventListener('pagehide', () => { ++run; active?.abort(); });
reply({ type: 'ready' });
