import { cleanMetadata } from './capture-utils.js';
import { uid, now, today, hash, ensure, text, oneOf, date, instant, email, topic, version, only, quoteSpan, parseCsv, AppError } from './util.js';
export const claimKinds = ['requirement', 'capability', 'blocker', 'commitment', 'context', 'contact_change', 'opinion'];
export function createDomain(store) {
    const d = store.db;
    const row = (table, w, id) => { const r = d.prepare(`SELECT * FROM ${table} WHERE workspace_id=? AND id=?`).get(w, id); ensure(r && !r.deleted, 'Record not found.', 404, 'not_found'); return r; };
    const workspace = w => { const r = d.prepare('SELECT * FROM workspaces WHERE id=?').get(w); ensure(r, 'Workspace not found.', 404, 'not_found'); return r; };
    const event = (w, kind, id, type, data = {}, occurred = now()) => d.prepare('INSERT INTO events VALUES(?,?,?,?,?,?,?,?)').run(uid(), w, kind, id, type, occurred, now(), JSON.stringify(data));
    const ref = (table, w, id) => { if (!id)
        return null; row(table, w, id); return id; };
    const limit = (table, w, n) => ensure(d.prepare(`SELECT COUNT(*) n FROM ${table} WHERE workspace_id=? ${table === 'notes' ? 'AND deleted=0' : ''}`).get(w).n < n, `This workspace supports up to ${n} ${table}. Archive or export data before adding more.`, 409, 'workspace_limit');
    function contactInput(i) {
        const mail = text(i.email, 'Email', 254, false);
        if (mail)
            email(mail);
        return { name: text(i.name, 'Name', 120), email: mail.toLowerCase(), company: text(i.company, 'Company', 160, false), role: text(i.role, 'Role', 160, false), phone: text(i.phone, 'Phone', 60, false), tags: text(i.tags, 'Tags', 400, false), notes: text(i.notes, 'Notes', 5000, false), contact_policy: oneOf(i.contact_policy ?? 'allowed', ['allowed', 'blocked'], 'contact policy'), archived: i.archived ? 1 : 0 };
    }
    const localToday = w => new Intl.DateTimeFormat('en-CA', {timeZone: workspace(w).timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    function saveSnapshot(w, p, refs = []) { d.prepare('INSERT INTO project_versions VALUES(?,?,?,?,?,?,?)').run(uid(), w, p.id, p.version, JSON.stringify({ name: p.name, goal: p.goal, status: p.status, unknowns: p.unknowns, summary: p.summary }), JSON.stringify(refs), now()); }
    function invalidate(w, claimIds, reason = 'The supporting evidence changed.') {
        workspace(w);
        d.prepare('UPDATE workspaces SET generation=generation+1 WHERE id=?').run(w);
        // All cached idempotent responses are invalid after evidence/permission changes.
        // Keep key tombstones until their documented TTL; remove cached private payloads.
        d.prepare("UPDATE idempotency SET response='{}' WHERE workspace_id=?").run(w);
        const ids = new Set(claimIds);
        const reviews = d.prepare("SELECT * FROM reviews WHERE workspace_id=?").all(w);
        for (const r of reviews)
            if (ids.has(r.requirement_id) || ids.has(r.capability_id) || JSON.parse(r.draft_refs).some(x => ids.has(x)))
                d.prepare("UPDATE reviews SET state='stale',title='Evidence withdrawn',reason=?,draft='',draft_refs='[]',version=version+1,updated_at=? WHERE workspace_id=? AND id=?").run(reason, now(), w, r.id);
        for (const p of d.prepare('SELECT * FROM projects WHERE workspace_id=?').all(w))
            if (JSON.parse(p.summary_refs).some(x => ids.has(x)))
                d.prepare("UPDATE projects SET summary='',summary_refs='[]',version=version+1,updated_at=? WHERE workspace_id=? AND id=?").run(now(), w, p.id);
        for (const v of d.prepare('SELECT * FROM project_versions WHERE workspace_id=?').all(w))
            if (JSON.parse(v.refs).some(x => ids.has(x)))
                d.prepare("UPDATE project_versions SET snapshot='{}',refs='[]' WHERE workspace_id=? AND id=?").run(w, v.id);
        for (const id of ids)
            d.prepare("UPDATE tasks SET title='Supporting note removed — review this task',notes='',claim_id=NULL,version=version+1,updated_at=? WHERE workspace_id=? AND claim_id=?").run(now(), w, id);
        d.prepare("UPDATE jobs SET state='cancelled',error='Evidence changed. Start a new request.',result='{}',updated_at=? WHERE workspace_id=? AND state='running'").run(now(), w);
        // Unconfirmed source annotations must not outlive their note/goal/person context.
        d.prepare("UPDATE jobs SET state='cancelled',error='The source review is out of date. Read it again.',result='{}',updated_at=? WHERE workspace_id=? AND type='warm-source'").run(now(), w);
    }
    function invalidateProject(w, pid) { d.prepare("UPDATE reviews SET state='stale',draft='',draft_refs='[]',version=version+1,updated_at=? WHERE workspace_id=? AND project_id=? AND state NOT IN('closed','dismissed')").run(now(), w, pid); }
    function usableClaim(w, id) { const c = row('claims', w, id), n = row('notes', w, c.note_id); ensure(c.status === 'approved', 'Review and approve the evidence first.', 409, 'unapproved_evidence'); ensure(!c.valid_until || c.valid_until >= today(), 'This evidence has expired. Review it first.', 409, 'expired_evidence'); ensure([...n.body].slice(c.start_cp, c.end_cp).join('') === c.quote, 'The original quotation has changed.', 409, 'invalid_quote'); return { ...c, note_title: n.title, occurred_on: n.occurred_on }; }
    function activeReview(w, id) { const r = row('reviews', w, id); ensure(r.state !== 'stale', 'This recommendation is out of date. Refresh opportunities.', 409, 'stale_evidence'); const p = row('projects', w, r.project_id); ensure(['active', 'waiting'].includes(p.status), 'Reopen this project before starting a new follow-up.', 409, 'project_closed'); if (r.contact_id) {
        const c = row('contacts', w, r.contact_id);
        ensure(c.contact_policy === 'allowed' && !c.archived, 'This contact is blocked or archived.', 409, 'contact_restricted');
    } const req = usableClaim(w, r.requirement_id), cap = usableClaim(w, r.capability_id); ensure(req.kind === 'requirement' && cap.kind === 'capability' && req.certainty === 'confirmed' && cap.certainty === 'confirmed' && req.topic === cap.topic, 'The approved conditions changed. Refresh opportunities.', 409, 'stale_evidence'); ensure(!hasBlocker(w, p.id, req.topic, cap.occurred_on), 'New blocking evidence requires review before any follow-up.', 409, 'blocking_evidence'); return r; }
    function hasBlocker(w, pid, t, capDate) { return d.prepare("SELECT c.*,n.occurred_on FROM claims c JOIN notes n ON n.id=c.note_id AND n.workspace_id=c.workspace_id WHERE c.workspace_id=? AND c.kind='blocker' AND c.certainty='confirmed' AND c.status='approved' AND c.topic=? AND n.deleted=0 AND (c.valid_until IS NULL OR c.valid_until>=?) AND (c.project_id IS NULL OR c.project_id=?)").all(w, t, today(), pid).some(b => !b.occurred_on || !capDate || b.occurred_on >= capDate); }
    function isolateBlocked(w, pid, t) { for (const r of d.prepare("SELECT r.* FROM reviews r JOIN claims c ON c.id=r.requirement_id AND c.workspace_id=r.workspace_id WHERE r.workspace_id=? AND c.topic=? AND (? IS NULL OR r.project_id=?) AND r.state<>'stale'").all(w, t, pid, pid)) {
        let cap;
        try {
            cap = usableClaim(w, r.capability_id);
        }
        catch {
            continue;
        }
        if (hasBlocker(w, r.project_id, t, cap.occurred_on))
            d.prepare("UPDATE reviews SET state='stale',reason='New blocking evidence requires review. No follow-up should be inferred.',draft='',draft_refs='[]',version=version+1,updated_at=? WHERE workspace_id=? AND id=?").run(now(), w, r.id);
    } }
    const api = { workspace, row, event, invalidate, usableClaim, activeReview,
        state(w) {
            const ws = workspace(w), q = (t, where = '', order = 'created_at DESC') => d.prepare(`SELECT * FROM ${t} WHERE workspace_id=? ${where} ORDER BY ${order}`).all(w);
            return { workspace: ws, contacts: q('contacts'), projects: q('projects'), notes: q('notes', 'AND deleted=0').map(({ body, ...r }) => ({ ...r, excerpt: [...body].slice(0, 190).join(''), characters: [...body].length })), claims: q('claims', "AND status NOT IN('withdrawn','rejected')"), reviews: q('reviews'), tasks: q('tasks'), events: q('events', '', 'recorded_at DESC').slice(0, 150).map(r => ({ ...r, data: JSON.parse(r.data) })), jobs: q('jobs').slice(0, 30) };
        },
        settings(w, i) { only(i, ['name', 'timezone', 'version']); const r = workspace(w); version(r, i.version); const name = text(i.name, 'Workspace name', 100), tz = text(i.timezone, 'Timezone', 80); try {
            new Intl.DateTimeFormat('en', { timeZone: tz });
        }
        catch {
            throw new AppError('Choose a valid IANA timezone.');
        } d.prepare('UPDATE workspaces SET name=?,timezone=?,version=version+1 WHERE id=?').run(name, tz, w); return workspace(w); },
        createContact(w, i) { only(i, ['name', 'email', 'company', 'role', 'phone', 'tags', 'notes', 'contact_policy', 'archived']); limit('contacts', w, 1000); const p = contactInput(i); ensure(!p.email || !d.prepare('SELECT 1 FROM contacts WHERE workspace_id=? AND email=?').get(w, p.email), 'A contact with this email already exists.', 409, 'duplicate_contact'); const id = uid(), t = now(); d.prepare('INSERT INTO contacts(id,workspace_id,name,email,company,role,phone,tags,notes,contact_policy,archived,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id, w, ...Object.values(p), t, t); event(w, 'contact', id, 'contact.created'); return row('contacts', w, id); },
        editContact(w, id, i) { only(i, ['name', 'email', 'company', 'role', 'phone', 'tags', 'notes', 'contact_policy', 'archived', 'version']); const c = row('contacts', w, id); version(c, i.version); const p = contactInput({ ...c, ...i }); ensure(!p.email || !d.prepare('SELECT 1 FROM contacts WHERE workspace_id=? AND email=? AND id<>?').get(w, p.email, id), 'A contact with this email already exists.', 409, 'duplicate_contact'); return store.tx(() => { d.prepare('UPDATE contacts SET name=?,email=?,company=?,role=?,phone=?,tags=?,notes=?,contact_policy=?,archived=?,version=version+1,updated_at=? WHERE workspace_id=? AND id=?').run(...Object.values(p), now(), w, id); if (['name', 'email', 'company', 'role', 'contact_policy', 'archived'].some(k => p[k] !== c[k])) {
            invalidate(w, []);
            d.prepare("UPDATE reviews SET state='stale',draft='',draft_refs='[]',version=version+1 WHERE workspace_id=? AND contact_id=?").run(w, id);
        } event(w, 'contact', id, 'contact.updated'); return row('contacts', w, id); }); },
        deleteContact(w, id, i) { version(row('contacts', w, id), i.version); return store.tx(() => { invalidate(w, []); d.prepare('DELETE FROM reviews WHERE workspace_id=? AND contact_id=?').run(w, id); for (const t of ['notes', 'tasks', 'projects'])
            d.prepare(`UPDATE ${t} SET contact_id=NULL,version=version+1 WHERE workspace_id=? AND contact_id=?`).run(w, id); d.prepare('DELETE FROM contacts WHERE workspace_id=? AND id=?').run(w, id); event(w, 'contact', id, 'contact.deleted'); return { deleted: true }; }); },
        importContacts(w, i) { only(i, ['csv']); const list = parseCsv(i.csv); ensure(d.prepare('SELECT count(*) n FROM contacts WHERE workspace_id=?').get(w).n + list.length <= 1000, 'The import would exceed the 1,000-contact limit.'); list.forEach(contactInput); return store.tx(() => { const created = [], skipped = []; for (const [idx, c] of list.entries()) {
            if (c.email && d.prepare('SELECT 1 FROM contacts WHERE workspace_id=? AND email=?').get(w, c.email.trim().toLowerCase())) {
                skipped.push({ row: idx + 2, reason: 'Email already exists' });
                continue;
            }
            created.push(this.createContact(w, c).id);
        } return { created: created.length, skipped, ids: created }; }); },
        createProject(w, i) { only(i, ['name', 'company', 'goal', 'status', 'contact_id', 'value', 'currency', 'unknowns', 'next_review']); limit('projects', w, 500); const p = this.projectInput(w, i), id = uid(), t = now(); d.prepare('INSERT INTO projects(id,workspace_id,name,company,goal,status,contact_id,value,currency,unknowns,next_review,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id, w, ...Object.values(p), t, t); const out = row('projects', w, id); saveSnapshot(w, out); event(w, 'project', id, 'project.created'); return out; },
        projectInput(w, i) { const value = Number(i.value ?? 0); ensure(Number.isSafeInteger(value) && value >= 0 && value <= 100000000000, 'Project value must be a non-negative integer in minor units (cents).'); return { name: text(i.name, 'Project name', 160), company: text(i.company, 'Company', 160, false), goal: text(i.goal, 'Goal', 3000, false), status: oneOf(i.status ?? 'active', ['active', 'waiting', 'won', 'lost', 'archived'], 'project status'), contact_id: ref('contacts', w, i.contact_id), value, currency: oneOf(i.currency ?? 'USD', ['USD', 'EUR', 'GBP', 'CAD', 'AUD'], 'currency'), unknowns: text(i.unknowns, 'Unknowns', 3000, false), next_review: date(i.next_review, 'Next review') }; },
        editProject(w, id, i) { only(i, ['name', 'company', 'goal', 'status', 'contact_id', 'value', 'currency', 'unknowns', 'next_review', 'version']); const p = row('projects', w, id); version(p, i.version); const v = this.projectInput(w, { ...p, ...i }); return store.tx(() => { d.prepare('UPDATE projects SET name=?,company=?,goal=?,status=?,contact_id=?,value=?,currency=?,unknowns=?,next_review=?,version=version+1,updated_at=? WHERE workspace_id=? AND id=?').run(...Object.values(v), now(), w, id); invalidateProject(w, id); const r = row('projects', w, id); saveSnapshot(w, r, JSON.parse(r.summary_refs)); event(w, 'project', id, 'project.updated', { status: r.status }); return r; }); },
        deleteProject(w, id, i) { version(row('projects', w, id), i.version); return store.tx(() => { invalidate(w, []); d.prepare('DELETE FROM reviews WHERE workspace_id=? AND project_id=?').run(w, id); d.prepare('DELETE FROM project_versions WHERE workspace_id=? AND project_id=?').run(w, id); for (const t of ['notes', 'claims', 'tasks'])
            d.prepare(`UPDATE ${t} SET project_id=NULL,version=version+1 WHERE workspace_id=? AND project_id=?`).run(w, id); d.prepare('DELETE FROM projects WHERE workspace_id=? AND id=?').run(w, id); event(w, 'project', id, 'project.deleted'); return { deleted: true }; }); },
        projectDetail(w, id) { const p = row('projects', w, id); return { ...p, history: d.prepare('SELECT * FROM project_versions WHERE workspace_id=? AND project_id=? ORDER BY created_at DESC').all(w, id).map(v => ({ ...v, snapshot: JSON.parse(v.snapshot) })) }; },
        createNote(w, i) { only(i, ['title', 'body', 'kind', 'project_id', 'contact_id', 'occurred_on']); limit('notes', w, 1000); const title = text(i.title, 'Note title', 200); ensure(typeof i.body === 'string' && i.body.trim() && [...i.body].length <= 100000 && !i.body.includes('\u0000'), 'A note must contain 1–100,000 characters.'); const kind = oneOf(i.kind ?? 'note', ['note', 'meeting', 'email', 'delivery', 'conversation'], 'note type'), when = date(i.occurred_on, 'Event date'); ensure(!when || when <= localToday(w), 'Use a past or current date for a source event. Use a task for future plans.'); const pid = ref('projects', w, i.project_id), cid = ref('contacts', w, i.contact_id), digest = hash(i.body); const duplicate = d.prepare('SELECT id FROM notes WHERE workspace_id=? AND body_hash=? AND project_id IS ? AND contact_id IS ? AND deleted=0').get(w, digest, pid, cid); ensure(!duplicate, 'This note is already saved in the same context.', 409, 'duplicate_note'); const id = uid(), t = now(); d.prepare('INSERT INTO notes(id,workspace_id,project_id,contact_id,title,kind,body,body_hash,occurred_on,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id, w, pid, cid, title, kind, i.body, digest, when, t, t); d.prepare('INSERT INTO notes_search VALUES(?,?,?,?)').run(id, w, title, i.body); event(w, 'note', id, 'note.created'); return row('notes', w, id); },
        noteDetail(w, id) { return { ...row('notes', w, id), capture: d.prepare('SELECT channel,source_url,tags FROM note_metadata WHERE workspace_id=? AND note_id=?').get(w,id) || null, claims: d.prepare("SELECT * FROM claims WHERE workspace_id=? AND note_id=? AND status NOT IN('withdrawn','rejected') ORDER BY start_cp").all(w, id) }; },
        editNote(w, id, i) { only(i, ['title', 'body', 'kind', 'project_id', 'contact_id', 'occurred_on', 'version']); const n = row('notes', w, id); version(n, i.version); const title = text(i.title ?? n.title, 'Title', 200), body = i.body ?? n.body; ensure(typeof body === 'string' && body.trim() && [...body].length <= 100000 && !body.includes('\u0000'), 'A note must contain 1–100,000 characters.'); const kind = oneOf(i.kind ?? n.kind, ['note', 'meeting', 'email', 'delivery', 'conversation'], 'note type'), when = date('occurred_on' in i ? i.occurred_on : n.occurred_on); ensure(!when || when <= localToday(w), 'Event dates cannot be in the future.'); const pid = ref('projects', w, 'project_id' in i ? i.project_id : n.project_id), cid = ref('contacts', w, 'contact_id' in i ? i.contact_id : n.contact_id); return store.tx(() => { const ids = d.prepare("SELECT id FROM claims WHERE workspace_id=? AND note_id=?").all(w, id).map(c => c.id); invalidate(w, ids); d.prepare("UPDATE claims SET status='withdrawn',statement='',quote='',topic='',version=version+1,updated_at=? WHERE workspace_id=? AND note_id=?").run(now(), w, id); d.prepare('UPDATE notes SET title=?,body=?,body_hash=?,kind=?,occurred_on=?,project_id=?,contact_id=?,version=version+1,updated_at=? WHERE workspace_id=? AND id=?').run(title, body, hash(body), kind, when, pid, cid, now(), w, id); d.prepare('DELETE FROM notes_search WHERE workspace_id=? AND note_id=?').run(w, id); d.prepare('INSERT INTO notes_search VALUES(?,?,?,?)').run(id, w, title, body); event(w, 'note', id, 'note.revised'); return row('notes', w, id); }); },
        deleteNote(w, id, i) { version(row('notes', w, id), i.version); return store.tx(() => { const ids = d.prepare('SELECT id FROM claims WHERE workspace_id=? AND note_id=?').all(w, id).map(c => c.id); invalidate(w, ids, 'The original note was deleted.'); d.prepare("UPDATE claims SET status='withdrawn',statement='',quote='',topic='',start_cp=0,end_cp=0,version=version+1 WHERE workspace_id=? AND note_id=?").run(w, id); d.prepare("UPDATE notes SET deleted=1,body='',body_hash='',title='Deleted note',contact_id=NULL,project_id=NULL,version=version+1,updated_at=? WHERE workspace_id=? AND id=?").run(now(), w, id); d.prepare('DELETE FROM notes_search WHERE workspace_id=? AND note_id=?').run(w, id); d.prepare('DELETE FROM note_metadata WHERE workspace_id=? AND note_id=?').run(w,id); d.prepare("UPDATE jobs SET result='{}',error='' WHERE workspace_id=? AND subject_id=?").run(w, id); event(w, 'note', id, 'note.deleted'); return { deleted: true, generation: workspace(w).generation }; }); },
        createClaim(w, i, origin = 'manual') {
            only(i, ['note_id', 'project_id', 'kind', 'topic', 'statement', 'quote', 'certainty', 'valid_until']);
            limit('claims', w, 10000);
            const n = row('notes', w, i.note_id), span = quoteSpan(n.body, i.quote);
            const k = oneOf(i.kind, claimKinds, 'evidence type'), t = topic(i.topic);
            ensure(t, 'Enter a searchable topic.');
            const certainty = oneOf(i.certainty ?? 'uncertain', ['confirmed', 'planned', 'uncertain', 'reported'], 'certainty'), until = date(i.valid_until, 'Review expiry');
            const statement = text(i.statement || i.quote, 'Evidence statement', 4000), pid = ref('projects', w, i.project_id || n.project_id);
            ensure(k !== 'requirement' || pid, 'Link a requirement to a project.');
            const old = d.prepare("SELECT id FROM claims WHERE workspace_id=? AND note_id=? AND quote=? AND kind=? AND topic=? AND status NOT IN('withdrawn','rejected')").get(w, n.id, i.quote, k, t);
            if (old)
                return row('claims', w, old.id);
            const id = uid(), stamp = now();
            d.prepare('INSERT INTO claims(id,workspace_id,note_id,project_id,kind,topic,statement,quote,start_cp,end_cp,certainty,valid_until,origin,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id, w, n.id, pid, k, t, statement, i.quote, span.start, span.end, certainty, until, origin, stamp, stamp);
            return row('claims', w, id);
        },
        decideClaim(w, id, i) { only(i, ['version', 'decision', 'kind', 'topic', 'certainty', 'valid_until']); const c = row('claims', w, id); version(c, i.version); const n = row('notes', w, c.note_id); ensure(c.status !== 'withdrawn', 'This evidence was withdrawn.', 409); const decision = oneOf(i.decision, ['approve', 'reject', 'withdraw'], 'decision'), k = oneOf(i.kind ?? c.kind, claimKinds, 'type'), t = topic(i.topic ?? c.topic), certainty = oneOf(i.certainty ?? c.certainty, ['confirmed', 'planned', 'uncertain', 'reported'], 'certainty'); ensure(t, 'Enter a topic.'); ensure(k !== 'requirement' || c.project_id, 'Link this note to a project before approving a requirement.'); ensure(!(decision === 'approve' && k === 'capability' && certainty === 'confirmed') || n.occurred_on, 'A confirmed capability needs an event date. Edit the note first.'); const until = 'valid_until' in i ? date(i.valid_until) : c.valid_until; return store.tx(() => { if (c.status === 'approved')
            invalidate(w, [id]); d.prepare('UPDATE claims SET kind=?,topic=?,certainty=?,valid_until=?,status=?,version=version+1,updated_at=? WHERE workspace_id=? AND id=?').run(k, t, certainty, until, { approve: 'approved', reject: 'rejected', withdraw: 'withdrawn' }[decision], now(), w, id); if (decision === 'approve' && k === 'blocker' && certainty === 'confirmed') {
            invalidate(w, []);
            isolateBlocked(w, c.project_id, t);
        } event(w, 'claim', id, 'evidence.' + decision); return row('claims', w, id); }); },
        scan(w, nid) {
            const n = row('notes', w, nid), parts = n.body.match(/[^.!?\n]+(?:[.!?]+(?=\s|$)|(?=\n|$))/gu) || [n.body];
            const result = [];
            for (const part of parts) {
                const q = part.trim();
                if (q.length < 8 || q.length > 1000)
                    continue;
                let kind = 'context';
                if (/\b(need|require|must|looking for)\b/i.test(q))
                    kind = 'requirement';
                else if (/\b(delivered|completed|shipped|supports|implemented|launched|capable)\b/i.test(q))
                    kind = 'capability';
                else if (/\b(i will|we will|i'll|we'll|promise|send by|follow up)\b/i.test(q))
                    kind = 'commitment';
                else if (/\b(blocked|waiting|budget|pending|cannot|can't)\b/i.test(q))
                    kind = 'blocker';
                if (kind === 'requirement' && !n.project_id)
                    kind = 'context';
                const topics = [[/private|on.prem/i, 'private-deployment'], [/single.sign|\bsso\b/i, 'single-sign-on'], [/\bsoc.?2\b/i, 'soc2'], [/\bcrm\b|salesforce|hubspot/i, 'crm-integration'], [/knowledge|search/i, 'knowledge-search'], [/\bvoice\b/i, 'voice-support'], [/budget|funding/i, 'budget'], [/security/i, 'security-review'], [/accessib/i, 'accessibility']];
                const top = topics.find(([re]) => re.test(q))?.[1] || 'general';
                let certainty = /\b(plan|will|expect|may|might|hope|not yet|not |cannot|can't|if )/i.test(q) ? 'planned' : /\b(heard|said that|reportedly)\b/i.test(q) ? 'reported' : 'uncertain';
                // Local scanning never promotes a sentence to a confirmed fact.
                try {
                    result.push(this.createClaim(w, { note_id: nid, kind, topic: top, quote: q, certainty }, 'local-scan').id);
                }
                catch (e) {
                    if (!['ambiguous_quote'].includes(e.code))
                        throw e;
                }
                if (result.length >= 15)
                    break;
            }
            event(w, 'note', nid, 'note.scanned', { candidates: result.length });
            return { ids: result, mode: 'local-scan', message: 'These are text-scan candidates, not AI-verified facts. Review type, topic, certainty and quotation.' };
        },
        refresh(w) {
            return store.tx(() => {
                for (const old of d.prepare("SELECT * FROM reviews WHERE workspace_id=? AND state IN('suggested','accepted','snoozed')").all(w)) {
                    try {
                        activeReview(w, old.id);
                    }
                    catch (e) {
                        d.prepare("UPDATE reviews SET state='stale',draft='',draft_refs='[]',version=version+1,updated_at=? WHERE workspace_id=? AND id=?").run(now(), w, old.id);
                    }
                }
                const gen = workspace(w).generation;
                const claims = d.prepare("SELECT c.*,n.occurred_on FROM claims c JOIN notes n ON n.id=c.note_id AND n.workspace_id=c.workspace_id WHERE c.workspace_id=? AND c.status='approved' AND n.deleted=0 AND (c.valid_until IS NULL OR c.valid_until>=?)").all(w, today());
                const capabilities = claims.filter(c => c.kind === 'capability' && c.certainty === 'confirmed' && c.occurred_on && c.occurred_on <= today());
                let count = 0;
                for (const r of claims.filter(c => c.kind === 'requirement' && c.project_id && c.certainty === 'confirmed')) {
                    const p = row('projects', w, r.project_id);
                    if (!['active', 'waiting'].includes(p.status))
                        continue;
                    const person = p.contact_id ? row('contacts', w, p.contact_id) : null;
                    if (person && (person.contact_policy === 'blocked' || person.archived))
                        continue;
                    const caps = capabilities.filter(c => c.topic === r.topic && c.note_id !== r.note_id && (!r.occurred_on || c.occurred_on >= r.occurred_on)).sort((a, b) => b.occurred_on.localeCompare(a.occurred_on));
                    const c = caps[0];
                    if (!c)
                        continue;
                    // Explicit, later confirmed blockers suppress a match; uncertainty is not silently resolved.
                    const blocked = claims.some(b => b.kind === 'blocker' && b.certainty === 'confirmed' && b.topic === r.topic && (!b.project_id || b.project_id === p.id) && (!b.occurred_on || b.occurred_on >= c.occurred_on));
                    if (blocked)
                        continue;
                    const fingerprint = hash(`${p.id}:${r.id}:${c.id}:${p.contact_id || ''}`);
                    const old = d.prepare('SELECT * FROM reviews WHERE workspace_id=? AND fingerprint=?').get(w, fingerprint);
                    if (old && ['dismissed', 'closed', 'contacted', 'replied', 'meeting'].includes(old.state))
                        continue;
                    if (old && old.state === 'snoozed' && old.snooze_until > today())
                        continue;
                    if (old && old.base_version === p.version && old.state === 'accepted') {
                        if (old.generation !== gen)
                            d.prepare('UPDATE reviews SET generation=?,version=version+1 WHERE workspace_id=? AND id=?').run(gen, w, old.id);
                        continue;
                    }
                    if (old && old.base_version === p.version && old.state !== 'stale' && old.generation === gen)
                        continue;
                    const title = `Revisit ${r.topic.replaceAll('-', ' ')}`, reason = `A confirmed ${c.topic.replaceAll('-', ' ')} capability overlaps with an earlier requirement. Verify current fit, ownership and timing; this does not establish budget or buying intent.`;
                    if (old)
                        d.prepare("UPDATE reviews SET title=?,reason=?,state='suggested',base_version=?,generation=?,draft='',draft_refs='[]',snooze_until=NULL,version=version+1,updated_at=? WHERE workspace_id=? AND id=?").run(title, reason, p.version, gen, now(), w, old.id);
                    else
                        d.prepare('INSERT INTO reviews(id,workspace_id,project_id,contact_id,requirement_id,capability_id,fingerprint,base_version,generation,title,reason,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(uid(), w, p.id, p.contact_id, r.id, c.id, fingerprint, p.version, gen, title, reason, now(), now());
                    count++;
                }
                event(w, 'workspace', w, 'opportunities.refreshed', { created_or_updated: count });
                return { created_or_updated: count };
            });
        },
        reviewDetail(w, id) { const r = row('reviews', w, id); if (r.state === 'stale')
            return { ...r, evidence: [], project: row('projects', w, r.project_id) }; const evidence = []; for (const id of [r.requirement_id, r.capability_id])
            try {
                evidence.push(usableClaim(w, id));
            }
            catch { } return { ...r, evidence, project: row('projects', w, r.project_id), contact: r.contact_id ? row('contacts', w, r.contact_id) : null }; },
        accept(w, id, i) { only(i, ['version', 'project_version']); const r = activeReview(w, id); version(r, i.version); const p = row('projects', w, r.project_id); version(p, i.project_version); ensure(p.version === r.base_version, 'The project changed. Refresh opportunities.', 412, 'stale_version'); ensure(r.state === 'suggested', 'This review is no longer awaiting a decision.', 409); return store.tx(() => { d.prepare('UPDATE projects SET summary=?,summary_refs=?,version=version+1,updated_at=? WHERE workspace_id=? AND id=?').run(r.reason, JSON.stringify([r.requirement_id, r.capability_id]), now(), w, p.id); const np = row('projects', w, p.id); saveSnapshot(w, np, [r.requirement_id, r.capability_id]); d.prepare("UPDATE reviews SET state='accepted',base_version=?,version=version+1,updated_at=? WHERE workspace_id=? AND id=?").run(np.version, now(), w, id); event(w, 'review', id, 'review.accepted', { project_id: p.id }); return row('reviews', w, id); }); },
        reviewEvent(w, id, i) {
            only(i, ['version', 'type', 'occurred_at', 'until', 'outcome']);
            const r = row('reviews', w, id);
            version(r, i.version);
            const type = oneOf(i.type, ['dismiss', 'snooze', 'copied', 'contacted', 'replied', 'meeting', 'outcome'], 'event');
            let state = r.state, outcome = r.outcome, until = null, occurred = now();
            if (['contacted', 'replied', 'meeting', 'outcome'].includes(type))
                occurred = instant(i.occurred_at);
            if (['snooze', 'copied', 'contacted'].includes(type))
                activeReview(w, id);
            if (type === 'dismiss') {
                ensure(['suggested', 'accepted', 'snoozed'].includes(state), 'This item cannot be dismissed now.', 409);
                state = 'dismissed';
            }
            if (type === 'snooze') {
                until = date(i.until, 'Reminder date');
                ensure(until && until > today(), 'Choose a future reminder date.');
                ensure(['suggested', 'accepted', 'snoozed'].includes(state), 'Only an uncontacted opportunity can be snoozed.', 409);
                state = 'snoozed';
            }
            if (type === 'copied')
                ensure(r.draft, 'Create a draft before recording a copy.');
            if (type === 'contacted') {
                ensure(r.contact_id, 'Choose a project contact first.');
                ensure(['accepted', 'suggested', 'snoozed'].includes(state), 'Contact is already recorded or this item is closed.', 409);
                state = 'contacted';
            }
            if (type === 'replied') {
                ensure(state === 'contacted', 'Record the actual contact before a reply.', 409);
                state = 'replied';
            }
            if (type === 'meeting') {
                ensure(['contacted', 'replied'].includes(state), 'Record contact before a meeting.', 409);
                state = 'meeting';
            }
            if (type === 'outcome') {
                ensure(['contacted', 'replied', 'meeting', 'closed'].includes(state), 'Record a contact before an outcome.', 409);
                outcome = oneOf(i.outcome, ['progressed', 'won', 'lost', 'not_relevant'], 'outcome');
                if (outcome !== 'progressed')
                    state = 'closed';
            }
            if (['replied', 'meeting', 'outcome'].includes(type)) {
                const last = d.prepare("SELECT e.occurred_at FROM events e WHERE e.workspace_id=? AND e.subject_id=? AND e.type IN('contacted','replied','meeting') AND NOT EXISTS(SELECT 1 FROM events fix WHERE fix.workspace_id=e.workspace_id AND fix.type='event.corrected' AND json_extract(fix.data,'$.target_id')=e.id) ORDER BY e.occurred_at DESC LIMIT 1").get(w, id);
                ensure(!last || occurred >= last.occurred_at, 'This event cannot precede the recorded contact or reply.');
            }
            return store.tx(() => { d.prepare('UPDATE reviews SET state=?,outcome=?,snooze_until=?,version=version+1,updated_at=? WHERE workspace_id=? AND id=?').run(state, outcome, until, now(), w, id); event(w, 'review', id, type, { outcome: type === 'outcome' ? outcome : undefined, evidence_level: 'user_reported' }, occurred); return row('reviews', w, id); });
        },
        correctEvent(w, eventId, i) {
            only(i, ['version']);
            const e = row('events', w, eventId);
            ensure(['contacted', 'replied', 'meeting', 'outcome'].includes(e.type), 'Only real-world outcome events can be corrected here.');
            const r = row('reviews', w, e.subject_id);
            version(r, i.version);
            const events = d.prepare('SELECT rowid,* FROM events WHERE workspace_id=? AND subject_id=? ORDER BY rowid').all(w, e.subject_id);
            const corrected = new Set(events.filter(x => x.type === 'event.corrected').map(x => JSON.parse(x.data).target_id));
            ensure(!corrected.has(eventId), 'This event has already been corrected.', 409);
            const relevant = events.filter(x => ['contacted', 'replied', 'meeting', 'outcome'].includes(x.type) && !corrected.has(x.id));
            ensure(relevant.at(-1)?.id === eventId, 'Correct later business events first so the history remains consistent.', 409, 'dependent_events');
            return store.tx(() => { let state = events.some(x => x.type === 'review.accepted') ? 'accepted' : 'suggested', outcome = 'none'; for (const v of relevant.filter(x => x.id !== eventId)) {
                if (['contacted', 'replied', 'meeting'].includes(v.type))
                    state = v.type;
                else if (v.type === 'outcome') {
                    outcome = JSON.parse(v.data).outcome;
                    if (outcome !== 'progressed')
                        state = 'closed';
                }
            } if (r.state === 'stale')
                state = 'stale'; d.prepare('UPDATE reviews SET state=?,outcome=?,version=version+1,updated_at=? WHERE workspace_id=? AND id=?').run(state, outcome, now(), w, r.id); event(w, 'review', r.id, 'event.corrected', { target_id: eventId }); return row('reviews', w, r.id); });
        },
        draftContext(w, id, i) { only(i, ['version', 'evidence_ids', 'use_ai']); const r = activeReview(w, id); version(r, i.version); ensure(Array.isArray(i.evidence_ids) && i.evidence_ids.length > 0 && i.evidence_ids.length <= 2, 'Select the quotations you permit in this draft.'); const allowed = [r.requirement_id, r.capability_id]; ensure(new Set(i.evidence_ids).size === i.evidence_ids.length && i.evidence_ids.every(x => allowed.includes(x)), 'The selected evidence does not belong to this follow-up.'); const evidence = i.evidence_ids.map(x => usableClaim(w, x)); ensure(evidence.every(x => x.kind !== 'opinion' && x.certainty === 'confirmed'), 'Only confirmed, approved evidence may be used.'); ensure(r.contact_id, 'Choose a contact for this project first.'); return { review: r, project: row('projects', w, r.project_id), contact: row('contacts', w, r.contact_id), evidence, generation: workspace(w).generation }; },
        saveDraft(w, id, i) { only(i, ['version', 'draft']); const r = activeReview(w, id); version(r, i.version); ensure(JSON.parse(r.draft_refs).length > 0, 'Generate a draft with approved quotations before editing it.'); const draft = text(i.draft, 'Draft', 6000); d.prepare('UPDATE reviews SET draft=?,version=version+1,updated_at=? WHERE workspace_id=? AND id=?').run(draft, now(), w, id); event(w, 'review', id, 'draft.edited'); return row('reviews', w, id); },
        commitDraft(w, id, ctx, draft, mode) { const current = activeReview(w, id); ensure(workspace(w).generation === ctx.generation, 'Evidence changed during generation. Try again.', 409, 'generation_changed'); version(current, ctx.review.version); for (const c of ctx.evidence)
            usableClaim(w, c.id); const output = text(draft, 'Draft', 6000); d.prepare('UPDATE reviews SET draft=?,draft_refs=?,version=version+1,updated_at=? WHERE workspace_id=? AND id=?').run(output, JSON.stringify(ctx.evidence.map(c => c.id)), now(), w, id); event(w, 'review', id, 'draft.generated', { mode }); return row('reviews', w, id); },
        localDraft(w, id, i) {
            const ctx = this.draftContext(w, id, i);
            const requirement = ctx.evidence.find(c => c.kind === 'requirement');
            const intro = requirement ? `When we last discussed ${ctx.project.name}, you mentioned: “${requirement.quote}”` : `I’m getting back in touch about ${ctx.project.name}.`;
            const draft = `Hi ${ctx.contact.name.split(' ')[0]},\n\n${intro}\n\nIs this still a priority, and are you the right person to speak with about the next steps? I’d be glad to compare the current requirements with what we can support.\n\nNo urgency if the timing has changed — a quick update would help me follow up appropriately.\n\nBest,`;
            return this.commitDraft(w, id, ctx, draft, 'local-template');
        },
        createTask(w, i) { only(i, ['title', 'due_on', 'status', 'project_id', 'contact_id', 'notes', 'claim_id']); limit('tasks', w, 3000); const t = this.taskInput(w, i), id = uid(), stamp = now(); d.prepare('INSERT INTO tasks(id,workspace_id,title,due_on,status,project_id,contact_id,notes,claim_id,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id, w, ...Object.values(t), stamp, stamp); event(w, 'task', id, 'task.created'); return row('tasks', w, id); },
        taskInput(w, i) { if (i.claim_id)
            usableClaim(w, i.claim_id); return { title: text(i.title, 'Task title', 300), due_on: date(i.due_on, 'Due date'), status: oneOf(i.status ?? 'open', ['open', 'done', 'cancelled'], 'task status'), project_id: ref('projects', w, i.project_id), contact_id: ref('contacts', w, i.contact_id), notes: text(i.notes, 'Task notes', 2000, false), claim_id: ref('claims', w, i.claim_id) }; },
        editTask(w, id, i) { only(i, ['title', 'due_on', 'status', 'project_id', 'contact_id', 'notes', 'claim_id', 'version']); const r = row('tasks', w, id); version(r, i.version); const t = this.taskInput(w, { ...r, ...i }); d.prepare('UPDATE tasks SET title=?,due_on=?,status=?,project_id=?,contact_id=?,notes=?,claim_id=?,version=version+1,updated_at=? WHERE workspace_id=? AND id=?').run(...Object.values(t), now(), w, id); event(w, 'task', id, 'task.updated', { status: t.status }); return row('tasks', w, id); },
        deleteTask(w, id, i) { version(row('tasks', w, id), i.version); invalidate(w, []); d.prepare('DELETE FROM tasks WHERE workspace_id=? AND id=?').run(w, id); event(w, 'task', id, 'task.deleted'); return { deleted: true }; },
        search(w, q) { q = text(q, 'Search', 240); const tokens = q.match(/[\p{L}\p{N}]+/gu)?.slice(0, 12) || []; if (!tokens.length)
            return { notes: [], contacts: [], projects: [] }; const fts = tokens.map(t => '"' + t.replaceAll('"', '') + '"*').join(' OR '); const ns = d.prepare("SELECT n.id,n.title,n.kind,n.occurred_on,snippet(notes_search,3,'[',']','…',30) snippet FROM notes_search JOIN notes n ON n.id=notes_search.note_id AND n.workspace_id=notes_search.workspace_id WHERE notes_search MATCH ? AND notes_search.workspace_id=? AND n.deleted=0 ORDER BY rank LIMIT 30").all(fts, w); const like = '%' + q.replace(/[\\%_]/g, m => '\\' + m) + '%'; return { notes: ns, contacts: d.prepare("SELECT * FROM contacts WHERE workspace_id=? AND (name LIKE ? ESCAPE '\\' OR company LIKE ? ESCAPE '\\' OR tags LIKE ? ESCAPE '\\') LIMIT 20").all(w, like, like, like), projects: d.prepare("SELECT * FROM projects WHERE workspace_id=? AND (name LIKE ? ESCAPE '\\' OR goal LIKE ? ESCAPE '\\') LIMIT 20").all(w, like, like) }; },
        export(w) { const ws = workspace(w), tables = {}; for (const t of ['contacts', 'projects', 'notes', 'claims', 'reviews', 'tasks', 'events', 'project_versions'])
            tables[t] = d.prepare(`SELECT * FROM ${t} WHERE workspace_id=? ${t === 'notes' ? 'AND deleted=0' : t === 'claims' ? "AND status NOT IN('withdrawn','rejected')" : t === 'reviews' ? "AND state<>'stale'" : ''}`).all(w); tables.note_metadata = d.prepare('SELECT m.* FROM note_metadata m JOIN notes n ON n.id=m.note_id AND n.workspace_id=m.workspace_id WHERE m.workspace_id=? AND n.deleted=0').all(w); return { format: 'threadline-export', version: 1, exported_at: now(), workspace: { name: ws.name, timezone: ws.timezone }, tables }; },
        restore(w, input) {
            only(input, ['archive']);
            const a = input.archive;
            ensure(a && a.format === 'threadline-export' && a.version === 1 && a.tables, 'This is not a supported Threadline export.');
            const tableLimits = { contacts: 1000, projects: 500, notes: 1000, claims: 10000, reviews: 2000, tasks: 3000, events: 20000, project_versions: 20000 };
            for (const [t, max] of Object.entries(tableLimits))
                ensure(Array.isArray(a.tables[t]) && a.tables[t].length <= max, `Invalid or oversized ${t} table.`);
            ensure(!d.prepare('SELECT 1 FROM contacts WHERE workspace_id=? UNION SELECT 1 FROM projects WHERE workspace_id=? UNION SELECT 1 FROM notes WHERE workspace_id=? UNION SELECT 1 FROM tasks WHERE workspace_id=? LIMIT 1').get(w, w, w, w), 'Restore into an empty workspace to prevent accidental overwrites.', 409, 'workspace_not_empty');
            // Business records are recreated through the same validators; IDs are remapped. Recommendations are recomputed.
            return store.tx(() => {
                const maps = { contacts: new Map(), projects: new Map(), notes: new Map(), claims: new Map() };
                const lookup = (t, id) => { if (!id)
                    return null; ensure(maps[t].has(id), `Import refers to an unknown ${t} record.`); return maps[t].get(id); };
                for (const c of a.tables.contacts) {
                    ensure(!maps.contacts.has(c.id), 'Duplicate contact ID in archive.');
                    const v = this.createContact(w, Object.fromEntries(['name', 'email', 'company', 'role', 'phone', 'tags', 'notes', 'contact_policy', 'archived'].map(k => [k, c[k]])));
                    maps.contacts.set(c.id, v.id);
                }
                for (const p of a.tables.projects) {
                    ensure(!maps.projects.has(p.id), 'Duplicate project ID in archive.');
                    const v = this.createProject(w, { ...Object.fromEntries(['name', 'company', 'goal', 'status', 'value', 'currency', 'unknowns', 'next_review'].map(k => [k, p[k]])), contact_id: lookup('contacts', p.contact_id) });
                    maps.projects.set(p.id, v.id);
                }
                for (const n of a.tables.notes) {
                    ensure(!maps.notes.has(n.id), 'Duplicate note ID in archive.');
                    const v = this.createNote(w, { title: n.title, body: n.body, kind: n.kind, occurred_on: n.occurred_on, project_id: lookup('projects', n.project_id), contact_id: lookup('contacts', n.contact_id) });
                    maps.notes.set(n.id, v.id);
                }
                const metadata = a.tables.note_metadata ?? [];
                ensure(Array.isArray(metadata) && metadata.length <= 1000, 'Invalid note metadata.');
                const seenMetadata = new Set();
                for (const m of metadata) {
                    ensure(!seenMetadata.has(m.note_id), 'Duplicate capture metadata.');
                    seenMetadata.add(m.note_id);
                    const n = lookup('notes',m.note_id), clean = cleanMetadata(m);
                    d.prepare('INSERT INTO note_metadata VALUES(?,?,?,?,?,?)').run(w,n,clean.channel,clean.source_url,clean.tags,now());
                }
                for (const c of a.tables.claims) {
                    ensure(!maps.claims.has(c.id), 'Duplicate evidence ID in archive.');
                    const v = this.createClaim(w, { note_id: lookup('notes', c.note_id), project_id: lookup('projects', c.project_id), kind: c.kind, topic: c.topic, statement: c.statement, quote: c.quote, certainty: c.certainty, valid_until: c.valid_until }, 'import');
                    maps.claims.set(c.id, v.id);
                    if (c.status === 'approved')
                        this.decideClaim(w, v.id, { version: v.version, decision: 'approve' });
                }
                for (const t of a.tables.tasks)
                    this.createTask(w, { title: t.title, due_on: t.due_on, status: t.status, notes: t.notes, project_id: lookup('projects', t.project_id), contact_id: lookup('contacts', t.contact_id), claim_id: lookup('claims', t.claim_id) });
                event(w, 'workspace', w, 'workspace.restored', { contacts: maps.contacts.size, projects: maps.projects.size, notes: maps.notes.size });
                return { restored: true, contacts: maps.contacts.size, projects: maps.projects.size, notes: maps.notes.size, notice: 'Core records restored. Historical events and generated drafts remain in your export as an archive; opportunities are recomputed, not replayed.' };
            });
        }
    };
    return api;
}
