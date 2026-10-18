"""Verify real npm start/restart and user-created persisted data. Stdlib only; temporary DB."""
from pathlib import Path
import os, subprocess, tempfile, socket, time, urllib.request, urllib.error, http.cookiejar, json, uuid, secrets, signal, argparse, sqlite3
P=argparse.ArgumentParser(description=__doc__);P.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[1]);P.add_argument('--output',type=Path,required=True);args=P.parse_args();ROOT=args.root.resolve()
checks=[];process=None;csrf='';base='';jar=http.cookiejar.CookieJar();opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
def check(name,condition):
 if not condition:raise AssertionError(name)
 checks.append({'name':name,'passed':True});print('PASS',name,flush=True)
def request(path,method='GET',value=None,key=None,expected=200):
 data=json.dumps(value or {}).encode() if method!='GET' else None
 headers={'Content-Type':'application/json'}
 if method!='GET':headers.update({'Origin':base,'X-CSRF-Token':csrf,'Idempotency-Key':key or str(uuid.uuid4())})
 req=urllib.request.Request(base+path,data=data,headers=headers,method=method)
 try:r=opener.open(req,timeout=15)
 except urllib.error.HTTPError as e:r=e
 raw=r.read().decode();status=r.status
 if status!=expected:raise AssertionError(f'{method} {path} expected {expected}, got {status}: {raw[:200]}')
 return json.loads(raw)
def stop():
 global process
 if process and process.poll() is None:
  if os.name=='posix':os.killpg(process.pid,signal.SIGTERM)
  else:process.terminate()
  try:process.wait(timeout=10)
  except subprocess.TimeoutExpired:
   if os.name=='posix':os.killpg(process.pid,signal.SIGKILL)
   else:process.kill()
   process.wait()
 process=None
