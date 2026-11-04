# Live Firefox test of the page script (store Firefox build, run on *.test copies of YouTube/Reddit/X).
#   FIREFOX=... GECKODRIVER=... python3 spoilershield/tests/ss-firefox.py      (Firefox + geckodriver: see DEV.md)
# The popup is not tested here (extension pages do not render in the cloud test Firefox) — see tests/ss-test.mjs.
import http.server, json, os, shutil, socketserver, sys, tempfile, threading, time, zipfile
from urllib.parse import urlparse, parse_qs
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.firefox.options import Options
from selenium.webdriver.firefox.service import Service
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(HERE)
SITE = os.path.join(HERE, 'site'); REL = os.path.join(ROOT, 'release', 'firefox'); ID = '@pure-spoiler-shield'
tmp = tempfile.mkdtemp(prefix='ss-ff-'); ext = os.path.join(tmp, 'ext'); shutil.copytree(REL, ext)
m = json.load(open(os.path.join(ext, 'manifest.json'), encoding='utf-8'))
m['content_scripts'][0]['matches'] = ['*://*.youtube.test/*', '*://*.reddit.test/*', '*://x.test/*']
m['host_permissions'] += ['*://*.youtube.test/*', '*://*.reddit.test/*', '*://x.test/*']
json.dump(m, open(os.path.join(ext, 'manifest.json'), 'w', encoding='utf-8'), indent=1)
if os.environ.get('SSDEBUG'):
    sp = os.path.join(ext, 'content', 'shield.js'); t = open(sp, encoding='utf-8').read()
    t = t.replace('function flush() {', 'function flush() { const D=document.documentElement.dataset; D.pssFlush=(+D.pssFlush||0)+1;')
    t = t.replace('  function queue(node) {', '  function queue(node) { const D=document.documentElement.dataset; D.pssQueue=(+D.pssQueue||0)+1;')
    t = t.replace('  function scan(roots) {', '  function scan(roots) { const D=document.documentElement.dataset; D.pssScan=(+D.pssScan||0)+1; D.pssActive=String(active());')
    open(sp, 'w', encoding='utf-8').write(t)
xpi = os.path.join(tmp, 'test.xpi')
with zipfile.ZipFile(xpi, 'w') as z:
    for d, _, fs in os.walk(ext):
        for f in fs: z.write(os.path.join(d, f), os.path.relpath(os.path.join(d, f), ext))
class H(http.server.SimpleHTTPRequestHandler):
    def do_GET(s):
        u = urlparse(s.path); h = s.headers.get('Host', '')
        f = 'x.html' if h.startswith('x.test') else ('reddit.html' if 'reddit' in h else ('yt-watch.html' if u.path.startswith('/watch') else 'yt-home.html'))
        b = open(os.path.join(SITE, f), 'rb').read(); s.send_response(200); s.send_header('content-type', 'text/html; charset=utf-8'); s.end_headers(); s.wfile.write(b)
    def log_message(s, *a): pass
