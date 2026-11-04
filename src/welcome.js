/*!
 * Pure Spoiler Shield — welcome page: pick how careful the GTA VI shield is.
 */
(function () {
  'use strict';
  const api = globalThis.browser && globalThis.browser.runtime ? globalThis.browser : globalThis.chrome;
  const DEFAULT_SHIELDS = [{ id: 'gta6', preset: 'gta6', mode: 'spoilers', action: 'blur', on: true }];
  SS.applyI18n(document);
  document.documentElement.lang = (api.i18n.getUILanguage() || 'en').split('-')[0];
  async function get() {
    const { settings } = await api.storage.local.get({ settings: {} });
    const s = Object.assign({}, settings || {});
    s.shields = Array.isArray(s.shields) ? s.shields : DEFAULT_SHIELDS.slice();
    return s;
  }
  async function render() {
    const s = await get();
    const g = s.shields.find((x) => x.preset === 'gta6');
    const mode = (g && g.mode) || 'spoilers';
    document.getElementById('modeSpoilers').setAttribute('aria-checked', String(mode !== 'everything'));
    document.getElementById('modeEverything').setAttribute('aria-checked', String(mode === 'everything'));
  }
  for (const b of document.querySelectorAll('.ss-seg button')) {
    b.addEventListener('click', async () => {
      const s = await get();
      if (!s.shields.some((x) => x.preset === 'gta6')) s.shields.unshift(Object.assign({}, DEFAULT_SHIELDS[0]));
      s.shields = s.shields.map((x) => (x.preset === 'gta6' ? Object.assign({}, x, { mode: b.dataset.mode, on: true }) : x));
      await api.storage.local.set({ settings: s });
      render();
    });
  }
  render();
})();
