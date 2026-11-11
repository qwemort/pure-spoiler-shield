// Pure Spoiler Shield — end-to-end test in a real Chromium with the extension loaded.
//   python3 spoilershield/tools/build.py && node spoilershield/tests/ss-test.mjs
// Test pages copy the structure of YouTube / Reddit / X / Google (tests/site); hosts *.test point to a local server.
// The test build runs the page script on *.test and has access to all sites (a headless browser cannot answer
// permission prompts). The store package keeps the real sites only (build.py checks that).
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path'; import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = path.join(ROOT, 'tests', 'site');
const EXT = fs.mkdtempSync(path.join(os.tmpdir(), 'ss-ext-'));
fs.cpSync(path.join(ROOT, 'release', 'chrome'), EXT, { recursive: true });
const man = JSON.parse(fs.readFileSync(path.join(EXT, 'manifest.json'), 'utf8'));
man.content_scripts[0].matches = ['*://*.youtube.test/*', '*://*.reddit.test/*', '*://*.x.test/*'];
man.host_permissions.push('<all_urls>');
fs.writeFileSync(path.join(EXT, 'manifest.json'), JSON.stringify(man));

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://' + req.headers.host); const h = u.hostname;
  let f = 'news.html';
  if (h.includes('youtube')) f = u.pathname.startsWith('/watch') ? (u.searchParams.get('v') === '9' ? 'yt-watch-normal.html' : 'yt-watch.html') : 'yt-home.html';
  else if (h.includes('reddit')) f = u.pathname.includes('/comments/') ? 'reddit-post.html' : 'reddit.html';
  else if (h.includes('x.test')) f = 'x.html';
  else if (h.includes('google')) f = 'google.html';
  else if (h.includes('tiktok')) f = u.pathname.includes('/video/') ? 'tiktok-video.html' : 'tiktok-search.html';
  else if (h.includes('instagram')) f = 'instagram.html';
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); res.end(fs.readFileSync(path.join(SITE, f)));
}).listen(0, '127.0.0.1');
await new Promise((r) => server.once('listening', r));
const P = server.address().port;
const url = (host, p = '/') => `http://${host}:${P}${p}`;

let pass = 0, fail = 0;
const ok = (c, n, x) => { if (c) { pass++; console.log('  ok  ' + n); } else { fail++; console.log('  FAIL ' + n + (x !== undefined ? '  → ' + JSON.stringify(x).slice(0, 300) : '')); } };

const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'ss-p-')), {
  channel: 'chromium', headless: true, viewport: { width: 1100, height: 900 },
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, '--host-resolver-rules=MAP *.test 127.0.0.1']
});
const errors = [];
ctx.on('page', (pg) => pg.on('pageerror', (e) => errors.push(pg.url().slice(0, 60) + ': ' + e.message)));
let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
const ID = sw.url().split('/')[2];
await new Promise((r) => setTimeout(r, 800));
let welcome;
for (let i = 0; i < 40 && !welcome; i++) { welcome = ctx.pages().find((p) => p.url().includes('welcome.html')); if (!welcome) await new Promise((r) => setTimeout(r, 200)); }
ok(!!welcome, 'welcome page opens on install');
const ext = await ctx.newPage(); await ext.goto(`chrome-extension://${ID}/popup.html`);
const setSettings = (patch) => ext.evaluate(async (p) => { const { settings } = await chrome.storage.local.get('settings'); await chrome.storage.local.set({ settings: Object.assign({}, settings, p) }); }, patch);
const GTA = (p) => Object.assign({ id: 'gta6', preset: 'gta6', mode: 'spoilers', action: 'blur', on: true }, p || {});
const setShields = (list) => setSettings({ shields: list });
const getSettings = async () => (await ext.evaluate(() => chrome.storage.local.get('settings'))).settings;
const veiled = (page, sel) => page.$eval(sel, (e) => e.classList.contains('pss-veil')).catch(() => 'missing');
const gone = (page, sel) => page.$eval(sel, (e) => getComputedStyle(e).display === 'none');
const label = (page, sel) => page.$eval(sel, (e) => e.dataset.pssLabel || '');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

