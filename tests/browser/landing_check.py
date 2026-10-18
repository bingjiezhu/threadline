"""Landing UI + actual consented inquiry endpoint. Temporary synthetic data only."""
from pathlib import Path
import os, subprocess, socket, tempfile, time, urllib.request, sys, re, base64, json, sqlite3
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[2]
OUT=Path(os.environ.get('THREADLINE_LANDING_OUTPUT',ROOT/'artifacts/v1.2/landing-browser'));OUT.mkdir(parents=True,exist_ok=True)
WARM=os.environ.get('THREADLINE_LANDING_PAGE')=='warm'
PAGE='/warm-start.html' if WARM else '/welcome'
HTML='warm-start.html' if WARM else 'welcome.html'
checks=[];errors=[]
def mark(name):checks.append({'check':name,'status':'passed'});print('PASS',name,flush=True)
with tempfile.TemporaryDirectory(prefix='threadline-landing-') as td:
 with socket.socket() as sk:sk.bind(('127.0.0.1',0));port=sk.getsockname()[1]
 origin=f'http://localhost:{port}';os.environ['THREADLINE_TEST_ORIGIN']=origin
 from bridge import Bridge
 db=Path(td)/'landing.sqlite';env={**os.environ,'HOST':'127.0.0.1','PORT':str(port),'THREADLINE_DB':str(db),'NODE_ENV':'development','APP_ORIGIN':'','OPENAI_API_KEY':'','REGISTRATION_TOKEN':''}
 with open(Path(td)/'server.log','w') as log:
  server=subprocess.Popen(['node','server.js'],cwd=ROOT,env=env,stdout=log,stderr=log)
  try:
   for _ in range(100):
    try:
     if urllib.request.urlopen(origin+'/api/health',timeout=1).status==200:break
    except Exception:time.sleep(.1)
   else:raise RuntimeError('Server did not start.')
   with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('THREADLINE_BROWSER_PATH','/usr/bin/chromium'),headless=True)
    page=browser.new_page(viewport={'width':1440,'height':1000});page.set_default_timeout(8000);page.on('pageerror',lambda e:errors.append(str(e)))
    if os.environ.get('THREADLINE_BROWSER_MODE','native')=='native':page.goto(origin+PAGE,wait_until='networkidle')
    else:
     bridge=Bridge();page.expose_function('__real_inquiry',bridge.request)
     html=(ROOT/'public'/HTML).read_text();html=re.sub(r'<link[^>]+>', '', html);html=re.sub(r'<script[\s\S]*?</script>','',html)
     logo='data:image/svg+xml;base64,'+base64.b64encode((ROOT/'public/logo.svg').read_bytes()).decode();html=html.replace('/logo.svg',logo)
     page.set_content(html);page.add_style_tag(content=(ROOT/'public/styles.css').read_text());page.add_style_tag(content=(ROOT/'public/marketing.css').read_text())
     page.evaluate('''() => {window.fetch=async(path,o={})=>{const r=await window.__real_inquiry({path:String(path),method:o.method||'GET',headers:o.headers||{},body:o.body||''});return new Response(r.text,{status:r.status,headers:{'content-type':'application/json'}});};}''')
     page.add_script_tag(content=(ROOT/'public/marketing.js').read_text())
    expect(page.locator('h1')).to_contain_text('Know who to ask.' if WARM else 'Remember why.');mark('Landing explains the new-hire benefit' if WARM else 'Landing explains the person-first benefit')
    expect(page.locator('.scene-caption')).to_contain_text('NOT A CUSTOMER');mark('Illustrative story is not presented as traction')
    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1');mark('Desktop page has no horizontal overflow')
    page.screenshot(path=str(OUT/'desktop.png'),full_page=True)
    form=page.locator('#pilot-form');form.scroll_into_view_if_needed()
    form.locator('[name=name]').fill('Synthetic Pilot Check');form.locator('[name=email]').fill('landing-check@example.invalid');form.locator('[name=company]').fill('Fictional Test Studio');form.locator('[name=goal]').fill('Test inquiry only. Verify real storage without sending mail or charging.')
    assert not form.evaluate('(f)=>f.checkValidity()');mark('Form requires affirmative consent')
    form.locator('[name=consent]').check();form.locator('button[type=submit]').click();expect(page.locator('#pilot-result')).to_contain_text('No payment has been taken and no email has been sent.');mark('Submission calls actual backend and reports its limited action')
    with sqlite3.connect(db) as con:
     rows=con.execute('SELECT name,email,consent FROM pilot_requests').fetchall();assert rows==[('Synthetic Pilot Check','landing-check@example.invalid',1)]
    mark('Consented synthetic inquiry is present in SQLite')
    assert form.locator('[name=email]').input_value()=='';mark('Successful form clears submitted private values')
    for width in [390,768]:
     page.set_viewport_size({'width':width,'height':844});page.evaluate('scrollTo(0,0)');page.wait_for_timeout(200)
     assert page.evaluate('document.documentElement.scrollWidth<=innerWidth+1');mark(f'Landing fits {width}px viewport')
     page.screenshot(path=str(OUT/f'width-{width}.png'),full_page=True)
    assert not errors;mark('No browser JavaScript errors')
    browser.close()
   report={'version':'1.3.2','status':'passed','mode':os.environ.get('THREADLINE_BROWSER_MODE','native'),'backend':'real temporary HTTP and SQLite','checks':checks,'javascript_errors':errors,'not_executed':['Native navigation/CSP/cookies in renderer mode','Real pilot enrollment or payment','Email transmission']}
   (OUT/'report.json').write_text(json.dumps(report,indent=2)+'\n')
  except Exception as e:
   (OUT/'report.json').write_text(json.dumps({'status':'failed','checks':checks,'error':str(e),'javascript_errors':errors},indent=2)+'\n');raise
  finally:
   server.terminate()
   try:server.wait(timeout=10)
   except subprocess.TimeoutExpired:server.kill();server.wait()
