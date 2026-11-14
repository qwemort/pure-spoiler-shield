/*!
 * Pure Spoiler Shield — background.
 * - Counts hidden blocks (badge per tab, total for the popup). Nothing about pages is stored.
 * - Everything is free (1.4): no license, no account. The extension makes NO network requests of any kind.
 * - "Every site": when the person pressed the button and granted access to all sites, the same page script
 *   is registered for every site. Without the permission it is removed again.
 */
const api = globalThis.browser && globalThis.browser.runtime ? globalThis.browser : globalThis.chrome;

const MAIN_SITES = ['*://*.youtube.com/*', '*://*.reddit.com/*', '*://*.x.com/*', '*://*.twitter.com/*'];
const EVERYWHERE = { origins: ['<all_urls>'] };
const SCRIPT_ID = 'pss-everywhere';
const DEFAULT_SETTINGS = { enabled: true, comments: true, media: false, offSites: [], pausedUntil: 0, protectUntil: '', everywhere: true,
  shields: [{ id: 'gta6', preset: 'gta6', mode: 'spoilers', action: 'blur', on: true }], hideAI: true, brand: true, trusted: '' };

let queue = Promise.resolve();
function serial(fn) { const p = queue.then(fn, fn); queue = p.catch(() => {}); return p; }

/* ---------------- counter ---------------- */
const tabCounts = new Map();
async function badge(tabId) {
  const n = tabCounts.get(tabId) || 0;
  try {
    await api.action.setBadgeBackgroundColor({ tabId, color: '#F6D860' });   // warm yellow = "armed", same as the window and the site
    if (api.action.setBadgeTextColor) await api.action.setBadgeTextColor({ tabId, color: '#2A2D32' });
    await api.action.setBadgeText({ tabId, text: n ? (n > 999 ? '999+' : String(n)) : '' });
  } catch (e) { /* tab gone */ }
}
/** Monday of the current week (local time) as YYYY-MM-DD: the week counter lives on this device only. */
function weekKey(now) {
  const d = new Date(now || Date.now()); const back = (d.getDay() + 6) % 7;
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate() - back);
  return m.getFullYear() + '-' + String(m.getMonth() + 1).padStart(2, '0') + '-' + String(m.getDate()).padStart(2, '0');
}
function addHidden(tabId, n) {
  n = Math.max(0, Math.min(500, Number(n) || 0));
  if (!n) return;
  if (tabId != null) { tabCounts.set(tabId, (tabCounts.get(tabId) || 0) + n); badge(tabId); }
  serial(async () => {
    const { stats } = await api.storage.local.get('stats');
    const s = Object.assign({ total: 0, since: Date.now() }, stats || {});
    s.total += n;
    const wk = weekKey();
    s.week = s.week && s.week.k === wk && Number.isFinite(s.week.n) ? { k: wk, n: s.week.n + n } : { k: wk, n };
    await api.storage.local.set({ stats: s });
  });
}
api.tabs.onUpdated.addListener((tabId, info) => { if (info.status === 'loading' && tabCounts.has(tabId)) { tabCounts.delete(tabId); badge(tabId); } });
api.tabs.onRemoved.addListener((tabId) => tabCounts.delete(tabId));

/* ---------------- 1.4: Pro is gone — remove what an older version stored ---------------- */
// Old license data is dropped silently; nobody loses anything (every feature is free now).
async function dropOldLicense() {
  try { await api.storage.local.remove('license'); } catch (e) { /* storage unavailable: nothing to clean */ }
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
      try {
        await api.scripting.registerContentScripts([{
          id: MORE_ID, matches: want, js: ['lib/words.js', 'content/sites.js', 'content/shield.js'], css: ['content/shield.css'],
          runAt: 'document_start', allFrames: false, persistAcrossSessions: true
        }]);
      } catch (e) { return { ok: false, error: String((e && e.message) || e).slice(0, 200), sites: 0 }; }   // the window must say so, not show "on"
    }
    return { ok: true, sites: want.length };
  });
}
async function moreStatus() {
  const out = {};
  for (const [k, list] of Object.entries(MORE_SITES)) { try { out[k] = await api.permissions.contains({ origins: [list[0]] }); } catch (e) { out[k] = false; } }
  return out;
}

