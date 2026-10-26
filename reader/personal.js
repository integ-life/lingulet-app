import { canonicalLanguage, validWord } from './core.js';
import { apiBase, loginURL } from './config.js';

// A private dictionary is never embeddable. No message listener or result
// callback exists here. The host can see only that its window was closed.
if (window.top !== window) { document.body.replaceChildren(); throw new Error('Top-level window required'); }
window.opener = null;
const params = new URLSearchParams(location.hash.slice(1));
const word = params.get('word') || '', language = canonicalLanguage(params.get('language') || 'en');
history.replaceState(null, '', location.pathname);
const strings = {
  en: ['Personal dictionary', 'Your saved language and prompt stay in Lingulet. Only this selected word is sent. Sign in in the new tab, then return here and check the session. Close this window to cancel.', 'Sign in to Lingulet', 'Check session', 'Use my language and prompt', 'Sign out of Lingulet', 'Clear / cancel', 'Ready. Your saved profile language and prompt will be used.', 'Sign in required, or session expired.', 'No active profile for this language. Manage profiles in Lingulet.', 'Select a word on the source page first.', 'Loading…', 'Personal translation', 'No translation found.', 'Request failed. Try again.', 'Signed out.', 'Local result cleared. Close this window to cancel.'],
  'zh-CN': ['个人词典', '已保存的语言与 prompt 留在 Lingulet，只发送所选词语。在新标签页登录后，回到这里检查会话。关闭窗口即可取消。', '登录 Lingulet', '检查会话', '使用我的语言与 prompt', '退出 Lingulet', '清除 / 取消', '已就绪，将使用已有 Profile 的语言与 prompt。', '请登录，或会话已过期。', '此语言没有启用的 Profile，请到 Lingulet 管理。', '请先在原页面选择词语。', '加载中…', '个人翻译', '没有翻译结果。', '请求失败，请重试。', '已退出。', '本地结果已清除，关闭窗口即可取消。'],
  id: ['Kamus pribadi', 'Bahasa dan prompt tersimpan tetap di Lingulet. Hanya kata ini yang dikirim. Masuk di tab baru, lalu kembali untuk memeriksa sesi. Tutup jendela untuk batal.', 'Masuk ke Lingulet', 'Periksa sesi', 'Gunakan bahasa dan prompt saya', 'Keluar dari Lingulet', 'Hapus / batal', 'Siap memakai bahasa profil dan prompt tersimpan.', 'Masuk diperlukan atau sesi berakhir.', 'Tidak ada profil aktif untuk bahasa ini.', 'Pilih kata di halaman asal.', 'Memuat…', 'Terjemahan pribadi', 'Terjemahan tidak ditemukan.', 'Permintaan gagal. Coba lagi.', 'Sudah keluar.', 'Hasil lokal dihapus. Tutup jendela untuk batal.'],
  ja: ['個人辞書', '保存した言語とプロンプトは Lingulet 内に留まります。この単語だけを送信します。新しいタブでログイン後、戻ってセッションを確認してください。閉じるとキャンセル。', 'Lingulet にログイン', 'セッションを確認', '自分の言語とプロンプトを使用', 'Lingulet からログアウト', '消去 / キャンセル', '保存されたプロファイルの言語とプロンプトを使用できます。', 'ログインが必要か、セッションが失効しました。', 'この言語の有効なプロファイルがありません。', '元のページで単語を選択してください。', '読み込み中…', '個人翻訳', '翻訳がありません。', '失敗しました。再試行してください。', 'ログアウトしました。', '結果を消去しました。閉じるとキャンセル。'],
};
let copy = strings[canonicalLanguage(navigator.language)] || strings.en;
const $ = id => document.getElementById(id);
let profile, epoch = 0, active;
function renderLabels() {
  for (const [id, index] of [['title', 0], ['privacy', 1], ['login', 2], ['check', 3], ['translate', 4], ['logout', 5], ['clear', 6]]) $(id).textContent = copy[index];
}
renderLabels(); $('word').textContent = word; $('login').href = loginURL;
function clear() { ++epoch; active?.abort(); active = new AbortController(); profile = null; $('result').replaceChildren(); $('translate').hidden = true; $('logout').hidden = true; $('check').disabled = false; $('translate').disabled = false; }
async function api(path, init = {}) {
  const controller = active;
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(`${apiBase}${path}`, { ...init, credentials: 'include', referrerPolicy: 'no-referrer', cache: 'no-store', signal: controller.signal, headers: init.body ? { 'Content-Type': 'application/json' } : {} });
    if (!response.ok) throw Object.assign(new Error('Request failed'), { status: response.status });
    return response.status === 204 ? null : await response.json();
  } finally { clearTimeout(timer); }
}
function failure(error, run) {
  if (run !== epoch) return;
  clear(); $('status').textContent = copy[error.status === 401 ? 8 : 14];
}
async function check() {
  clear(); const run = epoch; $('status').textContent = copy[11]; $('check').disabled = true;
  try {
    const me = await api('/me');
    if (run !== epoch) return;
    const profiles = await api('/profiles');
    if (run !== epoch) return;
    copy = strings[canonicalLanguage(me.preferences?.interfaceLanguage || '')] || copy; renderLabels();
    profile = profiles.items.find(p => p.targetLanguage === language && p.status === 'active');
    $('logout').hidden = false; $('translate').hidden = !profile || !validWord(word);
    $('status').textContent = copy[!validWord(word) ? 10 : profile ? 7 : 9];
  } catch (error) { failure(error, run); }
  finally { if (run === epoch) $('check').disabled = false; }
}
async function translate() {
  if (!profile || !validWord(word)) return;
  // Refresh the session/profile before each request; no private result cache.
  const chosenID = profile.id;
  clear(); const run = epoch; $('status').textContent = copy[11];
  try {
    const me = await api('/me');
    if (run !== epoch) return;
    const profiles = await api('/profiles');
    if (run !== epoch) return;
    const chosen = profiles.items.find(p => p.id === chosenID && p.targetLanguage === language && p.status === 'active');
    if (!chosen) throw new Error('Profile unavailable');
    const resolved = await api(`/profiles/${encodeURIComponent(chosen.id)}/words:resolve`, { method: 'POST', body: JSON.stringify({ language, items: [{ clientTokenId: crypto.randomUUID(), surface: word }] }) });
    if (run !== epoch) return;
    const lexeme = resolved.items?.[0];
    if (!lexeme?.eligible) { if (run === epoch) $('status').textContent = copy[13]; return; }
    const query = new URLSearchParams({ mode: 'personal', profileId: chosen.id, explanationSource: 'profile' });
    const result = await api(`/lexemes/${encodeURIComponent(lexeme.lexemeId)}/senses?${query}`);
    if (run !== epoch) return;
    profile = chosen; copy = strings[canonicalLanguage(me.preferences?.interfaceLanguage || '')] || copy; renderLabels();
    $('translate').hidden = false; $('logout').hidden = false;
    $('status').textContent = `${copy[12]} · ${chosen.explanationLanguage}`;
    for (const item of result.items || []) {
      const p = document.createElement('p');
      p.textContent = [item.gloss, ...(item.examples || []).map(e => `${e.sentence}\n${e.translation}`), ...(item.usageNotes || []), item.memoryTip].filter(Boolean).join('\n');
      $('result').append(p);
    }
    if (!result.items?.length) $('result').textContent = copy[13];
  } catch (error) { failure(error, run); }
}
$('check').onclick = check;
$('translate').onclick = translate;
$('login').onclick = () => { clear(); $('status').textContent = copy[8]; };
$('clear').onclick = () => { clear(); $('status').textContent = copy[16]; };
$('logout').onclick = async () => {
  clear(); const run = epoch; $('status').textContent = copy[11];
  try { await api('/auth/logout', { method: 'POST' }); if (run === epoch) $('status').textContent = copy[15]; }
  catch (error) { failure(error, run); }
};
// Erase private output on tab hiding, navigation and browser history restore.
document.addEventListener('visibilitychange', () => { if (document.hidden) { clear(); $('status').textContent = copy[16]; } });
window.addEventListener('pagehide', clear);
window.addEventListener('pageshow', () => { clear(); $('status').textContent = copy[8]; });
clear(); $('status').textContent = copy[8];
