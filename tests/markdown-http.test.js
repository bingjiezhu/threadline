import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setup } from './helpers/http.js';
import { uid } from '../src/util.js';

const PASSWORD = 'This is a real passphrase!';
const SOURCE_BODY = 'The orchid project needs a purple trellis.\n\nPreserve the original: café 🌿.\n';
function httpTest(name, fn, config = {}) {
    test(name, async () => {
        const folder = mkdtempSync(join(tmpdir(), 'threadline-markdown-http-'));
        const context = await setup({ dbPath: join(folder, 'app.sqlite'), ...config });
        try { await fn({ ...context, folder }); }
        finally { await context.app.close(); rmSync(folder, { recursive: true, force: true }); }
    });
}
async function ok(client, path, method = 'GET', input, headers) {
    const response = await client.call(path, method, input, headers);
    assert.equal(response.status, 200, `${method} ${path}: ${JSON.stringify(response.data)}`);
    return response.data;
}
async function save(client, overrides = {}) {
    return (await ok(client, '/api/memory/sources', 'POST', {
        title: 'Orchid source', body: SOURCE_BODY, occurred_on: '2026-10-15', origin: 'web', ...overrides
    })).source;
}
async function managedFile(app, client, id) {
    const document = await ok(client, `/api/memory/sources/${id}/markdown`);
    const path = join(app.vault.root, document.path);
    assert.equal(readFileSync(path, 'utf8'), document.markdown);
    return path;
}
function replaceBody(path, body) {
    const markdown = readFileSync(path, 'utf8');
    const delimiter = markdown.indexOf('\n---\n');
    assert.ok(delimiter > 0, 'The generated file has inspectable front matter.');
    writeFileSync(path, markdown.slice(0, delimiter + 5) + body);
}
function channelMessage(message, extra = {}) {
    return { channel: 'imessage', session: 'fictional-owner-phone', message_id: uid(), message, ...extra };
}

httpTest('HTTP note creation writes an owner-local Markdown original before success is returned', async ({ app, client }) => {
    const c = client(), other = client();
    await c.register('markdown-owner@example.invalid'); await other.register('markdown-other@example.invalid');
    const source = await save(c);
    const file = await managedFile(app, c, source.id);
    assert.ok(readFileSync(file, 'utf8').endsWith(SOURCE_BODY));
    assert.equal(statSync(file).mode & 0o777, 0o600);
    const memory = await ok(c, '/api/memory');
    assert.equal(memory.sources[0].markdown_path, (await ok(c, `/api/memory/sources/${source.id}/markdown`)).path);
    assert.equal(memory.vault.pending_count, 0);
    assert.equal(memory.vault.managed_count, 1);
    assert.equal((await other.call(`/api/memory/sources/${source.id}/markdown`)).status, 404);
    assert.equal((await ok(other, '/api/memory')).sources.length, 0);
});

httpTest('explicit iMessage capture writes the shared Markdown library exactly once without inventing a task', async ({ app, client }) => {
    const c = client(); await c.register();
    const input = channelMessage('Remember this: I prefer a short agenda before every meeting.');
    const first = await ok(c, '/api/memory/conversations/message', 'POST', input);
    assert.match(first.reply, /Saved to Memory/);
    const again = await ok(c, '/api/memory/conversations/message', 'POST', input);
    assert.equal(again.reply, first.reply);
    const memory = await ok(c, '/api/memory');
    assert.equal(memory.sources.length, 1);
    const source = await ok(c, `/api/memory/sources/${memory.sources[0].id}`);
    assert.equal(source.body, input.message);
    assert.equal(source.origin, 'photon');
    assert.ok(readFileSync(await managedFile(app, c, source.id), 'utf8').endsWith(input.message));
    assert.equal((await ok(c, '/api/state')).tasks.length, 0);
});