console.log('1. YouTube home, "spoilers only"');
const yt = await ctx.newPage(); await yt.goto(url('www.youtube.test')); await wait(700);
ok(await veiled(yt, '#v1') === true, 'GTA 6 ENDING EXPLAINED is hidden');
ok(await veiled(yt, '#v2') === false, 'GTA 6 trailer reaction stays (spoilers only)');
ok(await veiled(yt, '#v3') === false, 'pasta stays');
ok(await veiled(yt, '#v4') === false, '"Jason Momoa … ending" stays (not the game)');
ok(await veiled(yt, '#v5') === true, '"gta6 leaked cutscene" split over spans is hidden');
ok(await veiled(yt, '#v7') === true, 'spoiler only in the thumbnail label (aria-label) is hidden');
ok(await veiled(yt, '#v6') === true, 'card added later (infinite scroll) is hidden');
ok((await label(yt, '#v1')).includes('Hidden · GTA VI'), 'label names the shield', await label(yt, '#v1'));
ok(await yt.$eval('#v1', (e) => e.getAttribute('aria-hidden')) === 'true', 'veiled card is hidden from screen readers too');
ok(await gone(yt, '#s1') === true && await gone(yt, '#s2') === true && await gone(yt, '#s3') === false, '1.2: search suggestions naming the title hidden (any), "pasta recipe" stays');
const blur = await yt.$eval('#v1', (e) => getComputedStyle(e, '::after').backdropFilter);
ok(/blur/.test(blur), 'the veil really blurs (backdrop-filter)', blur);
// link under the veil must not open; first click arms, second shows
await yt.click('#v1'); await wait(100);
ok(yt.url() === url('www.youtube.test'), 'click on the veil does not open the video');
ok((await label(yt, '#v1')).startsWith('Click again'), 'first click asks to confirm', await label(yt, '#v1'));
await yt.click('#v1'); await wait(100);
ok(await veiled(yt, '#v1') === false, 'second click shows it');
await yt.evaluate(() => window.recycle()); await wait(300);
ok(await veiled(yt, '#v1') === false, 'recycled card with new harmless content stays visible');
await yt.evaluate(() => { const a = document.querySelector('#v3 #video-title'); a.textContent = 'GTA VI who dies at the end'; }); await wait(300);
ok(await veiled(yt, '#v3') === true, 'card whose text changes into a spoiler gets hidden');

console.log('2. "Everything about GTA VI" and own words');
await setShields([GTA({ mode: 'everything' })]); await wait(500);
ok(await veiled(yt, '#v2') === true, 'everything mode: trailer reaction hidden too');
ok(await gone(yt, '#s2') === true, 'everything mode: "gta 6 release date pc" suggestion hidden');
ok(await veiled(yt, '#v4') === false, 'everything mode: Jason Momoa still fine');
await setShields([GTA()]); await wait(500);
ok(await veiled(yt, '#v2') === false, 'back to spoilers only: trailer visible again');
ok(await yt.$eval('#v2', (e) => e.getAttribute('aria-hidden')) !== 'true', 'shown again: screen-reader state restored');

console.log('2b. Own shields, free limit, right-click words, "hide completely"');
const setTitle = (sel, text) => yt.evaluate(([q, v]) => { document.querySelector(q + ' #video-title').textContent = v; }, [sel, text]);
await setTitle('#v3', 'Severance season 2 finale explained'); await wait(300);
ok(await veiled(yt, '#v3') === false, 'without a shield, Severance finale stays');
await setShields([GTA(), { id: 'own-1', title: 'Severance, Разделение', names: 'Helly', mode: 'spoilers', action: 'blur', on: true }]); await wait(500);
ok(await veiled(yt, '#v3') === true && (await label(yt, '#v3')).includes('Severance'), 'own shield (free) hides "Severance … finale", label names it', await label(yt, '#v3'));
const OWN = (i, title) => ({ id: 'own-' + i, title, names: '', mode: 'everything', action: 'blur', on: true });
await setTitle('#v3', 'Pluribus episode 5 trailer'); await wait(300);
await setShields([GTA(), OWN(1, 'Severance'), OWN(2, 'Pluribus')]); await wait(500);
ok(await veiled(yt, '#v3') === true, 'free 1.1: second own title works');
await setTitle('#v3', 'Andor rewatch'); await wait(300);
await setShields([GTA(), OWN(1, 'Severance'), OWN(2, 'Pluribus'), OWN(3, 'Silo'), OWN(4, 'Andor')]); await wait(500);
ok(await veiled(yt, '#v3') === false, 'free: the 4th own title does not work (Pro)');
await setTitle('#v3', 'House of the Dragon season 3 finale: Rhaenyra'); await wait(300);
await setShields([GTA(), { id: 'house-dragon', preset: 'house-dragon', mode: 'spoilers', action: 'blur', on: true }]); await wait(500);
ok(await veiled(yt, '#v3') === true, 'free 1.1: ready lists work without Pro');
ok(await veiled(yt, '#v8') === true, 'spoiler from any channel is hidden (no trusted list in free)');
await setShields([GTA()]); await wait(300);
await setTitle('#v3', 'Best risotto in town'); await wait(300);
const aw = await ext.evaluate(() => chrome.runtime.sendMessage({ type: 'pss:addWords', text: 'risotto' }));
await wait(500);
const sAfter = await getSettings();
ok(aw && aw.ok && sAfter.shields.some((x) => !x.preset && /risotto/.test(x.words)), 'right-click "Hide as spoiler" adds the word to an own shield', [aw, sAfter.shields]);
ok(await veiled(yt, '#v3') === true, 'the right-click word is hidden at once');
await setTitle('#v3', 'How to cook pasta in 10 minutes');
await setShields([GTA({ action: 'remove' })]); await wait(500);
ok(await gone(yt, '#v1') === false, 'a card you already opened is not removed');
await setTitle('#v2', 'GTA 6 ending leaked'); await wait(400);
ok(await gone(yt, '#v2') === true, '"hide completely": spoiler card removed from the page');
await setTitle('#v2', 'GTA 6 trailer 3 reaction'); await wait(400);
ok(await gone(yt, '#v2') === false, 'removed card comes back when its text becomes harmless');
await setShields([GTA()]); await wait(400);

