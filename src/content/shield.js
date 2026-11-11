/*!
 * Pure Spoiler Shield — page side. Runs on YouTube, Reddit and X (and, with Pro, on every site).
 * Reads only the text of the page in this browser, judges it with lib/words.js and hides blocks that may spoil
 * the game. Nothing is stored about pages and nothing is sent anywhere; the only message out is "N blocks hidden"
 * to the extension's own background (for the counter on the icon).
 * Firefox note (DECISIONS 25.10.2026): shared code goes through globalThis, never window.
 */
(() => {
  'use strict';
  if (globalThis.__pureSpoilerShield) return;
  globalThis.__pureSpoilerShield = true;
  const SS = globalThis.SS;
  const api = globalThis.browser && globalThis.browser.runtime ? globalThis.browser : globalThis.chrome;
  const t = (k, ...v) => { let m = ''; try { m = api.i18n.getMessage(k) || ''; } catch (e) { m = ''; } return (m || k).replace(/\{(\d+)\}/g, (a, i) => (v[i] != null ? v[i] : a)); };

  /* ---------------------------------------------------------------- sites */
  const host = location.hostname.toLowerCase();
  const P = globalThis.SS_SITES;                     // content/sites.js — selectors of every site (1.2)
  const SITE = P.detect(host);
  const CARDS = P.CARDS, GONE = P.GONE, COMMENTS = P.COMMENTS;
  // big blocks of a generic page that can hold a spoiler on their own (Pro, every site)
  const GENERIC_BLOCK = 'article, [role="article"], li, [role="listitem"], tr, [class*="comment" i], [class*="post" i], [class*="card" i], [class*="message" i], [class*="tweet" i], [class*="story" i], [class*="result" i], blockquote, figure';
  // the site's own frame — logo, top bar, side menu, search form — is never covered (1.1: the YouTube logo was)
  const CHROME_ZONE = 'ytd-masthead, #masthead-container, #masthead, tp-yt-app-drawer, #guide, ytd-mini-guide-renderer, ytd-guide-renderer, [role="banner"], [role="navigation"], nav, [role="search"], body > header, body > footer, footer[role="contentinfo"], #searchform, #gb, reddit-header-large, faceplate-search-input, head, [role="searchbox"], [role="combobox"], [data-e2e="search-box"], [data-e2e="nav-search"]';
  // AI summaries that retell the story (Pro "hide AI summaries"): their label, in the 13 languages
  const AI_LABELS = ['ai overview', 'ai overviews', 'ai summary', 'ai generated summary', 'summary by ai', 'обзор от ии', 'ии обзор', 'краткий обзор от ии', 'конспект', 'огляд від ші', 'короткий огляд від ші',
    'przeglad od ai', 'przegląd od ai', 'podsumowanie ai', 'ubersicht mit ki', 'übersicht mit ki', 'ki übersicht', 'ki zusammenfassung', 'apercu ia', 'aperçu ia', 'aperçus ia', 'resumen de ia', 'vision general creada por ia', 'visión general creada por ia',
    'visao geral criada por ia', 'visão geral criada por ia', 'resumo de ia', 'panoramica ai', 'riepilogo ai', 'yapay zeka genel bakisi', 'yapay zeka genel bakışı', 'ai による概要', 'ai 概要', 'ai 개요', 'ai 요약', 'ai 概览', 'ai 摘要'];
  const AI_NORM = AI_LABELS.map((x) => SS.normalize(x));
  const hasAI = (norm) => AI_NORM.some((w) => norm.includes(w));
  const cardSel = CARDS[SITE].join(',');
  const goneSel = GONE[SITE].join(',');
  const foldSel = COMMENTS[SITE].join(',');
  const linkSel = (P.LINKS[SITE] || []).join(',');
  const keepSel = (P.KEEP[SITE] || []).join(',');
  const skipSel = (P.SKIP_ZONE[SITE] || []).join(',');
  const WATCH = P.WATCH[SITE] || null;
  // the site's frame and its private parts (inbox, notifications, messages) — never covered
  const offLimits = (el) => !!(el.closest(CHROME_ZONE) || (skipSel && el.closest(skipSel)));
  // typing places: a block that holds an editor is never covered (Антон 04.11: his own Reddit post got blurred)
  const EDITOR = 'textarea, [contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"], input[type="text"], input:not([type])';
  const COMPOSE_PATH = { reddit: /\/submit\b/, x: /\/compose\//, youtube: /^\/upload/ }[SITE];

  /* ---------------------------------------------------------------- settings */
  const DEFAULT_SHIELDS = [{ id: 'gta6', preset: 'gta6', mode: 'spoilers', action: 'blur', on: true }];
  const DEFAULTS = { enabled: true, comments: true, media: false, offSites: [], pausedUntil: 0, protectUntil: '', everywhere: true, shields: DEFAULT_SHIELDS, hideAI: true, trusted: '', blocked: '' };
  let S = Object.assign({}, DEFAULTS); let pro = false; let shields = [];
  function active() {
    if (!S.enabled || !shields.length) return false;
    if (S.pausedUntil && Date.now() < S.pausedUntil) return false;
    if ((S.offSites || []).includes(siteKey())) return false;
    if (pro && S.protectUntil && Date.now() > Date.parse(S.protectUntil + 'T23:59:59')) return false;
    return true;
  }
  function siteKey() { return SITE === 'generic' || SITE === 'google' ? host.replace(/^www\./, '') : SITE; }

  /* ---------------------------------------------------------------- state */
  let seen = new WeakMap();        // element -> { sig, revealed } — replaced on every full rescan
  const textVeils = new WeakMap();  // veil put by the text search → its reason (to move it one block up when narrow)
  let holders = new WeakMap();      // covered parent → Set of the blocks whose text needs it covered
  const veiled = new Set();
  function report(n) {   // one message per scan batch, only "how many" — nothing about the page
    if (n) try { api.runtime.sendMessage({ type: 'pss:hidden', n }).catch(() => {}); } catch (e) { /* extension reloaded */ }
  }

  let pageCtx = false; let contexts = new Set(); let ctxLabel = ''; let lastUrl = '';
  const NO_CTX = new Set();
  function pageText() {
    let s = document.title || '';
    const h = document.querySelector('ytd-watch-metadata h1, h1.ytd-watch-metadata, shreddit-post [slot="title"], h1');
    if (h) s += ' ' + h.textContent;
    if (SITE === 'google') { try { s += ' ' + (new URL(location.href).searchParams.get('q') || ''); } catch (e) { /* ignore */ } }
    if (SITE === 'reddit') s += ' ' + location.pathname.replace(/[/_-]+/g, ' ');   // r/GTA6, r/OnePiece …
    return s;
  }
  // 1.2.1 (review PR #3): the script starts before the page is read (document_start): the title and heading are not
  // there yet. The context is recomputed whenever address, title or heading change; when the protected titles of the
  // page change, the whole page is judged again (comments, pictures).
  function pageSig() {
    const h = document.querySelector('ytd-watch-metadata h1, h1.ytd-watch-metadata, shreddit-post [slot="title"], h1');
    return location.href + '|' + (document.title || '') + '|' + (h ? (h.textContent || '').slice(0, 200) : '');
  }
  function updateContext() {
    const norm = SS.normalize(pageText());
    const hit = shields.filter((sh) => SS.isAbout(norm, sh));
    contexts = new Set(hit.map((sh) => sh.key));
    pageCtx = contexts.size > 0;
    ctxLabel = hit.length ? hit[0].label : '';
  }

  /** Text of an element with a space between pieces (sites put words in neighbouring spans without spaces). */
  function joinedText(el, max) {
    const parts = []; let len = 0;
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let x = w.nextNode(); x && len < max; x = w.nextNode()) {
      const p = x.parentElement;
      if (p && (p.tagName === 'SCRIPT' || p.tagName === 'STYLE')) continue;
      parts.push(x.nodeValue); len += x.nodeValue.length + 1;
    }
    return parts.join(' ');
  }
  // 1.2.1: TikTok puts the song into the picture's alt text ("… с композицией «Final Game Showdown» (исполнитель X)") —
  // the song name says nothing about the video and gave false hits ("final"). Only in alt / aria-label, only the
  // pattern seen on real pages (review PR #3: in the visible text it cut real spoilers out).
  const SONG = /\s(с композицией|з композицією|with the (sound|song|music))\s*«[^»]{0,120}»(\s*\([^)]{0,80}\))?/gi;
  function textOf(el) {
    let s = joinedText(el, 4000);
    const attrs = [el, ...el.querySelectorAll('[title], [aria-label], img[alt]')].slice(0, 40);
    for (const a of attrs) {
      const v = a.getAttribute('title') || a.getAttribute('aria-label') || (a.tagName === 'IMG' ? a.getAttribute('alt') : '');
      if (v) s += ' ' + ((SITE === 'tiktok' || SITE === 'instagram') ? v.replace(SONG, ' ') : v).slice(0, 300);
    }
    return s;
  }
  /** null, or { reason, label, action, key } of the first shield that matches. */
  const judgeText = (s, ctx, level) => {
    const norm = SS.normalize(s);
    // Pro: an AI summary about a protected title is hidden whatever the level — it retells the story
    const force = level || (pro && S.hideAI !== false && hasAI(norm) ? 'everything' : '');
    return SS.judgeAll(norm, shields, ctx ? contexts : NO_CTX, force);
  };

  /* Pro "trusted": channels, subreddits and accounts whose posts are never hidden (the person trusts them). */
  let trustedSet = new Set();
  const handle = (x) => String(x || '').toLowerCase().trim().replace(/^https?:\/\/[^/]+/, '').replace(/^\/+/, '').replace(/^(@|r\/|u\/|user\/|c\/|channel\/)/, '').replace(/[/?#].*$/, '').replace(/\s+/g, ' ');
  function authorKeys(el) {
    const keys = [];
    for (const a of [el, ...el.querySelectorAll('[subreddit-prefixed-name], [subreddit-name], [author]')].slice(0, 6)) {
      for (const at of ['subreddit-prefixed-name', 'subreddit-name', 'author']) { const v = a.getAttribute && a.getAttribute(at); if (v) keys.push(handle(v)); }
    }
    for (const a of el.querySelectorAll('a[href^="/@"], a[href*="youtube.com/@"], a[href^="/channel/"], a[href^="/c/"], a[href^="/user/"], a[href^="/r/"], a[href*="reddit.com/r/"], [data-testid="User-Name"] a[href^="/"]')) {
      keys.push(handle(a.getAttribute('href')));
      if (keys.length > 12) break;
    }
    for (const n of el.querySelectorAll('ytd-channel-name, #channel-name, .ytd-channel-name')) { const v = (n.textContent || '').trim(); if (v && v.length < 80) keys.push(handle(v)); }
    return keys.filter(Boolean);
  }
  /* 1.2 Pro "always hide these authors": channels/accounts that keep posting spoilers — hidden whatever they write. */
  let blockedSet = new Set();
  function isBlocked(el) {
    if (!pro || !blockedSet.size || !el || !el.querySelectorAll) return false;
    return authorKeys(el).some((k) => blockedSet.has(k));
  }
  function isTrusted(el) {
    if (!pro || !trustedSet.size || !el || !el.querySelectorAll) return false;
    return authorKeys(el).some((k) => trustedSet.has(k));
  }
  function pageTrusted() {
    if (!pro || !trustedSet.size) return false;
    if (SITE === 'reddit') { const m = /^\/r\/([^/]+)/.exec(location.pathname); if (m && trustedSet.has(handle(m[1]))) return true; }
    const owner = document.querySelector('ytd-watch-metadata #owner, #owner, ytd-video-owner-renderer');
    return owner ? isTrusted(owner) : false;
  }

  /* ---------------------------------------------------------------- veil / fold / gone */
  const labelFor = (res) => (res.reason === 'author' ? t('veil_author') : t('veil_label', res.label));
  function veil(el, res) {
    if (offLimits(el)) return false;
    if (COMPOSE_PATH && COMPOSE_PATH.test(location.pathname)) return false;            // writing a post: never
    if (el.matches(EDITOR) || el.closest(EDITOR) || el.querySelector(EDITOR)) return false;
    const why = res.reason + '|' + res.key;
    if (el.classList.contains('pss-veil')) {       // already hidden: keep it, but the reason may have changed
      if (el.dataset.pssReason !== why) { el.dataset.pssReason = why; el.dataset.pssBase = el.dataset.pssLabel = labelFor(res); }
      return false;
    }
    const outer = el.parentElement && el.parentElement.closest('.pss-veil');
    if (outer) return false;                        // a bigger veil already covers it
    for (const inner of el.querySelectorAll('.pss-veil')) unveil(inner);   // one veil per item, not a veil on a veil
    el.classList.remove('pss-fading');
    el.classList.add('pss-veil');
    measureLater(el);
    el.dataset.pssReason = why;
    el.dataset.pssBase = labelFor(res);
    el.dataset.pssLabel = el.dataset.pssBase;
    // screen readers: the hidden text must not be read aloud either
    if (!el.hasAttribute('data-pss-aria')) el.setAttribute('data-pss-aria', el.getAttribute('aria-hidden') || '');
    el.setAttribute('aria-hidden', 'true');
    if (keepSel) for (const k of el.querySelectorAll(keepSel)) k.classList.add('pss-keep');   // author stays visible
    silence(el);
    veiled.add(el);
    return true;
  }
  /* 1.2: a video under a veil is paused and muted (the voice can tell the ending too); shown again → as it was. */
  function silence(el) {
    const vids = el.tagName === 'VIDEO' ? [el] : el.querySelectorAll('video');
    if (!vids.length) return;
    el.classList.add('pss-video');                   // thick veil: a blur over a playing video is not reliable
    for (const v of vids) {
      if (!v.hasAttribute('data-pss-muted')) v.setAttribute('data-pss-muted', v.muted ? '1' : '0');
      try { v.muted = true; if (!v.paused) v.pause(); } catch (e) { /* ignore */ }
    }
  }
  function unsilence(el) {
    el.classList.remove('pss-video');
    const vids = el.tagName === 'VIDEO' ? [el] : el.querySelectorAll('video');
    for (const v of vids) {
      if (!v.hasAttribute('data-pss-muted')) continue;
      try { v.muted = v.getAttribute('data-pss-muted') === '1'; } catch (e) { /* ignore */ }
      v.removeAttribute('data-pss-muted');
    }
  }
  // Sizes are read once per frame for all new veils together (reading a size right after a change forces the
  // browser to lay out the page again — on a long feed that was the slow part). 1.2: and again when a veiled
  // block changes size (ResizeObserver) — the label was cut when a card grew after it was covered.
  const toMeasure = new Set(); let measureQueued = false;
  function sizeClasses(x, w, h) {
    x.classList.toggle('pss-small', h > 0 && h < 70);
    // too small for the words: only the blur and a small shield (1.1 — the cut-off "Click to sh…")
    x.classList.toggle('pss-tiny', (h > 0 && h < 48) || (w > 0 && w < 150));
  }
  const resizer = typeof ResizeObserver === 'function' ? new ResizeObserver((list) => {
    for (const e of list) { const r = e.contentRect; if (e.target.classList.contains('pss-veil')) sizeClasses(e.target, r.width, r.height); }
  }) : null;
  function measureLater(el) {
    if (el) toMeasure.add(el);
    if (measureQueued) return;
    measureQueued = true;
    const run = () => {
      measureQueued = false;
      const items = Array.from(toMeasure); toMeasure.clear();
      const rs = items.map((x) => (x.isConnected ? x.getBoundingClientRect() : null));
      // 1.2.1: a text veil that turned out narrow (a name chip, a short line in a side panel) moves one block up —
      // sizes are known only here, read once per frame for all veils (review PR #3: reading them per block was slow)
      const up = items.filter((x, i) => rs[i] && rs[i].width > 0 && rs[i].width < 120 && x.classList.contains('pss-veil') && textVeils.has(x) && +(x.dataset.pssUp || 0) < 3);
      for (const x of up) promote(x);
      items.forEach((x, i) => {
        const r = rs[i];
        if (!x.classList.contains('pss-veil')) return;
        sizeClasses(x, r ? r.width : 0, r ? r.height : 0);
        if (keepSel) for (const k of x.querySelectorAll('.pss-keep')) { try { if (getComputedStyle(k).position === 'static') k.classList.add('pss-keep-rel'); } catch (e) { /* ignore */ } }
        if (resizer && x.classList.contains('pss-veil')) try { resizer.observe(x); } catch (e) { /* ignore */ }
      });
      runMedia();
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run); else Promise.resolve().then(run);
  }
  function restoreAria(el) {
    if (!el.hasAttribute('data-pss-aria')) return;
    const old = el.getAttribute('data-pss-aria');
    if (old) el.setAttribute('aria-hidden', old); else el.removeAttribute('aria-hidden');
    el.removeAttribute('data-pss-aria');
  }
  function unveil(el, smooth) {
    if (!el.classList) return;
    if (el.classList.contains('pss-removed')) { el.classList.remove('pss-gone', 'pss-removed'); veiled.delete(el); }
    if (!el.classList.contains('pss-veil')) return;
    const done = () => {
      el.classList.remove('pss-veil', 'pss-small', 'pss-tiny', 'pss-armed');
      delete el.dataset.pssLabel; delete el.dataset.pssReason; delete el.dataset.pssBase; delete el.dataset.pssUp;
      textVeils.delete(el);
      for (const k of el.querySelectorAll('.pss-keep')) k.classList.remove('pss-keep', 'pss-keep-rel');
    };
    if (resizer) try { resizer.unobserve(el); } catch (e) { /* ignore */ }
    restoreAria(el);
    unsilence(el);
    veiled.delete(el);
    done();
    // 1.2: shown on purpose → a copy of the veil fades out (≈0.18 s). The block itself is shown at once, so nothing
    // depends on a timer (Firefox may hold timers back); if the fade never ends, it stays invisible and click-through.
    if (smooth && !(globalThis.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) {
      el.classList.add('pss-fading');
      el.addEventListener('animationend', () => el.classList.remove('pss-fading'), { once: true });
    }
  }
  /** "Remove" shields: the block is simply not shown (no veil, nothing to click). */
  function removeBlock(el) {
    if (offLimits(el)) return false;
    if (el.classList.contains('pss-removed')) return false;
    unveil(el);
    el.classList.add('pss-gone', 'pss-removed');
    veiled.add(el);
    return true;
  }
  /*
   * 1.3.1 (Антон 06.11, видео): what the person opened with two clicks stays open. Before, a revealed card went back
   * under its veil whenever the site touched its text (YouTube does that all the time in the side list) — "no matter how
   * many times I click". An opened element is remembered with where it was opened (address) and which thing it was
   * (the card's own link, else the beginning of its text); a recycled element showing something else is judged again.
   */
  let opened = new WeakMap();
  const idOf = (el) => { const a = el.matches && el.matches('a[href]') ? el : (el.querySelector ? el.querySelector('a[href]') : null); return a ? String(a.getAttribute('href') || '').split('#')[0].slice(0, 200) : ''; };
  const headOf = (el) => SS.normalize(joinedText(el, 300)).slice(0, 40);
  // the video page opened by the person stays open while it is the same video (a time stamp or list in the address changes href)
  let openedWatch = '';
  const watchKey = () => location.pathname + '|' + (new URLSearchParams(location.search).get('v') || '');
  function markOpened(el) { try { opened.set(el, { url: location.href, id: idOf(el), head: idOf(el) ? '' : headOf(el) }); } catch (e) { /* ignore: not an element */ } }
  function isOpened(el) {
    const o = opened.get(el);
    if (!o) return false;
    if (o.url !== location.href || (o.id ? idOf(el) !== o.id : headOf(el) !== o.head)) { opened.delete(el); return false; }
    return true;
  }
  function hide(el, res) { if (isOpened(el)) return false; return res.action === 'remove' ? removeBlock(el) : veil(el, res); }

  function checkCard(el, isItem) {
    if (!el || !el.isConnected || el.nodeType !== 1) return 0;
    if (el.closest('.pss-ui')) return 0;
    if (isItem) return judgeCard(el);
    // the outermost card decides — unless it is a box of several cards (a Google carousel, a shelf): then each card does
    for (let p = el.parentElement && el.parentElement.closest(cardSel || '#\\-none'); p; p = p.parentElement && p.parentElement.closest(cardSel)) {
      if (!isContainer(p)) return 0;
    }
    if (isContainer(el)) { unveil(el); return 0; }
    return judgeCard(el);
  }
  function judgeCard(el) {
    if (isBlocked(el)) { seen.set(el, { sig: 'author', revealed: false }); return hide(el, { reason: 'author', label: '', key: 'author', action: 'blur' }) ? 1 : 0; }
    const sig = textOf(el);
    const st = seen.get(el);
    if (st && st.sig === sig) return 0;                                                  // nothing changed
    if (isOpened(el)) { seen.set(el, { sig, revealed: true }); return 0; }               // opened by the person: stays open
    seen.set(el, { sig, revealed: false });
    const res = isTrusted(el) ? null : judgeText(sig, pageCtx);
    if (res) return hide(el, res) ? 1 : 0;
    unveil(el);                                                                            // recycled element, new content
    return 0;
  }
  function isContainer(el) { return !!cardSel && el.querySelectorAll(cardSel).length >= 2; }

  function checkGone(el) {
    const s = joinedText(el, 1000) + ' ' + (el.getAttribute('aria-label') || '');
    // 1.2: search suggestions are judged as "everything": "one piece son of roger" has no spoiler word, but a
    // suggestion is exactly where a spoiler jumps at you while you type (Антон 06.11). Search results stay as they were.
    const hideIt = !!judgeText(s, false, 'everything');
    if (hideIt !== el.classList.contains('pss-gone')) { el.classList.toggle('pss-gone', hideIt); return hideIt ? 1 : 0; }
    return 0;
  }

  function checkFold(el) {
    if (!S.comments || !pageCtx || pageTrusted()) { unfold(el); return 0; }
    const st = seen.get(el);
    if (st && st.revealed && st.url === location.href) return 0;
    if (el.classList.contains('pss-fold')) return 0;
    seen.set(el, { revealed: false, url: location.href });
    el.classList.add('pss-fold');
    el.dataset.pssBase = el.dataset.pssLabel = t('fold_comments', ctxLabel);
    return 1;
  }
  function unfold(el) { el.classList.remove('pss-fold', 'pss-armed'); delete el.dataset.pssLabel; delete el.dataset.pssBase; }

  /*
   * Pictures and videos on a page about a protected title (leaks are often a photo with no words).
   * 1.2 (Антон 06.11, TikTok): only the previews of videos and posts — never avatars, notifications, menus, side
   * panels; the size is read from the drawn picture (img.width before drawing is the file size, so avatars passed);
   * the veil goes on the block that really covers the picture (a thin wrapper made "арти/ноже/ойле" strips).
   */
  const MEDIA = 'img, video, picture, shreddit-player, shreddit-aspect-ratio, [data-testid="tweetPhoto"], [data-testid="videoPlayer"], faceplate-img';
  const ITEM_ZONE = 'article, main, [role="main"], #search, #rso, #contents, #primary, #secondary';
  const NOT_ITEM = 'aside, nav, header, footer, [role="complementary"], [role="dialog"][aria-label*="notif" i], [role="menu"], [role="listbox"]';
  const pendingMedia = new Set();
  function inItem(m) {
    if (cardSel && m.closest(cardSel)) return true;
    if (linkSel && (m.closest(linkSel) || itemOfMedia(m))) return true;
    if (SITE === 'tiktok' || SITE === 'instagram') return false;       // there: only what belongs to a video/post
    return !!m.closest(ITEM_ZONE) && !m.closest(NOT_ITEM);
  }
  function itemOfMedia(m) {
    for (let p = m.parentElement, i = 0; p && i < 6; p = p.parentElement, i++) { const a = p.querySelector(linkSel); if (a) return linkItem(a); }
    return null;
  }
  function checkMedia(root) {
    if (!S.media || !pageCtx) return 0;
    const list = root.matches && root.matches(MEDIA) ? [root] : [];
    for (const m of root.querySelectorAll ? root.querySelectorAll(MEDIA) : []) list.push(m);
    for (const m of list) {
      if (m.closest('.pss-veil, .pss-ui') || offLimits(m) || !inItem(m)) continue;
      pendingMedia.add(m);
    }
    if (pendingMedia.size) measureLater(null);
    return 0;                                         // counted when covered (next frame)
  }
  function runMedia() {
    if (!pendingMedia.size) return;
    const list = Array.from(pendingMedia); pendingMedia.clear();
    let n = 0;
    for (const m of list) {
      if (!m.isConnected || m.closest('.pss-veil')) continue;
      const r = m.getBoundingClientRect();
      if (r.width < 120 || r.height < 80) continue;   // avatars, logos, icons, chips — or not drawn yet (load re-checks)
      let box = null;
      const a = linkSel && m.closest(linkSel);
      if (a) { const ra = a.getBoundingClientRect(); if (ra.width >= r.width * 0.85 && ra.height >= r.height * 0.85) box = a; }
      if (!box) {
        const first = m.closest('a, figure, [data-testid="tweetPhoto"], shreddit-aspect-ratio, shreddit-player') || (/^(IMG|VIDEO|PICTURE|SOURCE)$/.test(m.tagName) ? m.parentElement : m);
        const limit = (cardSel && m.closest(cardSel)) || null;     // never above the post / video it belongs to
        box = first;
        for (let p = first, i = 0; p && i < 6 && p !== document.body && p !== document.documentElement; p = p.parentElement, i++) {
          if (/^(IMG|VIDEO|PICTURE|SOURCE)$/.test(p.tagName)) continue;
          const rp = p.getBoundingClientRect();
          if (rp.width >= r.width * 0.85 && rp.height >= r.height * 0.85) { box = p; break; }
          if (p === limit) break;
        }
      }
      if (!box || box === document.body || seen.get(box) || offLimits(box)) continue;
      seen.set(box, { sig: 'media', revealed: false });
      if (veil(box, { reason: 'media', label: ctxLabel, key: 'media' })) { box.dataset.pssBase = box.dataset.pssLabel = t('media_label', ctxLabel); n++; }
    }
    if (n) report(n);
  }
  document.addEventListener('load', (e) => {      // a picture got drawn: now its real size is known
    const m = e.target;
    if (!m || m.tagName !== 'IMG' || !S.media || !pageCtx || !active()) return;
    if (!m.closest('.pss-veil, .pss-ui') && !offLimits(m) && inItem(m)) { pendingMedia.add(m); measureLater(null); }
  }, true);

  /*
   * One item = the biggest block around a link to a video/post that holds no other item (TikTok, Instagram).
   * Built from the page structure, not class names, so it survives a site's redesign.
   */
  const itemCache = new WeakMap();
  function linkItem(a) {
    const href = a.getAttribute('href') || '';
    const c0 = itemCache.get(a);
    if (c0 && c0.href === href && (!c0.item || c0.item.isConnected)) return c0.item;
    let c = a;
    for (let i = 0; i < 8; i++) {
      const p = c.parentElement;
      if (!p || p === document.body || p === document.documentElement) break;
      let other = false;
      for (const x of p.querySelectorAll(linkSel)) if ((x.getAttribute('href') || '') !== href) { other = true; break; }
      if (other) break;
      c = p;
    }
    const item = offLimits(c) ? null : c;
    itemCache.set(a, { href, item });
    return item;
  }

  /* A page that shows one video: YouTube watch/Shorts, TikTok video, Instagram reel/post. A spoiler video gets a
   * veil over the player and the title, and stays paused and muted. */
  let playerVeiled = false;
  function findPlayer() {
    if (SITE === 'youtube') return document.querySelector('#player-container-outer, ytd-watch-flexy #player, #shorts-player, ytd-reel-video-renderer[is-active] #player-container');
    if (!WATCH) return null;
    for (const sel of WATCH.player) { const x = document.querySelector(sel); if (x) return x; }
    let best = null, area = 0;                        // no known name: the biggest video on the page
    for (const v of document.querySelectorAll('video')) { const r = v.getBoundingClientRect(); if (r.width * r.height > area) { area = r.width * r.height; best = v; } }
    return best && area > 40000 ? (best.parentElement || best) : null;
  }
  function watchText() {
    let s = pageText();
    if (WATCH) for (const sel of WATCH.text) { const x = document.querySelector(sel); if (x && !x.closest('.pss-ui')) s += ' ' + textOf(x); }
    return s;
  }
  function checkWatchPage() {
    const isWatch = SITE === 'youtube' ? /^\/(watch|shorts\/)/.test(location.pathname) : !!(WATCH && WATCH.path.test(location.pathname));
    if (!isWatch) { playerVeiled = false; return 0; }
    const text = watchText();
    const res = pageTrusted() ? null : judgeText(text, false);
    const sig = location.href + '|' + (res ? res.key + res.reason : '');
    const player = SITE === 'youtube' || res || playerVeiled ? findPlayer() : null;
    if (!player) { if (!res) playerVeiled = false; return 0; }
    const meta = SITE === 'youtube' ? document.querySelector('ytd-watch-metadata, #above-the-fold') : null;
    const st = seen.get(player);
    if (st && st.sig === sig) return 0;
    if (res && openedWatch === watchKey()) { seen.set(player, { sig, revealed: true }); return 0; }   // opened by the person: same video stays open
    seen.set(player, { sig, revealed: false });
    if (!res) { unveil(player); if (meta) unveil(meta); playerVeiled = false; return 0; }
    veil(player, res); player.dataset.pssBase = player.dataset.pssLabel = t('player_label', res.label);
    if (meta) veil(meta, res);
    playerVeiled = true; silence(player);
    return 1;
  }
  // a video inside a veil does not start (the site's own autoplay, the next Short / TikTok in the feed)
  document.addEventListener('play', (e) => {
    const v = e.target;
    if (!v || v.tagName !== 'VIDEO' || !v.closest('.pss-veil')) return;
    if (!v.hasAttribute('data-pss-muted')) v.setAttribute('data-pss-muted', v.muted ? '1' : '0');
    try { v.muted = true; v.pause(); } catch (err) { /* ignore */ }
  }, true);

  /* ---------------------------------------------------------------- text-based search (Pro sites + safety net) */
  const SKIP = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT', 'SELECT', 'CODE', 'PRE', 'SVG', 'TEMPLATE', 'IFRAME']);
  function genericBlock(node) {
    let el = node.parentElement;
    if (!el || SKIP.has(el.tagName) || el.isContentEditable || el.closest('.pss-ui, [contenteditable="true"]')) return null;
    // prefer the whole post / article / comment / card; fall back to the paragraph or heading when it is too big
    const big = el.closest(GENERIC_BLOCK);
    if (big && big !== document.body && big !== document.documentElement && (big.textContent || '').length <= 2500) return big;
    return el.closest('p, li, h1, h2, h3, h4, h5, h6, blockquote, td, dd, figcaption, a[href]') || el;
  }
  // On YouTube/Reddit/X: if the site renamed its cards and a title slipped past them, hide the nearest small
  // block around the text (a link or a heading) — better a bit too much than a spoiler.
  const SAFETY_BLOCK = 'a[href], h1, h2, h3, h4, [role="heading"], #video-title, yt-formatted-string, [data-testid="tweetText"], [slot="title"], p';
  function safetyBlock(node) {
    const el = node.parentElement;
    if (!el || SKIP.has(el.tagName) || el.isContentEditable || el.closest('[contenteditable="true"], input, textarea, .pss-veil, .pss-gone, .pss-fold')) return null;
    if (cardSel && el.closest(cardSel)) return null;                 // a known card already decides
    if (goneSel && el.closest(goneSel)) return null;
    const b = el.closest(SAFETY_BLOCK) || el;
    return (b.textContent || '').length <= 400 ? b : null;
  }
  // 1.2.1: collects the blocks of one root into `blocks`; scan() judges the blocks of all roots together (one batch →
  // the sizes are read once, not once per added element)
  function scanText(root, safety, blocks) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (x) => (x.nodeValue && x.nodeValue.length > 2 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT)
    });
    let count = 0;
    for (let x = walker.nextNode(); x && count < 20000; x = walker.nextNode(), count++) {
      const quick = SS.normalize(x.nodeValue);
      if (!SS.mentions(quick, shields)) continue;   // cheap first look
      const b = safety ? safetyBlock(x) : genericBlock(x);
      if (b) blocks.add(b);
    }
  }
  /*
   * 1.2 speed budget: on a huge page (Pro "every site": long articles, forums) the blocks are judged at most
   * ~10 ms per frame, top of the page first; the rest continues next frame, so the site never freezes.
   * Known sites (safety net) are judged at once: there the text must be covered before it is drawn.
   */
  const BUDGET_MS = 10;
  let laterBlocks = []; let laterQueued = false;
  function judgeBlocks(list, budget) {
    let n = 0; const t0 = performance.now(); const hits = [];
    for (let i = 0; i < list.length; i++) {
      if (budget && i % 20 === 19 && performance.now() - t0 > BUDGET_MS) {
        laterBlocks = laterBlocks.concat(list.slice(i));
        if (!laterQueued) { laterQueued = true; requestAnimationFrame(() => { laterQueued = false; const l = laterBlocks; laterBlocks = []; const k = judgeBlocks(l, true); if (k) report(k); }); }
        break;
      }
      const h = judgeBlock(list[i]);
      if (h) hits.push(h);
    }
    // 1.2.1 (review PR #3): sizes are read for all hits together, after the text is judged and before anything is
    // covered — reading a size right after covering the previous block made the browser lay out the page each time.
    for (const h of hits) h.target = blockFor(h.b);
    for (const h of hits) n += cover(h.b, h.target, h.res);
    return n;
  }
  /*
   * 1.2.1: a veil on a piece of a line (a link, a hashtag, a span inside a title) covered only that piece — the rest
   * of the line stayed readable and tiny "Click to sh…" strips appeared (Антон 06.11, YouTube description, Google
   * panel). The veil goes on the nearest real block around it (not a piece of a line), never above a card,
   * a box of several cards, the site's frame, a typing place or ~3000 characters of text. Only reads (no changes).
   */
  function longer(el, max) {        // more than max characters of text? (stops counting at max)
    let len = 0; const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let x = w.nextNode(); x; x = w.nextNode()) { len += x.nodeValue.length; if (len > max) return true; }
    return false;
  }
  function blockFor(el) {
    let cur = el;
    for (let i = 0; i < 8; i++) {
      if (cardSel && cur.matches(cardSel)) return cur;
      let disp = 'block';
      try { disp = getComputedStyle(cur).display; } catch (e) { disp = 'block'; }
      // a piece of a line: inline text, a link, a hashtag chip (inline-block / inline-flex). Only the display is read —
      // reading sizes here cost ~2 ms per block on YouTube (review PR #3), sizes are read later, once per frame.
      if (!/^(inline|inline-block|inline-flex|inline-grid|contents)$/.test(disp)) return cur;
      const p = cur.parentElement;
      if (!canClimb(p)) return cur;
      cur = p;
    }
    return cur;
  }
  function canClimb(p) {
    return !!p && p !== document.body && p !== document.documentElement && !offLimits(p) && !(cardSel && isContainer(p)) && !p.querySelector(EDITOR) && !longer(p, 3000);
  }
  function promote(x) {
    const p = x.parentElement;
    if ((cardSel && x.matches(cardSel)) || !canClimb(p)) return;
    const res = textVeils.get(x); const n = +(x.dataset.pssUp || 0) + 1;
    const bs = new Set(holders.get(x) || []);
    for (const b of bs) { const st = seen.get(b); if (st && st.target !== x) bs.delete(b); }
    const own = seen.get(x); if (own && own.target === x) bs.add(x);
    holders.delete(x); unveil(x);
    if (!veil(p, res) && !p.classList.contains('pss-veil') && !(p.parentElement && p.parentElement.closest('.pss-veil'))) { veil(x, res); textVeils.set(x, res); x.dataset.pssUp = '3'; return; }   // could not go up: stay, never retry
    p.dataset.pssUp = String(n); textVeils.set(p, res);
    let set = holders.get(p); if (!set) holders.set(p, set = new Set());
    for (const b of bs) { const st = seen.get(b); if (st) st.target = p; if (b !== p) set.add(b); }
  }
  /** Judge one block's text. Returns { b, res } to cover, or null (and shows it again if it was covered). */
  /*
   * Review 2 (PR #3): a veil on a parent may cover other blocks whose own veils were taken off when it was put on
   * (one veil per item). When the parent's veil goes, everything inside is judged again in this same task (before
   * the page is drawn, so nothing flashes) — otherwise a spoiler that sat under it stayed open.
   */
  const rejudge = new Set(); let rejudgeQueued = false;
  function forgetInside(t) { seen.delete(t); for (const x of t.querySelectorAll('*')) { seen.delete(x); holders.delete(x); } }
  function liftAndRejudge(t) {
    holders.delete(t); unveil(t);
    rejudge.add(t);
    if (rejudgeQueued) return;
    rejudgeQueued = true;
    queueMicrotask(() => {
      rejudgeQueued = false;
      const list = Array.from(rejudge).filter((x) => x.isConnected); rejudge.clear();
      for (const x of list) forgetInside(x);
      if (list.length) scan(list);
    });
  }
  /** Holders of a text veil that are still on the page and still under it (a site may replace or remove them). */
  function liveHolders(t) {
    const set = holders.get(t);
    if (!set) return 0;
    for (const x of set) if (!x.isConnected || !t.contains(x)) set.delete(x);
    return set.size;
  }
  function release(b, st) {
    const target = st && st.target;
    if (!target || target === b) { unveil(b); return; }
    const set = holders.get(target);
    if (set) { set.delete(b); if (liveHolders(target)) return; }   // another spoiler under the same veil
    // review 3: already shown by the person (two clicks) — nothing to lift, and what they opened stays open
    if (!target.classList.contains('pss-veil')) { holders.delete(target); return; }
    liftAndRejudge(target);
  }
  function judgeBlock(b) {
    if (!b.isConnected) return null;
    const st = seen.get(b);
    let outer = b.closest('.pss-veil');
    // review 2 B: a text veil whose blocks were all replaced or removed by the site goes away (judged again)
    if (outer && outer !== b && holders.has(outer) && !(st && st.target === outer) && !liveHolders(outer)) { liftAndRejudge(outer); outer = b.closest('.pss-veil'); }
    // covered by someone else's veil (a card, a bigger block): that one decides. Its own veil on a parent: judge again.
    if (outer && outer !== b && !(st && st.target === outer)) return null;
    const sig = textOf(b);
    if (st && st.sig === sig) return null;
    const res = isTrusted(b) ? null : judgeText(sig, pageCtx);
    seen.set(b, { sig, revealed: false, target: st ? st.target : null });
    if (!res) { release(b, st); seen.get(b).target = null; return null; }
    return { b, res };
  }
  function cover(b, target, res) {
    const st = seen.get(b);
    if (isOpened(target) || isOpened(b)) return 0;
    if (st && st.target && st.target !== target) release(b, st);
    let done = hide(target, res);
    let on = target.classList.contains('pss-veil') || target.classList.contains('pss-removed') || !!(target.parentElement && target.parentElement.closest('.pss-veil'));
    if (!on && target !== b) {        // the block around could not be covered (it holds a typing place): cover the text itself
      target = b; done = hide(b, res);
      on = b.classList.contains('pss-veil') || b.classList.contains('pss-removed');
    }
    if (st) st.target = on ? target : null;
    if (on && target.classList.contains('pss-veil')) textVeils.set(target, res);
    if (on && target !== b) { let set = holders.get(target); if (!set) holders.set(target, set = new Set()); set.add(b); }
    return done ? 1 : 0;
  }

  /* Pro: AI summary boxes. The label ("AI Overview", "Конспект") sits in a heading; the box is the block around it. */
  const AI_BOX = '[data-attrid], [data-hveid], [jscontroller][data-ved], ytd-expandable-metadata-renderer, ytd-video-summary-renderer, section, article, [role="region"]';
  function checkAI(root) {
    if (!pro || S.hideAI === false || !shields.length) return 0;
    if (SITE !== 'google' && SITE !== 'generic' && SITE !== 'youtube') return 0;   // on YouTube the card text decides too
    let n = 0;
    for (const h of root.querySelectorAll ? root.querySelectorAll('h1, h2, h3, [role="heading"], div[aria-label], ytd-video-summary-renderer [id="title"]') : []) {
      const own = (h.getAttribute('aria-label') || (h.childElementCount <= 2 ? h.textContent : '') || '').trim();
      if (!own || own.length > 60) continue;
      const norm = SS.normalize(own);
      if (!AI_NORM.some((w) => norm.trim() === w.trim() || norm.trim().startsWith(w.trim() + ' '))) continue;
      const box = h.closest(AI_BOX) || (h.parentElement && h.parentElement.parentElement) || h.parentElement;
      if (!box || box === document.body || box.closest('.pss-veil') || box.closest(CHROME_ZONE)) continue;
      const res = SS.judgeAll(SS.normalize(textOf(box)), shields, pageCtx ? contexts : NO_CTX, 'everything')
        || (pageCtx ? { reason: 'ai', label: ctxLabel, action: 'blur', key: 'ai' } : null);   // a summary on a page about it
      if (res && hide(box, res)) n++;
    }
    return n;
  }

  /* ---------------------------------------------------------------- scanning */
  function scan(roots) {
    if (!active()) return;
    const textBlocks = new Set();
    const ps = pageSig();
    if (ps !== lastUrl) {
      const before = Array.from(contexts).join();
      lastUrl = ps; updateContext();
      if (Array.from(contexts).join() !== before && document.body) { clearAll(); seen = new WeakMap(); holders = new WeakMap(); opened = new WeakMap(); openedWatch = ''; roots = [document.body]; }   // review 2 C: judged from scratch, no stuck veils
    }
    let n = 0;
    for (const root of roots) {
      if (!root || !root.isConnected) continue;
      const el = root.nodeType === 1 ? root : root.parentElement;
      if (!el) continue;
      if (cardSel) {
        const c = el.closest(cardSel); if (c) n += checkCard(c);
        for (const x of el.querySelectorAll(cardSel)) n += checkCard(x);
      }
      if (linkSel) {                                  // 1.2: items found by their link (TikTok, Instagram)
        const a0 = el.closest(linkSel); if (a0) { const it = linkItem(a0); if (it) n += checkCard(it, true); }
        for (const a of el.querySelectorAll(linkSel)) { const it = linkItem(a); if (it) n += checkCard(it, true); }
      }
      if (goneSel) {
        const g = el.closest(goneSel); if (g) n += checkGone(g);
        for (const x of el.querySelectorAll(goneSel)) n += checkGone(x);
      }
      if (foldSel) {
        const f = el.closest(foldSel); if (f) n += checkFold(f);
        for (const x of el.querySelectorAll(foldSel)) n += checkFold(x);
      }
      scanText(el, !(SITE === 'generic' || SITE === 'google'), textBlocks);
      n += checkMedia(el);
      n += checkAI(el);
    }
    if (textBlocks.size) n += judgeBlocks(Array.from(textBlocks), SITE === "generic" || SITE === "google");
    n += checkWatchPage();
    if (n) report(n);
  }

  function clearAll() {
    for (const el of document.querySelectorAll('.pss-veil, .pss-removed')) unveil(el);
    for (const el of document.querySelectorAll('.pss-gone')) el.classList.remove('pss-gone');
    for (const el of document.querySelectorAll('.pss-fold')) unfold(el);
    veiled.clear(); playerVeiled = false;
  }
  function rescanAll() {
    clearAll();
    seen = new WeakMap(); holders = new WeakMap(); opened = new WeakMap(); openedWatch = '';   // judge everything again with the new settings
    lastUrl = '';
    if (document.body) scan([document.body]);
  }

  // Mutations are handled right in the observer callback (no timers: they can be throttled, and a spoiler must
  // be covered before it is painted). Roots inside another root of the same batch are skipped.
  const observer = new MutationObserver((list) => {
    if (!active()) return;
    const roots = new Set();
    for (const m of list) {
      if (m.type === 'childList') {
        for (const n of m.addedNodes) { const e = n.nodeType === 1 ? n : n.parentElement; if (e) roots.add(e); }
      } else if (m.type === 'characterData') { if (m.target.parentElement) roots.add(m.target.parentElement); }
      else if (m.type === 'attributes') roots.add(m.target);
    }
    if (!roots.size) return;
    const list2 = [];
    for (const r of roots) {
      let inside = false;
      for (let p = r.parentElement; p; p = p.parentElement) if (roots.has(p)) { inside = true; break; }
      if (!inside) list2.push(r);
    }
    scan(list2);
  });

  /* ---------------------------------------------------------------- reveal (click, then confirm) */
  let armedEl = null; let armTimer = 0;
  function disarm() {
    if (!armedEl) return;
    armedEl.classList.remove('pss-armed');
    if (armedEl.dataset.pssBase) armedEl.dataset.pssLabel = armedEl.dataset.pssBase;
    armedEl = null;
  }
  function onClick(e) {
    if (!e.isTrusted) return;
    const path = e.composedPath ? e.composedPath() : [e.target];
    const el = path.find((x) => x && x.classList && (x.classList.contains('pss-veil') || x.classList.contains('pss-fold')));
    if (!el) return;
    // a click on the fold bar only (not on comments that were shown)
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    if (armedEl !== el) {
      disarm();
      armedEl = el;
      el.classList.add('pss-armed');
      el.dataset.pssLabel = el.classList.contains('pss-fold') ? t('fold_confirm') : t('veil_confirm');
      clearTimeout(armTimer); armTimer = setTimeout(disarm, 4000);
      return;
    }
    clearTimeout(armTimer); armedEl = null;
    if (el.dataset.pssReason) el.dataset.pssWas = el.dataset.pssReason;     // for "Not a spoiler? Report"
    const st = seen.get(el) || {};
    seen.set(el, Object.assign(st, { revealed: true }));
    markOpened(el);
    const hs = holders.get(el); if (hs) for (const x of hs) markOpened(x);
    if (el.classList.contains('pss-fold')) unfold(el);
    else {
      unveil(el, true);
      const player = playerVeiled ? findPlayer() : null;
      if (player && (el === player || el.matches('ytd-watch-metadata, #above-the-fold'))) {
        playerVeiled = false; unveil(player, true); openedWatch = watchKey();
        const meta = document.querySelector('ytd-watch-metadata, #above-the-fold'); if (meta) unveil(meta, true);
      }
    }
  }
  // the veil must win against the site's own click handlers and links underneath
  for (const type of ['click', 'mousedown', 'pointerdown', 'mouseup', 'auxclick']) {
    window.addEventListener(type, (e) => {
      if (type === 'click') return onClick(e);
      const path = e.composedPath ? e.composedPath() : [e.target];
      if (path.some((x) => x && x.classList && (x.classList.contains('pss-veil') || x.classList.contains('pss-fold')))) { e.stopPropagation(); e.stopImmediatePropagation(); if (type !== 'mousedown' && type !== 'pointerdown') e.preventDefault(); }
    }, true);
  }

  /* ---------------------------------------------------------------- start */
  async function loadSettings() {
    const r = await api.storage.local.get({ settings: {}, license: {} });
    S = Object.assign({}, DEFAULTS, r.settings || {});
    pro = !!(r.license && r.license.pro);
    shields = SS.activeShields(Array.isArray(S.shields) ? S.shields : DEFAULT_SHIELDS, pro);
    trustedSet = new Set(String(S.trusted || '').split(/[\n,;]+/).map(handle).filter((x) => x.length >= 2));
    blockedSet = new Set(String(S.blocked || '').split(/[\n,;]+/).map(handle).filter((x) => x.length >= 2));
    lastUrl = '';
  }
  function start() {
    observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title', 'aria-label', 'href'] });
    rescanAll();
  }
  api.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !(changes.settings || changes.license)) return;
    loadSettings().then(() => { if (active()) rescanAll(); else clearAll(); });
  });
  // pause ends on its own: check once a minute
  setInterval(() => { if (S.pausedUntil && Date.now() >= S.pausedUntil && !document.querySelector('.pss-veil')) rescanAll(); }, 60000);
  window.addEventListener('yt-navigate-finish', () => { lastUrl = ''; if (document.body) scan([document.body]); }, true);
  window.addEventListener('popstate', () => { lastUrl = ''; setTimeout(() => document.body && scan([document.body]), 300); });

  /* 1.2: right-click on a hidden (or just shown) block → "Not a spoiler? Report" opens a GitHub issue the person
   * sees and sends themselves. Nothing is sent by the extension. */
  let lastMenuEl = null;
  document.addEventListener('contextmenu', (e) => {
    const path = e.composedPath ? e.composedPath() : [e.target];
    lastMenuEl = path.find((x) => x && x.classList && (x.classList.contains('pss-veil') || (x.dataset && x.dataset.pssWas))) || null;
  }, true);
  /* 1.2: self-check — links to videos/posts are on the page, but none of the known card names matched: the site has
   * probably changed its layout. Only numbers, no page text. */
  const PROBE = { youtube: 'a[href*="/watch?v="], a[href^="/shorts/"]', reddit: 'a[href*="/comments/"]', x: 'a[href*="/status/"]',
    tiktok: 'a[href^="/@"]', instagram: 'a[href^="/"][role="link"]' }[SITE];
  function health() {
    const cards = cardSel ? document.querySelectorAll(cardSel).length : 0;
    const items = linkSel ? document.querySelectorAll(linkSel).length : 0;
    const probe = PROBE ? document.querySelectorAll(PROBE).length : 0;
    const changed = !!PROBE && probe >= 8 && cards === 0 && items === 0;
    return { cards, items, probe, changed };
  }
  api.runtime.onMessage.addListener((msg, sender, reply) => {
    if (!msg) return false;
    if (msg.type === 'pss:pageCount') {
      reply(Object.assign({ count: document.querySelectorAll('.pss-veil, .pss-fold, .pss-gone').length, site: siteKey(), active: active() }, health()));
      return false;
    }
    if (msg.type === 'pss:lastVeil') {
      const el = lastMenuEl && lastMenuEl.isConnected ? lastMenuEl : null;
      const why = el ? (el.dataset.pssReason || el.dataset.pssWas || '') : '';
      reply({ ok: !!el, site: siteKey(), reason: why.split('|')[0] || '', list: why.split('|')[1] || '', text: el ? textOf(el).replace(/\s+/g, ' ').trim().slice(0, 300) : '' });
      return false;
    }
    return false;
  });

  loadSettings().then(start);
})();
