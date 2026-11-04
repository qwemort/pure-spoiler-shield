/*!
 * Pure Spoiler Shield — translations. SS.t('key', a, b) -> text from _locales/<language>/messages.json with {0}, {1} filled in.
 * The browser picks the language from its own interface language and falls back to English for a missing key.
 * Messages never contain "$", so the browser's own placeholder syntax is never involved.
 */
(function (g) {
  'use strict';
  const SS = g.SS || (g.SS = {});
  const api = g.browser && g.browser.runtime ? g.browser : g.chrome;
  SS.t = function (key, ...vals) {
    let m = '';
    try { m = (api && api.i18n && api.i18n.getMessage(key)) || ''; } catch (e) { m = ''; }
    if (!m) return key;
    return m.replace(/\{(\d+)\}/g, (all, i) => (Number(i) < vals.length ? String(vals[Number(i)]) : all));
  };
  SS.applyI18n = function (root) {
    for (const el of root.querySelectorAll('[data-i18n]')) el.textContent = SS.t(el.getAttribute('data-i18n'));
    for (const el of root.querySelectorAll('[data-i18n-title]')) el.title = SS.t(el.getAttribute('data-i18n-title'));
    for (const el of root.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = SS.t(el.getAttribute('data-i18n-placeholder'));
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