console.log('3. Pause, off on this site, main switch');
await setSettings({ pausedUntil: Date.now() + 600000 }); await wait(400);
ok((await yt.$$('.pss-veil')).length === 0, 'pause: everything visible');
await setSettings({ pausedUntil: 0 }); await wait(400);
ok(await veiled(yt, '#v5') === true, 'resume: hidden again');
await setSettings({ offSites: ['youtube'] }); await wait(400);
ok((await yt.$$('.pss-veil')).length === 0, 'off on YouTube: nothing hidden there');
await setSettings({ offSites: [] }); await setSettings({ enabled: false }); await wait(400);
ok((await yt.$$('.pss-veil, .pss-gone')).length === 0, 'main switch off: nothing hidden');
await setSettings({ enabled: true }); await wait(400);

console.log('4. YouTube watch page: player, title, comments');
const w = await ctx.newPage(); await w.goto(url('www.youtube.test', '/watch?v=1')); await wait(700);
ok(await veiled(w, '#player-container-outer') === true, 'spoiler video: player hidden');
ok((await label(w, '#player-container-outer')).includes('This video may spoil'), 'player label');
ok(await veiled(w, 'ytd-watch-metadata') === true, 'title hidden too');
ok(await w.$eval('#comments', (e) => e.classList.contains('pss-fold')), 'comments folded on a GTA video');
ok(await w.$eval('#c2', (e) => e.getClientRects().length === 0), 'folded comments are not shown');
await w.click('#comments'); await w.click('#comments'); await wait(200);
ok(!(await w.$eval('#comments', (e) => e.classList.contains('pss-fold'))), 'two clicks open the comments');
ok(await veiled(w, '#c1') === true, 'but "Jason dies at the end" is still hidden (GTA page context)');
ok(await veiled(w, '#c2') === false, 'normal comment visible');
await w.click('#player-container-outer'); await w.click('#player-container-outer'); await wait(200);
ok(await veiled(w, '#player-container-outer') === false && await veiled(w, 'ytd-watch-metadata') === false, 'two clicks show the video and title');
const n = await ctx.newPage(); await n.goto(url('www.youtube.test', '/watch?v=9')); await wait(600);
ok(await veiled(n, '#player-container-outer') === false, 'normal video: player visible');
ok(!(await n.$eval('#comments', (e) => e.classList.contains('pss-fold'))), 'normal video: comments not folded');
ok(await veiled(n, '#c2') === true, 'normal video: a GTA spoiler comment is still hidden');
await setSettings({ comments: false }); await w.reload(); await wait(600);
ok(!(await w.$eval('#comments', (e) => e.classList.contains('pss-fold'))), 'setting off: comments not folded');
await setSettings({ comments: true });

