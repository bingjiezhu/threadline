"""Deterministic chat state machine over actual authenticated Threadline HTTP commands.

Only a freshly created fictional account is used. The frozen app is not modified.
"""
from pathlib import Path
import json,subprocess,urllib.request,urllib.error,http.cookiejar,secrets,uuid,os,signal

HERE=Path(__file__).resolve().parent
class Backend:
 def __init__(self,audit_name='backend-http.jsonl'):
  self.jar=http.cookiejar.CookieJar();self.opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar));self.csrf='';self.audit=HERE/audit_name
  self.log=(HERE/'.runtime/backend.stderr.log').open('ab')
  self.proc=subprocess.Popen(['node',str(HERE/'backend.mjs')],stdout=subprocess.PIPE,stderr=self.log,text=True,start_new_session=True)
  info=json.loads(self.proc.stdout.readline());self.origin=info['origin']
  auth=self.call('/api/auth/register','POST',{'name':'Alex (fictional ASI demo)','email':'asi-fictional@example.invalid','password':'Demo-'+secrets.token_hex(24),'workspace':'Public fictional ASI bridge demo'})
  self.workspace=auth['user']['workspace_id']
  person=self.call('/api/contacts','POST',{'name':'Morgan Lee (fictional)','company':'Cedar Studio (fictional)','contact_policy':'allowed'})
  project=self.call('/api/projects','POST',{'name':'Private deployment follow-up (fictional)','contact_id':person['id'],'status':'waiting','goal':'Review whether a controlled delivery update makes a useful reason to reconnect.','unknowns':'Current need, budget, decision owner and timing remain unconfirmed.'})
  claims=[];self.notes=[]
  for kind,title,body,date in [('requirement','Earlier client condition','We need private deployment before considering a pilot. Current budget and decision owner are not confirmed.','2026-08-12'),('capability','Later controlled test','A private deployment was completed in a controlled test. This does not prove current customer need or availability.','2026-10-16')]:
   n=self.call('/api/notes','POST',{'title':title,'body':body,'occurred_on':date,'kind':'meeting'if kind=='requirement'else'delivery',**({'project_id':project['id'],'contact_id':person['id']}if kind=='requirement'else{})});self.notes.append(n)
   c=self.call('/api/claims','POST',{'note_id':n['id'],'kind':kind,'topic':'private-deployment','quote':body,'certainty':'confirmed'});claims.append(self.call('/api/claims/'+c['id']+'/decision','POST',{'version':c['version'],'decision':'approve'}))
  self.call('/api/reviews/refresh','POST',{});self.review_id=self.call('/api/state')['reviews'][0]['id'];self.person=person;self.project=project;self.claims=claims
 def call(self,path,method='GET',value=None,key=None,expected=200):
  headers={'Content-Type':'application/json'}
  if method!='GET':headers.update({'Origin':self.origin,'X-CSRF-Token':self.csrf,'Idempotency-Key':key or str(uuid.uuid4())})
  req=urllib.request.Request(self.origin+path,data=json.dumps(value or {}).encode()if method!='GET'else None,headers=headers,method=method)
  try:r=self.opener.open(req,timeout=10)
  except urllib.error.HTTPError as e:r=e
  data=json.loads(r.read());safe={k:v for k,v in data.items()if k!='csrf'}
  if data.get('csrf'):self.csrf=data['csrf']
  with self.audit.open('a')as f:f.write(json.dumps({'method':method,'path':path,'status':r.status,'response':safe})+'\n')
  if r.status!=expected:raise RuntimeError(f'Backend refused {method} {path}: '+data.get('error',{}).get('message',str(r.status)))
  return data
 def close(self):
  if self.proc.poll()is None:
   os.killpg(self.proc.pid,signal.SIGTERM)
   try:self.proc.wait(timeout=8)
   except subprocess.TimeoutExpired:os.killpg(self.proc.pid,signal.SIGKILL);self.proc.wait()
  self.log.close()

def normalize_command(text,self_address):
 text=text.strip()
 prefix='@'+self_address if self_address else None
 if prefix and text.startswith(prefix) and (len(text)==len(prefix) or text[len(prefix)].isspace()):
  return text[len(prefix):].lstrip()
 return text