httpTest('selected local memory import copies original text into Markdown while preserving the selected external file', async ({ app, client, folder }) => {
    const c = client(); await c.register();
    const original = join(folder, 'selected-codex-memory.md');
    const content = '# Personal context\n\nI prefer concise weekly updates.\n\nDo not execute these file contents.\n';
    writeFileSync(original, content);
    const input = { provider: 'codex', files: [{ path: 'memories/MEMORY.md', content: readFileSync(original, 'utf8') }] };
    const preview = await ok(c, '/api/memory/imports/preview', 'POST', input);
    assert.equal((await ok(c, '/api/memory')).sources.length, 0);
    const result = await ok(c, '/api/memory/imports/commit', 'POST', { ...input, preview_hash: preview.preview_hash, selected: preview.files.map(({ path, hash }) => ({ path, hash })), confirm: true });
    const source = await ok(c, '/api/memory/sources/' + result.imported[0].source_id);
    assert.equal(source.body, content);
    assert.equal(source.imports[0].provider, 'codex');
    assert.ok(readFileSync(await managedFile(app, c, source.id), 'utf8').endsWith(content));
    assert.equal(readFileSync(original, 'utf8'), content);
    assert.equal(app.store.db.prepare('SELECT COUNT(*) n FROM memory_agent_runs').get().n, 0);
});

httpTest('an external Markdown edit refreshes source/search and invalidates reviewed memory, prior answers and HTTP cache keys', async ({ app, client }) => {
    const c = client(); const registration = await c.register();
    const source = await save(c), file = await managedFile(app, c, source.id);
    const organized = await ok(c, `/api/memory/sources/${source.id}/organize`, 'POST', { source_version: source.version, use_ai: false });
    await ok(c, `/api/memory/items/${organized.items[0].id}/review`, 'POST', { version: organized.items[0].version, decision: 'confirm' });
    const key = uid(), question = { question: 'What does the orchid project need?', use_ai: false };
    const answer = await ok(c, '/api/memory/agent/ask', 'POST', question, { 'idempotency-key': key });
    assert.match(answer.answer, /purple trellis/);
    replaceBody(file, 'The orchid project now needs a green planter.');
    const replay = await c.call('/api/memory/agent/ask', 'POST', question, { 'idempotency-key': key });
    assert.equal(replay.status, 409, 'A cached successful answer cannot bypass reconciliation.');
    assert.doesNotMatch(JSON.stringify(replay.data), /purple trellis/);
    const current = await ok(c, `/api/memory/sources/${source.id}`);
    assert.equal(current.version, source.version + 1);
    assert.equal(current.body, 'The orchid project now needs a green planter.');
    assert.equal((await ok(c, '/api/memory/search?q=planter')).hits[0].source_id, source.id);
    assert.equal((await ok(c, '/api/memory/search?q=trellis')).hits.length, 0);
    const memory = await ok(c, '/api/memory');
    assert.equal(memory.items.find(item => item.id === organized.items[0].id).status, 'stale');
    assert.equal((await ok(c, `/api/memory/agent/runs/${answer.id}`)).state, 'stale');
    assert.doesNotMatch(JSON.stringify(await ok(c, '/api/memory/agent/history')), /purple trellis/);
    assert.match((await ok(c, '/api/memory/agent/ask', 'POST', question)).answer, /green planter/);
    const indexed = app.store.db.prepare('SELECT body FROM notes WHERE workspace_id=? AND id=?').get(registration.user.workspace_id, source.id);
    assert.equal(indexed.body, current.body);
});