console.log('5. Reddit and X');
const r = await ctx.newPage(); await r.goto(url('www.reddit.test')); await wait(600);
ok(await veiled(r, '#p1') === true && await veiled(r, '#p2') === false, 'Reddit: spoiler post hidden, other stays');
await setSettings({ media: true }); await wait(400);
ok(await veiled(yt, '#logo') === false && await yt.$eval('#logoimg', (e) => !e.closest('.pss-veil')), 'pictures on: the site logo is never covered (1.1)');
await setSettings({ media: false }); await wait(300);
ok(await veiled(r, '#p3') === true, 'Reddit: Russian "ГТА 6 концовка" hidden');
const rp = await ctx.newPage(); await rp.goto(url('www.reddit.test', '/r/GTA6/comments/9/')); await wait(600);
ok(await rp.$eval('#tree', (e) => e.classList.contains('pss-fold')), 'Reddit post about the game: comment tree folded');
await rp.click('#tree'); await rp.click('#tree'); await wait(200);
ok(await veiled(rp, '#c1 [slot="comment"]') === true && await veiled(rp, '#c2 [slot="comment"]') === false, 'Reddit: "who betrays Jason" hidden after opening, "looks great" visible');
const x = await ctx.newPage(); await x.goto(url('x.test', '/home')); await wait(600);
ok(await veiled(x, '#t1') === true && await veiled(x, '#t2') === false, 'X: spoiler post hidden, other stays');
ok(await gone(x, '#tr1') === true && await gone(x, '#tr2') === false, 'X: trend "GTA 6 ending" removed, other trend stays');

await setSettings({ media: true }); await wait(300);
await rp.evaluate(() => { const p = document.createElement('shreddit-post'); p.setAttribute('post-title', 'Look at this screenshot'); const a = document.createElement('a'); a.id = 'pic'; a.href = '#'; const i = document.createElement('img'); i.width = 200; i.height = 120; i.src = 'data:image/gif;base64,R0lGODlhAQABAAAAACw='; a.appendChild(i); p.appendChild(a); document.body.appendChild(p);
  const b = document.createElement('a'); b.id = 'pic2'; b.href = '#'; const j = document.createElement('img'); j.width = 200; j.height = 120; j.src = i.src; b.appendChild(j); document.body.appendChild(b); }); await wait(400);
ok(await veiled(rp, '#pic') === true, 'pictures toggle: a post picture on a page about the game is blurred');
ok(await veiled(rp, '#pic2') === false, '1.2: a picture outside posts (menus, panels) stays');
await setSettings({ media: false });

console.log('6. Counter');
await wait(600);
const total = (await ext.evaluate(() => chrome.storage.local.get('stats'))).stats.total;
ok(total >= 10, 'total counter counts hidden blocks', total);
const tabs = await ext.evaluate(async () => (await chrome.tabs.query({})).map((t) => [t.id, t.url]));
const ytId = tabs.find((t) => t[1] === url('www.youtube.test'))[0];
const badge = await ext.evaluate((id) => chrome.action.getBadgeText({ tabId: id }), ytId);
ok(Number(badge) > 0, 'badge on the YouTube tab shows a number', badge);

