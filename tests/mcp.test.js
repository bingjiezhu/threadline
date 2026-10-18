import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { openStore } from '../src/store.js';
import { createDomain } from '../src/domain.js';
import { createWarmStart } from '../src/warm-start.js';
import { uid, now } from '../src/util.js';
import { createCompanion, readConfig, MCP_TOOLS, PROTOCOL_VERSION } from '../scripts/threadline-mcp.mjs';

function fixture(t) {
    const dir = mkdtempSync(join(tmpdir(), 'threadline-mcp-')), dbPath = join(dir, 'existing.sqlite');
    const store = openStore(dbPath), domain = createDomain(store), warm = createWarmStart(store, domain);
    const workspaces = [uid(), uid()];
    for (const workspace of workspaces) {
        const user = uid();
        store.db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(user, user + '@example.invalid', 'Synthetic owner', 'unused', now());
        store.db.prepare('INSERT INTO workspaces(id,owner_id,name,created_at) VALUES(?,?,?,?)').run(workspace, user, 'Synthetic local workspace', now());
    }
    const config = { db: dbPath, workspace: workspaces[0], webOrigin: 'http://127.0.0.1:4173' };
    const peers = [];
    t.after(() => { for (const peer of peers) peer.close(); store.close(); rmSync(dir, { recursive: true, force: true }); });
    const connect = () => { const peer = createCompanion(config); peers.push(peer); return peer; };
    const goal = (workspace = workspaces[0]) => warm.createGoal(workspace, { title: 'Walk through the staging test site', role: 'New engineer', topic: 'staging-walkthrough', success: 'Explain one test result to my guide.' });
    const route = (name, date = '2026-09-01') => {
        const person = domain.createContact(config.workspace, { name });
        const note = domain.createNote(config.workspace, { title: name + ' original note', body: `${name} handles the first staging walkthrough. Finish training before asking.`, occurred_on: date });
        const record = warm.createRoute(config.workspace, { topic: 'staging-walkthrough', route_role: 'guide', contact_id: person.id, note_id: note.id, quote: note.body, confirm: true });
        return { person, note, record };
    };
    return { dir, store, domain, warm, config, workspaces, connect, goal, route };
}

test('MCP startup requires explicit existing schema/workspace without creating or migrating data', t => {
    const f = fixture(t), absent = join(f.dir, 'absent.sqlite');
    assert.throws(() => readConfig([], {}), /Explicit existing/);
    assert.throws(() => readConfig(['--db', absent, '--workspace', f.config.workspace, '--web-origin', f.config.webOrigin], {}));
    assert.equal(existsSync(absent), false);
    const empty = join(f.dir, 'empty.sqlite'); writeFileSync(empty, '');
    assert.throws(() => readConfig(['--db', empty, '--workspace', f.config.workspace, '--web-origin', f.config.webOrigin], {}), /initialized/);
    assert.throws(() => createCompanion({ ...f.config, workspace: 'missing-owner' }), /does not exist/);
    assert.throws(() => readConfig(['--db', f.config.db, '--workspace', f.config.workspace, '--web-origin', 'https://example.invalid'], {}), /loopback/);
    f.store.db.prepare("INSERT INTO jobs(id,workspace_id,type,subject_id,generation,state,created_at,updated_at) VALUES(?,?,?,?,?,'running',?,?)").run(uid(), f.workspaces[1], 'synthetic-job', 'fixture', 1, now(), now());
    const peer = f.connect(); peer.call('list_first_tasks', {});
    assert.equal(f.store.db.prepare('SELECT state FROM jobs').get().state, 'running');
});

test('MCP tools cannot select another workspace or accept hidden confirmation fields', t => {
    const f = fixture(t), own = f.goal(), foreign = f.goal(f.workspaces[1]), peer = f.connect();
    assert.deepEqual(peer.call('list_first_tasks', {}).first_tasks.map(g => g.id), [own.id]);
    assert.throws(() => peer.call('review_first_task', { goal_id: foreign.id }), /not found/);
    assert.throws(() => peer.call('prepare_next_steps', { goal_id: own.id, confirm: true }), /Unexpected/);
    assert.throws(() => peer.call('review_first_task', { goal_id: own.id, workspace: f.workspaces[1] }), /Unexpected/);
    assert.throws(() => peer.call('list_first_tasks', { db: f.config.db }), /Unexpected/);
    assert.deepEqual(MCP_TOOLS.map(t => [t.name, t.annotations.readOnlyHint]), [['list_first_tasks', true], ['review_first_task', true], ['prepare_next_steps', false]]);
    assert.ok(MCP_TOOLS.every(t => t.inputSchema.additionalProperties === false));
});

