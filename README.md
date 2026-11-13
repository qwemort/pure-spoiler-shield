# Pure Spoiler Shield

[![external requests in code](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/qwemort/pure-spoiler-shield/main/badges/network.json)](PRIVACY-REPORT.md) [![telemetry](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/qwemort/pure-spoiler-shield/main/badges/telemetry.json)](PRIVACY-REPORT.md)

A browser extension that blurs or hides spoilers for the games, shows, films and anime you choose, on YouTube, Reddit and X. Everything runs inside your browser: no account, no analytics, no tracking.

- Chrome: https://chromewebstore.google.com/detail/aloilpojkoblacapdlknacjiljgjibng
- Firefox: Pure Spoiler Shield on addons.mozilla.org (1.4.0)
- Guide: [How to avoid GTA 6 spoilers on YouTube, Reddit and X](https://qwemort.github.io/pure-guides/avoid-gta-6-spoilers.html)

## Why the source is here

So you can check the claims instead of trusting them. The extension checks the visible text of titles, descriptions and comments locally and covers the items that match. The extension makes no network requests at all. You can verify this in `src/`, or read the auto-generated [privacy report](PRIVACY-REPORT.md), which lists every request to an external server found in the code.

Permissions (see `manifests/`): `storage`, `scripting`, `contextMenus`; content scripts only on YouTube, Reddit and X. No other website access.

## License: source-available, not open source

This code is licensed under the [PolyForm Shield License 1.0.0](LICENSE). In plain words: you may read it, run it, modify it and share it, **except** that you may not use it to provide a product that competes with Pure Spoiler Shield. This is **source-available**, not open source as defined by the Open Source Initiative. If you are unsure whether a use is allowed, ask: papana44444@gmail.com.

## Want a list for your show, game or anime?

[Request a title](https://github.com/qwemort/pure-spoiler-shield/issues/new?template=title-request.yml) (no spoilers in the request, please). Titles with the most 👍 go first, and your request closes automatically when the list ships.

## Free, all of it

Since 1.4 everything is free: all ready-made lists (60), your own titles, "I watched up to episode N", release and end dates, trusted channels and backup. No account, no license, no network requests. Versions up to 1.3 had a paid Pro tier; it was removed.

## Limits

It works on text, so a spoiler that exists only inside an image or a video frame is not caught. Sites change their markup, so some items can slip through until the selectors in `src/content/` are updated. It contains no spoilers itself, only public titles and general words such as "ending".

## Build and test

```
python3 tools/build.py          # checks the manifests and writes release/ (zips + unpacked folders)
node tests/words-test.mjs       # judge, shields, episodes
```

Load the unpacked folder from `release/` in Chrome (`chrome://extensions`, Developer mode, Load unpacked) or in Firefox (`about:debugging`). `tests/ss-test.mjs` and `tests/ss-firefox.py` need Playwright or geckodriver and local paths adjusted to your machine.

## Contact

Issues and pull requests are welcome. Not affiliated with Rockstar Games, Take-Two Interactive or any other game, film or TV company; all titles belong to their owners.
