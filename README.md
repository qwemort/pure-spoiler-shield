# Pure Spoiler Shield

[![external requests in code](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/qwemort/pure-spoiler-shield/main/badges/network.json)](PRIVACY-REPORT.md) [![telemetry](https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/qwemort/pure-spoiler-shield/main/badges/telemetry.json)](PRIVACY-REPORT.md)

A browser extension that blurs or hides spoilers for the games, shows, films and anime you choose, on YouTube, Reddit and X. Everything runs inside your browser: no account, no analytics, no tracking.

- Chrome: https://chromewebstore.google.com/detail/aloilpojkoblacapdlknacjiljgjibng
- Firefox: in review
- Guide: [How to avoid GTA 6 spoilers on YouTube, Reddit and X](https://qwemort.github.io/pure-guides/avoid-gta-6-spoilers.html)

## Why the source is here

So you can check the claims instead of trusting them. The extension checks the visible text of titles, descriptions and comments locally and covers the items that match. The only network request in the whole extension is the optional Pro license check to `api.gumroad.com` when you enter a key (and a re-check at most every 7 days). You can verify this in `src/background.js`, or read the auto-generated [privacy report](PRIVACY-REPORT.md), which lists every request to an external server found in the code.

Permissions (see `manifests/`): `storage`, `scripting`, `contextMenus`; content scripts only on YouTube, Reddit and X (plus the Gumroad license endpoint). Access to all websites is an **optional** permission, requested only when you turn on Pro "everywhere".

## License: source-available, not open source

This code is licensed under the [PolyForm Shield License 1.0.0](LICENSE). In plain words: you may read it, run it, modify it and share it, **except** that you may not use it to provide a product that competes with Pure Spoiler Shield. This is **source-available**, not open source as defined by the Open Source Initiative. If you are unsure whether a use is allowed, ask: papana44444@gmail.com.

## Free and Pro

Free: all ready-made lists and up to 3 custom titles on YouTube, Reddit and X. Pro (one-time, via Gumroad): all sites, "I watched up to episode N", release and end dates, hidden AI summaries, trusted channels, backup. The Pro check is in the code; the code being readable is the point, not a way around it. If you like the extension, buying Pro supports it.

## Limits

It works on text, so a spoiler that exists only inside an image or a video frame is not caught. Sites change their markup, so some items can slip through until the selectors in `src/content/` are updated. It contains no spoilers itself, only public titles and general words such as "ending".

## Build and test

```
python3 tools/build.py          # checks the manifests and writes release/ (zips + unpacked folders)
node tests/words-test.mjs       # judge, shields, episodes, Pro rules
```

Load the unpacked folder from `release/` in Chrome (`chrome://extensions`, Developer mode, Load unpacked) or in Firefox (`about:debugging`). `tests/ss-test.mjs` and `tests/ss-firefox.py` need Playwright or geckodriver and local paths adjusted to your machine.

## Contact

Issues and pull requests are welcome. Not affiliated with Rockstar Games, Take-Two Interactive or any other game, film or TV company; all titles belong to their owners.
