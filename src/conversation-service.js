import { createAssistant } from './personal-conversation.js';
import { ensure, only, hash, now } from './util.js';

/** One durable owner-scoped dialogue service for website, iMessage and ASI:One. */
export function createConversationService(store, domain, agent, dispatch, config={}) {
  const db=store.db, engines=new Map();
  db.exec(`CREATE TABLE IF NOT EXISTS memory_conversation_state(
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    channel TEXT NOT NULL, state_json TEXT NOT NULL, updated_at TEXT NOT NULL,
    PRIMARY KEY(workspace_id,channel));
    CREATE TABLE IF NOT EXISTS memory_channel_threads(
    workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    channel TEXT NOT NULL, session TEXT NOT NULL, thread_id TEXT NOT NULL,
    PRIMARY KEY(workspace_id,channel,session));
    CREATE TRIGGER IF NOT EXISTS memory_clear_channel_source AFTER UPDATE OF version,deleted ON notes
    WHEN NEW.version<>OLD.version OR NEW.deleted<>OLD.deleted
    BEGIN
      UPDATE memory_conversation_state SET state_json='{}',updated_at=NEW.updated_at WHERE workspace_id=NEW.workspace_id;
    END;
    CREATE TRIGGER IF NOT EXISTS memory_clear_channel_contact AFTER UPDATE ON contacts BEGIN
      UPDATE memory_conversation_state SET state_json='{}',updated_at=NEW.updated_at WHERE workspace_id=NEW.workspace_id;
    END;
    CREATE TRIGGER IF NOT EXISTS memory_clear_channel_project AFTER UPDATE ON projects BEGIN
      UPDATE memory_conversation_state SET state_json='{}',updated_at=NEW.updated_at WHERE workspace_id=NEW.workspace_id;
    END;`);
  function initial(w) { return {schema:1,workspaceId:w,conversations:{},receipts:{},aiUsage:{}}; }
  async function engine(session,channel) {
    const w=session.user.workspace_id, key=w+':'+channel;
    if(engines.has(key)) return engines.get(key);
    const start=(async()=>{
      const value=initial(w); let expectedState=null;
      const persistence={value,refresh(){
        const row=db.prepare('SELECT state_json FROM memory_conversation_state WHERE workspace_id=? AND channel=?').get(w,channel);
        expectedState=row?.state_json ?? null;
        const loaded=row?JSON.parse(row.state_json):{};
        for(const key of Object.keys(value))delete value[key];Object.assign(value,initial(w),loaded);
      },save(){const current=db.prepare('SELECT state_json FROM memory_conversation_state WHERE workspace_id=? AND channel=?').get(w,channel)?.state_json ?? null;
        ensure(current===expectedState,'Memory changed during this request. Please ask again.',409,'conversation_changed');
        expectedState=JSON.stringify(value);db.prepare('INSERT INTO memory_conversation_state VALUES(?,?,?,?) ON CONFLICT(workspace_id,channel) DO UPDATE SET state_json=excluded.state_json,updated_at=excluded.updated_at').run(w,channel,expectedState,now());}};
      persistence.refresh();
      const client={workspaceId:w, async request(path,method='GET',input={},requestKey){
        // Core commands call the same authenticated domain dispatch, without loopback network or platform identity.
        ensure(!path.startsWith('/api/memory/conversations'), 'Recursive conversation call refused.');
        config.syncWorkspace?.(w);
        const url=new URL(path,'http://localhost'), fingerprint=hash(method+':'+url.pathname+':'+JSON.stringify(input));
        if(method!=='GET'&&requestKey){
          const old=db.prepare('SELECT * FROM idempotency WHERE workspace_id=? AND key=?').get(w,requestKey);
          if(old){ensure(old.request_hash===fingerprint&&old.generation===domain.workspace(w).generation,'This request changed. Review it again.',409);return JSON.parse(old.response);}
        }
        const result=await dispatch({method},url,input,session);
        if(path==='/api/capture'&&method==='POST'&&result.note?.id)db.prepare('INSERT OR REPLACE INTO memory_sources VALUES(?,?,?,?)').run(w,result.note.id,channel==='asi-one'?'asi':'photon',now());
        if(method!=='GET') config.flushWorkspace?.(w);
        if(method!=='GET'&&requestKey) db.prepare('INSERT INTO idempotency VALUES(?,?,?,?,?,?)').run(w,requestKey,fingerprint,JSON.stringify(result),domain.workspace(w).generation,now());
        return result;
      }};
      return createAssistant({client,persistence,quickCapture:true,env:{THREADLINE_REPLY_LANGUAGE:'en',THREADLINE_CHAT_CHANNEL:channel},
        vertexConfig:config.vertexProject?{project:config.vertexProject,model:config.openaiModel}:null,
        recall:async(question,{use_ai,session:chatSession})=>{
          const old=db.prepare('SELECT thread_id FROM memory_channel_threads WHERE workspace_id=? AND channel=? AND session=?').get(w,channel,chatSession);
          const run=await agent.ask(w,{question,thread_id:old?.thread_id,use_ai,consent:use_ai});
          if(run.thread_id)db.prepare('INSERT INTO memory_channel_threads VALUES(?,?,?,?) ON CONFLICT(workspace_id,channel,session) DO UPDATE SET thread_id=excluded.thread_id').run(w,channel,chatSession,run.thread_id);
          if(run.state!=='done')return 'I could not complete this memory request: '+run.error;
          const citations=run.citations.slice(0,3).map((c,i)=>`[${i+1}] ${c.title}: “${c.quote}”`).join('\n');
          return `${run.answer}${citations?'\n\n'+citations:''}${run.actions?.length?'\n\nI proposed '+run.actions.length+' task(s). Review and confirm them in Personal agent on the website.':''}\n\n${use_ai?'Gemini used the retrieved excerpts.':'Local source retrieval.'}`;
        }});
    })();
    engines.set(key,start);start.catch(()=>engines.delete(key));return start;
  }
  return {
    async message(session,input){
      only(input,['session','message','message_id','created_at','channel']);
      ensure(['imessage','asi-one'].includes(input.channel),'Choose an available channel.');
      for(const key of ['session','message_id'])ensure(typeof input[key]==='string'&&input[key].length>0&&input[key].length<=200,'Invalid conversation identifier.');
      ensure(typeof input.message==='string'&&input.message.trim()&&input.message.length<=4000,'Send a message of 1–4,000 characters.');
      if(input.created_at)ensure(Number.isFinite(Date.parse(input.created_at)),'Invalid message time.');
      config.syncWorkspace?.(session.user.workspace_id);
      const service=await engine(session,input.channel);
      return {reply:await service.call(input.session,input.message,{messageId:input.channel+':'+input.session+':'+input.message_id,createdAt:input.created_at}),engine:'threadline-memory-core'};
    },
    async close(){await Promise.allSettled([...engines.values()].map(async x=>(await x).close()));}
  };
}
