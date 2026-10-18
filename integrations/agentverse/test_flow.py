"""Real backend workflow tests plus official ACP model contract; not ASI end-to-end."""
from pathlib import Path
from datetime import datetime,timezone
from uuid import uuid4
import json,re,hashlib
from flow import Backend,Workflow,normalize_command
from uagents_core.contrib.protocols.chat import ChatMessage,ChatAcknowledgement,TextContent
HERE=Path(__file__).resolve().parent;(HERE/'.runtime').mkdir(exist_ok=True)
checks=[];transcript=[]
def check(name,value):
 assert value,name
 checks.append({'name':name,'passed':True})
b=Backend('local-test-http.jsonl');address='agent1qg9nvtv8gsj0zah5qe29pzu6f3dqr5k5mcxj56gqezvx63qwxk5mknxkgsr';f=Workflow(b,address);key='local-contract-session'
def say(text):
 wire='@'+address+'  '+text;out=f.handle(key,wire);transcript.append({'user':wire,'agent':out});return out
report={'status':'not_started'}
try:
 check('Exact observed own leading ASI mention is removed once',normalize_command('@'+address+'  ACCEPT F70A2F',address)=='ACCEPT F70A2F')
 check('Other, quoted, embedded and repeated mentions cannot become an approval command',all(not normalize_command(t,address).startswith('ACCEPT')for t in ['@different-agent ACCEPT F70A2F','"@'+address+' ACCEPT F70A2F"','Source says @'+address+' ACCEPT F70A2F','@'+address+' @'+address+' ACCEPT F70A2F','@'+address+'evil ACCEPT F70A2F']))
 msg=ChatMessage(timestamp=datetime.now(timezone.utc),msg_id=uuid4(),content=[TextContent(type='text',text='REVIEW')]);serialized=msg.json();parsed=ChatMessage.parse_raw(serialized)
 ack=ChatAcknowledgement(timestamp=datetime.now(timezone.utc),acknowledged_msg_id=msg.msg_id)
 check('Official installed ACP ChatMessage and acknowledgement serialize/parse with matching message ID',parsed.text()=='REVIEW'and ack.acknowledged_msg_id==msg.msg_id)
 out=say('REVIEW');token=f.sessions[key]['token'];initial=b.call('/api/state')
 check('Chat reads two actual dated source quotations and unresolved context from the live backend','2026-08-12'in out and '2026-10-16'in out and b.claims[0]['quote']in out and b.claims[1]['quote']in out and not initial['tasks'])
 say('CONFIRM TASK '+token);say('ACCEPT WRONG')
 check('Wrong approval and premature task confirmation perform no mutation',b.call('/api/reviews/'+b.review_id)['state']=='suggested'and not b.call('/api/state')['tasks'])
 say('ACCEPT '+token)
 check('Exact chat acceptance changes the actual source-backed review to accepted',b.call('/api/reviews/'+b.review_id)['state']=='accepted')
 say('DRAFT '+token+' EVERYTHING')
 check('Unsupported evidence permission creates no draft',not b.call('/api/reviews/'+b.review_id)['draft'])
 draft=say('DRAFT '+token+' BOTH');r=b.call('/api/reviews/'+b.review_id)
 check('Explicit quote selection saves a real local draft with only the selected evidence',bool(r['draft'])and set(json.loads(r['draft_refs']))=={c['id']for c in b.claims}and not b.call('/api/state')['tasks'])
 edited='Hi Morgan, is private deployment still relevant? I can share the controlled test update if useful. Please confirm current scope and timing.'
 say('EDIT '+token+' '+edited)
 check('Chat edit persists exactly and is not a send',b.call('/api/reviews/'+b.review_id)['draft']==edited and not any(e['type']=='contacted'for e in b.call('/api/state')['events']))
 say('TASK '+token+' Check current context before contacting Morgan')
 check('Task preview requires a separate confirmation and creates zero tasks',not b.call('/api/state')['tasks'])
 created=say('CONFIRM TASK '+token);st=b.call('/api/state');task=st['tasks'][0]
 check('Exact chat confirmation creates the previewed real app task',len(st['tasks'])==1 and task['id']in created and task['title']=='Check current context before contacting Morgan'and task['project_id']==b.project['id']and task['contact_id']==b.person['id'])
 say('CONFIRM TASK '+token)
 check('Repeated confirmation does not create duplicate tasks',len(b.call('/api/state')['tasks'])==1)
 status=json.loads(say('STATUS'))
 check('Chat status rereads persisted task and draft, with no claimed outreach or outcome',status['task']['id']==task['id']and status['draft_saved']is True and status['messages_sent']==0 and status['customer_outcome']=='not established')
 f.handle('stale-session','REVIEW');stale_token=f.sessions['stale-session']['token']
 b.call('/api/notes/'+b.notes[1]['id'],'DELETE',{'version':b.notes[1]['version']})
 rejected=False
 try:f.handle('stale-session','DRAFT '+stale_token+' BOTH')
 except RuntimeError:rejected=True
 st=b.call('/api/state');check('Actual source withdrawal clears the draft and rejects stale chat continuation',rejected and st['reviews'][0]['state']=='stale'and st['reviews'][0]['draft']==''and len(st['tasks'])==1)
 root=HERE.parents[1]
 report={'status':'passed','executed_at':datetime.now(timezone.utc).isoformat(),'checks':checks,'backend':'Actual frozen Final HTTP handlers and new disposable SQLite owner account','protocol_scope':'Official ACP models serialize/parse; actual Agentverse/ASI transport remains NOT_RUN by this test','actual_asi_end_to_end':'NOT_RUN','source_pin':{p:hashlib.sha256((root/p).read_bytes()).hexdigest()for p in ['server.js','src/domain.js','src/auth.js','src/store.js']},'transcript':transcript,'state_at_end':{'review_state':st['reviews'][0]['state'],'task_count':len(st['tasks']),'task_id':task['id']},'credentials_recorded':False,'canonical_changed':False}
except Exception as e:report={'status':'failed','checks':checks,'error':str(e),'transcript':transcript}
finally:b.close();(HERE/'LOCAL_ACCEPTANCE.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({'status':report['status'],'checks':len(checks),'error':report.get('error')},indent=2))
if report['status']!='passed':raise SystemExit(1)
