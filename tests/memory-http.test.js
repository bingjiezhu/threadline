import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers/http.js';
import { uid } from '../src/util.js';

function apiTest(name, fn) {
    test(name, async () => {
        const context = await setup();
        try { await fn(context); } finally { await context.app.close(); }
    });
}

apiTest('memory HTTP owner, CSRF and source-version checks guard real persisted sources', async ({ client }) => {
    const a = client(), b = client(), anon = client();
    await a.register('memory-owner@example.com');
    await b.register('memory-other@example.com');
    assert.equal((await anon.call('/api/memory')).status, 401);
    const saved = await a.call('/api/memory/sources', 'POST', { title: 'Private preference', body: 'I prefer quiet morning planning.', occurred_on: '2026-10-15', origin: 'web' });
    assert.equal(saved.status, 200);
    const source = saved.data.source;
    assert.equal((await b.call(`/api/memory/sources/${source.id}`)).status, 404);
    assert.equal((await b.call(`/api/memory/sources/${source.id}/forget`, 'POST', { version: source.version })).status, 404);
    assert.equal((await b.call('/api/memory/search?q=quiet')).data.hits.length, 0);
    assert.equal((await a.call(`/api/memory/sources/${source.id}/organize`, 'POST', { source_version: 1 }, { 'x-csrf-token': 'wrong' })).status, 403);
    const organized = await a.call(`/api/memory/sources/${source.id}/organize`, 'POST', { source_version: 1, use_ai: false });
    assert.equal(organized.status, 200);
    assert.equal(organized.data.state, 'done');
    assert.equal(organized.data.items.length, 1);
    const m = organized.data.items[0];
    assert.equal((await b.call(`/api/memory/items/${m.id}/review`, 'POST', { version: m.version, decision: 'confirm' })).status, 404);
    assert.equal((await a.call(`/api/memory/items/${m.id}/review`, 'POST', { version: 999, decision: 'confirm' })).status, 412);
    assert.equal((await a.call(`/api/memory/items/${m.id}/review`, 'POST', { version: m.version, decision: 'confirm' })).data.status, 'confirmed');
});

apiTest('legacy note edits invalidate organized memory, agent history and cached HTTP replies', async ({ client }) => {
    const c = client(); await c.register();
    const source = (await c.call('/api/memory/sources', 'POST', { title: 'Orchid plan', body: 'The privateorchid project needs a purple trellis.', origin: 'web' })).data.source;
    const organized = await c.call(`/api/memory/sources/${source.id}/organize`, 'POST', { source_version: 1, use_ai: false });
    assert.equal(organized.data.state, 'done');
    const key = uid(), input = { question: 'What does the privateorchid project need?', use_ai: false };
    const answer = await c.call('/api/memory/agent/ask', 'POST', input, { 'idempotency-key': key });
    assert.match(answer.data.answer, /purple trellis/);
    const edited = await c.call(`/api/notes/${source.id}`, 'PATCH', { version: 1, body: 'The privateorchid project now needs a green planter.' });
    assert.equal(edited.status, 200);
    const state = (await c.call('/api/memory')).data;
    assert.equal(state.items[0].status, 'stale');
    assert.equal(state.items[0].quote, '');
    const run = (await c.call(`/api/memory/agent/runs/${answer.data.id}`)).data;
    assert.equal(run.state, 'stale');
    assert.doesNotMatch(JSON.stringify(run), /purple trellis/);
    assert.equal((await c.call('/api/memory/agent/ask', 'POST', input, { 'idempotency-key': key })).status, 409);
    const newer = await c.call('/api/memory/agent/ask', 'POST', input);
    assert.match(newer.data.answer, /green planter/);
    const forgotten = await c.call(`/api/memory/sources/${source.id}/forget`, 'POST', { version: edited.data.version });
    assert.equal(forgotten.status, 200);
    assert.equal((await c.call('/api/memory/search?q=privateorchid')).data.hits.length, 0);
    assert.doesNotMatch(JSON.stringify((await c.call('/api/memory/agent/history')).data), /purple trellis|green planter/);
});
