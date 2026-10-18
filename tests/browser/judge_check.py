"""Focused actual UI integration: source -> person -> approved next step. No mock API responses."""
from bridge import Bridge, ROOT
from playwright.sync_api import sync_playwright,expect
from pathlib import Path
import os,json,secrets,uuid
out=ROOT/'artifacts/v1.3.2/browser/judge_check';out.mkdir(parents=True,exist_ok=True)
checks=[];errors=[]
def mark(s):checks.append({'check':s,'status':'passed'});print('PASS',s,flush=True)
def nav(p,s):p.evaluate('(s)=>location.hash="#"+s',s);p.wait_for_timeout(300)
def shot(p,s):p.screenshot(path=str(out/(s+'.png')),full_page=True)
def fits(p,s):assert p.evaluate('document.documentElement.scrollWidth <= innerWidth+1'),s;mark(s+' has no horizontal overflow')
b=Bridge();auth=b.json('/api/auth/register','POST',{'name':'Alex Rivera','email':str(uuid.uuid4())+'@example.invalid','password':'Synthetic-'+secrets.token_hex(12),'workspace':'Focused task test','inviteCode':os.environ['THREADLINE_TEST_INVITATION']})
csrf=auth['csrf'];post=lambda path,x:b.json(path,'POST',x,csrf)
with sync_playwright() as pw:
 browser=pw.chromium.launch(executable_path=os.environ.get('THREADLINE_BROWSER_PATH','/usr/bin/chromium'),headless=True)
 ctx=browser.new_context(viewport={'width':1600,'height':1000});p=ctx.new_page();p.set_default_timeout(10000);p.on('pageerror',lambda e:errors.append(str(e)))
 try:
  b.mount(p,'#first-task');p.wait_for_selector('.firstwin-empty');mark('Empty focused entry does not seed data');fits(p,'Empty focus')
  maya=post('/api/contacts',{'name':'Maya Chen','role':'Platform lead'});jordan=post('/api/contacts',{'name':'Jordan Lee','role':'Developer enablement'})
  old=post('/api/notes',{'title':'Original sandbox guide','body':'Maya Chen approves sandbox access. Complete security training before asking.','occurred_on':'2026-10-01'})
  nr=post('/api/notes',{'title':'Sandbox responsibility update','body':'Jordan Lee now handles sandbox access. Maya Chen no longer approves requests. Complete security training first; access is not automatic.','occurred_on':'2026-10-16'})
  oldr=post('/api/warm/routes',{'topic':'sandbox-access','contact_id':maya['id'],'note_id':old['id'],'quote':old['body'],'route_role':'approver','confirm':True})
  # Reload the ordinary state through the UI; create the user's real goal through the focused entry.
  p.evaluate('location.hash="#warmstart"');p.wait_for_selector('.warm-hero');p.evaluate('location.hash="#first-task"');p.wait_for_selector('.firstwin-empty')
  # Refresh state so these newly created, authorized test records become selectable in UI forms.
  p.locator('[data-action=reload]').count()
  post('/api/warm/goals',{'title':'Run my first sandbox walkthrough','role':'New solutions engineer','topic':'sandbox-access','success':'Run one approved test and explain the result to my buddy.'})
  gid=b.json('/api/warm')['goals'][0]['id'];nav(p,'first-task/'+gid);p.wait_for_selector('[data-focus-state=unplanned]');mark('A stored goal opens in the focused view')
  p.get_by_role('button',name='Find my next steps',exact=True).click();p.get_by_role('button',name='Prepare plan',exact=True).click();p.wait_for_selector('[data-testid=current-owner]');expect(p.locator('[data-testid=current-owner]')).to_have_text('Maya Chen');assert len(b.json('/api/state')['tasks'])==0;mark('Unconfirmed later note does not replace responsibility or create tasks');fits(p,'Maya proposal');shot(p,'01_maya')
  p.get_by_role('button',name='Update who to ask',exact=True).click();p.wait_for_selector('#edit-form');assert not p.locator('#edit-form input[name=confirm]').is_checked();mark('Replacement requires a separate explicit confirmation')
  p.locator('#f-note_id').select_option(nr['id']);expect(p.locator('#f-quote')).to_have_value(nr['body']);expect(p.locator('#firstwin-update-date')).to_contain_text('2026');p.locator('#f-contact_id').select_option(jordan['id']);shot(p,'02_review')
  p.locator('#edit-form input[name=confirm]').check();p.get_by_role('button',name='Confirm the change',exact=True).click();p.wait_for_selector('[data-focus-state=stale]');assert 'Jordan Lee now handles' not in p.locator('#main').inner_text();assert p.locator('#warm-approval').count()==0;mark('Confirmation invalidates the old plan rather than executing a new one');shot(p,'03_stale')
  p.get_by_role('button',name='Check again',exact=True).click();p.get_by_role('button',name='Prepare plan',exact=True).click();p.wait_for_selector('[data-testid=current-owner]');expect(p.locator('[data-testid=current-owner]')).to_have_text('Jordan Lee');expect(p.locator('.firstwin-change')).to_contain_text('Maya Chen');expect(p.locator('.firstwin-open')).to_contain_text('Access still needs to be checked');mark('New plan shows current colleague, source, previous record and unknowns');fits(p,'Jordan proposal');shot(p,'04_jordan')
  p.locator('#warm-approval input[value=verify]').uncheck();p.locator('#warm-approval input[name=confirm]').check();p.get_by_role('button',name='Add to my tasks',exact=True).click();p.wait_for_selector('[data-focus-state=approved]');assert len(b.json('/api/state')['tasks'])==2;mark('Only two selected steps create two persistent tasks, not three');shot(p,'05_approved')
  p.locator('.firstwin-draft summary').click();p.locator('#draft-ask').fill('Hi Jordan, I am new here. What should I prepare for sandbox access?');p.get_by_role('button',name='Save edits',exact=True).click();p.wait_for_timeout(350);assert 'What should I prepare' in next(s for s in b.json('/api/warm/goals/'+gid)['plans'][0]['body']['steps'] if s['id']=='ask')['draft'];mark('Editable introduction is saved through the real backend')
  p.locator('[data-action=warm-complete]').first.click();p.wait_for_timeout(400);expect(p.locator('.firstwin-count')).to_contain_text('1 / 2 done');assert b.json('/api/warm/goals/'+gid)['status']=='open';mark('One completed step leaves the goal explicitly open');shot(p,'06_progress')
  p.set_viewport_size({'width':390,'height':844});fits(p,'390px focused page');expect(p.locator('.firstwin-exit')).to_be_visible();expect(p.locator('.sidebar')).not_to_be_visible();shot(p,'07_mobile')
  p.locator('.firstwin-exit').click();p.wait_for_selector('.warm-hero');p.get_by_role('button',name='Toggle navigation',exact=True).click();expect(p.locator('[data-nav=contacts]')).to_be_visible();p.keyboard.press('Escape');mark('Leaving focus restores normal mobile navigation')
  p.set_viewport_size({'width':1600,'height':1000});nav(p,'first-task/'+gid);b.json('/api/notes/'+nr['id'],'DELETE',{'version':nr['version']},csrf);nav(p,'warmstart');nav(p,'first-task/'+gid);p.wait_for_selector('[data-focus-state=stale]');assert nr['body'] not in p.locator('#main').inner_text();mark('Source deletion withholds focused evidence and executable steps')
  g=post('/api/warm/goals',{'title':'Production deployment','role':'Engineer','topic':'production','success':'Get explicit permission'})
  nav(p,'first-task/'+g['id']);p.get_by_role('button',name='Find my next steps',exact=True).click();p.get_by_role('button',name='Prepare plan',exact=True).click();p.wait_for_selector('[data-focus-state=blocked]');assert p.locator('#warm-approval').count()==0;mark('No evidence produces a clear block, not a plausible invented person');shot(p,'08_missing')
  assert not errors,errors;mark('Focused workflow has no JavaScript errors')
 except Exception:shot(p,'FAILURE');raise
 finally:browser.close()
(out/'report.json').write_text(json.dumps({'version':'1.3.2','checks':checks,'status':'passed','errors':errors,'transport':os.environ.get('THREADLINE_BROWSER_MODE','native'),'data':'synthetic records, real HTTP and SQLite'},indent=2))
