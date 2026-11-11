/*!
 * Pure Spoiler Shield — background.
 * - Counts hidden blocks (badge per tab, total for the popup). Nothing about pages is stored.
 * - Pro license: Gumroad keys or offline signed keys PSPOIL-… (P-256). The only network request of the whole
 *   extension is the Gumroad license check when a key is entered (and a re-check at most every 7 days).
 * - Pro "everywhere": when Pro is on AND the user granted access to all sites (asked only then), the same page
 *   script is registered for every site. Without Pro it is removed again.
 */
const api = globalThis.browser && globalThis.browser.runtime ? globalThis.browser : globalThis.chrome;

/* ============================  CONFIG  ============================ */
const CONFIG = {
  GUMROAD_PRODUCT_ID: 'XiFPwi9TG4xOnCjR96-KeQ==', // Gumroad → product → Content → License key block → product ID
  BUY_URL: 'https://papana8.gumroad.com/l/dihltc', // https://papana8.gumroad.com/l/xxxxx
  BROWSERS_PER_SEAT: 3,
  RECHECK_DAYS: 7,
  DEV_KEY: 'PSPOIL-DEV9-2026-TEST',   // accepted only in a copy you load yourself (unpacked / about:debugging)
  PUBLIC_KEY_JWK: { kty: 'EC', crv: 'P-256', x: '0AFcvF1V67AbQdW7irDU0Cfyq9VHCgVUsPiReYRkJgc', y: 'yxp7snWwUl5LHWUCpT-i4Gtmulj1PAEzlCk6dsgXJuc' }
};
/* ================================================================== */
const MAIN_SITES = ['*://*.youtube.com/*', '*://*.reddit.com/*', '*://*.x.com/*', '*://*.twitter.com/*'];
const EVERYWHERE = { origins: ['<all_urls>'] };
const SCRIPT_ID = 'pss-everywhere';
const DEFAULT_SETTINGS = { enabled: true, comments: true, media: false, offSites: [], pausedUntil: 0, protectUntil: '', everywhere: true,
  shields: [{ id: 'gta6', preset: 'gta6', mode: 'spoilers', action: 'blur', on: true }], hideAI: true, trusted: '' };

let queue = Promise.resolve();
function serial(fn) { const p = queue.then(fn, fn); queue = p.catch(() => {}); return p; }

/* ---------------- counter ---------------- */
const tabCounts = new Map();
async function badge(tabId) {
  const n = tabCounts.get(tabId) || 0;
  try {
    await api.action.setBadgeBackgroundColor({ tabId, color: '#ff3d8b' });
    if (api.action.setBadgeTextColor) await api.action.setBadgeTextColor({ tabId, color: '#ffffff' });
    await api.action.setBadgeText({ tabId, text: n ? (n > 999 ? '999+' : String(n)) : '' });
  } catch (e) { /* tab gone */ }
}
function addHidden(tabId, n) {
  n = Math.max(0, Math.min(500, Number(n) || 0));
  if (!n) return;
  if (tabId != null) { tabCounts.set(tabId, (tabCounts.get(tabId) || 0) + n); badge(tabId); }
  serial(async () => {
    const { stats } = await api.storage.local.get('stats');
    const s = Object.assign({ total: 0, since: Date.now() }, stats || {});
    s.total += n;
    await api.storage.local.set({ stats: s });
  });
}
api.tabs.onUpdated.addListener((tabId, info) => { if (info.status === 'loading' && tabCounts.has(tabId)) { tabCounts.delete(tabId); badge(tabId); } });
api.tabs.onRemoved.addListener((tabId) => tabCounts.delete(tabId));

/* ---------------- license ---------------- */
const EMPTY_LICENSE = { pro: false, source: null, licenseKey: '', label: '', checkedAt: 0 };
async function getLicense() { const { license } = await api.storage.local.get('license'); return Object.assign({}, EMPTY_LICENSE, license || {}); }
const setLicense = (lic) => api.storage.local.set({ license: Object.assign({}, EMPTY_LICENSE, lic) });

