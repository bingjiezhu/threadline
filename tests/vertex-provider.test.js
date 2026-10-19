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

test('Vertex memory HTTP preserves consent, cited proposals, explicit task confirmation and source invalidation (contract stub)', async () => {
    let calls = 0;
    const quote = 'I promised to send the orchid agenda by 2026-10-23.';
    const x = await setup({ aiProvider: 'vertex', vertexProject: 'synthetic-project', openaiModel: 'gemini-contract-test', tokenProvider: options.tokenProvider,
        fetchImpl: async (_, request) => {
            calls++;
            const payload = JSON.parse(JSON.parse(request.body).contents[0].parts[0].text), source = payload.sources[0];
            return response({
                answer: 'You promised to send the orchid agenda by October 23. [1]',
                citations: [{ source_id: source.source_id, source_version: source.source_version, quote }],
                actions: [{ type: 'create_task', title: 'Send the orchid agenda', due_on: '2026-10-23', contact_id: source.allowed_contact_id, project_id: source.allowed_project_id, source_id: source.source_id, source_version: source.source_version, quote }]
            });
        } });
    try {
        const c = x.client(); await c.register();
        const person = (await c.call('/api/contacts', 'POST', { name: 'Test contact' })).data;
        const saved = await c.call('/api/memory/sources', 'POST', { title: 'Orchid agenda', body: quote, occurred_on: '2026-10-16', contact_id: person.id, origin: 'web' });
        assert.equal(saved.status, 200);
        const source = saved.data.source, question = { question: 'What did I promise about the orchid agenda?', use_ai: true };
        assert.equal((await c.call('/api/memory/agent/ask', 'POST', { ...question, consent: false })).status, 400);
        assert.equal(calls, 0);
        const asked = await c.call('/api/memory/agent/ask', 'POST', { ...question, consent: true });
        assert.equal(asked.status, 200, JSON.stringify(asked.data));
        const run = asked.data;
        assert.equal(run.state, 'done');
        assert.equal(run.provider, 'vertex');
        assert.equal(run.model, 'gemini-contract-test');
        assert.equal(run.citations[0].source_id, source.id);
        assert.equal(run.citations[0].quote, quote);
        assert.equal(run.actions.length, 1);
        assert.equal((await c.call('/api/state')).data.tasks.length, 0);
        const approved = await c.call(`/api/memory/agent/runs/${run.id}/actions/0/confirm`, 'POST', { source_version: source.version });
        assert.equal(approved.status, 200, JSON.stringify(approved.data));
        assert.equal(approved.data.task.title, 'Send the orchid agenda');
        assert.equal(approved.data.task.contact_id, person.id);
        assert.equal((await c.call('/api/state')).data.tasks.length, 1);
        const removed = await c.call(`/api/memory/sources/${source.id}/forget`, 'POST', { version: source.version });
        assert.equal(removed.status, 200);
        const stale = (await c.call(`/api/memory/agent/runs/${run.id}`)).data;
        assert.equal(stale.state, 'stale');
        assert.equal(stale.answer, '');
        assert.deepEqual(stale.citations, []);
        assert.doesNotMatch(JSON.stringify(stale), /promised to send/);
        const task = (await c.call('/api/state')).data.tasks[0];
        assert.match(task.title, /Supporting memory source changed/);
        assert.equal(task.notes, '');
        assert.equal(calls, 1);
    } finally { await x.app.close(); }
});
