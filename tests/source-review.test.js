/** Contract-stub HTTP behavior for source annotation; live acceptance is separate. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers/http.js';

const body = 'Riley Park handles orientation, not staging walkthroughs. For a first staging walkthrough, ask Noor Haddad. Finish security training first. Access is not automatic.';
const quote = 'For a first staging walkthrough, ask Noor Haddad.';
const reply = value => new Response(JSON.stringify({ modelVersion: 'gemini-contract-test', responseId: 'source-review-contract-stub',
    candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }], usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 30 } }));
async function fixture(change = value => value, transport = null, extraConfig = {}) {
    let calls = 0, sent;
    const x = await setup({ aiProvider: 'vertex', vertexProject: 'synthetic-project', openaiModel: 'gemini-contract-test', tokenProvider: async () => 'synthetic-token', ...extraConfig,
        fetchImpl: async (_, request) => {
            calls++; sent = JSON.parse(JSON.parse(request.body).contents[0].parts[0].text);
            const selected = sent.known_colleagues.find(person => person.name === 'Noor Haddad');
            const value = change({ status: 'candidate', contact_id: selected.id, quote, explanation: 'The selected note explicitly names Noor for this task.', questions: [] });
            return transport ? transport(value) : reply(value);
        } });
    const client = x.client(), session = await client.register(), w = session.user.workspace_id;
    const riley = x.app.domain.createContact(w, { name: 'Riley Park', email: 'private-riley@example.invalid', role: 'Private profile role, not authority' });
    const noor = x.app.domain.createContact(w, { name: 'Noor Haddad' });
    const note = x.app.domain.createNote(w, { title: 'Selected raw handover', body, occurred_on: '2026-10-18' });
    const goal = x.app.warm.createGoal(w, { title: 'First staging walkthrough', role: 'New engineer', topic: 'staging', success: 'Explain one approved result.' });
    const start = () => client.call(`/api/warm/goals/${goal.id}/source-review`, 'POST', { note_id: note.id, consent: true });
    const ready = async () => { const started = await start(); assert.equal(started.status, 202); await x.app.ai.drain(); return started.data.job_id; };
    return { ...x, newClient: x.client, client, w, riley, noor, note, goal, start, ready, calls: () => calls, sent: () => sent };
}

test('An unmapped task is blocked before AI; source reading sends only explicitly consented selected input', async () => {
    const x = await fixture();
    try {
        assert.equal(x.app.warm.plan(x.w, x.goal.id).body.resolution, 'needs_evidence');
        const refused = await x.client.call(`/api/warm/goals/${x.goal.id}/source-review`, 'POST', { note_id: x.note.id, consent: false });
        assert.equal(refused.status, 400); assert.equal(x.calls(), 0);
        const jobId = await x.ready();
        const proposed = await x.client.call('/api/warm/source-reviews/' + jobId);
        assert.equal(proposed.status, 200);
        assert.equal(proposed.data.candidate.name, 'Noor Haddad');
        assert.equal(proposed.data.candidate.quote, quote);
        assert.deepEqual(Object.keys(x.sent().known_colleagues[0]).sort(), ['id', 'name']);
        assert.equal(x.sent().selected_note.body, body);
        assert.equal(JSON.stringify(x.sent()).includes('private-riley'), false);
        assert.equal(x.app.warm.routes(x.w).length, 0); assert.equal(x.app.domain.state(x.w).tasks.length, 0);
        const foreign = x.newClient(); await foreign.register('another-owner@example.invalid');
        assert.equal((await foreign.call('/api/warm/source-reviews/' + jobId)).status, 404);
    } finally { await x.app.close(); }
});

test('Human confirmation alone establishes a quoted guide; planning and selected task approval remain separate', async () => {
    const x = await fixture();
    try {
        const id = await x.ready();
        assert.equal((await x.client.call(`/api/warm/source-reviews/${id}/confirm`, 'POST', { confirm: false })).status, 400);
        assert.equal(x.app.warm.routes(x.w).length, 0);
        const confirmed = await x.client.call(`/api/warm/source-reviews/${id}/confirm`, 'POST', { confirm: true });
        assert.equal(confirmed.status, 200); assert.equal(confirmed.data.route.contact_id, x.noor.id);
        assert.equal(confirmed.data.route.route_role, 'guide'); assert.equal(confirmed.data.route.quote, quote);
        assert.equal(x.app.domain.state(x.w).tasks.length, 0);
        assert.equal((await x.client.call(`/api/warm/source-reviews/${id}/confirm`, 'POST', { confirm: true })).status, 409);
        assert.equal(x.app.warm.routes(x.w).length, 1);
        assert.equal(x.app.domain.row('jobs', x.w, id).result.includes(quote), false);
        const plan = x.app.warm.plan(x.w, x.goal.id);
        assert.equal(plan.body.steps.find(step => step.id === 'ask').route_id, confirmed.data.route.id);
        const approved = x.app.warm.approve(x.w, plan.id, { version: plan.version, confirm: true, step_ids: ['read', 'ask'] });
        assert.equal(approved.tasks.length, 2); assert.equal(x.app.warm.goal(x.w, x.goal.id).status, 'open');
        x.app.domain.deleteNote(x.w, x.note.id, { version: x.note.version });
        assert.equal(x.app.warm.goal(x.w, x.goal.id).plans[0].status, 'stale');
        assert.ok(x.app.domain.state(x.w).tasks.every(task => task.status === 'cancelled'));
        assert.equal(x.app.domain.row('jobs', x.w, id).result, '{}');
    } finally { await x.app.close(); }
});

test('Ambiguous model review asks for clarification and cannot establish any route', async () => {
    const x = await fixture(() => ({ status: 'needs_clarification', contact_id: '', quote: '', explanation: 'The source does not identify a current guide.', questions: ['Who currently handles this walkthrough?'] }));
    try {
        const id = await x.ready(), review = (await x.client.call('/api/warm/source-reviews/' + id)).data;
        assert.equal(review.status, 'needs_clarification'); assert.equal(review.candidate, null);
        assert.equal((await x.client.call(`/api/warm/source-reviews/${id}/confirm`, 'POST', { confirm: true })).status, 409);
        assert.equal(x.app.warm.routes(x.w).length, 0); assert.equal(x.app.domain.state(x.w).tasks.length, 0);
    } finally { await x.app.close(); }
});

test('Invented quotations, unavailable contacts and a quotation naming another person are rejected', async t => {
    for (const [name, change] of [
        ['invented quotation', value => ({ ...value, quote: 'Noor Haddad grants all access immediately.' })],
        ['unavailable identity', value => ({ ...value, contact_id: 'foreign-workspace-contact' })],
        ['different quoted person', value => ({ ...value, quote: 'Riley Park handles orientation, not staging walkthroughs.' })]
    ]) await t.test(name, async () => {
        const x = await fixture(change);
        try {
            const id = await x.ready(), job = x.app.domain.row('jobs', x.w, id);
            assert.equal(job.state, 'failed'); assert.equal(job.result, '{}');
            assert.equal(x.app.warm.routes(x.w).length, 0);
        } finally { await x.app.close(); }
    });
});

test('A source deletion while inference is in flight cancels the proposal without resurrection', async () => {
    let resolveReply;
    const x = await fixture(value => value, value => new Promise(resolve => { resolveReply = () => resolve(reply(value)); }));
    try {
        const started = await x.start();
        for (let i = 0; !resolveReply && i < 20; i++) await new Promise(resolve => setTimeout(resolve, 1));
        x.app.domain.deleteNote(x.w, x.note.id, { version: x.note.version });
        resolveReply(); await x.app.ai.drain();
        assert.equal(x.app.domain.row('jobs', x.w, started.data.job_id).state, 'cancelled');
        assert.equal(x.app.domain.row('jobs', x.w, started.data.job_id).result, '{}');
        assert.equal(x.app.warm.routes(x.w).length, 0);
    } finally { await x.app.close(); }
});

test('Source, goal and contact changes after review invalidate the candidate before confirmation', async t => {
    for (const kind of ['source', 'goal', 'permission']) await t.test(kind, async () => {
        const x = await fixture();
        try {
            const id = await x.ready();
            if (kind === 'source') x.app.domain.editNote(x.w, x.note.id, { version: 1, body: 'The former guidance was withdrawn.' });
            if (kind === 'goal') x.app.warm.editGoal(x.w, x.goal.id, { version: 1, title: 'A completely different first task' });
            if (kind === 'permission') x.app.domain.editContact(x.w, x.noor.id, { version: 1, contact_policy: 'blocked' });
            const job = x.app.domain.row('jobs', x.w, id); assert.equal(job.result, '{}'); assert.equal(job.state, 'cancelled');
            assert.equal((await x.client.call(`/api/warm/source-reviews/${id}/confirm`, 'POST', { confirm: true })).status, 409);
            assert.equal(x.app.warm.routes(x.w).length, 0);
        } finally { await x.app.close(); }
    });
});

test('New duplicate-name identity after inference is caught even without a generation change', async () => {
    const x = await fixture();
    try {
        const id = await x.ready(); x.app.domain.createContact(x.w, { name: 'Noor Haddad' });
        assert.equal((await x.client.call('/api/warm/source-reviews/' + id)).status, 409);
        assert.equal(x.app.domain.row('jobs', x.w, id).result, '{}'); assert.equal(x.app.warm.routes(x.w).length, 0);
    } finally { await x.app.close(); }
});

test('An existing confirmed route cannot be silently replaced by model source review', async () => {
    const x = await fixture();
    try {
        x.app.warm.createRoute(x.w, { topic: 'staging', contact_id: x.riley.id, note_id: x.note.id, quote: 'Riley Park handles orientation, not staging walkthroughs.', route_role: 'guide', confirm: true });
        assert.equal((await x.start()).status, 409); assert.equal(x.calls(), 0);
        assert.equal(x.app.warm.routes(x.w)[0].contact_id, x.riley.id);
    } finally { await x.app.close(); }
});

test('Provider failure is visible and never replaced with an undisclosed local person guess', async () => {
    const x = await fixture(value => value, async () => new Response('{}', { status: 401 }));
    try {
        const id = await x.ready(); assert.equal(x.app.domain.row('jobs', x.w, id).state, 'failed');
        assert.equal(x.app.warm.routes(x.w).length, 0); assert.equal(x.app.domain.state(x.w).tasks.length, 0);
    } finally { await x.app.close(); }
});

test('An uncooperative provider settles as failed; a late reply cannot establish a candidate', async () => {
    let release;
    const x = await fixture(value => value, value => new Promise(resolve => { release = () => resolve(reply(value)); }), { aiRequestTimeoutMs: 25 });
    try {
        const id = await x.ready();
        const review = (await x.client.call('/api/warm/source-reviews/' + id)).data;
        assert.equal(review.state, 'failed'); assert.match(review.error, /timed out/);
        release(); await new Promise(resolve => setTimeout(resolve, 10));
        assert.equal(x.app.domain.row('jobs', x.w, id).state, 'failed');
        assert.equal(x.app.domain.row('jobs', x.w, id).result, '{}');
        assert.equal(x.app.warm.routes(x.w).length, 0); assert.equal(x.app.domain.state(x.w).tasks.length, 0);
    } finally { await x.app.close(); }
});