let devBuildPromise = null;
function isDevBuild() {
  if (!devBuildPromise) devBuildPromise = Promise.resolve().then(() => api.management.getSelf()).then((s) => !!s && s.installType === 'development').catch(() => false);
  return devBuildPromise;
}
function b64urlToBytes(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64); const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
let publicKeyPromise = null;
const getPublicKey = () => publicKeyPromise || (publicKeyPromise = crypto.subtle.importKey('jwk', CONFIG.PUBLIC_KEY_JWK, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']));

/** PSPOIL-<base64url JSON payload>.<base64url 64-byte signature>; payload {v:1, p:'PureSpoilerShield', i, n, d}. */
async function verifySignedKey(key) {
  const m = /^PSPOIL-([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(key);
  if (!m) return null;
  try {
    const payloadBytes = b64urlToBytes(m[1]); const sig = b64urlToBytes(m[2]);
    if (sig.length !== 64) return null;
    if (!(await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, await getPublicKey(), sig, payloadBytes))) return null;
    const payload = JSON.parse(new TextDecoder().decode(payloadBytes));
    return payload && payload.v === 1 && payload.p === 'PureSpoilerShield' ? payload : null;
  } catch (_) { return null; }
}

async function verifyGumroad(key, increment) {
  if (!CONFIG.GUMROAD_PRODUCT_ID) return { ok: false, definitive: true, error: 'not_setup' };
  const body = new URLSearchParams({ product_id: CONFIG.GUMROAD_PRODUCT_ID, license_key: key, increment_uses_count: increment ? 'true' : 'false' });
  let resp, data;
  try {
    resp = await fetch('https://api.gumroad.com/v2/licenses/verify', { method: 'POST', body, credentials: 'omit', cache: 'no-store' });
    data = await resp.json().catch(() => ({}));
  } catch (_) { return { ok: false, definitive: false, error: 'no_connection' }; }
  if (!data || data.success !== true) {
    const definitive = resp.status >= 400 && resp.status < 500;
    return { ok: false, definitive, error: definitive ? 'not_found' : 'busy' };
  }
  const p = data.purchase || {};
  if (p.refunded || p.chargebacked || p.disputed) return { ok: false, definitive: true, error: 'refunded' };
  const max = CONFIG.BROWSERS_PER_SEAT * Math.max(1, Number(p.quantity) || 1);
  if (increment && typeof data.uses === 'number' && data.uses > max) return { ok: false, definitive: true, error: 'max_activations', max };
  return { ok: true, label: p.email ? String(p.email).replace(/^(.).*(@.*)$/, '$1***$2') : 'Gumroad' };
}

async function activate(rawKey) {
  const key = String(rawKey || '').trim();
  if (!key || key.length > 600) return { ok: false, error: 'paste_first' };
  if (key === CONFIG.DEV_KEY) {
    if (!(await isDevBuild())) return { ok: false, error: 'not_valid' };
    await setLicense({ pro: true, source: 'dev', licenseKey: key, label: 'Developer test key', checkedAt: Date.now() });
  } else if (key.startsWith('PSPOIL-')) {
    const payload = await verifySignedKey(key);
    if (!payload) return { ok: false, error: 'not_valid' };
    await setLicense({ pro: true, source: 'key', licenseKey: key, label: String(payload.n || payload.i || 'License').slice(0, 80), checkedAt: Date.now() });
  } else {
    const g = await verifyGumroad(key, true);
    if (!g.ok) return { ok: false, error: g.error, max: g.max };
    await setLicense({ pro: true, source: 'gumroad', licenseKey: key, label: g.label, checkedAt: Date.now() });
  }
  await syncEverywhere();
  return { ok: true };
}
async function deactivate() { await setLicense(EMPTY_LICENSE); await syncEverywhere(); return { ok: true }; }

/** A hand-edited "pro" flag without a valid key does not stay; Gumroad keys are re-checked at most every 7 days. */
async function revalidate() {
  const lic = await getLicense();
  if (!lic.licenseKey) { if (lic.pro) await setLicense(EMPTY_LICENSE); }
  else if (lic.licenseKey === CONFIG.DEV_KEY) { if (!(await isDevBuild())) await setLicense(EMPTY_LICENSE); }
  else if (lic.licenseKey.startsWith('PSPOIL-')) {
    const ok = !!(await verifySignedKey(lic.licenseKey));
    if (ok !== lic.pro) await setLicense(ok ? Object.assign(lic, { pro: true }) : EMPTY_LICENSE);
  } else if (Date.now() - (lic.checkedAt || 0) > CONFIG.RECHECK_DAYS * 86400000) {
    const g = await verifyGumroad(lic.licenseKey, false);
    if (g.ok) await setLicense(Object.assign(lic, { pro: true, checkedAt: Date.now() }));
    else if (g.definitive) await setLicense(EMPTY_LICENSE);
  }
  await syncEverywhere();
}

/* ---------------- 1.2: Google, TikTok, Instagram — free, after the person allows them in the popup ---------------- */
// Asked only when the person presses the button (optional permission, same as "all sites"): nothing new at install.
const GOOGLE = ['com', 'pl', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'ru', 'com.ua', 'com.tr', 'co.uk', 'ca', 'com.au', 'com.br', 'com.mx', 'co.jp', 'co.kr', 'com.hk', 'com.tw']
  .map((d) => '*://*.google.' + d + '/*');
const MORE_SITES = { google: GOOGLE, tiktok: ['*://*.tiktok.com/*'], instagram: ['*://*.instagram.com/*'] };
const MORE_ID = 'pss-more';
async function grantedMore() {
  const out = [];
  for (const list of Object.values(MORE_SITES)) {
    let ok = false; try { ok = await api.permissions.contains({ origins: [list[0]] }); } catch (e) { ok = false; }
    if (ok) for (const o of list) { let g = false; try { g = await api.permissions.contains({ origins: [o] }); } catch (e) { g = false; } if (g) out.push(o); }
  }
  return out;
}
function syncMore() {
  return serial(async () => {
    const want = await grantedMore();
    let have = [];
    try { const r = await api.scripting.getRegisteredContentScripts({ ids: [MORE_ID] }); have = r.length ? r[0].matches : []; } catch (e) { have = []; }
    if (want.join() === (have || []).join()) return { ok: true, sites: want.length };
    await api.scripting.unregisterContentScripts({ ids: [MORE_ID] }).catch(() => {});
    if (want.length) {
      await api.scripting.registerContentScripts([{
        id: MORE_ID, matches: want, js: ['lib/words.js', 'content/sites.js', 'content/shield.js'], css: ['content/shield.css'],
        runAt: 'document_start', allFrames: false, persistAcrossSessions: true
      }]).catch(() => {});
    }
    return { ok: true, sites: want.length };
  });
}
async function moreStatus() {
  const out = {};
  for (const [k, list] of Object.entries(MORE_SITES)) { try { out[k] = await api.permissions.contains({ origins: [list[0]] }); } catch (e) { out[k] = false; } }
  return out;
}

/* ---------------- Pro: every site ---------------- */
async function hasEverywhere() { try { return await api.permissions.contains(EVERYWHERE); } catch (e) { return false; } }
function syncEverywhere() {
  return serial(async () => {
    const [lic, { settings }, granted] = await Promise.all([getLicense(), api.storage.local.get('settings'), hasEverywhere()]);
    const want = !!lic.pro && granted && (settings || {}).everywhere !== false;
    let have = false;
    try { have = (await api.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] })).length > 0; } catch (e) { have = false; }
    if (want && !have) {
      await api.scripting.registerContentScripts([{
        id: SCRIPT_ID, matches: ['<all_urls>'], excludeMatches: MAIN_SITES.concat(GOOGLE, MORE_SITES.tiktok, MORE_SITES.instagram), js: ['lib/words.js', 'content/sites.js', 'content/shield.js'], css: ['content/shield.css'],
        runAt: 'document_start', allFrames: false, persistAcrossSessions: true
      }]).catch(() => {});
    } else if (!want && have) {
      await api.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] }).catch(() => {});
    }
    return { ok: true, active: want };
  });
}
api.permissions.onAdded.addListener(() => { syncEverywhere(); syncMore(); });
api.permissions.onRemoved.addListener(() => { syncEverywhere(); syncMore(); });
api.storage.onChanged.addListener((c, area) => { if (area === 'local' && (c.license || (c.settings && (c.settings.newValue || {}).everywhere !== (c.settings.oldValue || {}).everywhere))) syncEverywhere(); });