test('MCP conflict preparation uses actual engine evidence and creates no tasks or responsibilities', t => {
    const f = fixture(t); f.route('Maya Chen'); f.route('Noor Haddad', '2026-09-02'); const goal = f.goal(), peer = f.connect();
    const result = peer.call('prepare_next_steps', { goal_id: goal.id });
    assert.equal(result.resolution, 'needs_clarification');
    assert.deepEqual(result.plan.body.steps, []);
    assert.equal(result.sources.filter(s => s.usable).length, 2);
    assert.equal(result.plan.status, 'proposed');
    assert.equal(result.tasksCreated, 0);
    assert.equal(result.responsibilitiesConfirmed, 0);
    assert.equal(f.store.db.prepare('SELECT count(*) n FROM tasks').get().n, 0);
    assert.equal(f.store.db.prepare('SELECT count(*) n FROM knowledge_routes').get().n, 2);
});

test('MCP ready proposal still needs human approval; withdrawal hides old bodies and drafts', t => {
    const f = fixture(t), source = f.route('Noor Haddad'), goal = f.goal(), peer = f.connect();
    const prepared = peer.call('prepare_next_steps', { goal_id: goal.id });
    assert.equal(prepared.resolution, 'ready'); assert.equal(prepared.approved, false);
    assert.equal(prepared.app_tasks.length, 0); assert.equal(prepared.modelCalled, false);
    assert.match(prepared.humanReviewURL, new RegExp(goal.id + '$'));
    const approved = f.warm.approve(f.config.workspace, prepared.plan.id, { version: prepared.plan.version, confirm: true, step_ids: ['read', 'ask'] });
    assert.equal(approved.tasks.length, 2);
    f.domain.deleteNote(f.config.workspace, source.note.id, { version: source.note.version });
    const stale = peer.call('review_first_task', { goal_id: goal.id });
    assert.equal(stale.status, 'stale'); assert.deepEqual(stale.plan.body, {});
    assert.equal(stale.goal.status, 'open');
    assert.ok(stale.app_tasks.every(t => t.status === 'cancelled' && t.notes === ''));
    assert.doesNotMatch(JSON.stringify(stale), /Finish training before asking|Hi Noor Haddad/);
    assert.ok(stale.sources.every(s => s.quote === ''));
});

test('MCP read tools evaluate expiry in a rollback snapshot with no persisted maintenance', t => {
    const f = fixture(t), source = f.route('Noor Haddad'), goal = f.goal(), peer = f.connect();
    const prepared = peer.call('prepare_next_steps', { goal_id: goal.id });
    f.warm.approve(f.config.workspace, prepared.plan.id, { version: prepared.plan.version, confirm: true, step_ids: ['ask'] });
    f.store.db.prepare('UPDATE knowledge_routes SET expires_on=? WHERE id=?').run('2000-01-01', source.record.id);
    const before = { generation: f.domain.workspace(f.config.workspace).generation, task: { ...f.store.db.prepare('SELECT * FROM tasks').get() }, route: { ...f.store.db.prepare('SELECT * FROM knowledge_routes').get() }, events: f.store.db.prepare('SELECT count(*) n FROM events').get().n };
    const reviewed = peer.call('review_first_task', { goal_id: goal.id });
    assert.equal(reviewed.status, 'stale'); assert.deepEqual(reviewed.plan.body, {});
    assert.equal(reviewed.app_tasks[0].status, 'cancelled'); assert.equal(reviewed.app_tasks[0].notes, '');
    const after = { generation: f.domain.workspace(f.config.workspace).generation, task: { ...f.store.db.prepare('SELECT * FROM tasks').get() }, route: { ...f.store.db.prepare('SELECT * FROM knowledge_routes').get() }, events: f.store.db.prepare('SELECT count(*) n FROM events').get().n };
    assert.deepEqual(after, before);
    peer.call('list_first_tasks', {});
    assert.equal(f.domain.workspace(f.config.workspace).generation, before.generation);
});

test('Actual stdio is JSON-RPC only and supports initialization, ping, listing and validation errors', t => {
    const f = fixture(t), goal = f.goal();
    const requests = [
        { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'local-test', version: '1' } } },
        { jsonrpc: '2.0', method: 'notifications/initialized' },
        { jsonrpc: '2.0', id: 2, method: 'ping' },
        { jsonrpc: '2.0', id: 3, method: 'tools/list' },
        { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'review_first_task', arguments: { goal_id: goal.id } } },
        { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'prepare_next_steps', arguments: { goal_id: goal.id, workspace: 'injected' } } }
    ];
    const result = spawnSync(process.execPath, [resolve('scripts/threadline-mcp.mjs'), '--db', f.config.db, '--workspace', f.config.workspace, '--web-origin', f.config.webOrigin], { input: requests.map(r => JSON.stringify(r)).join('\n') + '\n', encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 0, result.stderr);
    const responses = result.stdout.trim().split('\n').map(s => JSON.parse(s));
    assert.equal(responses.length, 5); assert.ok(responses.every(r => r.jsonrpc === '2.0'));
    assert.equal(responses[0].result.protocolVersion, PROTOCOL_VERSION);
    assert.equal(responses[2].result.tools.length, 3);
    assert.equal(responses[3].result.structuredContent.goal.id, goal.id);
    assert.equal(responses[4].result.isError, true);
});
