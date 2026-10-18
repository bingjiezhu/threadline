"""Real-backend browser integration harness.
Native mode navigates the actual localhost app and audits the same synthetic
browser session. Optional renderer mode is explicitly weaker: shipped assets
and a real HTTP relay do not establish native cookies or CSP enforcement.
No API result or business operation is mocked here.
"""
from pathlib import Path
import urllib.request, urllib.error, http.cookiejar, json, base64, uuid, os
ROOT=Path(os.environ.get('THREADLINE_ROOT', Path(__file__).resolve().parents[2]))
BASE=os.environ.get('THREADLINE_TEST_ORIGIN','http://localhost:4173')
class Bridge:
 def __init__(self):
  self.jar=http.cookiejar.CookieJar();self.opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
 def request(self,payload):
  path=payload['path'];method=payload.get('method','GET');headers=payload.get('headers',{})
  if not path.startswith('/api/') or '://' in path:raise RuntimeError('Only the tested local API may be called.')
  if method!='GET':headers={**headers,'Origin':BASE}
  if getattr(self,'native_context',None):
   # Audit the same synthetic session established by the real browser UI.
   # Values stay in memory and are never included in a report.
   cookies=self.native_context.cookies(BASE)
   headers={**headers,'Cookie':'; '.join(c['name']+'='+c['value'] for c in cookies)}
  req=urllib.request.Request(BASE+path,data=payload.get('body','').encode() if method!='GET' else None,headers=headers,method=method)
  try:r=self.opener.open(req,timeout=55)
  except urllib.error.HTTPError as e:r=e
  return {'status':r.status,'text':r.read().decode('utf8')}
 def json(self,path,method='GET',body=None,csrf=''):
  p={'path':path,'method':method,'headers':{'Content-Type':'application/json','X-CSRF-Token':csrf,'Idempotency-Key':str(uuid.uuid4())},'body':json.dumps(body or {})}
  return json.loads(self.request(p)['text'])
 def mount(self,page,initial_hash=""):
  if os.environ.get('THREADLINE_BROWSER_MODE','native') == 'native':
   from urllib.parse import urlparse
   if getattr(self,'native_context',None) is not page.context:
    page.context.add_cookies([{'name':c.name,'value':c.value,'url':BASE,'httpOnly':True,'sameSite':'Strict'} for c in self.jar])
   page.goto(BASE+initial_hash, wait_until='networkidle')
   self.native_context=page.context
   return
  page.expose_function('__threadline_real_http',self.request)
  html=(ROOT/'public/index.html').read_text()
  import re
  html=re.sub(r'<link[^>]+>', '', html)
  html=re.sub(r'<script[\s\S]*?</script>','',html)
  logo='data:image/svg+xml;base64,'+base64.b64encode((ROOT/'public/logo.svg').read_bytes()).decode()
  html=html.replace('/logo.svg',logo)
  page.set_content(html)
  page.add_style_tag(content=(ROOT/'public/styles.css').read_text())
  if (ROOT/'public/focus.css').exists():page.add_style_tag(content=(ROOT/'public/focus.css').read_text())
  if (ROOT/'public/warm.css').exists():page.add_style_tag(content=(ROOT/'public/warm.css').read_text())
  if (ROOT/'public/first-task.css').exists():page.add_style_tag(content=(ROOT/'public/first-task.css').read_text())
  if (ROOT/'public/warm-ui.js').exists():page.add_script_tag(content=(ROOT/'public/warm-ui.js').read_text())
  if (ROOT/'public/relationship-ui.js').exists():page.add_script_tag(content=(ROOT/'public/relationship-ui.js').read_text())
  page.evaluate('''() => {
    window.fetch=async (path,options={})=>{
      const r=await window.__threadline_real_http({path:String(path),method:options.method||'GET',headers:options.headers||{},body:options.body||''});
      return new Response(r.text,{status:r.status,headers:{'content-type':'application/json'}});
    };
    if(!crypto.randomUUID)crypto.randomUUID=()=>{const b=crypto.getRandomValues(new Uint8Array(16));b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const s=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`;};
    document.addEventListener('click',e=>{const a=e.target.closest('a');if(a?.getAttribute('href')?.startsWith('#')){e.preventDefault();location.hash=a.getAttribute('href');}},true);
  }''')
  if initial_hash:page.evaluate('(h)=>location.hash=h',initial_hash)
  page.add_script_tag(content=(ROOT/'public/app.js').read_text().replace('/logo.svg',logo),type='module')