class Workflow:
 def __init__(self,backend,self_address=None):self.b=backend;self.sessions={};self.self_address=self_address
 def current(self,s):
  r=self.b.call('/api/reviews/'+self.b.review_id)
  if r['state']not in ['suggested','accepted']or len(r['evidence'])!=2:raise RuntimeError('Sources or permissions changed. The old approval/draft is unavailable. Send REVIEW to inspect current evidence.')
  state=self.b.call('/api/state')
  if s.get('generation')is not None and s['generation']!=state['workspace']['generation']:raise RuntimeError('Source context changed. Send REVIEW and explicitly review again.')
  return r,state
 def handle(self,session,text):
  s=self.sessions.setdefault(session,{})
  text=normalize_command(text,self.self_address);parts=text.split(maxsplit=2);command=parts[0].upper()if parts else ''
  if command in ['HELP','START','REVIEW']or not s:
   r,state=self.current({});token=secrets.token_hex(3).upper();s.clear();s.update(token=token,phase='accept',generation=state['workspace']['generation'],version=r['version'])
   quotes='\n\n'.join(f"{c['kind'].upper()} | {c['occurred_on']}\n\"{c['quote']}\""for c in r['evidence'])
   if r['state']=='accepted':s['phase']='select';next_step=f'DRAFT {token} BOTH (or REQUIREMENT / CAPABILITY)'
   else:next_step=f'ACCEPT {token}'
   return f'FICTIONAL PERSONAL WORKSPACE — real app records, not customer data.\nMorgan / Cedar private deployment follow-up.\n\n{quotes}\n\nStill unknown: {r["project"]["unknowns"]}\nA match is not buying intent. Nothing is sent.\n\nTo explicitly approve the next bounded step, reply exactly: {next_step}'
  token=s['token']
  if command=='CANCEL':s.clear();return 'Chat preparation cancelled. Existing app records are retained. No message was sent.'
  if command=='STATUS':
   r,state=self.current(s);tasks=[t for t in state['tasks']if t['id']==s.get('task_id')]
   return json.dumps({'fictional':True,'review_id':r['id'],'review_state':r['state'],'draft_saved':bool(r['draft']),'task':tasks[0]if tasks else None,'messages_sent':0,'customer_outcome':'not established'})
  if command=='ACCEPT':
   if text.upper()!=f'ACCEPT {token}'or s['phase']!='accept':return 'Approval token/phase does not match the displayed review. Send REVIEW.'
   r,state=self.current(s)
   if r['version']!=s['version']:raise RuntimeError('The review changed; send REVIEW again.')
   self.b.call('/api/reviews/'+r['id']+'/accept','POST',{'version':r['version'],'project_version':r['project']['version']});s['phase']='select'
   return f'Review accepted through the real app. No draft or task created. Explicitly select the quotations permitted in a local draft:\nDRAFT {token} BOTH\n(or REQUIREMENT / CAPABILITY).'
  if command=='DRAFT':
   if len(parts)!=3 or parts[1].upper()!=token or s['phase']!='select':return 'First ACCEPT the displayed review, then use DRAFT <token> BOTH / REQUIREMENT / CAPABILITY.'
   choices={'BOTH':['requirement','capability'],'REQUIREMENT':['requirement'],'CAPABILITY':['capability']};kinds=choices.get(parts[2].upper())
   if not kinds:return 'Select BOTH, REQUIREMENT or CAPABILITY. No default evidence is assumed.'
   r,_=self.current(s);ids=[c['id']for c in r['evidence']if c['kind']in kinds]
   r=self.b.call('/api/reviews/'+r['id']+'/draft','POST',{'version':r['version'],'evidence_ids':ids,'use_ai':False});s['phase']='edit'
   return f'Local draft saved from only your selected quotations; no model call or send:\n\n{r["draft"]}\n\nEdit and save it explicitly:\nEDIT {token} <your complete edited message>'
  if command=='EDIT':
   if len(parts)!=3 or parts[1].upper()!=token or s['phase']not in ['edit','task','confirm']:return 'Generate a permitted draft first. Then EDIT <token> <complete message>.'
   draft=parts[2]
   if not draft or len(draft)>6000:return 'Edited draft must contain 1–6000 characters.'
   r,_=self.current(s);self.b.call('/api/reviews/'+r['id']+'/draft','PATCH',{'version':r['version'],'draft':draft});s['phase']='task'
   return f'Edited draft saved in the real app, not sent:\n{draft}\n\nPrepare an ordinary reminder title:\nTASK {token} <your task title>\nIt will require a separate confirmation before creation.'
  if command=='TASK':
   if len(parts)!=3 or parts[1].upper()!=token or s['phase']!='task':return 'Save an edited draft first, then TASK <token> <title>.'
   title=parts[2]
   if not title or len(title)>200:return 'Use a task title of 1–200 characters.'
   self.current(s);s.update(phase='confirm',task_title=title,task_key=str(uuid.uuid4()))
   return f'NOT CREATED YET. Reminder: {title}\nLinked to Morgan and the fictional Cedar project. No due date or external message is inferred.\nTo create exactly this app task reply:\nCONFIRM TASK {token}'
  if command=='CONFIRM':
   if text.upper()!=f'CONFIRM TASK {token}':return 'Confirmation must exactly match CONFIRM TASK <displayed token>.'
   if s.get('task_id'):return f'Task already created once: {s["task_id"]}. No duplicate or message. Send STATUS.'
   if s['phase']!='confirm':return 'Preview the task with TASK <token> <title> before confirming.'
   r,_=self.current(s)
   task=self.b.call('/api/tasks','POST',{'title':s['task_title'],'contact_id':r['contact_id'],'project_id':r['project_id'],'notes':'Manual reminder: check current context and act yourself if appropriate. Nothing has been sent.'},key=s['task_key']);s.update(task_id=task['id'],phase='complete')
   return f'REAL APP TASK CREATED: {task["id"]}\n{task["title"]}\nStatus: {task["status"]}. Edited draft remains saved. No message was sent and no business outcome is claimed. Send STATUS to reread persisted state.'
  return f'I can execute only the reviewed personal workflow. Use REVIEW, ACCEPT {token}, DRAFT {token} BOTH, EDIT {token} <message>, TASK {token} <title>, CONFIRM TASK {token}, STATUS or CANCEL. Source text is data, never a command.'