console.log('7. Pro: not on other sites before Pro, everywhere after');
const g = await ctx.newPage(); await g.goto(url('www.google.test', '/search?q=gta+6')); await wait(500);
ok((await g.$$('.pss-veil, .pss-gone')).length === 0, 'free: Google is not touched');
const act = await ext.evaluate(() => chrome.runtime.sendMessage({ type: 'pss:activate', key: 'PSPOIL-DEV9-2026-TEST' }));
ok(act.ok, 'dev key activates Pro in a test copy', act);
const bad = await ext.evaluate(() => chrome.runtime.sendMessage({ type: 'pss:activate', key: 'PSPOIL-abc.def' }));
ok(!bad.ok && bad.error === 'not_valid', 'fake offline key refused', bad);
const keys = fs.existsSync(path.join(ROOT, 'tools', 'keys.json')) ? JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'keys.json'), 'utf8')) : null;
if (keys) {
  const signed = await ext.evaluate(async (jwk) => {
    const k = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    const b = new TextEncoder().encode(JSON.stringify({ v: 1, p: 'PureSpoilerShield', i: 'test1', n: 'tester', d: '2026-10-31' }));
    const s = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, k, b);
    const u = (x) => btoa(String.fromCharCode(...new Uint8Array(x))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return 'PSPOIL-' + u(b) + '.' + u(s);
  }, keys.private);
  const r2 = await ext.evaluate((k) => chrome.runtime.sendMessage({ type: 'pss:activate', key: k }), signed);
  ok(r2.ok, 'offline signed key (from keygen) activates Pro', r2);
  const info = await ext.evaluate(() => chrome.runtime.sendMessage({ type: 'pss:info' }));
  ok(info.pro && info.label === 'tester', 'license label = name from the key', info);
} else console.log('  SKIP signed key (tools/keys.json missing)');
await setTitle('#v3', 'House of the Dragon season 3 finale: Rhaenyra');
await setShields([GTA(), { id: 'own-1', title: 'Severance', names: '', mode: 'spoilers', action: 'blur', on: true }, { id: 'own-2', title: 'Pluribus', names: '', mode: 'everything', action: 'blur', on: true }, { id: 'house-dragon', preset: 'house-dragon', mode: 'spoilers', action: 'blur', on: true }]); await wait(600);
ok(await veiled(yt, '#v3') === true, 'Pro: ready list House of the Dragon works');
await setShields([GTA(), OWN(1, 'Severance'), OWN(2, 'Pluribus'), OWN(3, 'Silo'), OWN(4, 'Andor')]); await setTitle('#v3', 'Andor rewatch'); await wait(500);
ok(await veiled(yt, '#v3') === true, 'Pro: the 4th own title works');
await setSettings({ trusted: '@TrustedGuy' }); await wait(500);
ok(await veiled(yt, '#v8') === false && await veiled(yt, '#v5') === true, 'Pro trusted: a channel you trust is not hidden, others are');
await setSettings({ trusted: '' }); await wait(400);
ok(await veiled(yt, '#v8') === true, 'trusted list emptied: hidden again');
await setTitle('#v3', 'One Piece episode 1150 review');
await setShields([GTA(), { id: 'one-piece', preset: 'one-piece', mode: 'everything', action: 'blur', on: true, upTo: 1190 }]); await wait(500);
ok(await veiled(yt, '#v3') === false, 'Pro "watched up to 1190": episode 1150 shown');
await setTitle('#v3', 'Ван Пис 1197 — разбор'); await wait(400);
ok(await veiled(yt, '#v3') === true, 'Pro "watched up to 1190": 1197 hidden');
await setTitle('#v3', 'How to cook pasta in 10 minutes'); await setShields([GTA()]); await wait(300);
await ext.evaluate(() => chrome.runtime.sendMessage({ type: 'pss:sync' }));
const reg = await ext.evaluate(() => chrome.scripting.getRegisteredContentScripts());
ok(reg.some((x) => x.id === 'pss-everywhere' && x.matches[0] === '<all_urls>'), 'Pro + permission: page script registered for every site', reg.map((x) => x.id));
await g.reload(); await wait(700);
ok(await veiled(g, '#r1') === true && await veiled(g, '#r2') === false, 'Pro: Google result with spoiler hidden, price guide stays');
ok(await veiled(g, '#r3') === false && await veiled(g, '#r3a') === true && await veiled(g, '#r3b') === false, 'a box of several results is not covered whole — only the spoiler inside');
ok(await veiled(g, '#r4') === false, '"(no spoilers)" result stays');
ok(await veiled(g, '#ai1') === true, 'Pro: the AI Overview about the game is hidden');
await setSettings({ hideAI: false }); await wait(500);
ok(await veiled(g, '#ai1') === false, 'AI summaries switch off: shown');
await setSettings({ hideAI: true });
ok(await gone(g, '#gs1') === true && await gone(g, '#gs2') === true, 'Pro: Google suggestions naming the title removed (1.2)');
const news = await ctx.newPage(); await news.goto(url('news.test')); await wait(700);
ok(await veiled(news, '#a1') === true && await veiled(news, '#a2') === false, 'Pro: any site — article about the ending hidden, football stays');
ok(await veiled(news, '#cm1') === true && await veiled(news, '#cm2') === false, 'Pro: any site — spoiler comment hidden');
await setSettings({ protectUntil: '2020-01-01' }); await wait(500);
ok((await news.$$('.pss-veil')).length === 0, 'Pro "protect until" date passed: protection off');
await setSettings({ protectUntil: '' }); await wait(400);
await ext.evaluate(() => chrome.runtime.sendMessage({ type: 'pss:deactivate' }));
const reg2 = await ext.evaluate(() => chrome.scripting.getRegisteredContentScripts());
ok(!reg2.some((x) => x.id === 'pss-everywhere') && reg2.some((x) => x.id === 'pss-more'), 'license removed: every-site script removed (free Google/TikTok/Instagram stays)', reg2.map((x) => x.id));

