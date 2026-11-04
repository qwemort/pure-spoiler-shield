# Privacy report

Generated from the source code by `tools/privacy-report.py` (static check of what the code contains).

| Extension | Version | Requests to external servers in code | Analytics / trackers | Remote code (eval, remote scripts) | Permissions | Site access at install | Optional site access |
|---|---|---|---|---|---|---|---|
| Spoiler Shield | 1.1.0 | 1 | none | none | `contextMenus`, `scripting`, `storage` | `*://*.reddit.com/*`, `*://*.twitter.com/*`, `*://*.x.com/*`, `*://*.youtube.com/*`, `https://api.gumroad.com/*` | `<all_urls>` |

## Spoiler Shield 1.1.0

**Requests to external servers (fixed URLs in the code):**

- `src/background.js: https://api.gumroad.com/v2/licenses/verify`

**Other places that touch browser network APIs** (for example wrapping `fetch` to mock it; listed for transparency):

- none

**Domains mentioned in the code:** api.gumroad.com, papana8.gumroad.com

**Content scripts run on:** `*://*.reddit.com/*`, `*://*.twitter.com/*`, `*://*.x.com/*`, `*://*.youtube.com/*`
