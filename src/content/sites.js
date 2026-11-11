/*!
 * Pure Spoiler Shield — site profiles (1.2). Everything that depends on how a site's page is built lives here, so
 * when a site changes its layout the fix is one line in this file, not a change in the page logic (shield.js).
 * Every role has several candidates: if a site renames one, the next still works. When none of the card names
 * works any more, shield.js falls back to "item = the block around a link to a video/post" (links) and to the
 * text safety net, and the popup shows "this site may have changed".
 *   cards    — one video / post / comment, judged by its whole text (title, description, alt, aria-label)
 *   gone     — search suggestions and trends: simply not shown when they name a protected title
 *   comments — the comment section (folded on a page about the title)
 *   links    — a link to one item; the item is the biggest block around it that holds no other item (structure,
 *              not class names — survives renames)
 *   keep     — parts of an item that stay visible over the veil (author, avatar)
 *   watch    — address of a page that shows one video/post; player = where that video plays; watchText = its caption
 *   skip     — parts of the site that are never touched (inbox, notifications, messages)
 * No data is in here — only selectors.
 */
(function (g) {
  'use strict';
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

  // 1.2: TikTok and Instagram (free, after the person allows these sites in the popup). Selectors from the public
  // structure of both sites (data-e2e names on TikTok); links/keep work even when the names change.
  CARDS.tiktok = ['[data-e2e="recommend-list-item-container"]', '[data-e2e="search_top-item"]', '[data-e2e="search_video-item"]',
    '[data-e2e="search-card-desc"]', '[data-e2e="search-card-video-caption"]', '[data-e2e="video-desc"]', '[data-e2e="browse-video-desc"]',
    '[data-e2e="comment-level-1"]', '[data-e2e="comment-level-2"]', '[data-e2e="search-comment-container"] [data-e2e="comment-level-1"]'];
  GONE.tiktok = ['[data-e2e="search-transfer-guess-search-item"]', '[data-e2e="search-suggestion-item"]', '[id^="search-sug"]', '[role="listbox"] [role="option"]', '[data-e2e="search-sug-item"]'];
  COMMENTS.tiktok = [];
  CARDS.instagram = ['article', '[role="dialog"] article', 'ul li[role="menuitem"] h1', 'div[role="button"] h1'];
  GONE.instagram = ['[role="listbox"] [role="option"]', 'a[href^="/explore/search/keyword/"]', 'a[href*="/explore/tags/"][role="link"]'];
  COMMENTS.instagram = [];
  const LINKS = {
    youtube: [], reddit: [], x: [], google: [], generic: [],
    tiktok: ['a[href*="/video/"]', 'a[href*="/photo/"]'],
    instagram: ['a[href*="/reel/"]', 'a[href*="/p/"]']
  };
  const KEEP = {
    youtube: [], reddit: [], x: [], google: [], generic: [],
    tiktok: ['a[href^="/@"]:not([href*="/video/"]):not([href*="/photo/"])', '[data-e2e="search-card-user-link"]', '[data-e2e="video-author-avatar"]', '[data-e2e="browse-username"]'],
    instagram: ['header', 'a[href^="/"][role="link"] img[alt*="profile" i]']
  };
  const WATCH = {
    tiktok: { path: /\/(video|photo)\//, player: ['[data-e2e="browse-video"]', '[data-e2e="detail-video"]', '[data-e2e="feed-video"]'],
      text: ['[data-e2e="browse-video-desc"]', '[data-e2e="video-desc"]', 'h1'] },
    instagram: { path: /^\/(reel|reels|p)\//, player: [], text: ['h1', 'article h1', '[role="dialog"] h1'] }
  };
  const SKIP_ZONE = {
    youtube: [], reddit: [], x: ['[data-testid="DMDrawer"]'], google: [], generic: [],
    tiktok: ['[data-e2e="inbox-list"]', '[data-e2e="inbox-notifications"]', '[class*="InboxContainer"]', '[class*="DivInbox"]', '[data-e2e="nav-messages"]', '[class*="DivMessage"]'],
    instagram: ['a[href^="/direct/"]', '[aria-label*="Notifications" i]', '[aria-label*="Messages" i]', '[aria-label*="Direct" i]']
  };
  function detect(host) {
    return /(^|\.)youtube\.(com|test)$/.test(host) || /(^|\.)youtube-nocookie\.com$/.test(host) ? 'youtube'
      : /(^|\.)reddit\.(com|test)$/.test(host) ? 'reddit'
        : /(^|\.)(x|twitter)\.(com|test)$/.test(host) ? 'x'
          : /(^|\.)tiktok\.(com|test)$/.test(host) ? 'tiktok'
            : /(^|\.)instagram\.(com|test)$/.test(host) ? 'instagram'
              : /(^|\.)google\.[a-z.]+$/.test(host) || /(^|\.)google\.test$/.test(host) ? 'google' : 'generic';
  }
  g.SS_SITES = { detect, CARDS, GONE, COMMENTS, LINKS, KEEP, WATCH, SKIP_ZONE };
})(typeof globalThis !== 'undefined' ? globalThis : this);
