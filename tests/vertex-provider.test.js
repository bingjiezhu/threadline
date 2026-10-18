import test from 'node:test';
import assert from 'node:assert/strict';
import { vertexJson } from '../src/vertex-provider.js';
import { setup } from './helpers/http.js';

const options = { project: 'synthetic-project', model: 'gemini-contract-test', tokenProvider: async () => 'synthetic-token', prompt: 'Bounded plan.', payload: { goal: 'Synthetic test' }, schema: { type: 'object' } };
const response = (value, finishReason = 'STOP') => new Response(JSON.stringify({ responseId: 'synthetic-response', modelVersion: 'gemini-contract-test', candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify(value) }] } }], usageMetadata: { promptTokenCount: 12, candidatesTokenCount: 8, totalTokenCount: 20 } }));

test('Vertex contract keeps fixed Google host, explicit schema and bounded data without tools', async () => {
    let sent;
    const result = await vertexJson({ ...options, fetchImpl: async (url, request) => { sent = { url, request, body: JSON.parse(request.body) }; return response({ summary: 'A synthetic plan' }); } });
    assert.equal(new URL(sent.url).host, 'aiplatform.googleapis.com');
    assert.equal(sent.request.redirect, 'error');
    assert.equal(sent.body.tools, undefined);
    assert.equal(sent.body.generationConfig.responseMimeType, 'application/json');
    assert.deepEqual(sent.body.generationConfig.responseJsonSchema, options.schema);
    assert.equal(result.provider, 'vertex');
    assert.equal(result.responseId, 'synthetic-response');
    assert.equal(result.usage.total_tokens, 20);
});

test('Vertex rejects truncation and invalid JSON without a simulated success', async () => {
    await assert.rejects(() => vertexJson({ ...options, fetchImpl: async () => response({}, 'MAX_TOKENS') }), error => error.code === 'incomplete_output');
    await assert.rejects(() => vertexJson({ ...options, fetchImpl: async () => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: 'not json' }] } }] })) }), error => error.code === 'invalid_output');
});

test('Vertex credentials and endpoint errors cannot leak operator secrets or route to another host', async () => {
    let calls = 0;
    await assert.rejects(() => vertexJson({ ...options, project: 'https://evil.invalid', fetchImpl: async () => { calls++; } }), error => error.code === 'ai_not_configured');
    assert.equal(calls, 0);
    await assert.rejects(() => vertexJson({ ...options, tokenProvider: async () => { throw Error('secret credential content'); } }), error => error.code === 'ai_not_configured' && !error.message.includes('secret credential'));
    await assert.rejects(() => vertexJson({ ...options, fetchImpl: async () => new Response('operator-secret', { status: 403 }) }), error => error.code === 'provider_error' && !error.message.includes('operator-secret'));
});

test('Vertex HTTP workflow preserves provider identity, consent, selected approval and source invalidation (contract stub)', async () => {
    let calls = 0;
    const x = await setup({ aiProvider: 'vertex', vertexProject: 'synthetic-project', openaiModel: 'gemini-contract-test', tokenProvider: options.tokenProvider,
        fetchImpl: async (_, request) => { calls++; const payload = JSON.parse(JSON.parse(request.body).contents[0].parts[0].text); return response({ summary: 'Read the note and ask the confirmed colleague.', steps: ['read', 'ask', 'verify'].map(kind => ({ kind, route_id: payload.selected_route_id, instruction: `Review the authorized ${kind} step.` })), unknowns: ['Availability still needs checking.'] }); } });
    try {
        const c = x.client(), auth = await c.register(), w = auth.user.workspace_id;
        const person = x.app.domain.createContact(w, { name: 'Synthetic Jordan' });
        const note = x.app.domain.createNote(w, { title: 'Synthetic guide', body: 'Synthetic Jordan handles sandbox access. Training is required.', occurred_on: '2026-10-16' });
        x.app.warm.createRoute(w, { topic: 'sandbox', contact_id: person.id, note_id: note.id, quote: note.body, route_role: 'approver', confirm: true });
        const goal = x.app.warm.createGoal(w, { title: 'First task', topic: 'sandbox', role: 'New engineer', success: 'Explain one test.' });
        assert.equal((await c.call(`/api/warm/goals/${goal.id}/plan`, 'POST', { use_ai: true, consent: false })).status, 400);
        assert.equal(calls, 0);
        const started = await c.call(`/api/warm/goals/${goal.id}/plan`, 'POST', { use_ai: true, consent: true });
        assert.equal(started.status, 202);
        await x.app.ai.drain();
        const plan = x.app.warm.goal(w, goal.id).plans[0];
        assert.equal(plan.body.provider, 'vertex');
        assert.equal(plan.body.model, 'gemini-contract-test');
        assert.equal(x.app.domain.state(w).tasks.length, 0);
        const approved = x.app.warm.approve(w, plan.id, { version: plan.version, confirm: true, step_ids: ['read', 'ask'] });
        assert.equal(approved.tasks.length, 2);
        x.app.domain.deleteNote(w, note.id, { version: note.version });
        const stale = x.app.warm.goal(w, goal.id).plans[0];
        assert.equal(stale.status, 'stale');
        assert.deepEqual(stale.body, {});
        assert.ok(stale.tasks.every(task => task.status === 'cancelled'));
    } finally { await x.app.close(); }
});
