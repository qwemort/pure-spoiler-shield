#!/usr/bin/env python3
"""Отчёт о приватности по исходному коду расширения: разрешения, сетевые вызовы, внешние домены, аналитика.
Запуск: python3 tools/privacy-report.py <папка расширения> [...]  (в папке: src/ и manifests/manifest.chrome.json)
  --md FILE      записать Markdown-отчёт
  --badges DIR   записать JSON для значков shields.io (network.json, telemetry.json)
Проверка статическая (по тексту кода): она честно показывает, что в коде есть, но не заменяет чтение кода.
"""
import json, os, re, sys
NET = {'fetch()': r'\bfetch\s*\(', 'XMLHttpRequest': r'\bXMLHttpRequest\b', 'sendBeacon': r'sendBeacon\s*\(',
       'WebSocket': r'\bnew\s+WebSocket\s*\(', 'EventSource': r'\bnew\s+EventSource\s*\('}
REMOTE_CODE = {'eval': r'(?<![\w.])eval\s*\(', 'new Function': r'\bnew\s+Function\s*\(', 'remote script': r'<script[^>]+src=["\']https?:',
               'importScripts(http)': r'importScripts\s*\(\s*["\']https?:'}
ANALYTICS = r'google-analytics\.com|googletagmanager\.com|\bgtag\(|mixpanel\.com|segment\.(io|com)|amplitude\.com|sentry\.io|sentry-cdn|posthog|hotjar|clarity\.ms|mc\.yandex|plausible\.io|matomo'
EXTERNAL = r'(?:\bfetch|sendBeacon|new\s+WebSocket|new\s+EventSource|\.open)\s*\(\s*(?:["\'`][A-Z]+["\'`]\s*,\s*)?["\'`](https?://[^"\'`]+)'
def scan(folder):
    man = json.load(open(os.path.join(folder, 'manifests', 'manifest.chrome.json'), encoding='utf-8'))
    ext = []; net = {k: 0 for k in NET}; rc = {k: 0 for k in REMOTE_CODE}; hosts = set(); analytics = set(); calls = []
    for base, _, files in os.walk(os.path.join(folder, 'src')):
        for f in files:
            if not f.endswith(('.js', '.html')): continue
            p = os.path.join(base, f); t = open(p, encoding='utf-8', errors='replace').read()
            t_nc = re.sub(r'/\*[\s\S]*?\*/', '', t)
            t_nc = re.sub(r'(?m)(^|[^:"\'])//.*$', r'\1', t_nc)
            rel = os.path.relpath(p, folder)
            for k, rx in NET.items():
                for mt in re.finditer(rx, t_nc):
                    net[k] += 1
                    line = t_nc[max(0, mt.start() - 0):t_nc.find('\n', mt.start())][:140].strip()
                    calls.append(f'{rel}: {line}')
            for mt in re.finditer(EXTERNAL, t_nc): ext.append(f'{rel}: {mt.group(1)}')
            for k, rx in REMOTE_CODE.items(): rc[k] += len(re.findall(rx, t_nc))
            for h in re.findall(r'https?://([a-z0-9.-]+\.[a-z]{2,})', t_nc, re.I): hosts.add(h.lower())
            for a in re.findall(ANALYTICS, t_nc, re.I): analytics.add(a.lower())
    cs = sorted({m for c in man.get('content_scripts', []) for m in c.get('matches', [])})
    return dict(name=man.get('short_name') or man.get('name'), version=man.get('version'), permissions=sorted(man.get('permissions', [])),
                host_permissions=sorted(man.get('host_permissions', [])), optional_host_permissions=sorted(man.get('optional_host_permissions', [])),
                content_scripts=cs, network=net, network_total=len(ext), external=ext, calls=calls, remote_code=rc, hosts=sorted(hosts), analytics=sorted(analytics))
def md(reports):
    out = ['# Privacy report', '', 'Generated from the source code by `tools/privacy-report.py` (static check of what the code contains).', '',
           '| Extension | Version | Requests to external servers in code | Analytics / trackers | Remote code (eval, remote scripts) | Permissions | Site access at install | Optional site access |',
           '|---|---|---|---|---|---|---|---|']
    for r in reports:
        out.append(f"| {r['name']} | {r['version']} | {r['network_total']} | {', '.join(r['analytics']) or 'none'} | {sum(r['remote_code'].values()) or 'none'} | "
                   f"{', '.join('`%s`' % x for x in r['permissions'])} | {', '.join('`%s`' % x for x in r['host_permissions']) or 'none'} | {', '.join('`%s`' % x for x in r['optional_host_permissions']) or 'none'} |")
    for r in reports:
        out += ['', f"## {r['name']} {r['version']}", '', '**Requests to external servers (fixed URLs in the code):**', '']
        out += [f'- `{c}`' for c in r['external']] or ['- none']
        out += ['', '**Other places that touch browser network APIs** (for example wrapping `fetch` to mock it; listed for transparency):', '']
        out += [f'- `{c}`' for c in r['calls'] if not any(u.split(': ', 1)[1] in c for u in r['external'])] or ['- none']
        out += ['', '**Domains mentioned in the code:** ' + (', '.join(r['hosts']) or 'none'), '',
                '**Content scripts run on:** ' + (', '.join(f'`{x}`' for x in r['content_scripts']) or 'no content scripts (only on click)')]
    return '\n'.join(out) + '\n'
def main(argv):
    mdf = badges = None; folders = []
    it = iter(argv)
    for a in it:
        if a == '--md': mdf = next(it)
        elif a == '--badges': badges = next(it)
        elif a == '--fail-on-tracking': globals()['STRICT'] = True
        else: folders.append(a)
    reports = [scan(f) for f in folders]
    for r in reports: print(f"{r['name']} {r['version']}: external requests {r['network_total']}, analytics {r['analytics'] or 'none'}, remote code {sum(r['remote_code'].values())}")
    if mdf: open(mdf, 'w', encoding='utf-8').write(md(reports))
    if badges and len(reports) == 1:
        r = reports[0]; os.makedirs(badges, exist_ok=True)
        json.dump({'schemaVersion': 1, 'label': 'external requests in code', 'message': str(r['network_total']), 'color': 'brightgreen' if r['network_total'] <= 1 else 'yellow'}, open(os.path.join(badges, 'network.json'), 'w'))
        json.dump({'schemaVersion': 1, 'label': 'telemetry', 'message': 'none' if not r['analytics'] else 'found', 'color': 'brightgreen' if not r['analytics'] else 'red'}, open(os.path.join(badges, 'telemetry.json'), 'w'))
    if globals().get('STRICT'):
        bad = [r['name'] for r in reports if r['analytics'] or sum(r['remote_code'].values()) or r['network_total'] > 1]
        if bad: print('ОСТАНОВКА: трекеры, удалённый код или больше одного внешнего адреса в: ' + ', '.join(bad)); return 1
    return 0
if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
