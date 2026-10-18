import test from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../src/store.js';
import { createDomain } from '../src/domain.js';
import { createAI, responsesJson, extractionSchema } from '../src/ai.js';
import { uid, now } from '../src/util.js';
function fixture(fetchImpl, dailyLimit = 30) { const s = openStore(':memory:'), d = s.db, u = uid(), w = uid(); d.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(u, 'test@example.com', 'Test', 'unused', now()); d.prepare('INSERT INTO workspaces(id,owner_id,name,created_at) VALUES(?,?,?,?)').run(w, u, 'Test', now()); const D = createDomain(s), A = createAI(s, D, { key: 'test-key-not-real', fetchImpl, dailyLimit }); return { s, d, D, A, w }; }
function response(value) { return new Response(JSON.stringify({ id: 'test-response', status: 'completed', model: 'contract-test-model', output: [{ content: [{ type: 'output_text', text: JSON.stringify(value) }] }], usage: { input_tokens: 100, output_tokens: 80 } }), { status: 200, headers: { 'content-type': 'application/json' } }); }
test('Provider contract uses strict JSON, no tools, store=false and selected input only', async () => { let captured; const r = await responsesJson({ key: 'test-only', model: 'gpt-4.1-mini', prompt: 'Extract.', payload: { body: 'Our note' }, schema: extractionSchema, name: 'evidence', fetchImpl: async (url, i) => { captured = { url, body: JSON.parse(i.body) }; return response({ claims: [] }); } }); assert.equal(captured.url, 'https://api.openai.com/v1/responses'); assert.equal(captured.body.store, false); assert.equal(captured.body.text.format.strict, true); assert.equal(captured.body.tools, undefined); assert.equal(r.usage.input_tokens, 100); });
test('Contract-tested AI extraction stores proposed candidates with exact evidence', async () => { const c = fixture(async () => response({ claims: [{ kind: 'context', topic: 'security', quote: 'Security matters.', statement: 'The conversation addresses security.', certainty: 'uncertain' }] })); try {
    const n = c.D.createNote(c.w, { title: 'Safe input', body: 'Security matters.' });
    const j = c.A.extract(c.w, n.id, { consent: true });
    await c.A.drain();
    assert.equal(c.D.row('jobs', c.w, j.job_id).state, 'succeeded');
    const claim = c.D.state(c.w).claims[0];
    assert.equal(claim.status, 'proposed');
    assert.equal(claim.quote, 'Security matters.');
}
finally {
    c.s.close();
} });
test('Invented AI quotations are rejected atomically, without a partial first claim', async () => { const c = fixture(async () => response({ claims: [{ kind: 'context', topic: 'x', quote: 'Valid passage.', statement: 'Valid', certainty: 'uncertain' }, { kind: 'context', topic: 'x', quote: 'Invented passage.', statement: 'Bad', certainty: 'confirmed' }] })); try {
    const n = c.D.createNote(c.w, { title: 'Original', body: 'Valid passage.' });
    const j = c.A.extract(c.w, n.id, { consent: true });
    await c.A.drain();
    assert.equal(c.D.row('jobs', c.w, j.job_id).state, 'failed');
    assert.equal(c.D.state(c.w).claims.length, 0);
    assert.equal(c.D.noteDetail(c.w, n.id).body, 'Valid passage.');
}
finally {
    c.s.close();
} });
test('Source deletion while an AI call is in flight prevents memory resurrection', async () => { let resolveResponse; const wait = new Promise(r => resolveResponse = r), c = fixture(() => wait); try {
    const n = c.D.createNote(c.w, { title: 'Delete me', body: 'Sensitive source text.' });
    const j = c.A.extract(c.w, n.id, { consent: true });
    c.D.deleteNote(c.w, n.id, { version: n.version });
    resolveResponse(response({ claims: [{ kind: 'context', topic: 'sensitive', quote: 'Sensitive source text.', statement: 'Sensitive', certainty: 'uncertain' }] }));
    await c.A.drain();
    assert.equal(c.D.row('jobs', c.w, j.job_id).state, 'cancelled');
    assert.equal(c.D.state(c.w).claims.length, 0);
    assert.equal(c.D.state(c.w).notes.length, 0);
}
finally {
    c.s.close();
} });
test('AI extraction requires explicit provider consent', async () => { const c = fixture(async () => response({ claims: [] })); try {
    const n = c.D.createNote(c.w, { title: 'No consent', body: 'Do not send.' });
    assert.throws(() => c.A.extract(c.w, n.id, { consent: false }), /Confirm/);
    assert.equal(c.D.state(c.w).jobs.length, 0);
}
finally {
    c.s.close();
} });
test('AI daily allowance is enforced independently of model success', async () => { const c = fixture(async () => response({ claims: [] }), 1); try {
    const n = c.D.createNote(c.w, { title: 'Daily allowance', body: 'Test note.' });
    c.A.extract(c.w, n.id, { consent: true });
    await c.A.drain();
    assert.throws(() => c.A.extract(c.w, n.id, { consent: true }), e => e.code === 'ai_quota');
}
finally {
    c.s.close();
} });
test('AI authentication failure is reported without fallback to fabricated facts', async () => { const c = fixture(async () => new Response('{}', { status: 401 })); try {
    const n = c.D.createNote(c.w, { title: 'Failure', body: 'Original stays safe.' });
    const j = c.A.extract(c.w, n.id, { consent: true });
    await c.A.drain();
    const job = c.D.row('jobs', c.w, j.job_id);
    assert.equal(job.state, 'failed');
    assert.match(job.error, /key was rejected/);
    assert.equal(c.D.state(c.w).claims.length, 0);
}
finally {
    c.s.close();
} });
test('Incomplete provider output is never accepted as a completed extraction', async () => { await assert.rejects(() => responsesJson({ key: 'test', model: 'm', prompt: 'p', payload: {}, schema: extractionSchema, name: 'x', fetchImpl: async () => new Response(JSON.stringify({ status: 'incomplete', output: [] })) }), e => e.code === 'incomplete_output'); });