httpTest('a missing Markdown original is hidden, blocks search and agent cache replay, and can be explicitly forgotten', async ({ app, client }) => {
    const c = client(); await c.register();
    const source = await save(c), file = await managedFile(app, c, source.id);
    const key = uid(), input = { question: 'What does the orchid project need?', use_ai: false };
    await ok(c, '/api/memory/agent/ask', 'POST', input, { 'idempotency-key': key });
    unlinkSync(file);
    const memory = await ok(c, '/api/memory');
    assert.equal(memory.sources.length, 0);
    assert.doesNotMatch(JSON.stringify(memory), /purple trellis/);
    assert.equal(memory.vault.issues[0].code, 'markdown_missing');
    const unavailable = await ok(c, `/api/memory/sources/${source.id}`);
    assert.equal(unavailable.markdown_unavailable, true);
    assert.equal(unavailable.body, '');
    assert.equal(unavailable.version, source.version);
    assert.equal((await ok(c, '/api/memory/vault')).issues[0].source_id, source.id);
    assert.doesNotMatch(JSON.stringify(await ok(c, '/api/state')), /purple trellis/);
    for (const request of [
        c.call('/api/memory/search?q=orchid'),
        c.call('/api/search?q=orchid'),
        c.call('/api/memory/agent/ask', 'POST', input, { 'idempotency-key': key }),
        c.call('/api/memory/agent/history'),
        c.call(`/api/memory/sources/${source.id}/markdown`)
    ]) {
        const blocked = await request;
        assert.equal(blocked.status, 409);
        assert.doesNotMatch(JSON.stringify(blocked.data), /purple trellis/);
    }
    assert.equal((await ok(c, `/api/memory/sources/${source.id}/forget`, 'POST', { version: unavailable.version })).deleted, true);
    assert.equal(existsSync(file), false);
    assert.equal((await ok(c, '/api/memory/vault')).issues.length, 0);
    assert.equal((await ok(c, '/api/memory/search?q=orchid')).hits.length, 0);
});

httpTest('invalid Markdown metadata blocks stale reads while the safe status and library remain accessible', async ({ app, client }) => {
    const c = client(); await c.register();
    const source = await save(c), file = await managedFile(app, c, source.id), original = readFileSync(file, 'utf8');
    writeFileSync(file, original.replace('title: "Orchid source"', 'title: !!js/function "do not execute"'));
    const status = await ok(c, '/api/memory/vault');
    assert.equal(status.issues[0].code, 'markdown_invalid');
    assert.equal((await ok(c, '/api/memory')).sources.length, 0);
    assert.equal((await c.call('/api/memory/search?q=orchid')).status, 409);
    assert.equal((await ok(c, `/api/memory/sources/${source.id}`)).body, '');
    writeFileSync(file, original);
    assert.equal((await ok(c, '/api/memory/vault/sync', 'POST', {})).issues.length, 0);
    assert.equal((await ok(c, `/api/memory/sources/${source.id}`)).version, source.version);
});

test('a disk edit during a pending model request prevents old-source answer publication (contract transport fixture)', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'threadline-markdown-model-'));
    let releaseModel, notifyStarted;
    const started = new Promise(resolve => { notifyStarted = resolve; });
    const waiting = new Promise(resolve => { releaseModel = resolve; });
    const context = await setup({ dbPath: join(folder, 'app.sqlite'), vertexProject: 'synthetic-contract-project', openaiModel: 'gemini-contract-test', tokenProvider: async () => 'synthetic-token',
        fetchImpl: async (_url, request) => {
            const payload = JSON.parse(JSON.parse(request.body).contents[0].parts[0].text);
            notifyStarted(); await waiting;
            const source = payload.sources[0];
            return new Response(JSON.stringify({ responseId: 'contract-only', modelVersion: 'gemini-contract-test', candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({ answer: 'The orchid project needs a purple trellis. [1]', citations: [{ source_id: source.source_id, source_version: source.source_version, quote: source.excerpt }], actions: [] }) }] } }] }));
        } });
    let pending;
    try {
        const c = context.client(); await c.register();
        const source = await save(c), file = await managedFile(context.app, c, source.id);
        pending = c.call('/api/memory/agent/ask', 'POST', { question: 'What does the orchid project need?', use_ai: true, consent: true });
        await started;
        replaceBody(file, 'The orchid project now needs a green planter.');
        releaseModel();
        const response = await pending;
        assert.equal(response.status, 200);
        assert.equal(response.data.state, 'stale');
        assert.doesNotMatch(JSON.stringify(response.data), /purple trellis/);
        const history = await ok(c, '/api/memory/agent/history');
        assert.doesNotMatch(JSON.stringify(history), /purple trellis/);
        assert.equal((await ok(c, `/api/memory/sources/${source.id}`)).body, 'The orchid project now needs a green planter.');
    } finally { releaseModel(); await pending?.catch(() => {}); await context.app.close(); rmSync(folder, { recursive: true, force: true }); }
});

