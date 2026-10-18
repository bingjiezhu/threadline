"""Reuse the independently tested workflow over a separate real fictional HTTP backend."""
from pathlib import Path
import importlib.util,json,sys,signal,uuid
sys.dont_write_bytecode=True
HERE=Path(__file__).resolve().parent
(HERE/'.runtime').mkdir(exist_ok=True)
spec=importlib.util.spec_from_file_location('threadline_photon_local_flow',HERE.parent/'agentverse/flow.py')
flow=importlib.util.module_from_spec(spec);spec.loader.exec_module(flow)
# This changes only this process's imported module, not the ASI files or running agent.
flow.HERE=HERE
backend=None
signal.signal(signal.SIGTERM,lambda *_:sys.exit(0))
class PhotonWorkflow(flow.Workflow):
 def handle(self,session,text):
  s=self.sessions.get(session);parts=text.strip().split(maxsplit=1)
  # Ordinary app reminders do not require generating a message draft. They
  # still need a displayed current review, explicit preview and exact confirm.
  if s and len(parts)==2 and parts[0].upper()=='TASK' and not parts[1].upper().startswith(s['token']+' '):
   self.current(s);title=parts[1].strip()
   if not title or len(title)>200:return 'Use TASK <a reminder title of 1–200 characters>.'
   if s.get('task_id'):return 'A task was already created in this session. Send STATUS or REVIEW.'
   s.update(phase='confirm',task_title=title,task_key=str(uuid.uuid4()),short_task=True)
   return f'NOT CREATED YET. Ordinary app reminder: {title}\nNo draft, message or customer contact is created.\nTo create exactly this task, reply CONFIRM TASK {s["token"]}.'
  reply=super().handle(session,text)
  if s and s.get('short_task'):
   reply=reply.replace('Edited draft remains saved.','No draft was generated in this short reminder path.')
  if parts and parts[0].upper() in ['REVIEW','START','HELP']:
   reply+='\n\nSHORT REMINDER PATH: TASK <your reminder title>\nThen confirm the displayed token. This does not send outreach.'
  return reply
try:
 backend=flow.Backend(audit_name='fictional-http.jsonl');workflow=PhotonWorkflow(backend)
 print(json.dumps({'ready':True,'fictional':True}),flush=True)
 for line in sys.stdin:
  try:
   request=json.loads(line);reply=workflow.handle(request['session'],request['text'])
   print(json.dumps({'reply':reply}),flush=True)
  except Exception as exc:print(json.dumps({'error':str(exc)}),flush=True)
finally:
 if backend:backend.close()
