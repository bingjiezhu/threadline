/** Workday-oriented personal onboarding. References are explicit; models never choose authorization. */
import { uid, now, text, topic, date, only, ensure, version, quoteSpan } from './util.js';
export const warmPlanSchema = { type: 'object', additionalProperties: false, required: ['summary', 'steps', 'unknowns'], properties: { summary: { type: 'string' }, steps: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['kind', 'route_id', 'instruction'], properties: { kind: { type: 'string', enum: ['read', 'ask', 'verify'] }, route_id: { type: 'string' }, instruction: { type: 'string' } } } }, unknowns: { type: 'array', items: { type: 'string' } } } };
export function createWarmStart(store, domain) {
    const db = store.db, R = (t, w, id) => domain.row(t, w, id), day = w => new Intl.DateTimeFormat('en-CA', { timeZone: domain.workspace(w).timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const canContact = c => !c.archived && c.contact_policy === 'allowed';
    function readPlan(w, p) {
        const body = JSON.parse(p.body);
        const tasks = db.prepare('SELECT t.*,l.step_id FROM onboarding_plan_tasks l JOIN tasks t ON t.workspace_id=l.workspace_id AND t.id=l.task_id WHERE l.workspace_id=? AND l.plan_id=?').all(w, p.id);
        // Date expiry is enforced on access without a background timer. Never render an expired plan as current.
        if (['proposed', 'approved'].includes(p.status) && body.resolution === 'ready') {
            const usable = new Set(routes(w).filter(r => r.usable).map(r => r.id));
            if (!body.evidence.every(r => usable.has(r.id)))
                return { ...p, status: 'stale', body: {}, tasks: [], stale_reason: 'Evidence expired or is no longer available. Prepare a new plan.' };
        }
        return { ...p, body, tasks };
    }
    function routes(w, t = null) {
        domain.workspace(w);
        const expired = db.prepare("SELECT id FROM knowledge_routes WHERE workspace_id=? AND status='active' AND expires_on IS NOT NULL AND expires_on<?").all(w, day(w));
        if (expired.length)
            store.tx(() => { domain.invalidate(w, [], 'A knowledge route reached its review date.'); db.prepare("UPDATE knowledge_routes SET status='stale',version=version+1 WHERE workspace_id=? AND status='active' AND expires_on IS NOT NULL AND expires_on<?").run(w, day(w)); });
        return db.prepare(`SELECT r.*,c.name AS person_name,c.role AS person_role,c.archived,c.contact_policy,n.title AS source_title,n.version AS current_note_version,n.deleted,n.occurred_on FROM knowledge_routes r JOIN contacts c ON c.workspace_id=r.workspace_id AND c.id=r.contact_id JOIN notes n ON n.workspace_id=r.workspace_id AND n.id=r.note_id WHERE r.workspace_id=? ${t ? 'AND r.topic=?' : ''} ORDER BY r.effective_on DESC,r.created_at DESC`).all(...(t ? [w, t] : [w])).map(r => ({ ...r, usable: r.status === 'active' && !r.deleted && r.note_version === r.current_note_version && (!r.expires_on || r.expires_on >= day(w)) && canContact(r) }));
    }
    function prepare(w, gid) { const goal = R('onboarding_goals', w, gid); ensure(goal.status === 'open', 'Reopen this goal before planning.', 409, 'goal_closed'); const all = routes(w, goal.topic), active = all.filter(r => r.usable); const conflict = active.some(r => active.some(x => x.route_role === r.route_role && x.contact_id !== r.contact_id)); return { goal, generation: domain.workspace(w).generation, routes: active.slice(0, 6), history: all.filter(r => !r.usable).map(r => ({ id: r.id, person_name: r.person_name, status: r.status, effective_on: r.effective_on })), conflict }; }
    function localBody(ctx) {
        const { goal, routes: rs, conflict } = ctx;
        if (!rs.length)
            return { summary: 'No current, confirmed route for this topic yet.', resolution: 'needs_evidence', steps: [], unknowns: ['Save an authorized source and confirm who can help. A profile tag alone is not proof of ownership.'], evidence: [], history: ctx.history, trace: ['Load your goal', 'Find explicit topic routes', 'Check source versions, dates and contact permissions', 'Pause: no usable evidence'], disclosure: 'Local source-backed workflow. No model call.' };
        if (conflict)
            return { summary: 'Two current sources disagree about who owns the next step.', resolution: 'needs_clarification', steps: [], unknowns: ['Confirm the current responsibility with the source owner. Do not contact a guessed approver.'], evidence: rs, history: ctx.history, trace: ['Load your goal', 'Find explicit topic routes', 'Detect competing current ownership', 'Pause: request clarification'], disclosure: 'Local source-backed workflow. No model call.' };
        const r = rs.find(x => x.route_role === 'approver') || rs[0];
        return { summary: `Start with the source. Ask ${r.person_name} to confirm the next step.`, resolution: 'ready', steps: [{ id: 'read', kind: 'read', route_id: r.id, title: 'Read the team note', instruction: `Read “${r.source_title}”. Check the date and instructions.`, draft: '' }, { id: 'ask', kind: 'ask', route_id: r.id, title: `Ask ${r.person_name}`, instruction: 'Check what you need and when they can help.', draft: `Hi ${r.person_name}, I’m getting started as ${goal.role}. I’m working on: ${goal.title}. Are you the right person to help with the next step, and what should I prepare? My goal is: ${goal.success}` }, { id: 'verify', kind: 'verify', route_id: r.id, title: 'Check your result', instruction: `${goal.success}`, draft: '' }], unknowns: ['Access still needs to be checked.', 'Check any required training.', 'Ask when the person can help.'], evidence: rs, history: ctx.history, trace: ['Load your goal', 'Find explicit topic routes', 'Inspect exact source and effective dates', 'Resolve current responsibility', 'Prepare steps for your approval'], disclosure: 'Local source-backed workflow. No model call.' };
    }
    function commit(w, ctx, modelOutput = null, providerInfo = { provider: 'openai' }) {
        return store.tx(() => {
            const live = R('onboarding_goals', w, ctx.goal.id);
            ensure(live.version === ctx.goal.version && domain.workspace(w).generation === ctx.generation, 'Context changed while planning. Start again.', 409, 'generation_changed');
            const current = prepare(w, live.id);
            ensure(JSON.stringify(current.routes.map(r => [r.id, r.version])) === JSON.stringify(ctx.routes.map(r => [r.id, r.version])), 'Sources changed while planning.', 409, 'stale_evidence');
            let b = localBody(ctx), mode = 'local';
            if (modelOutput) {
                ensure(b.resolution === 'ready', 'Resolve missing or conflicting evidence before using AI.', 409, 'needs_evidence');
                only(modelOutput, ['summary', 'steps', 'unknowns']);
                const steps = modelOutput.steps;
                ensure(Array.isArray(steps) && steps.length === 3, 'AI must return three bounded steps.', 502, 'invalid_output');
                ensure(new Set(steps.map(x => x.kind)).size === 3 && ['read', 'ask', 'verify'].every(k => steps.some(x => x.kind === k)), 'AI returned an unsupported plan.', 502, 'invalid_output');
                const allowed = new Set(ctx.routes.map(r => r.id));
                for (const s of steps) {
                    only(s, ['kind', 'route_id', 'instruction']);
                    ensure(allowed.has(s.route_id), 'AI referenced unavailable evidence.', 502, 'invalid_output');
                    ensure(s.route_id === b.steps.find(x => x.kind === s.kind).route_id, 'AI cannot change the selected route or recipient.', 502, 'invalid_output');
                    text(s.instruction, 'Instruction', 900);
                }
                ensure(Array.isArray(modelOutput.unknowns) && modelOutput.unknowns.length <= 8, 'AI returned invalid unknowns.', 502, 'invalid_output');
                // Only prose is model-authored. The server owns tools, recipients, drafts and authorization.
                b.summary = text(modelOutput.summary, 'Summary', 600);
                b.steps = b.steps.map(s => ({ ...s, instruction: text(steps.find(x => x.kind === s.kind).instruction, 'Instruction', 900) }));
                b.unknowns = [...b.unknowns, ...modelOutput.unknowns.map(x => text(x, 'Unknown', 300))];
                b.disclosure = 'AI-assisted wording; exact evidence and task permissions are checked by code. Human review required.';
                // Schema 3 stores all AI plans in its legacy 'openai' mode slot.
                // Actual provider/model are explicit metadata, never inferred from that slot.
                ensure(['openai', 'vertex'].includes(providerInfo.provider), 'Unsupported AI provider.');
                b.provider = providerInfo.provider;
                b.model = providerInfo.model || '';
                mode = 'openai';
            }
            db.prepare("UPDATE onboarding_plans SET status='rejected',version=version+1 WHERE workspace_id=? AND goal_id=? AND status='proposed'").run(w, live.id);
            const id = uid();
            db.prepare('INSERT INTO onboarding_plans(id,workspace_id,goal_id,goal_version,generation,mode,body,created_at) VALUES(?,?,?,?,?,?,?,?)').run(id, w, live.id, live.version, ctx.generation, mode, JSON.stringify(b), now());
            domain.event(w, 'onboarding_plan', id, 'warm.plan.prepared', { mode, resolution: b.resolution });
            return readPlan(w, R('onboarding_plans', w, id));
        });
    }
    return {
        routes, prepare, commit, localBody,
        home(w) { domain.workspace(w); return { goals: db.prepare('SELECT * FROM onboarding_goals WHERE workspace_id=? ORDER BY created_at DESC').all(w), routes: routes(w), plans: db.prepare('SELECT * FROM onboarding_plans WHERE workspace_id=? ORDER BY created_at DESC,rowid DESC LIMIT 30').all(w).map(p => readPlan(w, p)), boundary: 'A personal, authorized onboarding workspace. Not an HR system or shared employee directory.' }; },
        createRoute(w, i) {
            only(i, ['topic', 'contact_id', 'note_id', 'quote', 'route_role', 'expires_on', 'supersedes_id', 'confirm']);
            ensure(i.confirm === true, 'Confirm that the source supports this person and responsibility.');
            const t = topic(i.topic);
            ensure(t, 'Add a concrete topic.');
            const c = R('contacts', w, i.contact_id), n = R('notes', w, i.note_id);
            ensure(canContact(c), 'This colleague is blocked or archived.', 409, 'contact_restricted');
            ensure(n.occurred_on, 'Add a known event date before treating this as current knowledge.', 409, 'unknown_date');
            const q = quoteSpan(n.body, i.quote);
            const role = i.route_role || 'guide';
            ensure(['guide', 'approver', 'mentor'].includes(role), 'Choose a guide, approver or mentor.');
            const exp = date(i.expires_on);
            ensure(!exp || exp >= day(w), 'Use an unexpired source.');
            let prior = null;
            if (i.supersedes_id) {
                prior = R('knowledge_routes', w, i.supersedes_id);
                ensure(prior.topic === t && prior.route_role === role && prior.status === 'active', 'Replace a current route on the same topic and responsibility.', 409, 'invalid_replacement');
                ensure(n.occurred_on > prior.effective_on, 'A replacement must be supported by a later event date.', 409, 'older_evidence');
            }
            ensure(db.prepare('SELECT count(*) n FROM knowledge_routes WHERE workspace_id=?').get(w).n < 1000, 'Route limit reached.', 409, 'workspace_limit');
            return store.tx(() => { domain.invalidate(w, [], 'The knowledge map changed.'); if (prior)
                db.prepare("UPDATE knowledge_routes SET status='superseded',version=version+1 WHERE workspace_id=? AND id=?").run(w, prior.id); const id = uid(); db.prepare('INSERT INTO knowledge_routes(id,workspace_id,topic,contact_id,note_id,note_version,quote,start_cp,end_cp,route_role,effective_on,expires_on,supersedes_id,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id, w, t, c.id, n.id, n.version, i.quote, q.start, q.end, role, n.occurred_on, exp, prior?.id || null, now()); domain.event(w, 'knowledge_route', id, 'warm.route.confirmed', { replaces: prior?.id || null }); return R('knowledge_routes', w, id); });
        },
        saveDraft(w, id, i) { only(i, ['version', 'step_id', 'draft']); const p = R('onboarding_plans', w, id); version(p, i.version); ensure(['proposed', 'approved'].includes(p.status) && p.generation === domain.workspace(w).generation, 'Refresh this plan before editing a draft.', 409, 'stale_plan'); const b = JSON.parse(p.body), step = b.steps?.find(s => s.id === i.step_id && s.kind === 'ask'); ensure(step, 'Only the displayed introduction draft can be edited.'); const ctx = prepare(w, p.goal_id); ensure(!ctx.conflict && ctx.routes.some(r => r.id === step.route_id), 'The colleague or evidence is no longer available.', 409, 'stale_evidence'); step.draft = text(i.draft, 'Draft', 4000); db.prepare('UPDATE onboarding_plans SET body=?,version=version+1 WHERE workspace_id=? AND id=?').run(JSON.stringify(b), w, id); domain.event(w, 'onboarding_plan', id, 'warm.draft.edited'); return readPlan(w, R('onboarding_plans', w, id)); },
        revoke(w, id, i) { only(i, ['version']); const r = R('knowledge_routes', w, id); version(r, i.version); return store.tx(() => { domain.invalidate(w, []); db.prepare("UPDATE knowledge_routes SET status='revoked',quote='',version=version+1 WHERE workspace_id=? AND id=?").run(w, id); domain.event(w, 'knowledge_route', id, 'warm.route.revoked'); return { revoked: true }; }); },
        createGoal(w, i) { only(i, ['title', 'role', 'topic', 'success', 'due_on']); ensure(db.prepare('SELECT count(*) n FROM onboarding_goals WHERE workspace_id=?').get(w).n < 250, 'Goal limit reached.', 409, 'workspace_limit'); const id = uid(), t = now(); const top = topic(i.topic); ensure(top, 'Choose a specific topic.'); db.prepare('INSERT INTO onboarding_goals(id,workspace_id,title,role,topic,success,due_on,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)').run(id, w, text(i.title, 'First goal', 200), text(i.role, 'Your role', 160), top, text(i.success, 'Definition of done', 1000), date(i.due_on), t, t); domain.event(w, 'onboarding_goal', id, 'warm.goal.created'); return R('onboarding_goals', w, id); },
        editGoal(w, id, i) {
            only(i, ['version', 'status', 'title', 'role', 'topic', 'success', 'due_on']);
            const r = R('onboarding_goals', w, id);
            version(r, i.version);
            const v = { ...r, ...i };
            ensure(['open', 'done', 'archived'].includes(v.status), 'Choose a goal state.');
            v.title = text(v.title, 'Goal', 200);
            v.role = text(v.role, 'Role', 160);
            v.topic = topic(v.topic);
            v.success = text(v.success, 'Definition of done', 1000);
            v.due_on = date(v.due_on);
            ensure(v.topic, 'Choose a concrete topic.');
            return store.tx(() => {
                if (['title', 'role', 'topic', 'success', 'due_on'].some(k => v[k] !== r[k]))
                    domain.invalidate(w, [], 'Your goal changed.');
                db.prepare('UPDATE onboarding_goals SET title=?,role=?,topic=?,success=?,due_on=?,status=?,version=version+1,updated_at=? WHERE workspace_id=? AND id=?').run(v.title, v.role, v.topic, v.success, v.due_on, v.status, now(), w, id);
                domain.event(w, 'onboarding_goal', id, 'warm.goal.updated', { status: v.status });
                return R('onboarding_goals', w, id);
            });
        },
        goal(w, id) { const g = R('onboarding_goals', w, id); return { ...g, plans: db.prepare('SELECT * FROM onboarding_plans WHERE workspace_id=? AND goal_id=? ORDER BY created_at DESC,rowid DESC').all(w, id).map(p => readPlan(w, p)), routes: routes(w, g.topic) }; },
        plan(w, id) { return commit(w, prepare(w, id)); },
        approve(w, id, i) {
            only(i, ['version', 'confirm', 'step_ids']);
            const p = R('onboarding_plans', w, id);
            version(p, i.version);
            ensure(i.confirm === true, 'Review the sources and approve the selected steps.');
            const b = JSON.parse(p.body);
            ensure(p.status === 'proposed' && p.generation === domain.workspace(w).generation && b.resolution === 'ready', 'This plan cannot be approved. Refresh its context.', 409, 'stale_plan');
            const g = R('onboarding_goals', w, p.goal_id);
            ensure(g.status === 'open' && g.version === p.goal_version, 'The goal changed. Prepare a new plan.', 409, 'stale_goal');
            const ctx = prepare(w, g.id);
            ensure(!ctx.conflict, 'Resolve the conflicting owners first.', 409, 'needs_clarification');
            const valid = new Set(ctx.routes.map(r => r.id));
            ensure(b.evidence.every(r => valid.has(r.id)), 'The source expired or was withdrawn.', 409, 'stale_evidence');
            ensure(Array.isArray(i.step_ids) && i.step_ids.length > 0 && i.step_ids.length <= 3 && new Set(i.step_ids).size === i.step_ids.length && i.step_ids.every(x => b.steps.some(s => s.id === x)), 'Select one or more unique displayed steps.');
            return store.tx(() => { for (const s of b.steps.filter(s => i.step_ids.includes(s.id))) {
                const r = ctx.routes.find(r => r.id === s.route_id);
                ensure(r, 'Evidence is no longer available.', 409, 'stale_evidence');
                const t = domain.createTask(w, { title: s.title, notes: s.instruction, contact_id: s.kind === 'ask' ? r.contact_id : null, due_on: g.due_on });
                db.prepare('INSERT INTO onboarding_plan_tasks VALUES(?,?,?,?)').run(w, p.id, t.id, s.id);
            } db.prepare("UPDATE onboarding_plans SET status='approved',version=version+1 WHERE workspace_id=? AND id=?").run(w, id); domain.event(w, 'onboarding_plan', id, 'warm.plan.approved', { steps: i.step_ids }); return readPlan(w, R('onboarding_plans', w, id)); });
        },
        export(w) { return { format: 'threadline-warm-start', version: 1, goals: db.prepare('SELECT * FROM onboarding_goals WHERE workspace_id=?').all(w), routes: routes(w).map(({ archived, contact_policy, current_note_version, deleted, ...r }) => r), plans: db.prepare('SELECT * FROM onboarding_plans WHERE workspace_id=?').all(w).map(p => readPlan(w, p)), scope: 'Readable archive. Core-record restore does not restore these plans or external account bindings.' }; }
    };
}