async function info() {
  const [lic, granted, { stats }] = await Promise.all([getLicense(), hasEverywhere(), api.storage.local.get('stats')]);
  return { ok: true, pro: !!lic.pro, source: lic.source, label: lic.label, everywhereGranted: granted, isDev: await isDevBuild(),
    buyConfigured: /^https:\/\//.test(CONFIG.BUY_URL), total: (stats && stats.total) || 0 };
}

/* ---------------- messages ---------------- */
api.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg || sender.id !== api.runtime.id) return false;
  if (msg.type === 'pss:hidden') { addHidden(sender.tab && sender.tab.id, msg.n); return false; }
  const fn = {
    'pss:info': () => info(),
    'pss:activate': () => activate(msg.key),
    'pss:deactivate': () => deactivate(),
    'pss:sync': () => syncEverywhere(),
    'pss:syncMore': () => syncMore(),
    'pss:moreStatus': async () => ({ ok: true, sites: await moreStatus(), origins: MORE_SITES }),
    'pss:addWords': () => addWords(msg.text),
    'pss:tabCount': async () => ({ ok: true, count: tabCounts.get(msg.tabId) || 0 }),
    'pss:buy': async () => {
      if (!/^https:\/\//.test(CONFIG.BUY_URL)) return { ok: false, error: 'checkout_unavailable' };
      await api.tabs.create({ url: CONFIG.BUY_URL }); return { ok: true };
    }
  }[msg.type];
  if (!fn) return false;
  fn().then(reply, (e) => reply({ ok: false, error: 'busy' }));
  return true;
});