console.log('8. Popup');
await ext.reload(); await wait(400);
ok(Number((await ext.locator('#total').textContent()).replace(/\D/g, '')) >= 10, 'popup shows the total');
ok((await ext.locator('#totalLabel').textContent()) === 'spoilers hidden', 'plural label');
ok(await ext.locator('.ss-shield').count() === 1 && (await ext.locator('.ss-shield-name').first().textContent()) === 'GTA VI', 'popup lists the GTA VI shield');
ok(await ext.locator('.ss-shield select').count() === 1 && await ext.locator('.ss-shield select').first().locator('option').count() === 3, 'popup: one level select with three levels, the rest is hidden');
ok(!(await ext.locator('#adv').evaluate((d) => d.open)), 'popup: rarely needed settings sit under Advanced (closed)');
await ext.locator('#adv > summary').click(); await wait(100);
ok(await ext.locator('#pauseBtn').isVisible(), 'popup: Advanced opens and shows pause');
await ext.locator('.ss-shield select').first().selectOption('light'); await wait(200);
ok((await getSettings()).shields[0].mode === 'light', 'popup: light level saves');
ok((await ext.locator('.ss-shield .ss-hint').first().textContent()).length > 10, 'popup: level has a plain-words caption');
await ext.locator('.ss-shield select').first().selectOption('everything'); await wait(200);
ok((await getSettings()).shields[0].mode === 'everything', 'popup: shield mode saves');
await ext.locator('.ss-shield .ss-mini').first().click(); await wait(150);
await ext.locator('.ss-shield select').nth(1).selectOption('remove'); await wait(200);
ok((await getSettings()).shields[0].action === 'remove', 'popup: shield action saves');
await setShields([GTA()]); await ext.reload(); await wait(400);
await ext.click('#addBtn'); await ext.fill('#libSearch', 'fri'); await wait(100);
ok(await ext.locator('#libList button').count() === 1 && (await ext.locator('#libList button').textContent()).includes('Frieren') && !(await ext.locator('#libList button').textContent()).includes('PRO'), 'popup: search finds Frieren, no PRO badge (free 1.1)');
await ext.locator('#libList button').click(); await wait(150);
let sh = (await getSettings()).shields;
ok(sh.length === 2 && sh[1].preset === 'frieren' && sh[1].mode === 'everything', 'free: ready list added; anime starts at "everything"', sh);
ok(await ext.locator('#libList button').isDisabled(), 'added ready list shows as added');
for (const tt of ['Severance', 'Pluribus', 'Silo']) { await ext.fill('#cTitle', tt); await ext.click('#cAdd'); await wait(150); }
sh = (await getSettings()).shields;
ok(sh.filter((x) => !x.preset).length === 3 && sh[2].title === 'Severance', 'popup: 3 own titles added from the form', sh);
await ext.fill('#cTitle', 'Andor'); await ext.click('#cAdd'); await wait(200);
ok((await getSettings()).shields.filter((x) => !x.preset).length === 3 && (await ext.locator('#addErr').textContent()).includes('3 own titles'), 'free: the 4th own title is refused with a note');
await ext.locator('.ss-shield').nth(1).locator('.ss-mini', { hasText: 'Tune' }).click(); await wait(100);
await ext.locator('.ss-shield').nth(1).locator('.ss-mini', { hasText: 'More' }).click(); await wait(100);
ok(await ext.locator('.ss-more input[type="number"]').isDisabled() && (await ext.locator('.ss-more').textContent()).includes('part of Pro'), 'free: "More" shows the Pro options, locked');
await ext.locator('.ss-shield').nth(1).locator('.ss-x').click();
ok((await ext.locator('.ss-shield').nth(1).locator('.ss-x').textContent()) === 'Sure?', 'delete asks first');
await ext.locator('.ss-shield').nth(1).locator('.ss-x').click(); await wait(200);
ok((await getSettings()).shields.length === 4, 'popup: delete asks once, then removes the shield');
ok(await ext.locator('#media').count() === 1, 'popup: pictures toggle exists');
await ext.evaluate(() => { document.getElementById('adv').open = true; }); await ext.click('#pauseBtn'); await wait(150);
ok((await ext.evaluate(() => chrome.storage.local.get('settings'))).settings.pausedUntil > Date.now(), 'pause button works');
ok((await ext.locator('#pauseBtn').textContent()) === 'Resume now', 'pause button turns into "Resume now"');
await ext.click('#pauseBtn');
await ext.click('#haveKey'); await ext.fill('#key', 'PSPOIL-DEV9-2026-TEST'); await ext.click('#activate'); await wait(300);
ok(await ext.locator('#proOn').isVisible(), 'popup: key activates, Pro section shows');
await setShields([GTA(), { id: 'one-piece', preset: 'one-piece', mode: 'everything', action: 'blur', on: true }]); await wait(300);
await ext.locator('.ss-shield').nth(1).locator('.ss-mini', { hasText: 'Tune' }).click(); await wait(100);
await ext.locator('.ss-shield').nth(1).locator('.ss-mini', { hasText: 'More' }).click(); await wait(100);
const upto = ext.locator('.ss-more input[type="number"]');
ok(!(await upto.isDisabled()), 'Pro: "watched up to" can be filled');
await upto.fill('1190'); await upto.dispatchEvent('change'); await wait(200);
ok((await getSettings()).shields[1].upTo === 1190, 'Pro: "watched up to" saves');
await ext.locator('.ss-shield').first().locator('.ss-mini', { hasText: 'Tune' }).click(); await wait(100);
ok(await ext.locator('.ss-shield').first().locator('.ss-mini', { hasText: 'More' }).count() === 1, 'GTA VI has "More" too');
await ext.locator('.ss-shield').first().locator('.ss-mini', { hasText: 'More' }).click(); await wait(100);
ok(await ext.locator('.ss-shield').first().locator('input[type="number"]').count() === 0, 'a game has no "watched up to" field');
await ext.locator('#trusted').fill('@TrustedGuy\nr/anime'); await wait(600);
ok((await getSettings()).trusted.includes('r/anime'), 'Pro: trusted list saves');
ok(await ext.locator('#hideAI').isChecked() && await ext.locator('#exportBtn').isVisible() && await ext.locator('#importBtn').isVisible(), 'Pro: AI toggle on by default, backup buttons shown');
await ext.locator('#importFile').setInputFiles({ name: 'b.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ app: 'Pure Spoiler Shield', v: 1, shields: [GTA(), { id: 'frieren', preset: 'frieren', mode: 'everything' }, { id: 'evil', preset: 'nope' }], trusted: '@a' })) }); await wait(400);
sh = (await getSettings()).shields;
ok(sh.length === 2 && sh[1].preset === 'frieren' && (await getSettings()).trusted === '@a' && (await ext.locator('#backupNote').textContent()) === 'Loaded.', 'Pro: backup file loads (bad entries dropped)', sh);
await ext.locator('#importFile').setInputFiles({ name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('not json') }); await wait(300);
ok((await ext.locator('#backupNote').textContent()).includes('not a Spoiler Shield backup') && (await getSettings()).shields.length === 2, 'a broken file changes nothing');
ok(!(await ext.locator('#permWarn').isVisible()), 'no permission warning when access is granted');
ok(await ext.locator('#review').isVisible(), 'review card after 25 hidden');
await ext.click('#reviewHide');
ok(fs.readdirSync(path.join(EXT, '_locales')).length === 13, '13 languages packed');

console.log('9. 1.2: TikTok and Instagram (free after allowing), media only in previews, video muted, smooth reveal');
{
  const reg = await sw.evaluate(async () => (await chrome.scripting.getRegisteredContentScripts()).map((x) => x.id + ':' + x.matches.length));
  ok(reg.some((x) => x.startsWith('pss-more:')), 'Google/TikTok/Instagram script registered once access is there', reg);
  // the test build reaches *.test only: register the same files there (the real build uses tiktok.com / instagram.com)
  await sw.evaluate(async () => { await chrome.scripting.registerContentScripts([{ id: 'pss-test-more', matches: ['*://*.tiktok.test/*', '*://*.instagram.test/*'], js: ['lib/words.js', 'content/sites.js', 'content/shield.js'], css: ['content/shield.css'], runAt: 'document_start' }]); });
  await setSettings({ media: true, shields: [{ id: 'one-piece', preset: 'one-piece', mode: 'spoilers', action: 'blur', on: true }] });
  const tt = await ctx.newPage(); await tt.goto(url('www.tiktok.test', '/search?q=one+piece')); await wait(900);
  ok(await veiled(tt, '#t1') === true, 'TikTok: "One Piece 1198 ending explained" — the whole item (preview + caption) is covered');
  ok(await tt.$eval('#t1u', (e) => e.classList.contains('pss-keep')), 'TikTok: the author stays visible above the veil');
  ok(await veiled(tt, '#t3') === true, 'TikTok: "Luffy’s New Form: Gear 6" covered');
  ok(await veiled(tt, '#t2') === false && await veiled(tt, '#t2a') === true, 'TikTok: a preview without spoiler words is covered only as a picture (page about the title)');
  ok(await veiled(tt, '#t4') === false, 'TikTok: a block with an editor (draft) is never covered');
  ok(await veiled(tt, '#c1') === true && await veiled(tt, '#c2') === false, 'TikTok: spoiler comment covered, harmless one stays');
  ok(await gone(tt, '#sg1') === true && await gone(tt, '#sg2') === false, 'TikTok: suggestion "one piece son of roger" removed, "pasta recipe" stays');
  const inbox = await tt.evaluate(() => ['#av1', '#nth', '#av2'].map((s) => !!document.querySelector(s).closest('.pss-veil')));
  ok(inbox.every((x) => !x), 'TikTok: avatars and thumbnails in notifications are never covered', inbox);
  const narrow = await tt.evaluate(() => Array.from(document.querySelectorAll('.pss-veil')).map((e) => Math.round(e.getBoundingClientRect().width)).filter((w) => w < 100));
  ok(narrow.length === 0, 'TikTok: no thin veil strips', narrow);
  await tt.$eval('#t1', (e) => { e.style.width = '120px'; }); await wait(250);
  ok(await tt.$eval('#t1', (e) => e.classList.contains('pss-tiny')), 'a veil that becomes narrow switches to the small shield (resize)');
  await tt.click('#t3'); await tt.click('#t3');
  ok(await veiled(tt, '#t3') === false && await tt.$eval('#t3', (e) => e.classList.contains('pss-fading')), 'shown on purpose: shown at once, the veil fades out on top');
  await wait(400);
  ok(await tt.$eval('#t3', (e) => !e.classList.contains('pss-fading')), 'the fade ends by itself');
  const tv = await ctx.newPage(); await tv.goto(url('www.tiktok.test', '/@logposeee/video/123')); await wait(900);
  ok(await veiled(tv, '#pl') === true && await tv.$eval('#pl', (e) => e.classList.contains('pss-video')), 'TikTok video page: spoiler video covered with the thick veil');
  ok(await tv.$eval('#vid', (v) => v.muted === true && v.paused === true), 'TikTok video page: video paused and muted');
  const ig = await ctx.newPage(); await ig.goto(url('www.instagram.test')); await wait(900);
  ok(await veiled(ig, '#p1') === true, 'Instagram: spoiler post covered', await ig.$eval('#p1', (e) => e.className));
  ok(await ig.$eval('#p1u', (e) => !!e.closest('.pss-keep')), 'Instagram: author visible above the veil');
  ok(await veiled(ig, '#p2') === false, 'Instagram: "Pasta night" stays');
  const health = await ext.evaluate(async (u) => { const [t] = await chrome.tabs.query({ url: u }); return chrome.tabs.sendMessage(t.id, { type: 'pss:pageCount' }); }, url('www.tiktok.test', '/search?q=one+piece'));
  ok(health && health.items > 0 && health.changed === false, 'self-check: items found, "site changed" not shown', health);
  for (const pg of [tt, tv, ig]) await pg.close();
  await setSettings({ media: false, shields: [GTA()] });
}

console.log('10. 1.2: speed — a feed of 500 cards');
{
  const yt2 = await ctx.newPage(); await yt2.goto(url('www.youtube.test')); await wait(500);
  const ms = await yt2.evaluate(async () => {
    const box = document.createElement('div'); document.body.appendChild(box);
    const t0 = performance.now();
    for (let i = 0; i < 500; i++) { const c = document.createElement('ytd-rich-item-renderer'); c.innerHTML = '<a id="video-title" title="' + (i % 10 === 0 ? 'GTA 6 ending explained ' + i : 'Cooking video number ' + i) + '">' + 'Video ' + i + '</a><img width="320" height="180">'; box.appendChild(c); }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return { ms: performance.now() - t0, hidden: box.querySelectorAll('.pss-veil').length };
  });
  console.log('     500 cards: ' + Math.round(ms.ms) + ' ms, hidden ' + ms.hidden);
  ok(ms.hidden === 50, '500 cards: exactly the 50 spoiler cards hidden', ms);
  ok(ms.ms < 600, '500 cards handled in under 0.6 s (headless, two frames included)', ms);
  await yt2.close();
}
ok(errors.length === 0, 'no page errors', errors);
await ctx.close(); server.close();
console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