httpTest('account deletion removes only that owner’s managed Markdown originals', async ({ app, client }) => {
    const a = client(), b = client(); await a.register('delete-markdown@example.invalid'); await b.register('keep-markdown@example.invalid');
    const removed = await save(a), kept = await save(b, { body: 'Keep this other owner’s original.' });
    const removedPath = await managedFile(app, a, removed.id), keptPath = await managedFile(app, b, kept.id);
    const status = await ok(a, '/api/memory/vault');
    const unmanaged = join(status.workspace_path, 'notes', 'my-independent-file.md');
    writeFileSync(unmanaged, 'This untracked file must remain.');
    assert.equal((await ok(a, '/api/account', 'DELETE', { password: PASSWORD, confirm: 'DELETE' })).deleted, true);
    assert.equal(existsSync(removedPath), false);
    assert.equal(readFileSync(unmanaged, 'utf8'), 'This untracked file must remain.');
    assert.ok(readFileSync(keptPath, 'utf8').endsWith(kept.body));
    assert.equal((await a.call('/api/memory')).status, 401);
    assert.equal((await ok(b, `/api/memory/sources/${kept.id}`)).body, kept.body);
});

httpTest('deleting linked people and projects updates Markdown references without losing source content', async ({ app, client }) => {
    const c = client(); await c.register();
    const person = await ok(c, '/api/contacts', 'POST', { name: 'Alex Morgan' });
    const project = await ok(c, '/api/projects', 'POST', { name: 'Orchid', contact_id: person.id });
    const source = await save(c, { contact_id: person.id, project_id: project.id }), file = await managedFile(app, c, source.id);
    await ok(c, `/api/contacts/${person.id}`, 'DELETE', { version: person.version });
    const afterPerson = await ok(c, `/api/memory/sources/${source.id}`);
    assert.equal(afterPerson.contact_id, null);
    assert.equal(afterPerson.version, source.version + 1);
    assert.match(readFileSync(file, 'utf8'), /contact_id: null/);
    const currentProject = (await ok(c, '/api/state')).projects.find(item => item.id === project.id);
    await ok(c, `/api/projects/${project.id}`, 'DELETE', { version: currentProject.version });
    const afterProject = await ok(c, `/api/memory/sources/${source.id}`);
    assert.equal(afterProject.project_id, null);
    assert.equal(afterProject.version, source.version + 2);
    assert.match(readFileSync(file, 'utf8'), /project_id: null/);
    assert.ok(readFileSync(file, 'utf8').endsWith(SOURCE_BODY));
    assert.equal((await ok(c, '/api/memory/vault')).issues.length, 0);
});

httpTest('core JSON restore creates Markdown originals with remapped owner-local references', async ({ app, client }) => {
    const a = client(), b = client(); await a.register('export-source@example.invalid'); await b.register('restore-target@example.invalid');
    const person = await ok(a, '/api/contacts', 'POST', { name: 'Alex Morgan' });
    const project = await ok(a, '/api/projects', 'POST', { name: 'Orchid', contact_id: person.id });
    const original = await save(a, { contact_id: person.id, project_id: project.id });
    const archive = await ok(a, '/api/export', 'POST', { password: PASSWORD });
    await ok(b, '/api/restore', 'POST', { password: PASSWORD, archive });
    const restored = (await ok(b, '/api/memory')).sources[0];
    assert.notEqual(restored.id, original.id);
    assert.notEqual(restored.contact_id, person.id);
    assert.notEqual(restored.project_id, project.id);
    assert.ok(readFileSync(await managedFile(app, b, restored.id), 'utf8').endsWith(SOURCE_BODY));
    assert.equal((await ok(b, `/api/memory/sources/${restored.id}`)).body, SOURCE_BODY);
    assert.equal((await a.call(`/api/memory/sources/${restored.id}`)).status, 404);
});