/* ---------------- right-click: "Hide “…” as a spoiler" ---------------- */
function makeMenu() {
  try {
    api.contextMenus.removeAll(() => {
      api.contextMenus.create({ id: 'pss-hide', title: api.i18n.getMessage('menu_hide') || 'Hide “%s” as a spoiler', contexts: ['selection'] });
      // 1.2: "Not a spoiler? Report" — opens a GitHub issue the person reads and sends themselves (nothing sent by us)
      api.contextMenus.create({ id: 'pss-wrong', title: api.i18n.getMessage('menu_wrong') || 'Not a spoiler? Report this blur', contexts: ['page', 'link', 'image', 'video'], documentUrlPatterns: ['http://*/*', 'https://*/*'] });
    });
  } catch (e) { /* no menus (Firefox for Android) */ }
}
/** Adds words to the person's own shield (the first one; a new "My words" shield if there is none). */
async function addWords(text) {
  const words = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (words.length < 2) return { ok: false };
  return serial(async () => {
    const { settings } = await api.storage.local.get('settings');
    const s = Object.assign({}, DEFAULT_SETTINGS, settings || {});
    const list = Array.isArray(s.shields) ? s.shields.slice() : DEFAULT_SETTINGS.shields.slice();
    let sh = list.find((x) => !x.preset);
    if (!sh) { sh = { id: 'mine-' + Date.now().toString(36), label: api.i18n.getMessage('my_words') || 'My words', title: '', names: '', words: '', mode: 'everything', action: 'blur', on: true }; list.push(sh); }
    const have = String(sh.words || '').split('\n').filter(Boolean);
    if (!have.some((w) => w.toLowerCase() === words.toLowerCase())) have.push(words);
    sh.words = have.slice(-200).join('\n');
    s.shields = list;
    await api.storage.local.set({ settings: s });
    return { ok: true, shield: sh.id };
  });
}
if (api.contextMenus && api.contextMenus.onClicked) {
  api.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'pss-hide' && info.selectionText) addWords(info.selectionText);
    if (info.menuItemId === 'pss-wrong') reportWrong(tab);
  });
}

const ISSUES = 'https://github.com/qwemort/pure-spoiler-shield/issues/new';
async function reportWrong(tab) {
  let d = {};
  try { d = (tab && tab.id != null ? await api.tabs.sendMessage(tab.id, { type: 'pss:lastVeil' }) : {}) || {}; } catch (e) { d = {}; }
  const v = api.runtime.getManifest().version;
  const title = '[wrong blur] ' + (d.list || 'list') + ' on ' + (d.site || 'site');
  const body = ['**Not a spoiler — Spoiler Shield hid it by mistake**', '',
    'List: ' + (d.list || '?'), 'Why (match): ' + (d.reason || '?'), 'Site: ' + (d.site || '?'), 'Version: ' + v, '',
    'Text Shield saw (edit or delete it before sending):', '> ' + (d.text || '(paste the title here)'), '',
    '_The extension sends nothing by itself. This issue becomes public only when you press "Submit"._'].join('\n');
  await api.tabs.create({ url: ISSUES + '?title=' + encodeURIComponent(title) + '&body=' + encodeURIComponent(body) }).catch(() => {});
}

api.runtime.onInstalled.addListener(async (d) => {
  makeMenu();
  const { settings } = await api.storage.local.get('settings');
  await api.storage.local.set({ settings: Object.assign({}, DEFAULT_SETTINGS, settings || {}) });
  if (d.reason === 'install') api.tabs.create({ url: api.runtime.getURL('welcome.html') }).catch(() => {});
  revalidate();
  syncMore();
});
api.runtime.onStartup.addListener(() => { makeMenu(); revalidate(); syncMore(); });