srv = socketserver.TCPServer(('127.0.0.1', 0), H); P = srv.server_address[1]
threading.Thread(target=srv.serve_forever, daemon=True).start()
o = Options(); o.add_argument('-headless'); o.binary_location = os.environ['FIREFOX']
o.set_preference('network.dns.localDomains', 'www.youtube.test,www.reddit.test,x.test')
o.set_preference('network.proxy.type', 0)
d = webdriver.Firefox(options=o, service=Service(os.environ['GECKODRIVER'], service_args=['--allow-system-access']))
d.set_window_size(1100, 900)
res = []
def chk(n, ok, x=''): res.append(('ok  ' if ok else 'FAIL') + ' ' + n + (('  — ' + str(x)[:300]) if (not ok and x != '') else '')); print(res[-1])
veiled = lambda sel: d.execute_script("const e=document.querySelector(arguments[0]); return e ? e.classList.contains('pss-veil') : 'missing'", sel)
try:
    print('Firefox', d.capabilities.get('browserVersion'))
    d.install_addon(xpi, temporary=True); time.sleep(2)
    d.set_context('chrome')
    r = d.execute_async_script('''const done=arguments[arguments.length-1];
      const {ExtensionPermissions}=ChromeUtils.importESModule("resource://gre/modules/ExtensionPermissions.sys.mjs");
      ExtensionPermissions.add("%s",{permissions:[],origins:["*://*.youtube.test/*","*://*.reddit.test/*","*://x.test/*"]}).then(()=>done("ok"),e=>done("ERR "+e));''' % ID)
    d.set_context('content'); chk('test access granted', r == 'ok', r)
    d.get(f'http://www.youtube.test:{P}/'); time.sleep(1.5)
    chk('YouTube: GTA 6 ending video hidden', veiled('#v1') is True, veiled('#v1'))
    chk('YouTube: trailer stays, pasta stays', veiled('#v2') is False and veiled('#v3') is False)
    # a card added later (infinite scroll); the page's own timer is unreliable in the headless cloud Firefox, so add it here
    d.execute_script("const c=document.createElement('ytd-rich-item-renderer'); c.id='v8'; c.innerHTML='<a>Leonida final mission secret</a>'; document.getElementById('contents').append(c);"); time.sleep(0.8)
    chk('YouTube: card added later is hidden', veiled('#v8') is True)
    if os.environ.get('SSDEBUG'):
        for i, (how, txt) in enumerate([('text', 'Leonida final mission secret'), ('html', 'GTA 6 ending leak'), ('text', 'GTA 6 ending leak'), ('html', 'Leonida final mission secret')]):
            js = "const c=document.createElement('ytd-rich-item-renderer'); c.id='d%d'; " % i + ("c.textContent=arguments[0];" if how == 'text' else "c.innerHTML='<a>'+arguments[0]+'</a>';") + " document.getElementById('contents').append(c);"
            d.execute_script(js, txt); time.sleep(0.8); print('DBG', how, txt, veiled('#d%d' % i), d.execute_script('return JSON.stringify(document.documentElement.dataset)'))
    chk('YouTube: suggestion removed', d.execute_script("return getComputedStyle(document.getElementById('s1')).display") == 'none')
    bf = d.execute_script("return getComputedStyle(document.getElementById('v1'), '::after').backdropFilter")
    chk('Firefox draws the blur (backdrop-filter)', 'blur' in str(bf), bf)
    lab = d.execute_script("return document.getElementById('v1').dataset.pssLabel")
    chk('label translated from _locales', 'GTA VI' in lab and 'Click to show' in lab, lab)
    el = d.find_element(By.ID, 'v1'); el.click(); time.sleep(0.2)
    chk('click on veil does not follow the link', '/watch' not in d.current_url, d.current_url)
    el.click(); time.sleep(0.2)
    chk('second click shows', veiled('#v1') is False)
    d.get(f'http://www.youtube.test:{P}/watch?v=1'); time.sleep(1.5)
    chk('watch page: player hidden, comments folded', veiled('#player-container-outer') is True and d.execute_script("return document.getElementById('comments').classList.contains('pss-fold')"))
    d.get(f'http://www.reddit.test:{P}/'); time.sleep(1.2)
    chk('Reddit: spoiler post hidden', veiled('#p1') is True and veiled('#p2') is False)
    d.get(f'http://x.test:{P}/home'); time.sleep(1.2)
    chk('X: spoiler post hidden, trend removed', veiled('#t1') is True and d.execute_script("return getComputedStyle(document.getElementById('tr1')).display") == 'none')
finally:
    d.quit(); srv.shutdown()
fails = sum(1 for r in res if r.startswith('FAIL'))
print(f'\n{len(res) - fails} passed, {fails} failed'); sys.exit(1 if fails else 0)
