/*!
 * Pure Spoiler Shield — release days that ship INSIDE the package (no network, no updates between versions).
 * Every date has an open source and the day it was checked. No source = no date: the field stays empty, we never guess.
 * The page https://qwemort.github.io/pure-guides/spoiler-danger/ has the fresh calendar; the window only says "dates as of the build".
 */
(function (g) {
  'use strict';
  const SS = g.SS || (g.SS = {});
  SS.BUILT = '2026-11-12';
  SS.RELEASES = {
    gta6: { date: '2026-11-19', src: 'https://www.gematsu.com/2025/11/grand-theft-auto-vi-delayed-to-november-19-2026', checked: '2026-11-12' }
  };
  const isDay = (d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || ''));
  /** Day of release for a shield from the settings: the person's own date wins, then the one shipped here. '' = unknown. */
  SS.releaseDay = function (sh) {
    if (!sh) return '';
    if (isDay(sh.release)) return sh.release;
    const r = sh.preset && SS.RELEASES[sh.preset];
    return r && isDay(r.date) ? r.date : '';
  };
  /** Whole days from today (local) to a day: 0 = today, negative = already out, null = no valid date. */
  SS.daysUntil = function (day, now) {
    if (!isDay(day)) return null;
    const n = new Date(now || Date.now());
    const today = new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
    const [y, m, d] = day.split('-').map(Number);
    return Math.round((new Date(y, m - 1, d).getTime() - today) / 86400000);
  };
  /** Shields that are on and have a release day today or later, soonest first: [{ label, days }]. */
  SS.upcoming = function (shields, labelOf, now) {
    const out = [];
    for (const sh of shields || []) {
      if (sh.on === false) continue;
      const days = SS.daysUntil(SS.releaseDay(sh), now);
      if (days !== null && days >= 0) out.push({ label: labelOf(sh), days });
    }
    return out.sort((a, b) => a.days - b.days);
  };
  /** Release week: the nearest shield whose release day is within 7 days before or after today (the picture card gets its own title). */
  SS.releaseWeek = function (shields, labelOf, now) {
    let best = null;
    for (const sh of shields || []) {
      if (sh.on === false) continue;
      const days = SS.daysUntil(SS.releaseDay(sh), now);
      if (days !== null && days >= -7 && days <= 7 && (!best || Math.abs(days) < Math.abs(best.days))) best = { label: labelOf(sh), days };
    }
    return best;
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
