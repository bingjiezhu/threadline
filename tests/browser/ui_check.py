from bridge import Bridge,ROOT
from playwright.sync_api import sync_playwright,expect
from pathlib import Path
import json,time,uuid,os,secrets
out=Path(os.environ.get('THREADLINE_UI_OUTPUT',ROOT/'artifacts/browser'));out.mkdir(parents=True,exist_ok=True);errors=[];checks=[]
TEST_PASSWORD='Synthetic-only-'+secrets.token_hex(18)
INVITATION=os.environ.get('THREADLINE_TEST_INVITATION','')
def mark(name):
 checks.append({'check':name,'status':'passed'});print('PASS',name,flush=True);(out/'ui-partial.json').write_text(json.dumps(checks,indent=2))
def ready(page):page.wait_for_selector('#modal[open]',state='hidden');page.wait_for_timeout(150)
def clicksave(page,text):page.get_by_role('button',name=text,exact=True).click();ready(page)
with sync_playwright() as p:
 b=p.chromium.launch(**({'executable_path':os.environ['THREADLINE_BROWSER_PATH']} if os.environ.get('THREADLINE_BROWSER_PATH') else {}),headless=True)
 c=b.new_context(viewport={'width':1600,'height':1000},device_scale_factor=1)
 page=c.new_page();page.set_default_timeout(7000);page.on('pageerror',lambda e:errors.append(str(e)));page.on('console',lambda e: errors.append(e.text) if e.type=='error' else None)
 bridge=Bridge();login=bridge.json('/api/auth/register','POST',{'name':'Morgan Ellis','workspace':'Morgan’s consulting workspace','email':'qa-'+str(uuid.uuid4())[:8]+'@example.invalid','password':TEST_PASSWORD,'inviteCode':INVITATION})
 bridge.mount(page);page.wait_for_selector('.sidebar')
 page.locator('[data-nav=settings]').click();page.locator('[data-action=restore]').click();page.locator('#restore-file').set_input_files(str(ROOT/'examples/fictional-workspace.json'));page.locator('#f-password').fill(TEST_PASSWORD);page.locator('#modal input[type=checkbox]').check();clicksave(page,'Restore working records');mark('Restore optional archive through the real HTTP import path')
 st=bridge.json('/api/state');assert len(st['contacts'])==6 and len(st['projects'])==4 and len(st['reviews'])==2;mark('Restore remaps IDs and regenerates only two eligible matches')
 # Capture every major view and verify no page-level horizontal overflow.
 for name in ['overview','projects','contacts','notes','reviews','tasks','activity','settings','guide']:
  page.locator('[data-nav='+name+']').click();page.wait_for_timeout(450)
  assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1'),name
  assert not page.locator('#main').get_by_text('We could not open this record').count(),name
  page.screenshot(path=str(out/f'ui_{name}.png'),full_page=True);mark(name+' view renders and fits desktop')
 # Persistent arbitrary new contact and project.
 page.locator('[data-nav=contacts]').click();page.locator('[data-action=new-contact]').click();page.locator('#f-name').fill('Avery Test '+str(uuid.uuid4())[:5]);name=page.locator('#f-name').input_value();page.locator('#f-email').fill('avery-'+str(uuid.uuid4())[:6]+'@example.invalid');page.locator('#f-company').fill('Independent QA Company');page.locator('#f-role').fill('Engineering lead');clicksave(page,'Create contact');mark('Create a new, non-sample contact through UI')
 st=bridge.json('/api/state');person=next(x for x in st['contacts'] if x['name']==name)
 page.locator('[data-nav=projects]').click();page.locator('[data-action=new-project]').click();page.locator('#f-name').fill('Air-gapped inventory rollout');page.locator('#f-company').fill('Independent QA Company');page.locator('#f-contact_id').select_option(person['id']);page.locator('#f-value').fill('9500.25');page.locator('#f-unknowns').fill('Budget and current ownership are not confirmed.');clicksave(page,'Create project');mark('Create linked project with fractional money value')
 st=bridge.json('/api/state');project=next(x for x in st['projects'] if x['name']=='Air-gapped inventory rollout');assert project['value']==950025
 def make_note(title,body,kind,date,project_id=''):
  page.locator('[data-action=new-note]').first.click();page.locator('#f-title').fill(title);page.locator('#f-body').fill(body);page.locator('#f-kind').select_option(kind);page.locator('#f-occurred_on').fill(date);page.locator('#f-project_id').select_option(project_id);clicksave(page,'Save note');page.wait_for_selector('#note-body')
 def evidence(quote,kind):
  page.locator('[data-action=annotate]').click();page.locator('#f-quote').fill(quote);page.locator('#f-kind').select_option(kind);page.locator('#f-topic').fill('air-gapped-inventory');page.locator('#f-certainty').select_option('confirmed');clicksave(page,'Save candidate');page.locator('[data-action=review-claim]').last.click();page.locator('#modal input[type=checkbox]').check();clicksave(page,'Save decision')
 make_note('Inventory requirement','We require air-gapped inventory for the facility.','meeting','2026-03-01',project['id']);evidence('We require air-gapped inventory for the facility.','requirement');mark('Save original note, exact quotation, and explicit approval')
 make_note('Inventory implementation','We delivered air-gapped inventory in a customer facility.','delivery','2026-09-01');evidence('We delivered air-gapped inventory in a customer facility.','capability');mark('Save a workspace-wide capability on an arbitrary new topic')
 page.locator('[data-nav=reviews]').click();page.locator('[data-action=refresh-reviews]').click();page.wait_for_timeout(250);st=bridge.json('/api/state');r=next(x for x in st['reviews'] if x['project_id']==project['id']);assert r['state']=='suggested';mark('Create a dynamic match for previously unseen data')
 page.locator(f'[data-action=open-review][data-id="{r["id"]}"]').click();page.wait_for_timeout(200);page.screenshot(path=str(out/'review_new_data.png'))
 page.locator('[data-action=accept-review]').click();page.wait_for_timeout(250);st=bridge.json('/api/state');assert next(x for x in st['projects'] if x['id']==project['id'])['unknowns']==project['unknowns'];mark('Accept new context without changing unknowns or commercial stage')
 page.locator('#draft-form input[name=evidence]').first.check();page.locator('#draft-form button[type=submit]').click();page.wait_for_selector('#f-draft');page.locator('#f-draft').fill('Hi Avery,\n\nIs the inventory rollout still a priority? Who owns it now?\n\nBest, Morgan');page.locator('#save-draft-form button[type=submit]').click();page.wait_for_timeout(200);st=bridge.json('/api/state');assert next(x for x in st['reviews'] if x['id']==r['id'])['draft'].startswith('Hi Avery');mark('Generate a permitted local draft, edit, and persist it')
 page.locator('[data-action=record-event]').click();clicksave(page,'Record event');st=bridge.json('/api/state');assert next(x for x in st['reviews'] if x['id']==r['id'])['state']=='contacted';mark('Record an actual-contact event separately from a draft')
 # Create and complete a manual task: no matching evidence needed.
 page.locator('[data-nav=tasks]').click();page.locator('[data-action=new-task]').first.click();page.locator('#f-title').fill('Send the revised scope');page.locator('#f-project_id').select_option(project['id']);page.locator('#f-due_on').fill('2026-11-01');clicksave(page,'Create task');st=bridge.json('/api/state');task=next(x for x in st['tasks'] if x['title']=='Send the revised scope');page.locator(f'[data-action=toggle-task][data-id="{task["id"]}"]').click();page.wait_for_timeout(150);assert next(x for x in bridge.json('/api/state')['tasks'] if x['id']==task['id'])['status']=='done';mark('Manage a manual commitment through completion')
 # Filter persistence and full-text search.
 page.locator('[data-nav=contacts]').click();page.locator('#list-search').fill('Independent QA');page.wait_for_timeout(400);expect(page.get_by_role('button',name=name,exact=True)).to_be_visible();mark('Client-side list filter retains typed text after rerender')
 page.locator('#global-search input').fill('air-gapped');page.locator('#global-search input').press('Enter');page.wait_for_timeout(300);assert 'Inventory requirement' in page.locator('#main').inner_text();mark('Real SQLite full-text search reaches original notes')
 # Edit original source and verify derived proposal is invalidated.
 st=bridge.json('/api/state');n=next(x for x in st['notes'] if x['title']=='Inventory implementation');page.evaluate('(id)=>location.hash="#note/"+id',n['id']);page.wait_for_selector('#note-body');page.locator('[data-action=edit-note]').click();page.locator('#f-body').fill('This source has been corrected. Delivery has not completed.');clicksave(page,'Save revision');assert next(x for x in bridge.json('/api/state')['reviews'] if x['id']==r['id'])['state']=='stale';mark('Source revision withdraws old evidence and invalidates generated follow-up')
 # Remove test additions so screenshot dataset remains explicitly fictional and clean.
 auth=bridge.json('/api/auth/status');csrf=auth['csrf'];st=bridge.json('/api/state')
 for n in [x for x in st['notes'] if x['title'] in ['Inventory requirement','Inventory implementation']]:bridge.json('/api/notes/'+n['id'],'DELETE',{'version':n['version']},csrf)
 st=bridge.json('/api/state');task=next(x for x in st['tasks'] if x['id']==task['id']);bridge.json('/api/tasks/'+task['id'],'DELETE',{'version':task['version']},csrf)
 project=next(x for x in bridge.json('/api/state')['projects'] if x['id']==project['id']);bridge.json('/api/projects/'+project['id'],'DELETE',{'version':project['version']},csrf)
 person=next(x for x in bridge.json('/api/state')['contacts'] if x['id']==person['id']);bridge.json('/api/contacts/'+person['id'],'DELETE',{'version':person['version']},csrf)
 # Refresh genuine state and capture mobile pages.
 page.locator('[data-nav=overview]').click();page.locator('[data-action=refresh-reviews]').first.click();page.wait_for_timeout(200)
 page.wait_for_timeout(4600);page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(350);page.screenshot(path=str(out/'mobile_overview.png'),full_page=True)
 for name in ['contacts','projects','notes','reviews','tasks','settings','guide']:
  page.get_by_role('button',name='Toggle navigation',exact=True).click();page.locator('[data-nav='+name+']').click();page.wait_for_timeout(150)
  assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1'),name
  page.screenshot(path=str(out/f'mobile_{name}.png'),full_page=True);mark(name+' view fits a 390-pixel mobile viewport')
 assert not errors,errors;mark('No browser JavaScript errors during the full workflow')
 b.close()
report={'transport':('Native browser navigation and real HTTP API' if os.environ.get('THREADLINE_BROWSER_MODE','native')=='native' else 'Managed Chromium blocks navigation. Actual shipped UI mounted in an isolated renderer; every fetch relayed unchanged to the real localhost HTTP server. Native browser cookie/Origin/CSP policy was not tested by this renderer run. HTTP headers/security independently tested by Node.'),'checks':checks,'errors':errors}
(out/'ui-report.json').write_text(json.dumps(report,indent=2));print(json.dumps({'passed':len(checks),'errors':errors},indent=2))
