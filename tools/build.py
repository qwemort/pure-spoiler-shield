#!/usr/bin/env python3
"""src/ + manifests/ -> release/release-chrome.zip, release-firefox.zip (+ unpacked chrome/, firefox/).
Run: python3 spoilershield/tools/build.py
Checks: version sync, name lengths, every file the manifests point to exists, no remote code / eval / innerHTML,
no private key in src/, permissions stay storage + scripting, host access only YouTube/Reddit/X/Twitter + Gumroad
(all sites only as an OPTIONAL permission for Pro)."""
import json, os, re, shutil, sys, zipfile
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC, MAN, OUT = (os.path.join(ROOT, d) for d in ('src', 'manifests', 'release'))
MAIN = ['*://*.youtube.com/*', '*://*.reddit.com/*', '*://*.x.com/*', '*://*.twitter.com/*']
def fail(m): print('BUILD FAILED: ' + m); sys.exit(1)
def junk(n): return n.startswith('.') or n in ('Thumbs.db', 'desktop.ini', 'manifest.json') or n.endswith(('.map', '.zip'))
def files():
    out = []
    for d, _, fs in os.walk(SRC):
        for f in fs:
            if not junk(f): out.append(os.path.relpath(os.path.join(d, f), SRC).replace(os.sep, '/'))
    return sorted(out)
ct = open(os.path.join(MAN, 'manifest.chrome.json'), encoding='utf-8').read(); ft = open(os.path.join(MAN, 'manifest.firefox.json'), encoding='utf-8').read()
c, f = json.loads(ct), json.loads(ft); v = c['version']
if f['version'] != v:
    ft = re.sub(r'"version"\s*:\s*"[^"]*"', '"version": "%s"' % v, ft, count=1); open(os.path.join(MAN, 'manifest.firefox.json'), 'w', encoding='utf-8').write(ft); f = json.loads(ft)
if len(c['name']) > 75: fail('Chrome name > 75')
if len(f['name']) > 45: fail('Firefox name > 45')
if re.search(r'gta|grand theft|rockstar', c['name'], re.I): fail('trademark in the name (decided 31.10.2026: no game name in the title)')
for m, label in ((c, 'Chrome'), (f, 'Firefox')):
    if sorted(m['permissions']) != ['contextMenus', 'scripting', 'storage']: fail(label + ': permissions must be storage + scripting + contextMenus')
    if sorted(m['host_permissions']) != sorted(MAIN): fail(label + ': host_permissions changed (1.4: only the 4 main sites, no network address)')
    if m.get('optional_host_permissions') != ['<all_urls>']: fail(label + ': all sites must stay optional (asked only on the button)')
    if sorted(m['content_scripts'][0]['matches']) != sorted(MAIN): fail(label + ': content script must run only on the 4 main sites')
    paths = list(m['icons'].values()) + [m['background'].get('service_worker')] + (m['background'].get('scripts') or []) + [m['action']['default_popup'], 'welcome.html']
    for cs in m['content_scripts']: paths += cs['js'] + cs['css']
    for p in filter(None, paths):
        if not os.path.exists(os.path.join(SRC, p)): fail(f'{label} manifest points to {p}, missing in src/')
for rel in files():
    if os.path.basename(rel).startswith('keygen') or os.path.basename(rel) == 'keys.json': fail(rel + ' must stay in tools/')
    if rel.endswith(('.js', '.html', '.json', '.css')):
        t = open(os.path.join(SRC, rel), encoding='utf-8').read()
        if re.search(r'"d"\s*:\s*"', t) or 'PRIVATE' in t: fail(rel + ' contains a private key')
        if rel.endswith(('.js', '.html')):
            if re.search(r'\beval\s*\(|new\s+Function\s*\(', t): fail(rel + ' uses eval/new Function')
            if re.search(r'\binnerHTML\b|insertAdjacentHTML|outerHTML\s*=', t): fail(rel + ' uses innerHTML')
            if re.search(r'<script[^>]+src=["\']https?:', t): fail(rel + ' loads remote code')
for d in sorted(os.listdir(os.path.join(SRC, '_locales'))):
    if len(json.load(open(os.path.join(SRC, '_locales', d, 'messages.json'), encoding='utf-8'))['extDesc']['message']) > 132: fail(d + ' extDesc > 132')
# 1.4: the extension makes no network requests at all — nothing in src/ may mention the old license server or open a connection
for rel in files():
    if rel.endswith(('.js', '.html')):
        t = open(os.path.join(SRC, rel), encoding='utf-8').read()
        if 'gumroad' in t.lower(): fail(rel + ' mentions Gumroad (Pro was removed in 1.4)')
        if re.search(r'(?<![\w.$])fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource|importScripts', t): fail(rel + ' opens a network connection (1.4: zero requests)')
os.makedirs(OUT, exist_ok=True)
for name, text in (('chrome', ct), ('firefox', ft)):
    with zipfile.ZipFile(os.path.join(OUT, f'release-{name}.zip'), 'w', zipfile.ZIP_DEFLATED) as zf:
        zf.writestr('manifest.json', text)
        for rel in files(): zf.write(os.path.join(SRC, rel), rel)
    d = os.path.join(OUT, name); shutil.rmtree(d, ignore_errors=True); shutil.copytree(SRC, d, ignore=lambda dd, ns: [n for n in ns if junk(n)])
    open(os.path.join(d, 'manifest.json'), 'w', encoding='utf-8').write(text)
print(f"{c['short_name']} {v} - build OK ({len(files()) + 1} files)")