/* ---------------- every site (optional permission, asked only on the button) ---------------- */
async function hasEverywhere() { try { return await api.permissions.contains(EVERYWHERE); } catch (e) { return false; } }
function syncEverywhere() {
  return serial(async () => {
    const [{ settings }, granted] = await Promise.all([api.storage.local.get('settings'), hasEverywhere()]);
    const want = granted && (settings || {}).everywhere !== false;
    let have = false;
    try { have = (await api.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] })).length > 0; } catch (e) { have = false; }
    if (want && !have) {
      try {
        await api.scripting.registerContentScripts([{
          id: SCRIPT_ID, matches: ['<all_urls>'], excludeMatches: MAIN_SITES.concat(GOOGLE, MORE_SITES.tiktok, MORE_SITES.instagram), js: ['lib/words.js', 'content/sites.js', 'content/shield.js'], css: ['content/shield.css'],
          runAt: 'document_start', allFrames: false, persistAcrossSessions: true
        }]);
      } catch (e) { return { ok: false, error: String((e && e.message) || e).slice(0, 200), active: false }; }
    } else if (!want && have) {
      await api.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] }).catch(() => {});
    }
    return { ok: true, active: want };
  });
}
api.permissions.onAdded.addListener(() => { syncEverywhere(); syncMore(); });
api.permissions.onRemoved.addListener(() => { syncEverywhere(); syncMore(); });
api.storage.onChanged.addListener((c, area) => { if (area === 'local' && ((c.settings && (c.settings.newValue || {}).everywhere !== (c.settings.oldValue || {}).everywhere))) syncEverywhere(); });

async function info() {
  const [granted, { stats }] = await Promise.all([hasEverywhere(), api.storage.local.get('stats')]);
  const wk = weekKey(); const w = stats && stats.week;
  return { ok: true, everywhereGranted: granted, total: (stats && stats.total) || 0, week: w && w.k === wk ? w.n : 0 };
}

/* ---------------- messages ---------------- */
api.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg || sender.id !== api.runtime.id) return false;
  if (msg.type === 'pss:hidden') { addHidden(sender.tab && sender.tab.id, msg.n); return false; }
  const fn = {
    'pss:info': () => info(),
    'pss:sync': () => syncEverywhere(),
    'pss:syncMore': () => syncMore(),
    'pss:moreStatus': async () => ({ ok: true, sites: await moreStatus(), origins: MORE_SITES }),
    'pss:addWords': () => addWords(msg.text),
    'pss:tabCount': async () => ({ ok: true, count: tabCounts.get(msg.tabId) || 0 })
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
  const body = ['**Not a spoiler — Spoiler Blocker hid it by mistake**', '',
    'List: ' + (d.list || '?'), 'Why (match): ' + (d.reason || '?'), 'Site: ' + (d.site || '?'), 'Version: ' + v, '',
    'Text Shield saw (edit or delete it before sending):', '> ' + (d.text || '(paste the title here)')].join('\n');
  /* The report goes to the clipboard of the page, never into the address. GitHub gets a fixed title and a fixed hint (no page text) so an empty form is never a puzzle. */
  let copied = false;
  try { if (tab && tab.id != null) { const r = await api.tabs.sendMessage(tab.id, { type: 'pss:copy', text: body }); copied = !!(r && r.ok); } } catch (e) { copied = false; }
  const hint = copied
    ? 'Paste the report here with Ctrl+V (Cmd+V on Mac). If this box is still empty, the copy did not work: write the site, the list name and the title that was hidden by mistake.'
    : 'Write here: the site, the list name and the title that was hidden by mistake.';
  await api.tabs.create({ url: ISSUES + '?title=' + encodeURIComponent('[wrong blur] report') + '&body=' + encodeURIComponent(hint) }).catch(() => {});
}

api.runtime.onInstalled.addListener(async (d) => {
  makeMenu();
  const { settings } = await api.storage.local.get('settings');
  const merged = Object.assign({}, DEFAULT_SETTINGS, settings || {});
  /* A "protect until" date that had already passed before this update must not switch the whole protection off without a word: it is dropped. */
  const updated = d.reason === 'update' || (d.reason === 'install' && !!settings);   // data already there = an update, even when the browser calls it an install
  if (updated && merged.protectUntil && Date.now() > Date.parse(merged.protectUntil + 'T23:59:59')) merged.protectUntil = '';
  await api.storage.local.set({ settings: merged });
  if (d.reason === 'install' && !settings) api.tabs.create({ url: api.runtime.getURL('welcome.html') }).catch(() => {});   // the greeting is for a first install only, never again on an update
  dropOldLicense();
  syncEverywhere();
  syncMore();
});
api.runtime.onStartup.addListener(() => { makeMenu(); dropOldLicense(); syncEverywhere(); syncMore(); });
