export const languages = ['en', 'zh-CN', 'id', 'ja', 'es', 'fr', 'de', 'pt-BR', 'it', 'ru', 'vi'];
export const protocol = 'lingulet-reader/v1';
export function canonicalLanguage(value = '') {
  const tag = value.toLowerCase().split('-')[0];
  return ({ zh: 'zh-CN', pt: 'pt-BR' })[tag] || (languages.includes(tag) ? tag : '');
}
export function validWord(word) {
  return typeof word === 'string' && [...word].length <= 128 && /^[\p{L}\p{M}]+(?:[-'’][\p{L}\p{M}]+)*$/u.test(word);
}
export function wordAt(text, offset, language) {
  // DOM offsets are UTF-16 offsets, as are Intl.Segmenter indexes.
  if (typeof Intl.Segmenter !== 'function') return null;
  const parts = (language === 'zh-CN' || language === 'ja')
    ? [...new Intl.Segmenter(language, { granularity: 'word' }).segment(text)].filter(p => p.isWordLike)
    : [...text.matchAll(/[\p{L}\p{M}]+(?:[-'’][\p{L}\p{M}]+)*/gu)].map(p => ({ segment: p[0], index: p.index }));
  return parts.find(p => offset >= p.index && offset < p.index + p.segment.length && validWord(p.segment)) || null;
}
export function safeURL(value) {
  const url = new URL(value);
  if (url.username || url.password || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) throw new TypeError('HTTPS or loopback URL required');
  return url;
}
export function acceptedMessage(event, source, origin, channel) {
  return event.source === source && event.origin === origin && event.data?.protocol === protocol && event.data?.channel === channel;
}
export const excluded = 'a,button,input,textarea,select,option,label,form,summary,[contenteditable]:not([contenteditable="false"]),[role], [tabindex], [onclick], [data-lingulet-ignore], [hidden], [inert], [aria-hidden="true"],script,style,noscript,pre,code,kbd,samp,svg,canvas,iframe,object,embed,video,audio';
