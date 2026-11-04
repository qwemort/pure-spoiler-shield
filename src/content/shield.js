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
  const SITE = /(^|\.)youtube\.(com|test)$/.test(host) || /(^|\.)youtube-nocookie\.com$/.test(host) ? 'youtube'
    : /(^|\.)reddit\.(com|test)$/.test(host) ? 'reddit'
      : /(^|\.)(x|twitter)\.(com|test)$/.test(host) ? 'x'
        : /(^|\.)google\.[a-z.]+$/.test(host) || /(^|\.)google\.test$/.test(host) ? 'google' : 'generic';

  const CARDS = {
    youtube: [
      'ytd-rich-item-renderer', 'ytd-video-renderer', 'ytd-compact-video-renderer', 'ytd-grid-video-renderer',
      'ytd-playlist-video-renderer', 'ytd-playlist-panel-video-renderer', 'ytd-reel-item-renderer', 'ytd-reel-video-renderer',
      'ytm-shorts-lockup-view-model', 'ytm-shorts-lockup-view-model-v2', 'yt-lockup-view-model', 'ytd-channel-video-player-renderer',
      'ytd-compact-radio-renderer', 'ytd-radio-renderer', 'ytd-playlist-renderer', 'ytd-movie-renderer', 'ytd-notification-renderer',
      'ytd-post-renderer', 'ytd-backstage-post-renderer', 'ytd-comment-view-model', 'ytd-comment-renderer',
      'ytd-universal-watch-card-renderer', 'ytd-search-refinement-card-renderer', 'ytd-end-screen-video-renderer',
      'a.ytp-videowall-still', 'a.ytp-ce-element', '.ytp-autonav-endscreen-upnext-container', 'ytm-video-with-context-renderer',
      'ytm-compact-video-renderer', 'ytm-comment-renderer'
    ],
    reddit: [
      'shreddit-post', 'shreddit-ad-post', '[slot="comment"]', 'faceplate-tracker[noun="search_result"]', 'search-telemetry-tracker',
      'reddit-pdp-right-rail-post', 'faceplate-tracker[source="search"]', 'li[role="presentation"] a[href*="/comments/"]',
      'article', '.thing.link', '.thing.comment > .entry'
    ],
    x: [
      'article[data-testid="tweet"]', '[data-testid="UserCell"]', '[data-testid="tweetText"]'
    ],
    google: [
      'div.MjjYud', 'div.g', 'div[data-hveid] > div.N54PNb', 'g-inner-card', 'div[data-news-cluster-id]', 'div.related-question-pair',
      'div[jsname][data-initq]', 'div.Ww4FFb', 'article', 'g-section-with-header', 'div[role="listitem"]', 'div.cv2VAd'
    ],
    generic: []
  };
  const GONE = {
    youtube: ['[role="listbox"] [role="option"]', '.sbsb_c', 'ytd-searchbox-suggestion', '.ytSuggestionComponentSuggestion'],
    reddit: ['[role="listbox"] [role="option"]', 'faceplate-tracker[source="search"][noun="typeahead_result"]', 'li[role="option"]'],
    x: ['[data-testid="typeaheadResult"]', '[data-testid="trend"]', '[role="listbox"] [role="option"]'],
    google: ['[role="listbox"] [role="option"]', 'li.sbct', 'div.wM6W7d'],
    generic: ['[role="listbox"] [role="option"]']
  };
  const COMMENTS = {
    youtube: ['ytd-comments#comments', 'ytm-comment-section-renderer', 'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-comments-section"]'],
    reddit: ['shreddit-comment-tree', '#comment-tree', '.commentarea'],
    x: [], google: [], generic: []
  };
  // big blocks of a generic page that can hold a spoiler on their own (Pro, every site)
  const GENERIC_BLOCK = 'article, [role="article"], li, [role="listitem"], tr, [class*="comment" i], [class*="post" i], [class*="card" i], [class*="message" i], [class*="tweet" i], [class*="story" i], [class*="result" i], blockquote, figure';
  // the site's own frame — logo, top bar, side menu, search form — is never covered (1.1: the YouTube logo was)
  const CHROME_ZONE = 'ytd-masthead, #masthead-container, #masthead, tp-yt-app-drawer, #guide, ytd-mini-guide-renderer, ytd-guide-renderer, [role="banner"], [role="navigation"], nav, [role="search"], body > header, body > footer, footer[role="contentinfo"], #searchform, #gb, reddit-header-large, faceplate-search-input';
  // AI summaries that retell the story (Pro "hide AI summaries"): their label, in the 13 languages
  const AI_LABELS = ['ai overview', 'ai overviews', 'ai summary', 'ai generated summary', 'summary by ai', 'обзор от ии', 'ии обзор', 'краткий обзор от ии', 'конспект', 'огляд від ші', 'короткий огляд від ші',
    'przeglad od ai', 'przegląd od ai', 'podsumowanie ai', 'ubersicht mit ki', 'übersicht mit ki', 'ki übersicht', 'ki zusammenfassung', 'apercu ia', 'aperçu ia', 'aperçus ia', 'resumen de ia', 'vision general creada por ia', 'visión general creada por ia',
    'visao geral criada por ia', 'visão geral criada por ia', 'resumo de ia', 'panoramica ai', 'riepilogo ai', 'yapay zeka genel bakisi', 'yapay zeka genel bakışı', 'ai による概要', 'ai 概要', 'ai 개요', 'ai 요약', 'ai 概览', 'ai 摘要'];
  const AI_NORM = AI_LABELS.map((x) => SS.normalize(x));
  const hasAI = (norm) => AI_NORM.some((w) => norm.includes(w));
  const cardSel = CARDS[SITE].join(',');
  const goneSel = GONE[SITE].join(',');
  const foldSel = COMMENTS[SITE].join(',');

  /* ---------------------------------------------------------------- settings */
  const DEFAULT_SHIELDS = [{ id: 'gta6', preset: 'gta6', mode: 'spoilers', action: 'blur', on: true }];
  const DEFAULTS = { enabled: true, comments: true, media: false, offSites: [], pausedUntil: 0, protectUntil: '', everywhere: true, shields: DEFAULT_SHIELDS, hideAI: true, trusted: '' };
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
  function textOf(el) {
    let s = joinedText(el, 4000);
    const attrs = [el, ...el.querySelectorAll('[title], [aria-label], img[alt]')].slice(0, 40);
    for (const a of attrs) {
      const v = a.getAttribute('title') || a.getAttribute('aria-label') || (a.tagName === 'IMG' ? a.getAttribute('alt') : '');
      if (v) s += ' ' + v.slice(0, 300);
    }
    return s;
  }
  /** null, or { reason, label, action, key } of the first shield that matches. */
  const judgeText = (s, ctx) => {
    const norm = SS.normalize(s);
    // Pro: an AI summary about a protected title is hidden whatever the level — it retells the story
    const force = pro && S.hideAI !== false && hasAI(norm) ? 'everything' : '';
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
  const labelFor = (res) => t('veil_label', res.label);
  function veil(el, res) {
    if (el.closest(CHROME_ZONE)) return false;
    const why = res.reason + '|' + res.key;
    if (el.classList.contains('pss-veil')) {       // already hidden: keep it, but the reason may have changed
      if (el.dataset.pssReason !== why) { el.dataset.pssReason = why; el.dataset.pssBase = el.dataset.pssLabel = labelFor(res); }
      return false;
    }
    el.classList.add('pss-veil');
    measureLater(el);
    el.dataset.pssReason = why;
    el.dataset.pssBase = labelFor(res);
    el.dataset.pssLabel = el.dataset.pssBase;
    // screen readers: the hidden text must not be read aloud either
    if (!el.hasAttribute('data-pss-aria')) el.setAttribute('data-pss-aria', el.getAttribute('aria-hidden') || '');
    el.setAttribute('aria-hidden', 'true');
    veiled.add(el);
    return true;
  }
  // Sizes are read once per frame for all new veils together (reading a size right after a change forces the
  // browser to lay out the page again — on a long feed that was the slow part).
  const toMeasure = new Set(); let measureQueued = false;
  function measureLater(el) {
    toMeasure.add(el);
    if (measureQueued) return;
    measureQueued = true;
    const run = () => {
      measureQueued = false;
      const items = Array.from(toMeasure); toMeasure.clear();
      const rs = items.map((x) => (x.isConnected ? x.getBoundingClientRect() : null));
      items.forEach((x, i) => {
        const r = rs[i]; const h = r ? r.height : 0; const w = r ? r.width : 0;
        x.classList.toggle('pss-small', h > 0 && h < 70);
        // too small for the words: only the blur and a small shield (1.1 — the cut-off "Click to sh…")
        x.classList.toggle('pss-tiny', (h > 0 && h < 40) || (w > 0 && w < 150));
      });
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run); else Promise.resolve().then(run);
  }
  function restoreAria(el) {
    if (!el.hasAttribute('data-pss-aria')) return;
    const old = el.getAttribute('data-pss-aria');
    if (old) el.setAttribute('aria-hidden', old); else el.removeAttribute('aria-hidden');
    el.removeAttribute('data-pss-aria');
  }
  function unveil(el) {
    if (!el.classList) return;
    if (el.classList.contains('pss-removed')) { el.classList.remove('pss-gone', 'pss-removed'); veiled.delete(el); }
    if (!el.classList.contains('pss-veil')) return;
    el.classList.remove('pss-veil', 'pss-small', 'pss-tiny', 'pss-armed');
    delete el.dataset.pssLabel; delete el.dataset.pssReason; delete el.dataset.pssBase;
    restoreAria(el);
    veiled.delete(el);
  }
  /** "Remove" shields: the block is simply not shown (no veil, nothing to click). */
  function removeBlock(el) {
    if (el.closest(CHROME_ZONE)) return false;
    if (el.classList.contains('pss-removed')) return false;
    unveil(el);
    el.classList.add('pss-gone', 'pss-removed');
    veiled.add(el);
    return true;
  }
  function hide(el, res) { return res.action === 'remove' ? removeBlock(el) : veil(el, res); }

  function checkCard(el) {
    if (!el || !el.isConnected || el.nodeType !== 1) return 0;
    if (el.closest('.pss-ui')) return 0;
    // the outermost card decides — unless it is a box of several cards (a Google carousel, a shelf): then each card does
    for (let p = el.parentElement && el.parentElement.closest(cardSel || '#\\-none'); p; p = p.parentElement && p.parentElement.closest(cardSel)) {
      if (!isContainer(p)) return 0;
    }
    if (isContainer(el)) { unveil(el); return 0; }
    const sig = textOf(el);
    const st = seen.get(el);
    if (st && st.sig === sig) return 0;                                                  // nothing changed
    seen.set(el, { sig, revealed: false });
    const res = isTrusted(el) ? null : judgeText(sig, pageCtx);
    if (res) return hide(el, res) ? 1 : 0;
    unveil(el);                                                                            // recycled element, new content
    return 0;
  }
  function isContainer(el) { return !!cardSel && el.querySelectorAll(cardSel).length >= 2; }

  function checkGone(el) {
    const s = joinedText(el, 1000) + ' ' + (el.getAttribute('aria-label') || '');
    const hideIt = !!judgeText(s, false);
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

  /* Pictures and videos on a page about a protected title (leaks are often a photo with no words). */
  const MEDIA = 'img, video, picture, shreddit-player, shreddit-aspect-ratio, [data-testid="tweetPhoto"], [data-testid="videoPlayer"], faceplate-img';
  function checkMedia(root) {
    if (!S.media || !pageCtx) return 0;
    let n = 0;
    const list = root.matches && root.matches(MEDIA) ? [root] : [];
    for (const m of root.querySelectorAll ? root.querySelectorAll(MEDIA) : []) list.push(m);
    for (const m of list) {
      // a veil needs a box that can hold ::after — <img>/<video> cannot, so use the link/figure around it
      const box = m.closest('a, figure, [data-testid="tweetPhoto"], shreddit-aspect-ratio, shreddit-player') || ((m.tagName === 'IMG' || m.tagName === 'VIDEO') ? m.parentElement : m);
      if (!box) continue;
      if (box.closest('.pss-veil') || box.closest(CHROME_ZONE) || seen.get(box)) continue;
      if (m.tagName === 'IMG' && (m.width < 120 || m.height < 80)) continue;   // avatars, logos, icons and chips stay
      seen.set(box, { sig: 'media', revealed: false });
      if (veil(box, { reason: 'media', label: ctxLabel, key: 'media' })) { box.dataset.pssBase = box.dataset.pssLabel = t('media_label', ctxLabel); n++; }
    }
    return n;
  }

  /* YouTube watch page: a spoiler video gets a veil over the player and the title, and stays paused. */
  let playerVeiled = false;
  function checkWatchPage() {
    if (SITE !== 'youtube') return 0;
    const isWatch = /^\/(watch|shorts\/)/.test(location.pathname);
    const player = document.querySelector('#player-container-outer, ytd-watch-flexy #player, #shorts-player, ytd-reel-video-renderer[is-active] #player-container');
    const meta = document.querySelector('ytd-watch-metadata, #above-the-fold');
    if (!isWatch || !player) { playerVeiled = false; return 0; }
    const res = pageTrusted() ? null : judgeText(pageText(), false);
    const st = seen.get(player);
    const sig = location.href + '|' + (res ? res.key + res.reason : '');
    if (st && st.sig === sig) return 0;
    seen.set(player, { sig, revealed: false });
    if (!res) { unveil(player); if (meta) unveil(meta); playerVeiled = false; return 0; }
    veil(player, res); player.dataset.pssBase = player.dataset.pssLabel = t('player_label', res.label);
    if (meta) veil(meta, res);
    playerVeiled = true; pauseVideo();
    return 1;
  }
  function pauseVideo() {
    const v = document.querySelector('#movie_player video, #shorts-player video, video');
    if (v && !v.paused) try { v.pause(); } catch (e) { /* ignore */ }
  }
  document.addEventListener('play', (e) => {
    if (!playerVeiled || !e.target || e.target.tagName !== 'VIDEO') return;
    const p = e.target.closest('.pss-veil');
    if (p) { try { e.target.pause(); } catch (err) { /* ignore */ } }
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
  function scanText(root, safety) {
    let n = 0;
    const blocks = new Set();
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
    for (const b of blocks) {
      if (b.closest('.pss-veil') && !b.classList.contains('pss-veil')) continue;
      const sig = textOf(b);
      const st = seen.get(b);
      if (st && st.sig === sig) continue;
      seen.set(b, { sig, revealed: false });
      const res = isTrusted(b) ? null : judgeText(sig, pageCtx);
      if (res && hide(b, res)) n++;
      else if (!res) unveil(b);
    }
    return n;
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
    if (location.href !== lastUrl) { lastUrl = location.href; updateContext(); }
    let n = 0;
    for (const root of roots) {
      if (!root || !root.isConnected) continue;
      const el = root.nodeType === 1 ? root : root.parentElement;
      if (!el) continue;
      if (cardSel) {
        const c = el.closest(cardSel); if (c) n += checkCard(c);
        for (const x of el.querySelectorAll(cardSel)) n += checkCard(x);
      }
      if (goneSel) {
        const g = el.closest(goneSel); if (g) n += checkGone(g);
        for (const x of el.querySelectorAll(goneSel)) n += checkGone(x);
      }
      if (foldSel) {
        const f = el.closest(foldSel); if (f) n += checkFold(f);
        for (const x of el.querySelectorAll(foldSel)) n += checkFold(x);
      }
      if (SITE === 'generic' || SITE === 'google') n += scanText(el, false);
      else n += scanText(el, true);
      n += checkMedia(el);
      n += checkAI(el);
    }
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
    seen = new WeakMap();   // judge everything again with the new settings
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
    const st = seen.get(el) || {};
    seen.set(el, Object.assign(st, { revealed: true }));
    if (el.classList.contains('pss-fold')) unfold(el);
    else {
      unveil(el);
      const player = document.querySelector('#player-container-outer, ytd-watch-flexy #player, #shorts-player');
      if (player && (el === player || el.matches('ytd-watch-metadata, #above-the-fold'))) {
        playerVeiled = false; unveil(player);
        const meta = document.querySelector('ytd-watch-metadata, #above-the-fold'); if (meta) unveil(meta);
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

  api.runtime.onMessage.addListener((msg, sender, reply) => {
    if (!msg || msg.type !== 'pss:pageCount') return false;
    reply({ count: document.querySelectorAll('.pss-veil, .pss-fold, .pss-gone').length, site: siteKey(), active: active() });
    return false;
  });

  loadSettings().then(start);
})();
