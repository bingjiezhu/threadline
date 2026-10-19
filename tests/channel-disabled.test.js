import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setup } from './helpers/http.js';
import { hash, now, uid } from '../src/util.js';

const disabledPaths = [
    '/hooks/slack', '/hooks/discord', '/hooks/photon', '/hooks/agentverse',
    '/api/connections', '/api/connections/code', '/api/connections/legacy-id',
    '/api/inbox/legacy-id/confirm', '/api/inbox/legacy-id/dismiss',
    '/api/memory/conversations/message', '/api/channels/photon'
];
const disabledError = { error: { code: 'channel_disabled', message: 'External messaging is disabled.' } };

async function isolated(fn) {
    const folder = mkdtempSync(join(tmpdir(), 'threadline-channels-off-'));
    let providerCalls = 0;
    const context = await setup({ dbPath: join(folder, 'app.sqlite'), fetchImpl: async () => { providerCalls++; throw new Error('No provider call is expected.'); } });
    try { await fn({ ...context, folder, providerCalls: () => providerCalls }); }
    finally { await context.app.close(); rmSync(folder, { recursive: true, force: true }); }
}

function rowCounts(app) {
    return Object.fromEntries(['notes', 'tasks', 'events', 'idempotency', 'note_metadata', 'memory_agent_runs'].map(table => [table, app.store.db.prepare(`SELECT count(*) n FROM ${table}`).get().n]));
}

test('removed external entry points reject anonymous requests without reading channel bodies or calling a provider', async () => {
    await isolated(async ({ base, app, providerCalls }) => {
        const before = rowCounts(app);
        for (const path of disabledPaths) {
            const response = await fetch(base + path, {
                method: 'POST', headers: { 'content-type': 'text/plain', authorization: 'Bearer legacy-token' },
                body: 'This deliberately is not JSON. Remember my private content.'
            });
            assert.equal(response.status, 410, path);
            assert.deepEqual(await response.json(), disabledError, path);
        }
        assert.deepEqual(rowCounts(app), before);
        assert.equal(providerCalls(), 0);
    });
});

test('legacy authenticated channel requests cannot write Markdown or replay cached private replies', async () => {
    await isolated(async ({ app, client, providerCalls }) => {
        const c = client(); const registration = await c.register();
        const saved = await c.call('/api/memory/sources', 'POST', {
            title: 'Owner-only context', body: 'The private orchid plan uses a green planter.', occurred_on: '2026-10-18', origin: 'web'
        });
        assert.equal(saved.status, 200);
        const document = await c.call(`/api/memory/sources/${saved.data.source.id}/markdown`);
        assert.equal(document.status, 200);
        const path = join(app.vault.root, document.data.path), original = readFileSync(path, 'utf8');
        const w = registration.user.workspace_id, key = uid();
        const input = { channel: 'imessage', session: 'legacy-session', message_id: uid(), message: 'Remember this: this must never be saved.' };
        const requestHash = hash('POST:/api/memory/conversations/message:' + JSON.stringify(input));
        app.store.db.prepare('INSERT INTO idempotency VALUES(?,?,?,?,?,?)').run(w, key, requestHash, JSON.stringify({ reply: 'A cached private answer must not be exposed.' }), app.domain.workspace(w).generation, now());
        const before = rowCounts(app);
        for (const target of disabledPaths) {
            for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
                const response = await c.call(target, method, input, { 'idempotency-key': key, authorization: 'Bearer old-valid-channel-token' });
                assert.equal(response.status, 410, `${method} ${target}`);
                assert.deepEqual(response.data, disabledError);
            }
        }
        assert.deepEqual(rowCounts(app), before);
        assert.equal(readFileSync(path, 'utf8'), original);
        assert.equal(readdirSync(join(app.vault.root, w, 'notes')).length, 1);
        assert.equal(providerCalls(), 0);
    });
});

test('a fresh workspace is empty and the local memory, retrieval and task workflows remain usable', async () => {
    await isolated(async ({ app, client }) => {
        const c = client(); await c.register();
        const initial = await c.call('/api/state');
        assert.equal(initial.status, 200);
        for (const table of ['contacts', 'projects', 'notes', 'claims', 'reviews', 'tasks']) assert.deepEqual(initial.data[table], []);
        assert.deepEqual((await c.call('/api/memory')).data.sources, []);
        const source = await c.call('/api/memory/sources', 'POST', { title: 'Orchid project', body: 'The orchid project needs a green planter.', occurred_on: '2026-10-18', origin: 'web' });
        assert.equal(source.status, 200);
        assert.equal((await c.call('/api/memory/search?q=orchid')).data.hits[0].source_id, source.data.source.id);
        const answer = await c.call('/api/memory/agent/ask', 'POST', { question: 'What does the orchid project need?', use_ai: false });
        assert.equal(answer.status, 200);
        assert.match(answer.data.answer, /green planter/);
        assert.equal(answer.data.citations[0].source_id, source.data.source.id);
        const task = await c.call('/api/tasks', 'POST', { title: 'Buy a planter', due_on: '2026-10-20' });
        assert.equal(task.status, 200);
        assert.equal((await c.call('/api/state')).data.tasks.length, 1);
        assert.equal((await c.call('/api/warm')).status, 404);
        const exported = await c.call('/api/export', 'POST', { password: 'This is a real passphrase!' });
        assert.equal(exported.status, 200);
        assert.equal(exported.data.extensions.warm_start, undefined);
        assert.equal(exported.data.extensions.chat, undefined);
        assert.ok(readFileSync(join(app.vault.root, (await c.call(`/api/memory/sources/${source.data.source.id}/markdown`)).data.path), 'utf8').endsWith(source.data.source.body));
    });
});
