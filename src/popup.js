/*!
 * Pure Spoiler Shield — popup: settings, the counters, sharing. Everything is free (1.4); the window never uses the network.
 */
(function () {
  'use strict';
  const api = globalThis.browser && globalThis.browser.runtime ? globalThis.browser : globalThis.chrome;
  const t = SS.t;
  const $ = (id) => document.getElementById(id);
  const version = api.runtime.getManifest().version;
  const MAIN = ['*://*.youtube.com/*', '*://*.reddit.com/*', '*://*.x.com/*', '*://*.twitter.com/*'];
  const EVERYWHERE = { origins: ['<all_urls>'] };
  const ua = navigator.userAgent;
  const IS_FF = /\bFirefox\//.test(ua); 
  const FIREFOX_SLUG = 'pure-spoiler-shield';
  const SPOILER_LINK = 'https://qwemort.github.io/pure-guides/s/';
  const REVIEW_AFTER = 25;   // spoilers hidden before the one-time review card
  const PAUSE_MIN = 5;
  const DEFAULT_SHIELDS = [{ id: 'gta6', preset: 'gta6', mode: 'spoilers', action: 'blur', on: true }];
  const DEFAULTS = { enabled: true, comments: true, media: false, offSites: [], pausedUntil: 0, protectUntil: '', everywhere: true, shields: DEFAULT_SHIELDS, hideAI: true, brand: true, trusted: '', blocked: '' };
  const MAX_SHIELDS = 60;
  const DAY = /^\d{4}-\d{2}-\d{2}$/;
  let openTune = '';   // id of the shield whose extra settings are open
  let openEdit = '';   // id of the own shield whose words are open for editing
  let openMore = '';   // id of the shield whose dates / episode options are open
  let added = null;    // { name } of the shield just added: offers "Check on YouTube" once
  let S = Object.assign({}, DEFAULTS); let info = {}; let tab = null; let page = null;
  const send = (m) => api.runtime.sendMessage(m);
  const lang = () => { try { return api.i18n.getUILanguage(); } catch (e) { return 'en'; } };
  const num = (n) => { try { return new Intl.NumberFormat(lang()).format(n); } catch (e) { return String(n); } };

  /* Shield is not in the Edge store: people who installed it from the Chrome Web Store in Edge go back to that page. */
  function storeUrl() {
    if (IS_FF) return 'https://addons.mozilla.org/firefox/addon/' + FIREFOX_SLUG + '/';
    return 'https://chromewebstore.google.com/detail/' + api.runtime.id;
  }
  function reviewUrl() {
    if (IS_FF) return 'https://addons.mozilla.org/firefox/addon/' + FIREFOX_SLUG + '/reviews/';
    return 'https://chromewebstore.google.com/detail/' + api.runtime.id + '/reviews';
  }
  const shareUrl = () => storeUrl() + (storeUrl().includes('?') ? '&' : '?') + 'utm_source=share';
  async function save(patch) {
    S = Object.assign({}, S, patch);
    await api.storage.local.set({ settings: S });
    render();
  }
  function plural(base, n) {
    let cat = 'other';
    try { cat = new Intl.PluralRules(lang()).select(n); } catch (e) { /* ignore */ }
    const m = api.i18n.getMessage(base + '_' + cat) || api.i18n.getMessage(base + '_other');
    return (m || base).replace('{0}', num(n));
  }
  function inDays(days) {
    try { return new Intl.RelativeTimeFormat(lang(), { numeric: 'auto' }).format(days, 'day'); } catch (e) { return days + ' d'; }
  }
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const passed = (day) => DAY.test(day || '') && Date.now() > Date.parse(day + 'T23:59:59');

  /* ---------- Google, TikTok, Instagram: free, the browser asks for access once, when the person presses the button ---------- */
  let more = { sites: {}, origins: {} };
  async function refreshMore() { more = await send({ type: 'pss:moreStatus' }).catch(() => more) || more; }
  function renderMore() {
    const names = { google: 'Google', tiktok: 'TikTok', instagram: 'Instagram' };
    const on = Object.keys(names).filter((k) => more.sites && more.sites[k]);
    const allOn = on.length === Object.keys(names).length;
    $('moreLine').textContent = on.length ? t('more_sites_on', on.map((k) => names[k]).join(', ')) + (allOn ? '' : ' ' + t('more_sites_hint')) : t('more_sites_hint');
    $('moreBtn').hidden = allOn;
  }

  /* ---------- the main screen ---------- */
  function shieldLabel(sh) { return shieldName(sh); }
  function render() {
    $('enabled').checked = !!S.enabled;
    const paused = S.pausedUntil && Date.now() < S.pausedUntil;
    const siteOff = page && (S.offSites || []).includes(page.site);
    const off = !S.enabled || paused || siteOff;
    const total = info.total || 0;
    $('hero').classList.toggle('ss-off', !!off);
    let n = total; let label = plural('hidden_total', total) + ' · ' + t('all_time'); let line;
    if (!S.enabled) line = t('st_off');
    else if (paused) line = t('st_paused', new Date(S.pausedUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    else if (siteOff) line = t('st_site_off');
    else if (page) {
      n = page.count || 0;
      label = n ? plural('dodged', n) : t('st_empty_title');
      line = n ? page.site : t('st_empty_sub');
    } else line = t('st_not_here');
    if (!heroPeek) { $('total').textContent = num(n); $('total').classList.remove('ss-armed'); $('totalLabel').textContent = label; $('pageLine').textContent = line; }
    $('changedLine').hidden = !(page && page.changed && !off);
    $('weekLine').textContent = t('week_line', num(info.week || 0), num(total));
    $('cardBtn').hidden = !(info.week > 0);   // an empty picture says nothing: offered once something was covered this week
    renderMore();

    renderShields();
    $('comments').checked = !!S.comments;
    $('media').checked = !!S.media;
    $('pauseBtn').textContent = paused ? t('btn_resume') : t('btn_pause');
    $('pauseBtn').classList.toggle('on', !!paused);
    if (page) {
      $('siteBtn').hidden = false;
      $('siteBtn').textContent = siteOff ? t('btn_site_on') : t('btn_site_off');
      $('siteBtn').classList.toggle('on', !!siteOff);
    }
    $('everywhere').checked = S.everywhere !== false && !!info.everywhereGranted;
    $('grantBtn').hidden = !!info.everywhereGranted || S.everywhere === false;
    $('until').value = S.protectUntil || '';
    $('hideAI').checked = S.hideAI !== false;
    $('brand').checked = S.brand !== false;
    if (document.activeElement !== $('trusted')) $('trusted').value = S.trusted || '';
    if (document.activeElement !== $('blocked')) $('blocked').value = S.blocked || '';
    const untilPassed = passed(S.protectUntil);
    $('untilNote').hidden = !untilPassed;
    if (untilPassed) $('untilNote').textContent = t('until_passed');

    // one review request per install, either after 25 spoilers or when a "protect until" date has run out; never to someone who is switching things off
    const ended = untilPassed || shields().some((x) => x.on !== false && passed(x.until));
    const switchingOff = off || shields().some((x) => x.on === false);
    $('review').hidden = !(!info.reviewDone && !switchingOff && (total >= REVIEW_AFTER || ended));
    $('reviewTitle').textContent = t(ended ? 'review_title_end' : 'review_title');
    const ad = added && !openTune;
    $('justAdded').hidden = !ad;
    if (ad) { $('justAddedText').textContent = t('yt_added', added.name); $('ytCheck').href = ytSearch(added.name); }
  }
  const ytSearch = (q) => 'https://www.youtube.com/results?search_query=' + encodeURIComponent(String(q).slice(0, 120));

  /* The number in the graphite bar: a click arms it (yellow), the second click shows how the product works — same two clicks as on a blurred post. */
  let heroPeek = 0;
  function heroClick() {
    heroPeek = (heroPeek + 1) % 3;
    if (heroPeek === 0) { render(); return; }
    const b = $('total'); b.classList.add('ss-armed');
    if (heroPeek === 1) { b.textContent = t('hero_armed'); $('totalLabel').textContent = t('hero_armed_label'); $('pageLine').textContent = t('hero_armed_line'); }
    else { b.textContent = t('hero_open'); $('totalLabel').textContent = t('w_s1_t'); $('pageLine').textContent = t('w_s2'); }
  }

  async function refreshPage() {
    page = null;
    try {
      [tab] = await api.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id != null) page = await api.tabs.sendMessage(tab.id, { type: 'pss:pageCount' });
    } catch (e) { page = null; }
  }
  async function refreshInfo() {
    info = await send({ type: 'pss:info' }).catch(() => ({}));
    const r = await api.storage.local.get({ reviewDone: false });
    info.reviewDone = r.reviewDone;
  }
  async function checkPermission() {
    let ok = true;
    try { ok = await api.permissions.contains({ origins: MAIN }); } catch (e) { ok = true; }
    $('permWarn').hidden = ok;
  }
  const note = (id, text) => { $(id).textContent = text; $(id).hidden = !text; };
  async function toClipboard(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { return false; }
  }

  function wire() {
    $('enabled').addEventListener('change', () => save({ enabled: $('enabled').checked }));
    $('comments').addEventListener('change', () => save({ comments: $('comments').checked }));
    $('media').addEventListener('change', () => save({ media: $('media').checked }));
    $('total').addEventListener('click', heroClick);
    wireShields();
    $('pauseBtn').addEventListener('click', () => {
      const paused = S.pausedUntil && Date.now() < S.pausedUntil;
      save({ pausedUntil: paused ? 0 : Date.now() + PAUSE_MIN * 60000 });
    });
    $('siteBtn').addEventListener('click', () => {
      if (!page) return;
      const list = new Set(S.offSites || []);
      if (list.has(page.site)) list.delete(page.site); else list.add(page.site);
      save({ offSites: Array.from(list) });
    });
    $('permBtn').addEventListener('click', async () => {
      try { await api.permissions.request({ origins: MAIN }); } catch (e) { /* the person closed the question */ }
      checkPermission();
    });
    $('everywhere').addEventListener('change', async () => {
      const want = $('everywhere').checked;
      if (want && !info.everywhereGranted) {
        let granted = false;
        try { granted = await api.permissions.request(EVERYWHERE); } catch (e) { granted = false; }
        if (!granted) { $('everywhere').checked = false; return; }
      }
      await save({ everywhere: want });
      const r = (await send({ type: 'pss:sync' }).catch(() => null)) || { ok: false };
      await refreshInfo(); render();
      note('everyNote', r.ok === false ? t('site_fail') : '');
    });
    $('grantBtn').addEventListener('click', async () => {
      let granted = false;
      try { granted = await api.permissions.request(EVERYWHERE); } catch (e) { granted = false; }
      if (granted) { await save({ everywhere: true }); const r = (await send({ type: 'pss:sync' }).catch(() => null)) || { ok: false }; await refreshInfo(); render(); note('everyNote', r.ok === false ? t('site_fail') : ''); }
    });
    $('until').addEventListener('change', () => save({ protectUntil: DAY.test($('until').value) ? $('until').value : '' }));
    $('hideAI').addEventListener('change', () => save({ hideAI: $('hideAI').checked }));
    $('brand').addEventListener('change', () => save({ brand: $('brand').checked }));
    let trTimer = 0;
    $('trusted').addEventListener('input', () => { clearTimeout(trTimer); trTimer = setTimeout(() => save({ trusted: $('trusted').value.slice(0, 5000) }), 400); });
    let blTimer = 0;
    $('blocked').addEventListener('input', () => { clearTimeout(blTimer); blTimer = setTimeout(() => save({ blocked: $('blocked').value.slice(0, 5000) }), 400); });
    $('moreBtn').addEventListener('click', async () => {
      // the browser asks the person once; nothing is asked at install (optional permission)
      const origins = [].concat(...Object.values(more.origins || {}));
      let granted = false;
      try { granted = origins.length ? await api.permissions.request({ origins }) : false; } catch (e) { granted = false; }
      let r = { ok: true };
      if (granted) { r = (await send({ type: 'pss:syncMore' }).catch(() => null)) || { ok: false }; }
      await refreshMore(); render();
      note('moreNote', r.ok === false ? t('site_fail') : '');
    });
    $('copyReport').addEventListener('click', async () => {
      const r = ['Pure Spoiler Shield ' + version, 'site: ' + (page && page.site), 'cards: ' + (page && page.cards), 'items: ' + (page && page.items),
        'links: ' + (page && page.probe), 'hidden: ' + (page && page.count), 'lists on: ' + shields().filter((x) => x.on !== false).length,
        'browser: ' + navigator.userAgent.replace(/^.*?(Chrome|Firefox|Edg)\/(\d+).*$/, '$1 $2')].join(' | ');
      $('copyReport').textContent = (await toClipboard(r)) ? t('report_copied') : r;
    });
    wireShare();
    $('exportBtn').addEventListener('click', exportShields);
    $('importBtn').addEventListener('click', () => $('importFile').click());
    $('importFile').addEventListener('change', importShields);
    const done = () => { api.storage.local.set({ reviewDone: true }); info.reviewDone = true; render(); };
    $('reviewBtn').href = reviewUrl(); $('reviewBtn').addEventListener('click', done); $('reviewHide').addEventListener('click', done);
    $('reviewLink').href = reviewUrl();
    $('mailLink').href = 'mailto:papana44444@gmail.com?subject=' + encodeURIComponent('Pure Spoiler Shield ' + version + ' — problem');
  }

  /* ---------- sharing: a link to the store, a picture of the week, a spoiler link, a list code. Nothing is sent by us: the person copies or posts it ---------- */
  function wireShare() {
    $('shareBtn').addEventListener('click', async () => {
      const text = t('share_text');
      /* Copy first: on some systems the share sheet takes focus and closes this window, and then nothing after it would run. */
      const copied = await toClipboard(text + ' ' + shareUrl());
      note('shareNote', copied ? t('share_copied') : '');
      try { if (navigator.share) await navigator.share({ title: 'Pure Spoiler Shield', text, url: shareUrl() }); } catch (e) { /* closed or not allowed: the text is already copied */ }
    });
    $('cardBtn').addEventListener('click', shareCard);
    $('slCopy').addEventListener('click', copySpoilerLink);
    $('codeCopy').addEventListener('click', async () => note('codeNote', (await toClipboard(makeCode())) ? t('code_copied') : t('code_bad')));
    $('codeLoad').addEventListener('click', loadCode);
  }
  /** The picture is drawn here on a canvas from numbers on this device; it goes to the clipboard (or a file), not to a server. */
  async function drawCard() {
    try { await document.fonts.load('700 120px Archivo'); } catch (e) { /* the system font is fine */ }
    const c = document.createElement('canvas'); c.width = 1200; c.height = 630;
    const g = c.getContext('2d');
    const css = getComputedStyle(document.documentElement);
    const col = (v) => css.getPropertyValue(v).trim();
    g.fillStyle = col('--bg'); g.fillRect(0, 0, 1200, 630);
    g.fillStyle = col('--cover'); g.beginPath(); g.roundRect(72, 140, 1056, 220, 28); g.fill();
    g.fillStyle = col('--on-cover'); g.font = '700 150px Archivo, system-ui, sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'center';
    g.fillText(num(info.week || 0), 600, 252);
    g.fillStyle = col('--signal'); g.beginPath(); g.roundRect(72, 392, 120, 12, 6); g.fill();
    g.fillStyle = col('--ink'); g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    const rw = SS.releaseWeek(shields(), shieldLabel);
    g.font = '700 54px Archivo, system-ui, sans-serif'; g.fillText(rw ? t('card_title_release', rw.label) : t('card_title'), 72, 478);
    g.font = '32px system-ui, sans-serif'; g.fillStyle = col('--muted'); g.fillText('Spoiler Shield · ' + t('card_foot'), 72, 560);
    return c;
  }
  async function shareCard() {
    note('shareNote', '');
    const c = await drawCard();
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    if (!blob) return;
    try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); note('shareNote', t('card_copied')); return; } catch (e) { /* no image clipboard here: save a file instead */ }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'spoiler-shield-week.png';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    note('shareNote', t('card_saved'));
  }

  /* Spoiler link: the text goes into the part of the address after "#" (deflate + base64url, format of the page /s/). Only text we make ourselves. */
  const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  async function deflate(u8) {
    const st = new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(st).arrayBuffer());
  }
  async function copySpoilerLink() {
    const about = $('slAbout').value.replace(/\s+/g, ' ').trim().slice(0, 80);
    const text = $('slText').value.trim().slice(0, 2000);
    if (!text) { note('slNote', t('sl_need')); $('slText').focus(); return; }
    const u = new TextEncoder().encode(JSON.stringify({ a: about, s: text }));
    let code = '1p' + b64(u);
    if (typeof CompressionStream === 'function') { try { const z = await deflate(u); if (z.length < u.length) code = '1z' + b64(z); } catch (e) { /* plain is fine */ } }
    note('slNote', (await toClipboard(SPOILER_LINK + '#' + code)) ? t('sl_copied') : t('sl_hint'));
  }

  /* ---------- shields: what is protected ---------- */
  const shields = () => (Array.isArray(S.shields) ? S.shields : DEFAULT_SHIELDS);
  function shieldName(sh) {
    if (sh.preset) { const p = SS.LIBRARY.find((x) => x.id === sh.preset); return p ? p.label : sh.preset; }
    const first = String(sh.title || '').split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean)[0];
    return sh.label || first || t('my_words');
  }
  function shieldKind(sh) {
    if (!sh.preset) return 'custom';
    const p = SS.LIBRARY.find((x) => x.id === sh.preset); return p ? p.kind : 'custom';
  }
  function setShield(id, patch) {
    save({ shields: shields().map((x) => (x.id === id ? Object.assign({}, x, patch) : x)) });
  }
  function segment(options, value, onChange, label) {
    const box = el('div', 'ss-seg'); box.setAttribute('role', 'radiogroup'); box.setAttribute('aria-label', label);
    for (const [v, k] of options) {
      const b = el('button', '', t(k)); b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(v === value));
      b.addEventListener('click', () => { if (v !== value) onChange(v); });
      box.appendChild(b);
    }
    return box;
  }
  function renderShields() {
    const list = $('shieldList'); const all = shields();
    list.textContent = '';
    if (!all.length) list.appendChild(el('div', 'ss-hint', t('shields_none')));
    all.forEach((sh) => {
      const card = el('div', 'ss-shield'); card.dataset.id = sh.id;
      const head = el('div', 'ss-shield-head');
      const nm = el('span', 'ss-shield-name', shieldName(sh)); nm.title = shieldName(sh); head.appendChild(nm);
      const days = SS.daysUntil(SS.releaseDay(sh));
      head.appendChild(el('span', 'ss-shield-sub', days !== null && days >= 0 ? inDays(days) : t('kind_' + shieldKind(sh))));
      const sw = el('label', 'ss-switch'); sw.title = t('shield_switch');
      const cb = el('input'); cb.type = 'checkbox'; cb.checked = sh.on !== false; cb.setAttribute('aria-label', t('shield_switch') + ': ' + shieldName(sh));
      cb.addEventListener('change', () => setShield(sh.id, { on: cb.checked }));
      sw.appendChild(cb); sw.appendChild(el('span', 'ss-track')).setAttribute('aria-hidden', 'true');
      head.appendChild(sw);
      const del = el('button', 'ss-x', '✕'); del.type = 'button'; del.title = t('shield_delete'); del.setAttribute('aria-label', t('shield_delete') + ': ' + shieldName(sh));
      del.addEventListener('click', () => {
        if (del.dataset.sure !== '1') { del.dataset.sure = '1'; del.textContent = t('shield_delete_sure'); del.classList.add('ss-sure'); return; }
        save({ shields: shields().filter((x) => x.id !== sh.id) });
      });
      head.appendChild(del);
      card.appendChild(head);
      const row = el('div', 'ss-shield-row');
      const lv = SS.level(sh.mode);
      row.appendChild(segment([['light', 'opt_light'], ['spoilers', 'opt_spoilers'], ['everything', 'opt_everything']], lv, (v) => setShield(sh.id, { mode: v }), t('level')));
      const tune = el('button', 'ss-mini', t('card_tune')); tune.type = 'button'; tune.setAttribute('aria-expanded', String(openTune === sh.id));
      if (sh.upTo || sh.release || sh.until || sh.action === 'remove') tune.classList.add('ss-on');
      tune.addEventListener('click', () => { openTune = openTune === sh.id ? '' : sh.id; if (openTune !== sh.id) { openEdit = ''; openMore = ''; } render(); });
      row.appendChild(tune);
      card.appendChild(row);
      card.appendChild(el('div', 'ss-hint', t('lv_' + lv)));
      if (openTune === sh.id) {
        const row2 = el('div', 'ss-shield-row');
        row2.appendChild(segment([['blur', 'opt_blur'], ['remove', 'opt_remove']], sh.action === 'remove' ? 'remove' : 'blur', (v) => setShield(sh.id, { action: v }), t('opt_action')));
        card.appendChild(row2);
        const row3 = el('div', 'ss-shield-row');
        if (!sh.preset) {
          const ed = el('button', 'ss-mini', openEdit === sh.id ? t('shield_done') : t('shield_edit')); ed.type = 'button';
          ed.addEventListener('click', () => { openEdit = openEdit === sh.id ? '' : sh.id; render(); });
          row3.appendChild(ed);
        }
        const mo = el('button', 'ss-mini', openMore === sh.id ? t('shield_done') : t('shield_more')); mo.type = 'button';
        if (sh.upTo || sh.release || sh.until) mo.classList.add('ss-on');
        mo.addEventListener('click', () => { openMore = openMore === sh.id ? '' : sh.id; render(); });
        row3.appendChild(mo);
        const yt = el('a', 'ss-mini', t('yt_check')); yt.href = ytSearch(shieldName(sh)); yt.target = '_blank'; yt.rel = 'noopener noreferrer';
        row3.appendChild(yt);
        card.appendChild(row3);
        if (!sh.preset && openEdit === sh.id) card.appendChild(editor(sh));
        if (openMore === sh.id) card.appendChild(shieldOptions(sh));
      }
      list.appendChild(card);
    });
    $('addBtn').textContent = $('addBox').hidden ? t('add_shield') : t('add_close');
    if (!$('addBox').hidden) renderLibrary();
  }
  /** Options of one shield: watched up to episode N, release day, protect until. */
  function shieldOptions(sh) {
    const box = el('div', 'ss-edit ss-more');
    box.appendChild(el('span', 'ss-hint', t('more_hint')));
    const field = (key, type, labelKey, attrs) => {
      const lab = el('label', 'ss-field');
      lab.appendChild(el('span', '', t(labelKey)));
      const f = el('input'); f.type = type; f.value = sh[key] || '';
      Object.assign(f, attrs || {});
      f.addEventListener('change', () => setShield(sh.id, { [key]: type === 'number' ? (parseInt(f.value, 10) > 0 ? parseInt(f.value, 10) : '') : (type === 'date' && !DAY.test(f.value) ? '' : f.value) }));
      lab.appendChild(f); box.appendChild(lab);
    };
    if (shieldKind(sh) !== 'game') field('upTo', 'number', 'more_upto', { min: 0, max: 99999, placeholder: '1190' });
    field('release', 'date', 'more_release');
    field('until', 'date', 'more_until');
    return box;
  }
  function editor(sh) {
    const box = el('div', 'ss-edit');
    const fields = [['title', 'custom_name_ph', 1], ['names', 'custom_names_ph', 3]];
    if (sh.words) fields.push(['words', 'custom_words_ph', 2]);
    for (const [k, ph, rows] of fields) {
      const f = rows === 1 ? el('input') : el('textarea');
      if (rows > 1) f.rows = rows; else f.type = 'text';
      f.placeholder = t(ph); f.value = sh[k] || ''; f.spellcheck = false; f.setAttribute('aria-label', t(ph));
      let timer = 0;
      f.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => setShield(sh.id, { [k]: f.value.slice(0, 5000) }), 400); });
      box.appendChild(f);
    }
    box.appendChild(el('div', 'ss-hint', t('custom_names_hint')));
    return box;
  }
  function renderLibrary() {
    const q = SS.normalize($('libSearch').value || '').trim();
    const have = new Set(shields().filter((x) => x.preset).map((x) => x.preset));
    const list = $('libList'); list.textContent = '';
    for (const p of SS.LIBRARY) {
      if (q && !SS.normalize(p.label).includes(q) && !p.id.includes(q)) continue;
      const b = el('button'); b.type = 'button'; b.dataset.id = p.id;
      b.appendChild(el('span', 'ss-kind', t('kind_' + p.kind)));
      b.appendChild(el('span', 'ss-grow', p.label));
      if (have.has(p.id)) { b.disabled = true; b.appendChild(el('span', 'ss-hint', t('lib_added'))); }
      b.addEventListener('click', () => addPreset(p));
      list.appendChild(b);
    }
    if (!list.firstChild) list.appendChild(el('div', 'ss-hint', t('lib_nothing')));
  }
  function addErr(text) { $('addErr').textContent = text; $('addErr').hidden = !text; }
  function addPreset(p) {
    if (shields().length >= MAX_SHIELDS) { addErr(t('shields_max')); return; }
    addErr('');
    // a season of a show or an anime is spoiled by almost any news about it: hide everything by default (1.1)
    const mode = p.kind === 'anime' || p.kind === 'show' ? 'everything' : 'spoilers';
    added = { name: p.label };
    save({ shields: shields().concat([{ id: p.id, preset: p.id, mode, action: 'blur', on: true }]) });
  }
  function addCustom() {
    const title = $('cTitle').value.trim(); const names = $('cNames').value.trim();
    if (!title) { addErr(t('custom_need_title')); $('cTitle').focus(); return; }
    if (shields().length >= MAX_SHIELDS) { addErr(t('shields_max')); return; }
    addErr('');
    $('cTitle').value = ''; $('cNames').value = '';
    added = { name: title.split(/[\n,;]+/)[0].trim().slice(0, 120) };
    save({ shields: shields().concat([{ id: 'own-' + Date.now().toString(36), title: title.slice(0, 2000), names: names.slice(0, 5000), words: '', mode: 'spoilers', action: 'blur', on: true }]) });
  }
  function wireShields() {
    $('addBtn').addEventListener('click', () => { $('addBox').hidden = !$('addBox').hidden; addErr(''); render(); if (!$('addBox').hidden) $('libSearch').focus(); });
    $('libSearch').addEventListener('input', renderLibrary);
    $('cAdd').addEventListener('click', addCustom);
    $('cTitle').addEventListener('keydown', (e) => { if (e.key === 'Enter') addCustom(); });
  }

  /* ---------- backup and list code. Everything that comes in from a file or a pasted code is checked field by field (border of trust) ---------- */
  const optDay = (d) => (DAY.test(d || '') ? d : undefined);
  /** One shield from outside → a clean one, or null. `withWords`: backups keep the right-click words, shared codes do not. */
  function cleanShield(x, withWords) {
    if (!x || typeof x !== 'object') return null;
    const preset = typeof x.preset === 'string' && SS.LIBRARY.some((p) => p.id === x.preset) ? x.preset : '';
    if (!preset && typeof x.title !== 'string' && !(withWords && typeof x.words === 'string')) return null;
    const id = preset || (typeof x.id === 'string' && /^[\w-]{1,60}$/.test(x.id) ? x.id : 'own-' + Math.random().toString(36).slice(2, 9));
    const up = parseInt(x.upTo, 10);
    return { id, preset: preset || undefined, title: preset ? undefined : String(x.title || '').slice(0, 2000), names: preset ? undefined : String(x.names || '').slice(0, 5000),
      words: preset || !withWords ? undefined : String(x.words || '').slice(0, 5000), label: !preset && x.label ? String(x.label).slice(0, 60) : undefined,
      mode: SS.level(x.mode), action: x.action === 'remove' ? 'remove' : 'blur', on: x.on !== false, upTo: up > 0 && up < 100000 ? up : undefined, release: optDay(x.release), until: optDay(x.until) };
  }
  function exportShields() {
    const data = { app: 'Pure Spoiler Shield', v: 1, shields: shields(), trusted: S.trusted || '' };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = 'spoiler-shield-backup.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  async function importShields() {
    const f = $('importFile').files && $('importFile').files[0];
    $('importFile').value = '';
    if (!f || f.size > 200000) return note('backupNote', t('backup_bad'));
    try {
      const d = JSON.parse(await f.text());
      const list = (Array.isArray(d && d.shields) ? d.shields : []).map((x) => cleanShield(x, true)).filter(Boolean).slice(0, MAX_SHIELDS);
      const seen = new Set(); for (let i = list.length - 1; i >= 0; i--) { const k = list[i].preset || list[i].id; if (seen.has(k)) list.splice(i, 1); else seen.add(k); }   // a backup may not hold the same list or id twice
      if (!list.length) return note('backupNote', t('backup_bad'));
      await save({ shields: list, trusted: typeof d.trusted === 'string' ? d.trusted.slice(0, 5000) : (S.trusted || '') });
      note('backupNote', t('backup_done'));
    } catch (e) { note('backupNote', t('backup_bad')); }
  }
  /** Code of my lists: PSS1.<base64url of JSON>. Only ready lists and own titles with their names — never right-click words, dates or channels. */
  const CODE_MAX = 40000;   // the same limit is checked when a code is loaded
  function makeCode() {
    let code = '';
    for (const nameCap of [1500, 200, 0]) {   // very long name lists are shortened so that our own code can always be loaded again
      const s = shields().map((x) => (x.preset ? { p: x.preset, m: SS.level(x.mode), a: x.action === 'remove' ? 'remove' : 'blur' }
        : { t: String(x.title || '').slice(0, 300), n: String(x.names || '').slice(0, nameCap), m: SS.level(x.mode), a: x.action === 'remove' ? 'remove' : 'blur' })).filter((x) => x.p || x.t);
      code = 'PSS1.' + b64(new TextEncoder().encode(JSON.stringify({ v: 1, s })));
      if (code.length <= CODE_MAX) break;
    }
    return code;
  }
  async function loadCode() {
    const raw = $('codeIn').value.replace(/\s+/g, '');
    if (!/^PSS1\.[A-Za-z0-9_-]{4,40000}$/.test(raw)) return note('codeNote', t('code_bad'));
    try {
      const u = raw.slice(5).replace(/-/g, '+').replace(/_/g, '/'); const bin = atob(u + '==='.slice((u.length + 3) % 4));
      const d = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))));
      if (!d || d.v !== 1 || !Array.isArray(d.s)) return note('codeNote', t('code_bad'));
      const ownKey = (x) => String(x.title || '').toLowerCase().replace(/\s+/g, ' ').trim();
      const have = new Set(shields().map((x) => (x.preset ? 'p:' + x.preset : 'o:' + ownKey(x))));   // the same code twice must not double the titles
      const fresh = []; let parsed = 0;
      for (const x of d.s.slice(0, MAX_SHIELDS)) {
        if (!x || typeof x !== 'object') continue;
        const c = cleanShield(x.p ? { preset: x.p, mode: x.m, action: x.a } : { title: x.t, names: x.n, mode: x.m, action: x.a }, false);
        if (!c) continue;
        parsed++;
        const k = c.preset ? 'p:' + c.preset : 'o:' + ownKey(c);
        if (have.has(k)) continue;
        have.add(k);
        fresh.push(c);
      }
      if (!parsed) return note('codeNote', t('code_bad'));
      if (!fresh.length) return note('codeNote', t('code_have'));
      const room = Math.max(0, MAX_SHIELDS - shields().length);
      if (!room) return note('codeNote', t('shields_max'));
      await save({ shields: shields().concat(fresh.slice(0, room)) });
      $('codeIn').value = '';
      note('codeNote', t('code_done', fresh.slice(0, room).length));
    } catch (e) { note('codeNote', t('code_bad')); }
  }

  async function start() {
    SS.applyI18n(document);
    document.documentElement.lang = (lang() || 'en').split('-')[0];
    const r = await api.storage.local.get({ settings: {} });
    S = Object.assign({}, DEFAULTS, r.settings || {});
    wire();
    await Promise.all([refreshInfo(), refreshPage(), checkPermission(), refreshMore()]);
    render();
    api.storage.onChanged.addListener(async (c, area) => {
      if (area !== 'local') return;
      if (c.settings && c.settings.newValue && document.activeElement && !document.activeElement.closest('.ss-shield, .ss-addbox')) { S = Object.assign({}, DEFAULTS, c.settings.newValue); render(); }
      if (c.stats) { await refreshInfo(); render(); }
    });
  }
  start();
})();
