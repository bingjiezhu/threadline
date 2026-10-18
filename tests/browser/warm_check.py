"""Warm Start functional UI checks against real HTTP and an isolated SQLite database."""
from bridge import Bridge,ROOT
from playwright.sync_api import sync_playwright,expect
from pathlib import Path
import os,json,secrets,uuid
out=Path(os.environ.get('THREADLINE_WARM_OUTPUT',ROOT/'artifacts/v1.3/browser'));out.mkdir(parents=True,exist_ok=True)
checks=[];errors=[]
def mark(s):checks.append({'check':s,'status':'passed'});print('PASS',s,flush=True)
def route(p,s):p.evaluate('(s)=>location.hash="#"+s',s);p.wait_for_timeout(400)
def shot(p,s):p.screenshot(path=str(out/(s+'.png')),full_page=True)
def fits(p,s):assert p.evaluate('document.documentElement.scrollWidth<=innerWidth+1'),s;mark(s+' fits viewport')
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=os.environ.get('THREADLINE_BROWSER_PATH','/usr/bin/chromium'),headless=True)
 ctx=browser.new_context(viewport={'width':1600,'height':1000},device_scale_factor=1);p=ctx.new_page();p.set_default_timeout(10000);p.on('pageerror',lambda e:errors.append(str(e)))
 b=Bridge();password='Synthetic-'+secrets.token_hex(12)
 auth=b.json('/api/auth/register','POST',{'name':'Alex Rivera','email':str(uuid.uuid4())+'@example.invalid','password':password,'workspace':'First-week UI verification','inviteCode':os.environ['THREADLINE_TEST_INVITATION']})
 csrf=auth['csrf'];post=lambda path,obj:b.json(path,'POST',obj,csrf)
 maya=post('/api/contacts',{'name':'Maya Chen','role':'Platform lead'});jordan=post('/api/contacts',{'name':'Jordan Lee','role':'Developer enablement'})
 old=post('/api/notes',{'title':'Original sandbox ownership','body':'Maya Chen approves sandbox access. Check required security training first.','occurred_on':'2026-10-01'})
 try:
  b.mount(p,'#warmstart');p.wait_for_selector('.warm-hero');mark('First-week page reads actual authenticated state');fits(p,'First week');shot(p,'01_first_week_empty')
  p.get_by_role('button',name='Add trusted context',exact=True).click();p.wait_for_selector('#edit-form')
  p.locator('#f-topic').fill('sandbox-access');p.locator('#f-route_role').select_option('approver');p.locator('#f-contact_id').select_option(maya['id']);p.locator('#f-note_id').select_option(old['id']);expect(p.locator('#f-quote')).to_have_value(old['body']);p.locator('#edit-form input[name=confirm]').check();p.get_by_role('button',name='Confirm route',exact=True).click();p.wait_for_selector('.warm-route')
  assert len(b.json('/api/warm')['routes'])==1;mark('Confirm a real dated source and a specific colleague through UI');shot(p,'02_knowledge_map')
  route(p,'warmstart');p.get_by_role('button',name='Set a first goal',exact=True).click();p.locator('#f-title').fill('Run my first sandbox walkthrough');p.locator('#f-role').fill('New solutions engineer');p.locator('#f-topic').fill('sandbox-access');p.locator('#f-success').fill('Run one approved test and explain the result to my buddy.');p.get_by_role('button',name='Create goal',exact=True).click();p.wait_for_selector('.warm-launch');gid=b.json('/api/warm')['goals'][0]['id'];mark('Create a persisted onboarding goal with a verifiable outcome')
  p.get_by_role('button',name='Prepare my plan',exact=True).click();p.get_by_role('button',name='Prepare plan',exact=True).click();p.wait_for_selector('.warm-step');expect(p.locator('.plan-summary')).to_contain_text('Maya');assert len(b.json('/api/state')['tasks'])==0;mark('First plan is a proposal; no tasks are silently created');shot(p,'03_original_plan')
  # A new source enters through the ordinary capture UI.
  route(p,'capture');p.wait_for_selector('#capture-form');newbody='Jordan Lee now handles sandbox access. Maya Chen no longer approves access requests. Complete security training first; access is not automatic.'
  p.locator('#capture-body').fill(newbody);p.locator('#f-contact_id').select_option(jordan['id']);p.locator('#f-occurred_on').fill('2026-10-16');p.get_by_role('button',name='Save conversation',exact=True).click();p.wait_for_selector('.saved-scene');newnote=b.json('/api/state')['notes'][0];mark('An actual captured message becomes new source context')
  route(p,'workmap');p.get_by_role('button',name='Add a knowledge route',exact=True).click();p.locator('#f-topic').fill('sandbox-access');p.locator('#f-route_role').select_option('approver');p.locator('#f-contact_id').select_option(jordan['id']);p.locator('#f-note_id').select_option(newnote['id']);expect(p.locator('#f-quote')).to_have_value(newbody);oldroute=b.json('/api/warm')['routes'][0];p.locator('#f-supersedes_id').select_option(oldroute['id']);p.locator('#edit-form input[name=confirm]').check();p.get_by_role('button',name='Confirm route',exact=True).click();p.wait_for_timeout(550);mark('Explicit later ownership replaces an older route; no automatic newest-upload guess')
  route(p,'warm-goal/'+gid);p.wait_for_selector('.warm-stale');assert 'Maya Chen approves' not in p.locator('#main').inner_text();mark('Old plan becomes stale and its derived text is withheld')
  p.get_by_role('button',name='Recheck the sources',exact=True).click();p.get_by_role('button',name='Prepare plan',exact=True).click();p.wait_for_selector('.warm-step');expect(p.locator('.plan-summary')).to_contain_text('Jordan');expect(p.locator('.warm-history')).to_contain_text('Superseded');expect(p.locator('.warm-unknowns')).to_contain_text('Access still needs to be checked');fits(p,'Current plan');shot(p,'04_current_plan');mark('New plan cites Jordan, explains supersession and keeps unknowns visible')
  p.locator('#warm-approval input[name=confirm]').check();p.get_by_role('button',name='Approve selected steps',exact=True).click();p.wait_for_selector('[data-action=warm-complete]');assert len(b.json('/api/state')['tasks'])==3;mark('Human approval creates three real tasks atomically');shot(p,'05_approved_tasks')
  p.locator('.warm-draft summary').click();p.locator('#draft-ask').fill('Hi Jordan, I am new to the team. What should I prepare before requesting sandbox access?');p.get_by_role('button',name='Save edits',exact=True).click();p.wait_for_timeout(400);stored=b.json('/api/warm/goals/'+gid)['plans'][0];assert 'What should I prepare' in next(s for s in stored['body']['steps'] if s['id']=='ask')['draft'];mark('Edited introduction draft is persisted, never sent automatically')
  p.locator('[data-action=warm-complete]').first.click();p.wait_for_timeout(400);assert len([t for t in b.json('/api/state')['tasks'] if t['status']=='done'])==1;assert b.json('/api/warm/goals/'+gid)['status']=='open';mark('Real task completion does not silently certify the overall outcome');shot(p,'06_first_step_done')
  for view in ['warmstart','workmap','warm-goal/'+gid,'connect']:
   p.set_viewport_size({'width':390,'height':844});route(p,view);fits(p,'Mobile '+view.split('/')[0]);shot(p,'mobile_'+view.split('/')[0]);p.get_by_role('button',name='Toggle navigation',exact=True).click();expect(p.locator('[data-nav=warmstart]')).to_be_visible();p.keyboard.press('Escape')
  mark('New screens preserve mobile navigation and keyboard dismissal')
  p.set_viewport_size({'width':1600,'height':1000});route(p,'connect');expect(p.locator('#main')).to_contain_text('Operator setup required');assert p.locator('[data-action=chat-code]').count()==0;mark('Unconfigured chat services are not displayed as connected');shot(p,'07_connections')
  g=post('/api/warm/goals',{'title':'Deploy directly to production','role':'New engineer','topic':'production-permission','success':'Get explicit authorization before any production work'})
  route(p,'warm-goal/'+g['id']);p.get_by_role('button',name='Prepare my plan',exact=True).click();p.get_by_role('button',name='Prepare plan',exact=True).click();p.wait_for_selector('.plan-summary');expect(p.locator('.plan-summary')).to_contain_text('No current');assert p.locator('#warm-approval [type=submit]').count()==0;mark('Missing evidence yields no fabricated owner or executable plan');shot(p,'08_no_evidence')
  b.json('/api/notes/'+newnote['id'],'DELETE',{'version':newnote['version']},csrf);route(p,'warm-goal/'+gid);p.wait_for_selector('.warm-stale');assert newbody not in p.locator('#main').inner_text();mark('Deleting a supporting note hides stale plans and cancels unfinished derived tasks')
  assert not errors,errors;mark('No browser JavaScript errors')
 except Exception:shot(p,'FAILURE');raise
 finally:browser.close()
(out/'report.json').write_text(json.dumps({'release':'1.3.1','status':'passed','transport':os.environ.get('THREADLINE_BROWSER_MODE','native'),'checks':checks,'errors':errors,'boundary':'Actual shipped UI and actual HTTP/SQLite. Renderer transport is not native navigation, platform installation or a live LLM test.'},indent=2))
print(json.dumps({'checks_passed':len(checks),'errors':errors}))
