/*!
 * Pure Spoiler Shield — popup: settings, the counter, Pro.
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
  const IS_FF = /\bFirefox\//.test(ua); const IS_EDGE = /\bEdg\//.test(ua);
  const FIREFOX_SLUG = 'pure-spoiler-shield';
  const REVIEW_AFTER = 25;   // spoilers hidden before the one-time review card
  const DEFAULT_SHIELDS = [{ id: 'gta6', preset: 'gta6', mode: 'spoilers', action: 'blur', on: true }];
  const DEFAULTS = { enabled: true, comments: true, media: false, offSites: [], pausedUntil: 0, protectUntil: '', everywhere: true, shields: DEFAULT_SHIELDS, hideAI: true, trusted: '' };
  const MAX_SHIELDS = 60;
  const KIND = { game: '🎮', movie: '🎬', show: '📺', anime: '✨', custom: '✏️' };
  let openEdit = '';   // id of the own shield whose words are open for editing
  let openMore = '';   // id of the shield whose Pro options are open
  let S = Object.assign({}, DEFAULTS); let info = {}; let tab = null; let page = null;
  const send = (m) => api.runtime.sendMessage(m);
  const num = (n) => { try { return new Intl.NumberFormat(api.i18n.getUILanguage()).format(n); } catch (e) { return String(n); } };

  function reviewUrl() {
    if (IS_FF) return 'https://addons.mozilla.org/firefox/addon/' + FIREFOX_SLUG + '/reviews/';
    if (IS_EDGE) return 'https://microsoftedge.microsoft.com/addons/detail/' + api.runtime.id;
    return 'https://chromewebstore.google.com/detail/' + api.runtime.id + '/reviews';
  }
  async function save(patch) {
    S = Object.assign({}, S, patch);
    await api.storage.local.set({ settings: S });
    render();
  }

  function plural(base, n) {
    let cat = 'other';
    try { cat = new Intl.PluralRules(api.i18n.getUILanguage()).select(n); } catch (e) { /* ignore */ }
    const m = api.i18n.getMessage(base + '_' + cat) || api.i18n.getMessage(base + '_other');
    return (m || base).replace('{0}', num(n));
  }

  function render() {
    $('enabled').checked = !!S.enabled;
    const paused = S.pausedUntil && Date.now() < S.pausedUntil;
    const siteOff = page && (S.offSites || []).includes(page.site);
    const off = !S.enabled || paused || siteOff;
    $('hero').classList.toggle('ss-off', off);
    $('total').textContent = num(info.total || 0);
    $('totalLabel').textContent = plural('hidden_total', info.total || 0);
    let line;
    if (!S.enabled) line = t('st_off');
    else if (paused) line = t('st_paused', new Date(S.pausedUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    else if (siteOff) line = t('st_site_off');
    else if (page) line = page.count ? plural('hidden_page', page.count) : t('st_page_clean');
    else line = info.pro ? t('st_not_here') : t('st_not_here_free');
    $('pageLine').textContent = line;

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

    $('proOff').hidden = !!info.pro; $('proOn').hidden = !info.pro;
    if (info.pro) {
      $('proLabel').textContent = t('pro_active', info.label || '');
      $('everywhere').checked = S.everywhere !== false && info.everywhereGranted;
      $('grantBtn').hidden = !!info.everywhereGranted || S.everywhere === false;
      $('until').value = S.protectUntil || '';
      $('hideAI').checked = S.hideAI !== false;
      if (document.activeElement !== $('trusted')) $('trusted').value = S.trusted || '';
      const passed = S.protectUntil && Date.now() > Date.parse(S.protectUntil + 'T23:59:59');
      $('untilNote').hidden = !passed;
      if (passed) $('untilNote').textContent = t('pro_until_passed');
    }
    const showReview = (info.total || 0) >= REVIEW_AFTER && !info.reviewDone;
    $('review').hidden = !showReview;
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

  function wire() {
    $('enabled').addEventListener('change', () => save({ enabled: $('enabled').checked }));
    $('comments').addEventListener('change', () => save({ comments: $('comments').checked }));
    $('media').addEventListener('change', () => save({ media: $('media').checked }));
    wireShields();
    $('pauseBtn').addEventListener('click', () => {
      const paused = S.pausedUntil && Date.now() < S.pausedUntil;
      save({ pausedUntil: paused ? 0 : Date.now() + 10 * 60000 });
    });
    $('siteBtn').addEventListener('click', () => {
      if (!page) return;
      const list = new Set(S.offSites || []);
      if (list.has(page.site)) list.delete(page.site); else list.add(page.site);
      save({ offSites: Array.from(list) });
    });
    $('permBtn').addEventListener('click', async () => {
      try { await api.permissions.request({ origins: MAIN }); } catch (e) { /* ignore */ }
      checkPermission();
    });
    $('buyBtn').addEventListener('click', async () => {
      const r = await send({ type: 'pss:buy' });
      if (!r || !r.ok) { $('keyBox').hidden = false; showKeyErr(t('lic_checkout_unavailable')); }
    });
    $('haveKey').addEventListener('click', () => { $('keyBox').hidden = !$('keyBox').hidden; if (!$('keyBox').hidden) $('key').focus(); });
    $('activate').addEventListener('click', async () => {
      $('activate').disabled = true; $('keyErr').hidden = true;
      const r = await send({ type: 'pss:activate', key: $('key').value }).catch(() => ({ ok: false, error: 'busy' }));
      $('activate').disabled = false;
      if (!r || !r.ok) { showKeyErr(t('lic_' + ((r && r.error) || 'busy'), (r && r.max) || 3)); return; }
      $('key').value = '';
      await refreshInfo(); render();
    });
    $('everywhere').addEventListener('change', async () => {
      const want = $('everywhere').checked;
      if (want && !info.everywhereGranted) {
        let granted = false;
        try { granted = await api.permissions.request(EVERYWHERE); } catch (e) { granted = false; }
        if (!granted) { $('everywhere').checked = false; return; }
      }
      await save({ everywhere: want });
      await send({ type: 'pss:sync' }); await refreshInfo(); render();
    });
    $('grantBtn').addEventListener('click', async () => {
      let granted = false;
      try { granted = await api.permissions.request(EVERYWHERE); } catch (e) { granted = false; }
      if (granted) { await save({ everywhere: true }); await send({ type: 'pss:sync' }); await refreshInfo(); render(); }
    });
    $('until').addEventListener('change', () => save({ protectUntil: $('until').value || '' }));
    $('hideAI').addEventListener('change', () => save({ hideAI: $('hideAI').checked }));
    let trTimer = 0;
    $('trusted').addEventListener('input', () => { clearTimeout(trTimer); trTimer = setTimeout(() => save({ trusted: $('trusted').value.slice(0, 5000) }), 400); });
    $('exportBtn').addEventListener('click', exportShields);
    $('importBtn').addEventListener('click', () => $('importFile').click());
    $('importFile').addEventListener('change', importShields);
    $('removeLic').addEventListener('click', async () => {
      if ($('removeLic').dataset.sure !== '1') { $('removeLic').dataset.sure = '1'; $('removeLic').textContent = t('pro_remove_sure'); return; }
      await send({ type: 'pss:deactivate' }); await refreshInfo(); render();
    });
    const done = () => { api.storage.local.set({ reviewDone: true }); info.reviewDone = true; render(); };
    $('reviewBtn').href = reviewUrl(); $('reviewBtn').addEventListener('click', done); $('reviewHide').addEventListener('click', done);
    $('reviewLink').href = reviewUrl();
    $('mailLink').href = 'mailto:papana44444@gmail.com?subject=' + encodeURIComponent('Pure Spoiler Shield ' + version + ' — problem');
  }
  /* ---------- shields: what is protected ---------- */
  const shields = () => (Array.isArray(S.shields) ? S.shields : DEFAULT_SHIELDS);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
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
  function select(options, value, onChange, label) {
    const s = el('select'); s.setAttribute('aria-label', label);
    for (const [v, k] of options) { const o = el('option', '', t(k)); o.value = v; s.appendChild(o); }
    s.value = value; s.addEventListener('change', () => onChange(s.value));
    return s;
  }
  function renderShields() {
    const list = $('shieldList'); const all = shields();
    list.textContent = '';
    if (!all.length) list.appendChild(el('div', 'ss-hint', t('shields_none')));
    all.forEach((sh, i) => {
      const locked = SS.isLocked(all, i, !!info.pro);
      const card = el('div', 'ss-shield' + (locked ? ' ss-locked' : '')); card.dataset.id = sh.id;
      const head = el('div', 'ss-shield-head');
      head.appendChild(el('span', 'ss-kind', KIND[shieldKind(sh)] || KIND.custom)).title = t('kind_' + shieldKind(sh));
      head.appendChild(el('span', 'ss-shield-name', shieldName(sh))).title = shieldName(sh);
      if (locked) head.appendChild(el('span', 'ss-badge ss-badge-small', 'PRO'));
      const sw = el('label', 'ss-switch'); sw.title = t('shield_switch');
      const cb = el('input'); cb.type = 'checkbox'; cb.checked = sh.on !== false; cb.disabled = locked;
      cb.addEventListener('change', () => setShield(sh.id, { on: cb.checked }));
      sw.appendChild(cb); sw.appendChild(el('span', 'ss-track')).setAttribute('aria-hidden', 'true');
      head.appendChild(sw);
      const del = el('button', 'ss-x', '✕'); del.title = t('shield_delete'); del.setAttribute('aria-label', t('shield_delete'));
      del.addEventListener('click', () => {
        if (del.dataset.sure !== '1') { del.dataset.sure = '1'; del.textContent = t('shield_delete_sure'); del.classList.add('ss-sure'); return; }
        save({ shields: shields().filter((x) => x.id !== sh.id) });
      });
      head.appendChild(del);
      card.appendChild(head);
      if (locked) {
        card.appendChild(el('div', 'ss-hint', t('locked_custom')));
      } else {
        const row = el('div', 'ss-shield-row');
        row.appendChild(select([['spoilers', 'opt_spoilers'], ['everything', 'opt_everything']], sh.mode === 'everything' ? 'everything' : 'spoilers', (v) => setShield(sh.id, { mode: v }), t('level')));
        row.appendChild(select([['blur', 'opt_blur'], ['remove', 'opt_remove']], sh.action === 'remove' ? 'remove' : 'blur', (v) => setShield(sh.id, { action: v }), t('opt_action')));
        if (!sh.preset) {
          const ed = el('button', 'ss-mini', openEdit === sh.id ? t('shield_done') : t('shield_edit'));
          ed.addEventListener('click', () => { openEdit = openEdit === sh.id ? '' : sh.id; render(); });
          row.appendChild(ed);
        }
        const more = el('button', 'ss-mini', openMore === sh.id ? t('shield_done') : t('shield_more'));
        if (sh.upTo || sh.release || sh.until) more.classList.add('ss-on');
        more.addEventListener('click', () => { openMore = openMore === sh.id ? '' : sh.id; render(); });
        row.appendChild(more);
        card.appendChild(row);
        if (!sh.preset && openEdit === sh.id) card.appendChild(editor(sh));
        if (openMore === sh.id) card.appendChild(proOptions(sh));
      }
      list.appendChild(card);
    });
    $('addBtn').textContent = $('addBox').hidden ? t('add_shield') : t('add_close');
    if (!$('addBox').hidden) renderLibrary();
  }
  /** Pro options of one shield: watched up to episode N, release date, protect until. */
  function proOptions(sh) {
    const box = el('div', 'ss-edit ss-more');
    const head = el('div', 'ss-shield-row');
    head.appendChild(el('span', 'ss-badge ss-badge-small', 'PRO'));
    head.appendChild(el('span', 'ss-hint', info.pro ? t('more_hint') : t('more_locked')));
    box.appendChild(head);
    const field = (key, type, labelKey, attrs) => {
      const lab = el('label', 'ss-field');
      lab.appendChild(el('span', '', t(labelKey)));
      const f = el('input'); f.type = type; f.value = sh[key] || ''; f.disabled = !info.pro;
      Object.assign(f, attrs || {});
      f.addEventListener('change', () => setShield(sh.id, { [key]: type === 'number' ? (parseInt(f.value, 10) > 0 ? parseInt(f.value, 10) : '') : f.value }));
      lab.appendChild(f); box.appendChild(lab);
    };
    if (shieldKind(sh) !== 'game') field('upTo', 'number', 'more_upto', { min: 0, max: 99999, placeholder: '1190' });
    field('release', 'date', 'more_release');
    field('until', 'date', 'more_until');
    if (!info.pro) { const b = el('button', 'ss-btn ss-btn-small', t('pro_buy')); b.addEventListener('click', toPro); box.appendChild(b); }
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
      b.appendChild(el('span', 'ss-kind', KIND[p.kind] || ''));
      b.appendChild(el('span', 'ss-grow', p.label));
      if (have.has(p.id)) { b.disabled = true; b.appendChild(el('span', 'ss-hint', t('lib_added'))); }
      b.addEventListener('click', () => addPreset(p));
      list.appendChild(b);
    }
    if (!list.firstChild) list.appendChild(el('div', 'ss-hint', t('lib_nothing')));
  }
  function addErr(text) { $('addErr').textContent = text; $('addErr').hidden = !text; }
  function toPro() { $('proBox').scrollIntoView({ behavior: 'smooth', block: 'start' }); $('proBox').classList.add('ss-flash'); setTimeout(() => $('proBox').classList.remove('ss-flash'), 1200); }
  function addPreset(p) {
    if (shields().length >= MAX_SHIELDS) { addErr(t('shields_max')); return; }
    addErr('');
    // a season of a show or an anime is spoiled by almost any news about it: hide everything by default (1.1)
    const mode = p.kind === 'anime' || p.kind === 'show' ? 'everything' : 'spoilers';
    save({ shields: shields().concat([{ id: p.id, preset: p.id, mode, action: 'blur', on: true }]) });
  }
  function addCustom() {
    const title = $('cTitle').value.trim(); const names = $('cNames').value.trim();
    if (!title) { addErr(t('custom_need_title')); $('cTitle').focus(); return; }
    if (!info.pro && shields().filter((x) => !x.preset).length >= SS.FREE_OWN) { addErr(t('custom_pro_only')); toPro(); return; }
    if (shields().length >= MAX_SHIELDS) { addErr(t('shields_max')); return; }
    addErr('');
    $('cTitle').value = ''; $('cNames').value = '';
    save({ shields: shields().concat([{ id: 'own-' + Date.now().toString(36), title: title.slice(0, 2000), names: names.slice(0, 5000), words: '', mode: 'spoilers', action: 'blur', on: true }]) });
  }
  function wireShields() {
    $('addBtn').addEventListener('click', () => { $('addBox').hidden = !$('addBox').hidden; addErr(''); render(); if (!$('addBox').hidden) $('libSearch').focus(); });
    $('libSearch').addEventListener('input', renderLibrary);
    $('cAdd').addEventListener('click', addCustom);
    $('cTitle').addEventListener('keydown', (e) => { if (e.key === 'Enter') addCustom(); });
  }

  /* Pro: backup — the list of shields as a small file, and back */
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
    const note = (k) => { $('backupNote').textContent = t(k); $('backupNote').hidden = false; };
    if (!f || f.size > 200000) return note('backup_bad');
    try {
      const d = JSON.parse(await f.text());
      const ok = (x) => x && typeof x === 'object' && typeof x.id === 'string' && (x.preset ? SS.LIBRARY.some((p) => p.id === x.preset) : typeof x.title === 'string' || typeof x.words === 'string');
      const list = Array.isArray(d && d.shields) ? d.shields.filter(ok).slice(0, MAX_SHIELDS) : [];
      if (!list.length) return note('backup_bad');
      const clean = list.map((x) => ({ id: x.id.slice(0, 60), preset: x.preset || undefined, title: x.preset ? undefined : String(x.title || '').slice(0, 2000), names: x.preset ? undefined : String(x.names || '').slice(0, 5000), words: x.preset ? undefined : String(x.words || '').slice(0, 5000), label: x.label ? String(x.label).slice(0, 60) : undefined, mode: x.mode === 'everything' ? 'everything' : 'spoilers', action: x.action === 'remove' ? 'remove' : 'blur', on: x.on !== false, upTo: parseInt(x.upTo, 10) > 0 ? parseInt(x.upTo, 10) : undefined, release: /^\d{4}-\d{2}-\d{2}$/.test(x.release || '') ? x.release : undefined, until: /^\d{4}-\d{2}-\d{2}$/.test(x.until || '') ? x.until : undefined }));
      await save({ shields: clean, trusted: typeof d.trusted === 'string' ? d.trusted.slice(0, 5000) : (S.trusted || '') });
      note('backup_done');
    } catch (e) { note('backup_bad'); }
  }
  function showKeyErr(text) { $('keyErr').textContent = text; $('keyErr').hidden = false; }

  async function start() {
    SS.applyI18n(document);
    document.documentElement.lang = (api.i18n.getUILanguage() || 'en').split('-')[0];
    const r = await api.storage.local.get({ settings: {} });
    S = Object.assign({}, DEFAULTS, r.settings || {});
    wire();
    await Promise.all([refreshInfo(), refreshPage(), checkPermission()]);
    render();
    api.storage.onChanged.addListener(async (c, area) => {
      if (area !== 'local') return;
      if (c.settings && c.settings.newValue && document.activeElement && !document.activeElement.closest('.ss-shield, .ss-addbox')) { S = Object.assign({}, DEFAULTS, c.settings.newValue); render(); }
      if (c.stats || c.license) { await refreshInfo(); render(); }
    });
  }
  start();
})();
