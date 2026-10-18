/** Unconfirmed source annotation, not recipient selection or permission inference. */
import { ensure, only, quoteSpan, text, now, AppError } from './util.js';

export const sourceReviewSchema = {
    type: 'object', additionalProperties: false,
    required: ['status', 'contact_id', 'quote', 'explanation', 'questions'],
    properties: {
        status: { type: 'string', enum: ['candidate', 'needs_clarification'] },
        contact_id: { type: 'string' }, quote: { type: 'string' }, explanation: { type: 'string' },
        questions: { type: 'array', items: { type: 'string' } }
    }
};
const normalized = value => value.normalize('NFKC').toLocaleLowerCase('en');
function mentions(body, name) {
    const pattern = normalized(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`(^|[^\\p{L}\\p{N}])${pattern}(?=$|[^\\p{L}\\p{N}])`, 'u').test(normalized(body));
}

export function createSourceReview(store, domain, warm) {
    const db = store.db;
    function prepare(w, goalId, noteId) {
        const goal = domain.row('onboarding_goals', w, goalId), note = domain.row('notes', w, noteId);
        ensure(goal.status === 'open', 'Reopen this task before reviewing a source.', 409, 'goal_closed');
        ensure(note.occurred_on, 'Add the original date to this note before reviewing it.', 409, 'unknown_date');
        ensure([...note.body].length <= 12000, 'Choose a note of at most 12,000 characters.');
        ensure(!warm.routes(w, goal.topic).some(route => route.usable), 'This task already has confirmed context. Review changes with Update who to ask.', 409, 'existing_route');
        const known = db.prepare("SELECT id,name,version FROM contacts WHERE workspace_id=? AND archived=0 AND contact_policy='allowed' ORDER BY id").all(w)
            .filter(person => person.name.length >= 3 && mentions(note.body, person.name));
        ensure(known.length > 0 && known.length <= 20, 'The note must name 1–20 allowed colleagues already saved in your workspace.', 409, 'needs_known_people');
        ensure(new Set(known.map(person => normalized(person.name))).size === known.length, 'Two saved colleagues have the same name. Clarify their identity manually before using this note.', 409, 'ambiguous_identity');
        return { goal_id: goal.id, goal_version: goal.version, note_id: note.id, note_version: note.version,
            generation: domain.workspace(w).generation, goal: { title: goal.title, role: goal.role, success: goal.success, topic: goal.topic },
            note: { title: note.title, date: note.occurred_on, body: note.body }, known };
    }
    function check(w, binding) {
        const current = prepare(w, binding.goal_id, binding.note_id);
        ensure(current.generation === binding.generation && current.goal_version === binding.goal_version && current.note_version === binding.note_version
            && JSON.stringify(current.known) === JSON.stringify(binding.known), 'The note, task or colleague changed. Read the source again.', 409, 'stale_source_review');
        return current;
    }
    function validate(w, binding, output, metadata) {
        const current = check(w, binding);
        only(output, ['status', 'contact_id', 'quote', 'explanation', 'questions']);
        ensure(['candidate', 'needs_clarification'].includes(output.status), 'AI returned an unsupported source review.', 502, 'invalid_output');
        const explanation = text(output.explanation, 'Explanation', 700);
        ensure(Array.isArray(output.questions) && output.questions.length <= 4, 'AI returned invalid questions.', 502, 'invalid_output');
        const questions = output.questions.map(question => text(question, 'Question', 300));
        let candidate = null;
        if (output.status === 'candidate') {
            const person = current.known.find(item => item.id === output.contact_id);
            ensure(person, 'AI named an unavailable colleague. Nothing was confirmed.', 502, 'invalid_output');
            quoteSpan(current.note.body, output.quote);
            ensure(mentions(output.quote, person.name), 'The quotation does not name the suggested colleague.', 502, 'invalid_output');
            candidate = { contact_id: person.id, name: person.name, quote: output.quote };
        } else {
            ensure(output.contact_id === '' && output.quote === '' && questions.length > 0,
                'An unclear note must return questions without a guessed person.', 502, 'invalid_output');
        }
        return { binding, status: output.status, candidate, explanation, questions, provider: metadata.provider,
            model: metadata.model, response_id: metadata.responseId, usage: metadata.usage,
            disclosure: 'AI suggests an unconfirmed source annotation. It does not certify responsibility or choose an action recipient. Review the original words and date yourself.' };
    }
    function read(w, jobId) {
        const job = domain.row('jobs', w, jobId);
        ensure(job.type === 'warm-source', 'This is not a source-review request.', 404, 'not_found');
        if (job.state !== 'succeeded') return { review_id: job.id, state: job.state, error: job.error };
        const result = JSON.parse(job.result);
        if (result.confirmed_route_id) return { review_id: job.id, state: 'confirmed', route_id: result.confirmed_route_id, goal_id: result.goal_id };
        try { check(w, result.binding); }
        catch (error) {
            db.prepare("UPDATE jobs SET state='cancelled',result='{}',error='The source review is out of date. Read the source again.',updated_at=? WHERE workspace_id=? AND id=?").run(now(), w, jobId);
            throw new AppError('The source review is out of date. Read the source again.', 409, 'stale_source_review');
        }
        return { review_id: job.id, state: 'succeeded', status: result.status, candidate: result.candidate,
            explanation: result.explanation, questions: result.questions, provider: result.provider, model: result.model,
            response_id: result.response_id, disclosure: result.disclosure, goal_id: result.binding.goal_id,
            source: { id: result.binding.note_id, title: result.binding.note.title, date: result.binding.note.date } };
    }
    function confirm(w, jobId, input) {
        only(input, ['confirm']);
        ensure(input.confirm === true, 'Read the source and explicitly confirm this person.');
        return store.tx(() => {
            const job = domain.row('jobs', w, jobId);
            ensure(job.type === 'warm-source' && job.state === 'succeeded', 'This source review is no longer available. Read it again.', 409, 'stale_source_review');
            const result = JSON.parse(job.result);
            ensure(!result.confirmed_route_id, 'This source review was already confirmed.', 409, 'source_review_used');
            ensure(result.status === 'candidate' && result.candidate, 'Clarify the source before confirming anyone.', 409, 'needs_clarification');
            check(w, result.binding);
            // The human, not the model, selects the only action that establishes
            // a route. Reuse the original exact-quote/date/permission transaction.
            const route = warm.createRoute(w, { topic: result.binding.goal.topic, contact_id: result.candidate.contact_id,
                note_id: result.binding.note_id, quote: result.candidate.quote, route_role: 'guide', confirm: true });
            db.prepare("UPDATE jobs SET state='succeeded',result=?,generation=?,updated_at=? WHERE workspace_id=? AND id=?")
                .run(JSON.stringify({ confirmed_route_id: route.id, goal_id: result.binding.goal_id }), domain.workspace(w).generation, now(), w, jobId);
            domain.event(w, 'knowledge_route', route.id, 'warm.source_review.confirmed', { job_id: jobId, provider: result.provider, model: result.model });
            return { route, goal_id: result.binding.goal_id, tasks_created: 0, disclosure: 'You confirmed the source and person. Planning and task approval are separate.' };
        });
    }
    return { prepare, check, validate, read, confirm };
}