try:
 with tempfile.TemporaryDirectory(prefix='threadline-install-') as td:
  with socket.socket() as s:s.bind(('127.0.0.1',0));port=s.getsockname()[1]
  base=f'http://localhost:{port}';db=Path(td)/'real.sqlite'
  env={**os.environ,'PORT':str(port),'HOST':'127.0.0.1','THREADLINE_DB':str(db),'NODE_ENV':'development','APP_ORIGIN':'','OPENAI_API_KEY':'','REGISTRATION_TOKEN':'','SLACK_SIGNING_SECRET':'','SLACK_TEAM_ID':'','SLACK_BOT_TOKEN':'','DISCORD_PUBLIC_KEY':'','DISCORD_APPLICATION_ID':''}
  check('Release metadata is 1.3.2 with zero runtime dependencies',json.loads((ROOT/'package.json').read_text())['version']=='1.3.2' and not json.loads((ROOT/'package.json').read_text()).get('dependencies'))
  check('No production environment file or initialized database in extracted code',not (ROOT/'.env').exists() and not (ROOT/'.data').exists())
  def start():
   global process
   log=open(Path(td)/'startup.log','ab')
   process=subprocess.Popen(['npm','start'],cwd=ROOT,env=env,stdout=log,stderr=log,start_new_session=(os.name=='posix'));log.close()
   for _ in range(120):
    if process.poll() is not None:raise RuntimeError('npm start stopped before healthy: '+(Path(td)/'startup.log').read_text()[-1000:])
    try:
     if request('/api/health')['version']=='1.3.2':return
    except Exception:time.sleep(.1)
   raise RuntimeError('Startup health timed out.')
  try:
   start();check('Actual npm start becomes healthy without npm install or cloud keys',True)
   guide=opener.open(base+'/guide',timeout=10).read().decode();check('English guide is served with the extension installation anchor','id="extension"' in guide and 'lang="en"' in guide)
   focus_css=opener.open(base+'/first-task.css',timeout=10).read().decode();focus_js=opener.open(base+'/warm-ui.js',timeout=10).read().decode()
   check('Focused first-task assets are served by the actual installation','firstwin' in focus_css and 'firstTaskPage' in focus_js)
   focus_guide=opener.open(base+'/guide-judges.html',timeout=10).read().decode();check('Focused English guide and timed pitch guide are accessible','lang="en"' in focus_guide and '42-second' in focus_guide)
   password='Test-only-'+secrets.token_hex(16);mail='install-'+str(uuid.uuid4())[:8]+'@example.invalid'
   auth=request('/api/auth/register','POST',{'name':'Independent install test','email':mail,'password':password});csrf=auth['csrf'];workspace=auth['user']['workspace_id'];check('A new real account can be registered',bool(csrf and workspace))
   st=request('/api/state');check('New workspace is empty, not a hidden demo',not st['contacts'] and not st['projects'] and not st['notes'] and not st['tasks'] and not st['demo'])
   raw='Morgan built a robotics cold-chain system. We agreed I would send a case study, subject to their availability.'
   capture={'body':raw,'new_contact':{'name':'Morgan Release Test','company':'Fictional Release Studio'},'channel':'wechat','occurred_on':'2026-10-16','source_url':'https://example.invalid/context?private_token=REMOVE#private','reminder':{'title':'Send the robotics case study','due_on':'2026-11-01'}};key=str(uuid.uuid4());a=request('/api/capture','POST',capture,key)
   check('Conversation, inline person and dated promise are saved without a project',bool(a['note']['id'] and a['person']['id'] and a['reminder']['id']) and not a['note']['project_id'])
   b=request('/api/capture','POST',capture,key);check('Retry with the same key creates no duplicate',a['note']['id']==b['note']['id'] and len(request('/api/state')['notes'])==1)
   n=request('/api/notes/'+a['note']['id']);check('Original wording and safe source metadata survive saving',n['body']==raw and n['capture']['channel']=='wechat' and n['capture']['source_url']=='https://example.invalid/context')
   found=request('/api/people/find?q=robotics');check('Real source-backed topic retrieval finds the new person',found['people'][0]['person']['id']==a['person']['id'] and found['people'][0]['evidence'][0]['quote'] in raw)
   brief=request('/api/contacts/'+a['person']['id']+'/brief');check('Brief reconstructs the source and open commitment',len(brief['conversations'])==1 and brief['tasks'][0]['id']==a['reminder']['id'])
   cal=request('/api/tasks/'+a['reminder']['id']+'/calendar');check('Authorized calendar file contains the dated reminder, not private source text','DTSTART;VALUE=DATE:20261101' in cal['content'] and raw not in cal['content'])
   request('/api/discovery/feedback','POST',{'contact_id':a['person']['id'],'note_id':a['note']['id'],'vote':'useful'});check('Useful feedback is recorded without pretending contact occurred',request('/api/week')['useful_finds']==1 and not any('contacted' in e['type'] for e in request('/api/state')['events']))
   request('/api/tasks/'+a['reminder']['id'],'PATCH',{'version':a['reminder']['version'],'status':'done'});check('Task completion persists as a real workflow action',request('/api/week')['completed_commitments']==1)
   export=request('/api/export','POST',{'password':password});check('Export includes core records and new source metadata without credentials',export['tables']['note_metadata'][0]['channel']=='wechat' and 'password_hash' not in json.dumps(export) and 'token_hash' not in json.dumps(export))
   warm_guide=opener.open(base+'/guide-warm.html',timeout=10).read().decode();check('Warm Start guide is served in English','lang="en"' in warm_guide and 'Warm Start' in warm_guide)
   route_note=request('/api/notes','POST',{'title':'Current sandbox owner','body':'Morgan handles sandbox access. Training and access approval must be confirmed.','occurred_on':'2026-10-16'})
   route=request('/api/warm/routes','POST',{'topic':'sandbox-access','contact_id':a['person']['id'],'note_id':route_note['id'],'quote':route_note['body'],'route_role':'approver','confirm':True})
   goal=request('/api/warm/goals','POST',{'title':'Run my first sandbox task','role':'New engineer','topic':'sandbox-access','success':'Explain one approved test to my buddy','due_on':'2026-11-01'})
   check('New onboarding goal and explicit dated owner route persist',goal['status']=='open' and route['status']=='active')
   before_tasks=len(request('/api/state')['tasks']);plan=request('/api/warm/goals/'+goal['id']+'/plan','POST',{})
   check('A source-backed plan preserves prerequisites without executing',plan['mode']=='local' and plan['status']=='proposed' and len(plan['body']['steps'])==3 and len(request('/api/state')['tasks'])==before_tasks and plan['body']['evidence'][0]['quote']==route_note['body'])
   approved=request('/api/warm/plans/'+plan['id']+'/approve','POST',{'version':plan['version'],'confirm':True,'step_ids':['read','ask']})
   check('Human approval creates only the two selected real tasks',approved['status']=='approved' and len(approved['tasks'])==2 and len(request('/api/state')['tasks'])==before_tasks+2)
   edited=request('/api/warm/plans/'+plan['id']+'/draft','PATCH',{'version':approved['version'],'step_id':'ask','draft':'Hi Morgan, which prerequisites should I complete before requesting sandbox access?'})
   check('Introduction edits persist without sending',edited['version']>approved['version'] and 'prerequisites' in edited['body']['steps'][1]['draft'])
   connections=request('/api/connections');check('Unconfigured chat adapters do not claim a live installation',not connections['providers']['slack']['configured'] and not connections['providers']['discord']['configured'] and connections['providers']['live_verified'] is False)
   export=request('/api/export','POST',{'password':password});check('Warm Start exports readable extensions without connection secrets',len(export['extensions']['warm_start']['goals'])==1 and len(export['extensions']['warm_start']['plans'])==1 and 'code_hash' not in json.dumps(export) and 'token_hash' not in json.dumps(export))
   stop();check('All npm/server processes stop cleanly',True)
   start();check('Actual npm start restarts the same on-disk database',True)
   jar.clear();auth=request('/api/auth/login','POST',{'email':mail,'password':password});csrf=auth['csrf'];check('Original login works after full server restart',auth['user']['workspace_id']==workspace)
   st=request('/api/state');check('New contact, conversation and completed task survive restart',st['contacts'][0]['id']==a['person']['id'] and any(n['id']==a['note']['id'] for n in st['notes']) and next(t for t in st['tasks'] if t['id']==a['reminder']['id'])['status']=='done')
   persisted=request('/api/warm/goals/'+goal['id']);check('New onboarding plan, approval, draft and tasks survive a full process restart',persisted['plans'][0]['status']=='approved' and len(persisted['plans'][0]['tasks'])==2 and 'prerequisites' in persisted['plans'][0]['body']['steps'][1]['draft'])
   request('/api/notes/'+route_note['id'],'DELETE',{'version':route_note['version']})
   stale_plan=request('/api/warm/goals/'+goal['id'])['plans'][0]
   check('Deleting an ownership source invalidates the plan and cancels derived open tasks',stale_plan['status']=='stale' and stale_plan['body']=={} and all(t['status']=='cancelled' and not t['notes'] for t in stale_plan['tasks']))
   check('Unrelated completed personal reminder is not erased by plan invalidation',next(t for t in request('/api/state')['tasks'] if t['id']==a['reminder']['id'])['status']=='done')
   n=request('/api/notes/'+a['note']['id']);request('/api/notes/'+n['id'],'DELETE',{'version':n['version']});check('Deleted source is absent from direct search and current lists',not request('/api/state')['notes'] and not request('/api/people/find?q=cold-chain')['people'])
   stale=request('/api/capture','POST',capture,key,expected=409);check('Deleted source cannot be recreated by replaying the old request',stale['error']['code']=='generation_changed' and not request('/api/state')['notes'])
   export=request('/api/export','POST',{'password':password});check('Export no longer contains withdrawn private source words',raw not in json.dumps(export) and not export['tables']['note_metadata'])
   deleted=request('/api/account','DELETE',{'password':password,'confirm':'DELETE'});check('Account deletion revokes access',deleted.get('deleted') and not request('/api/auth/status')['authenticated'])
   with sqlite3.connect(db) as c:
    check('Account deletion clears owned records and database integrity holds',c.execute('SELECT count(*) FROM users').fetchone()[0]==0 and c.execute('SELECT count(*) FROM contacts').fetchone()[0]==0 and c.execute('PRAGMA integrity_check').fetchone()[0]=='ok' and not c.execute('PRAGMA foreign_key_check').fetchall())
    check('Account deletion also clears new onboarding and connector records',all(c.execute('SELECT count(*) FROM '+table).fetchone()[0]==0 for table in ['knowledge_routes','onboarding_goals','onboarding_plans','onboarding_plan_tasks','chat_connections','chat_link_codes','chat_inbox']))
  finally:stop()
 report={'release':'1.3.2','status':'passed','command':'npm start','root_tested':str(ROOT),'checks':checks,'limits':['Synthetic temporary records only','No cloud-model request','Not a native-browser or public-hosting test'],'temporary_database_removed':True}
except Exception as e:
 stop();report={'release':'1.3.2','status':'failed','checks':checks,'error':str(e)}
args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(report,indent=2)+'\n')
if report['status']!='passed':raise SystemExit(report['error'])
print(f'{len(checks)} real install/restart checks passed.')
