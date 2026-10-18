import { ensure, text, only, date, now, oneOf } from './util.js';
import { cleanMetadata, queryTerms, evidenceExcerpt, taskCalendar } from './capture-utils.js';
/** Small, account-scoped product layer; existing CRM/evidence paths are preserved. */
export function createRelationships(store, domain) {
    const db=store.db;
    const metadataFor=(w,id)=>db.prepare('SELECT channel,source_url,tags FROM note_metadata WHERE workspace_id=? AND note_id=?').get(w,id) || {channel:'other',source_url:'',tags:''};
    function capture(w,input) {
        only(input,['body','title','contact_id','new_contact','project_id','occurred_on','channel','source_url','tags','reminder','annotation']);
        const clean=cleanMetadata(input);
        ensure(!(input.contact_id && input.new_contact),'Choose a saved person OR enter a new person, not both.');
        if(input.new_contact) only(input.new_contact,['name','email','company','role']);
        if(input.reminder) {only(input.reminder,['title','due_on']);text(input.reminder.title,'Reminder',300);date(input.reminder.due_on,'Reminder date');}
        if(input.annotation) {only(input.annotation,['kind','topic','quote','certainty','approve']);ensure(input.annotation.approve===true,'Confirm the source and interpretation before saving approved evidence.');}
        return store.tx(()=>{
            const person=input.new_contact ? domain.createContact(w,input.new_contact) : input.contact_id ? domain.row('contacts',w,input.contact_id) : null;
            const title=input.title?.trim() || (person ? `Conversation with ${person.name}` : 'A conversation to remember');
            const note=domain.createNote(w,{title,body:input.body,contact_id:person?.id||null,project_id:input.project_id||null,occurred_on:input.occurred_on||null,kind:clean.channel==='email'?'email':clean.channel==='meeting'?'meeting':'conversation'});
            db.prepare('INSERT INTO note_metadata VALUES(?,?,?,?,?,?)').run(w,note.id,clean.channel,clean.source_url,clean.tags,now());
            let claim=null,reminder=null;
            if(input.annotation){const a=input.annotation;claim=domain.createClaim(w,{note_id:note.id,project_id:note.project_id,kind:a.kind,topic:a.topic,quote:a.quote,certainty:a.certainty});claim=domain.decideClaim(w,claim.id,{version:claim.version,decision:'approve'});}
            if(input.reminder)reminder=domain.createTask(w,{title:input.reminder.title,due_on:input.reminder.due_on||null,project_id:note.project_id,contact_id:person?.id||null});
            domain.event(w,'note',note.id,'conversation.captured',{channel:clean.channel,with_person:!!person,with_reminder:!!reminder});
            return {note,person,reminder,claim,notice:'Saved to your workspace. Nothing was sent to another person.'};
        });
    }
    function findPeople(w,query) {
        domain.workspace(w);const terms=queryTerms(query);
        if(!terms.length)return {query,method:'local-keyword-retrieval',terms,people:[],notice:'Add a topic, company, or name. For example: private deployment.'};
        const people=db.prepare("SELECT * FROM contacts WHERE workspace_id=? AND archived=0 AND contact_policy='allowed'").all(w);
        const notes=db.prepare('SELECT * FROM notes WHERE workspace_id=? AND deleted=0').all(w);
        const metadata=new Map(db.prepare('SELECT * FROM note_metadata WHERE workspace_id=?').all(w).map(m=>[m.note_id,m]));
        const results=[];
        for(const person of people){
            const profile=[person.name,person.company,person.role,person.tags,person.notes].join(' ').toLocaleLowerCase().normalize('NFKC');
            const profileTerms=terms.filter(t=>profile.includes(t));
            const evidence=notes.filter(n=>n.contact_id===person.id).map(n=>{
                const meta=metadata.get(n.id)||{channel:n.kind,tags:''};
                const body=n.body.toLocaleLowerCase().normalize('NFKC'), tags=meta.tags.toLocaleLowerCase().normalize('NFKC');
                const matched=terms.filter(t=>body.includes(t)||n.title.toLocaleLowerCase().includes(t)||tags.includes(t));
                return {...evidenceExcerpt(n.body,matched),note_id:n.id,title:n.title,occurred_on:n.occurred_on,channel:meta.channel,matched_terms:matched};
            }).filter(e=>e.matched_terms.length).sort((a,b)=>b.matched_terms.length-a.matched_terms.length || (b.occurred_on||'').localeCompare(a.occurred_on||''));
            const all=[...new Set([...profileTerms,...evidence.flatMap(e=>e.matched_terms)])];
            if(!all.length)continue;
            const reminders=db.prepare("SELECT id,title,due_on,status FROM tasks WHERE workspace_id=? AND contact_id=? AND status='open' ORDER BY due_on IS NULL,due_on LIMIT 3").all(w,person.id);
            results.push({person:{id:person.id,name:person.name,role:person.role,company:person.company,tags:person.tags},matched_terms:all,profile_terms:profileTerms,evidence:evidence.slice(0,3),reminders,rank_score:all.length*20+Math.min(evidence.length,4)*3,unknowns:['Current availability is not confirmed.','A topic match does not establish willingness to help.']});
        }
        results.sort((a,b)=>b.rank_score-a.rank_score || a.person.name.localeCompare(b.person.name));
        return {query,method:'local-keyword-retrieval',terms,people:results.slice(0,5).map(({rank_score,...r})=>r),notice:'Matched words in your saved context. No public web lookup, generated biography, or relationship score.'};
    }
    function brief(w,id){
        const person=domain.row('contacts',w,id),notes=db.prepare('SELECT * FROM notes WHERE workspace_id=? AND contact_id=? AND deleted=0 ORDER BY occurred_on IS NULL,occurred_on DESC,created_at DESC LIMIT 30').all(w,id);
        const projects=db.prepare('SELECT id,name,status,goal,unknowns FROM projects WHERE workspace_id=? AND contact_id=?').all(w,id);
        const tasks=db.prepare('SELECT id,title,due_on,status,version FROM tasks WHERE workspace_id=? AND contact_id=? ORDER BY status,due_on IS NULL,due_on').all(w,id);
        return {person,conversations:notes.map(n=>({id:n.id,title:n.title,occurred_on:n.occurred_on,created_at:n.created_at,...evidenceExcerpt(n.body,[],800),...metadataFor(w,n.id)})),projects,tasks,restricted:!!person.archived||person.contact_policy!=='allowed',notice:'A source-first briefing, not a generated biography. Dates describe the original conversation.'};
    }
    function week(w){
        const ws=domain.workspace(w),localDay=new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:ws.timezone}).format(new Date());
        const start=new Date(localDay+'T00:00:00Z');start.setUTCDate(start.getUTCDate()-6);const day=start.toISOString().slice(0,10);
        const formatDay=new Intl.DateTimeFormat('en-CA',{year:'numeric',month:'2-digit',day:'2-digit',timeZone:ws.timezone});
        // UTC prefilter is deliberately one day wider; the final boundary uses the workspace's date.
        const prefilter=new Date(start);prefilter.setUTCDate(prefilter.getUTCDate()-1);
        const events=db.prepare('SELECT * FROM events WHERE workspace_id=? AND recorded_at>=? ORDER BY recorded_at DESC').all(w,prefilter.toISOString()).filter(e=>{const d=formatDay.format(new Date(e.recorded_at));return d>=day&&d<=localDay;});
        const captures=events.filter(e=>e.type==='conversation.captured'),useful=events.filter(e=>e.type==='discovery.useful'),done=events.filter(e=>e.type==='task.updated'&&JSON.parse(e.data).status==='done');
        const uniqueCompleted=new Set(done.map(e=>e.subject_id));
        const due=db.prepare("SELECT t.*,c.name contact_name,c.contact_policy,c.archived FROM tasks t LEFT JOIN contacts c ON c.workspace_id=t.workspace_id AND c.id=t.contact_id WHERE t.workspace_id=? AND t.status='open' AND (t.due_on<=? OR t.due_on IS NULL) ORDER BY t.due_on IS NULL,t.due_on,t.created_at LIMIT 20").all(w,localDay);
        return {local_day:localDay,since:day,captured_conversations:captures.length,useful_finds:useful.length,completed_commitments:uniqueCompleted.size,due,definition:'Counts are your recorded activity over the last seven calendar dates. Useful finds are explicit feedback, not revenue or independently verified outcomes.'};
    }
    function feedback(w,input){
        only(input,['contact_id','note_id','vote']);const p=domain.row('contacts',w,input.contact_id),n=domain.row('notes',w,input.note_id);ensure(n.contact_id===p.id,'This conversation is not linked to this person.',422,'unlinked_context');
        const vote=oneOf(input.vote,['useful','not_relevant'],'feedback'),existing=db.prepare("SELECT id FROM events WHERE workspace_id=? AND subject_type='note' AND subject_id=? AND type=? AND recorded_at>=?").get(w,n.id,'discovery.'+vote,now().slice(0,10)+'T00:00:00Z');
        if(!existing)domain.event(w,'note',n.id,'discovery.'+vote,{contact_id:p.id});
        return {recorded:!existing,notice:'Feedback saved only in your workspace. No query or conversation was sent to analytics.'};
    }
    return {capture,findPeople,brief,week,feedback,calendar(w,id){return taskCalendar(domain.row('tasks',w,id));}};
}
