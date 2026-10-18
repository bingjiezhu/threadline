import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setup } from './helpers/http.js';
import { uid } from '../src/util.js';

const route = '/api/memory/conversations/message';
const message = (text, overrides = {}) => ({ channel: 'imessage', session: 'owner-phone', message_id: uid(), message: text, ...overrides });
async function send(client, body) {
    const result = await client.call(route, 'POST', body);
    assert.equal(result.status, 200, JSON.stringify(result.data));
    return result.data.reply;
}
async function personProject(client) {
    const person = await client.call('/api/contacts', 'POST', { name: 'Alex Morgan' });
    const project = await client.call('/api/projects', 'POST', { name: 'Northstar', contact_id: person.data.id });
    return { person: person.data, project: project.data };
}
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

apiTest('thin channels share actual website notes while each owner and channel keeps separate previews', async ({ client }) => {
    const a = client(), b = client(); await a.register('first@example.com'); await b.register('second@example.com');
    await personProject(a);
    const capture = message('Remember this: I just spoke with Alex. He prefers the orchid report.');
    assert.match(await send(a, capture), /Ready to save/);
    assert.match(await send(b, message('Confirm')), /nothing pending/i);
    assert.match(await send(a, message('Confirm', { channel: 'asi-one' })), /nothing pending/i);
    assert.equal((await a.call('/api/memory')).data.sources.length, 0);
    const confirmation = message('Confirm');
    assert.match(await send(a, confirmation), /Saved to Alex/);
    assert.match(await send(a, confirmation), /Saved to Alex/);
    const state = (await a.call('/api/memory')).data;
    assert.equal(state.sources.length, 1);
    const recall = await send(a, message('What did I last discuss with Alex?', { channel: 'asi-one' }));
    assert.match(recall, /orchid report/);
    assert.equal((await b.call('/api/memory')).data.sources.length, 0);
});

apiTest('a project change after the preview blocks outdated channel capture context', async ({ client }) => {
    const c = client(); await c.register();
    const { project } = await personProject(c);
    assert.match(await send(c, message('Remember this: I just spoke with Alex. He asked for a pilot.')), /Northstar/);
    const other = (await c.call('/api/contacts', 'POST', { name: 'Jamie Stone' })).data;
    assert.equal((await c.call(`/api/projects/${project.id}`, 'PATCH', { version: project.version, contact_id: other.id })).status, 200);
    const reply = await send(c, message('Confirm'));
    assert.doesNotMatch(reply, /^Saved to/);
    assert.equal((await c.call('/api/memory')).data.sources.length, 0, 'A preview with stale project ownership must not create a source.');
});

test('channel previews and confirmed notes survive an actual HTTP server and SQLite restart', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'threadline-memory-http-')), dbPath = join(dir, 'app.sqlite');
    let context = await setup({ dbPath });
    try {
        const c = context.client(); await c.register('restart@example.com'); await personProject(c);
        assert.match(await send(c, message('Remember this: I just spoke with Alex. He prefers a quiet meeting.')), /Ready to save/);
        await context.app.close();
        context = await setup({ dbPath });
        const reopened = context.client();
        assert.equal((await reopened.call('/api/auth/login', 'POST', { email: 'restart@example.com', password: 'This is a real passphrase!' })).status, 200);
        assert.match(await send(reopened, message('Confirm')), /Saved to Alex/);
        assert.equal((await reopened.call('/api/memory')).data.sources.length, 1);
        assert.match(await send(reopened, message('What did I last discuss with Alex?')), /quiet meeting/);
    } finally { await context.app.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('forget during a pending Gemini request cannot resurrect cached channel replies (contract stub)', async () => {
    let finishModel, notifyStarted;
    const started = new Promise(resolve => { notifyStarted = resolve; });
    const modelWait = new Promise(resolve => { finishModel = resolve; });
    const context = await setup({ vertexProject: 'synthetic-project', openaiModel: 'gemini-contract-test', tokenProvider: async () => 'synthetic-token',
        fetchImpl: async (_, request) => {
            const payload = JSON.parse(JSON.parse(request.body).contents[0].parts[0].text);
            notifyStarted();
            await modelWait;
            const source = payload.sources[0];
            return new Response(JSON.stringify({ responseId: 'synthetic-only', modelVersion: 'gemini-contract-test', candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ answer: 'A purple trellis is needed. [1]', citations: [{ source_id: source.source_id, source_version: source.source_version, quote: source.excerpt }], actions: [] }) }] } }] }));
        } });
    let pending;
    try {
        const c = context.client(); await c.register();
        const source = (await c.call('/api/memory/sources', 'POST', { title: 'Orchid plan', body: 'The privateorchid project needs a purple trellis.' })).data.source;
        const first = message('What does privateorchid need?');
        assert.match(await send(c, first), /purple trellis/);
        pending = c.call(route, 'POST', message('Ask AI: What does privateorchid need?'));
        await started;
        assert.equal((await c.call(`/api/memory/sources/${source.id}/forget`, 'POST', { version: source.version })).status, 200);
        finishModel();
        const interrupted = await pending;
        assert.equal(interrupted.status, 409);
        assert.equal(interrupted.data.error.code, 'conversation_changed');
        const replay = await send(c, first);
        assert.doesNotMatch(replay, /purple trellis/, 'An old in-memory receipt must not overwrite the deletion invalidation.');
        const persisted = context.app.store.db.prepare('SELECT state_json FROM memory_conversation_state').all();
        assert.doesNotMatch(JSON.stringify(persisted), /purple trellis/);
    } finally { finishModel(); await pending?.catch(() => {}); await context.app.close(); }
});
