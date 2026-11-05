#!/usr/bin/env python3
"""Автоматика заявок «Add my title»: благодарит за новую заявку и сама закрывает её, когда тайтл появился в списках.
Запуск в GitHub Actions: python3 tools/title-requests.py (нужен GH_TOKEN, gh CLI).
"""
import json, os, re, subprocess, unicodedata
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
def gh(*a):
    return subprocess.run(['gh', *a], capture_output=True, text=True, check=True).stdout
def norm(s):
    s = unicodedata.normalize('NFKD', str(s).lower())
    s = ''.join(c for c in s if not unicodedata.combining(c))
    return re.sub(r'[^\w]+', ' ', s).strip()
def known():
    t = open(os.path.join(ROOT, 'src', 'lib', 'words.js'), encoding='utf-8').read()
    i = t.index('const LIB = ['); body = t[i:t.index('];', i)]
    names = set(norm(x) for x in re.findall(r"label: '([^']+)'", body))
    for grp in re.findall(r"game: \[([^\]]*)\]", body):
        names |= set(norm(x) for x in re.findall(r"'([^']+)'", grp))
    names |= {'gta 6', 'gta vi', 'grand theft auto vi'}
    version = json.load(open(os.path.join(ROOT, 'manifests', 'manifest.chrome.json'), encoding='utf-8'))['version']
    return names, version
def title_of(issue):
    m = re.search(r'### Title\s+(.+?)\s*(?:\n###|$)', issue.get('body') or '', re.S)
    t = (m.group(1) if m else re.sub(r'^add:\s*', '', issue['title'], flags=re.I)).strip()
    return '' if t.startswith('_No response') else t
def main():
    names, version = known()
    issues = json.loads(gh('issue', 'list', '--label', 'title-request', '--state', 'open', '--limit', '200', '--json', 'number,title,body,comments'))
    for it in issues:
        t = title_of(it); n = norm(t)
        said = any('Thanks for the request' in (c.get('body') or '') for c in it.get('comments', []))
        if n and n in names:
            gh('issue', 'comment', str(it['number']), '--body', f'**{t}** is in the ready-made lists now (version {version} or later). Update the extension, then turn it on in the popup. Thanks for asking!')
            gh('issue', 'close', str(it['number']), '--reason', 'completed')
            print('closed', it['number'], t)
        elif not said:
            gh('issue', 'comment', str(it['number']), '--body', f'Thanks for the request! **{t or "This title"}** is on the list. Titles with the most 👍 on their request go first, so share this page with friends who are waiting for it too. This issue closes automatically when the list ships.')
            print('thanked', it['number'], t)
if __name__ == '__main__':
    main()
