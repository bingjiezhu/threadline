"""Official ACP + Mailbox; a disposable fictional Threadline workflow only."""
from pathlib import Path
import os,json,secrets,atexit,logging,re,asyncio
from datetime import datetime,timezone
from uuid import uuid4
from uagents import Agent,Context,Protocol
from uagents_core.contrib.protocols.chat import ChatMessage,ChatAcknowledgement,TextContent,chat_protocol_spec
from flow import Backend,Workflow

HERE=Path(__file__).resolve().parent;RUNTIME=HERE/'.runtime';RUNTIME.mkdir(exist_ok=True);os.chmod(RUNTIME,0o700)
seed_file=RUNTIME/'agent-seed.txt'
if not seed_file.exists():seed_file.write_text(secrets.token_hex(32));os.chmod(seed_file,0o600)
seed=seed_file.read_text().strip();os.chdir(RUNTIME)
# No DEBUG transport logging. Runtime credentials/identity material stay here, never in the frozen app or public ZIP.
logging.getLogger('httpx').setLevel(logging.WARNING);logging.getLogger('httpcore').setLevel(logging.WARNING)
backend=Backend();flow=Workflow(backend);atexit.register(backend.close)
agent_loop=asyncio.new_event_loop();asyncio.set_event_loop(agent_loop)
agent=Agent(name='Threadline Personal Demo',seed=seed,port=int(os.environ.get('THREADLINE_ACP_PORT','8127')),mailbox=True,enable_agent_inspector=True,log_level='INFO',readme_path=str(HERE/'README.md'),description='Fictional personal consulting follow-up: inspect dated quotes, explicitly accept, select evidence, save/edit a draft and confirm a real app task. No outreach or private customer data.',handle_messages_concurrently=False,loop=agent_loop)
flow.self_address=agent.address
protocol=Protocol(spec=chat_protocol_spec)
def record(entry):
 with (HERE/'acp-events.jsonl').open('a')as f:f.write(json.dumps({'at':datetime.now(timezone.utc).isoformat(),**entry})+'\n')
@protocol.on_message(ChatMessage)
async def chat(ctx:Context,sender:str,msg:ChatMessage):
 await ctx.send(sender,ChatAcknowledgement(timestamp=datetime.now(timezone.utc),acknowledged_msg_id=msg.msg_id))
 text=msg.text()
 if not text:return
 session=str(ctx.session);record({'event':'chat_received','sender':sender,'session':session,'msg_id':str(msg.msg_id),'text':text})
 try:answer=await asyncio.to_thread(flow.handle,sender+':'+session,text)
 except Exception as error:answer='The real backend refused this operation: '+str(error)+' No approval or send is assumed.'
 response=ChatMessage(timestamp=datetime.now(timezone.utc),msg_id=uuid4(),content=[TextContent(type='text',text=answer)])
 await ctx.send(sender,response);record({'event':'chat_replied','sender':sender,'session':session,'reply':answer})
@protocol.on_message(ChatAcknowledgement)
async def acknowledgement(ctx:Context,sender:str,msg:ChatAcknowledgement):
 record({'event':'ack_received','sender':sender,'msg_id':str(msg.acknowledged_msg_id)})
agent.include(protocol,publish_manifest=True)
info={'status':'LOCAL_AGENT_STARTING_NOT_REGISTERED_OR_ASI_VERIFIED','agent_address':agent.address,'inspector_url':'https://agentverse.ai/inspector?uri=http%3A%2F%2F127.0.0.1%3A'+str(agent._port)+'&address='+agent.address+'&embedded=false','backend_origin':backend.origin,'workspace_id':backend.workspace,'synthetic_data_only':True,'credential_files_public':False,'required_next_step':'Root: log in to Agentverse Inspector, Connect -> Mailbox. No new API key is needed. Then actual ASI chat must complete the workflow.','stop_line':'Stop if actual ASI end-to-end cannot be completed by 2026-10-18 11:40 America/Los_Angeles.'}
(HERE/'LOCAL_AGENT_INFO.json').write_text(json.dumps(info,indent=2)+'\n');print(json.dumps(info),flush=True)
if __name__=='__main__':agent.run()
