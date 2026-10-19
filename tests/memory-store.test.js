import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../src/store.js';
import { createDomain } from '../src/domain.js';
import { createMemoryStore } from '../src/memory-store.js';
import { now, uid } from '../src/util.js';

function setup(path = ':memory:') {
    const store = openStore(path), D = createDomain(store), M = createMemoryStore(store, D);
    const makeOwner = name => {
        const id = uid(), w = uid();
        store.db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(id, `${id}@example.com`, name, 'test-only', now());
        store.db.prepare('INSERT INTO workspaces(id,owner_id,name,created_at) VALUES(?,?,?,?)').run(w, id, name, now());
        return w;
    };
    return { store, D, M, w: makeOwner('Owner'), other: makeOwner('Other') };
}
function fixture(ctx, overrides = {}) {
    const { D, M, w } = ctx;
    const c = D.createContact(w, { name: 'Alex Morgan' });
    const p = D.createProject(w, { name: 'Northstar', contact_id: c.id });
    const n = M.ingest(w, { title: 'Conversation with Alex', body: 'Alex prefers email updates. I promised to send the overview by Friday.', contact_id: c.id, project_id: p.id, occurred_on: '2026-10-15', ...overrides }).source;
    return { c, p, n };
}
function proposal(ctx, n, overrides = {}) {
    return ctx.M.propose(ctx.w, n.id, { source_version: n.version, items: [{ kind: 'preference', text: 'Alex prefers email updates.', quote: 'Alex prefers email updates.', topic: 'communication', ...overrides }] }, { provider: 'test-contract', model: 'fixture', run_id: 'run-one' }).items[0];
}
function checked(name, fn) {
    test(name, () => {
        const ctx = setup();
        try { fn(ctx); } finally { ctx.store.close(); }
    });
}

checked('memory schema is additive and constructor preserves canonical notes and schema version', ctx => {
    const { D, M, w, store } = ctx;
    const n = D.createNote(w, { title: 'Earlier journal', body: 'My bonsai nursery project needs a shaded shelf.', occurred_on: '2026-10-14' });
    const before = store.db.prepare('SELECT * FROM notes WHERE id=?').get(n.id);
    const schema = store.db.prepare('SELECT version FROM schema_meta').get().version;
    const pragma = store.db.prepare('PRAGMA user_version').get().user_version;
    createMemoryStore(store, D);
    assert.deepEqual(store.db.prepare('SELECT * FROM notes WHERE id=?').get(n.id), before);
    assert.equal(store.db.prepare('SELECT version FROM schema_meta').get().version, schema);
    assert.equal(store.db.prepare('PRAGMA user_version').get().user_version, pragma);
    assert.equal(M.state(w).sources[0].origin, 'existing');
    assert.equal(store.db.prepare('SELECT count(*) AS n FROM memory_sources').get().n, 0);
    assert.equal(M.retrieve(w, { query: 'bonsai' }).hits[0].source_id, n.id);
});

checked('new workspaces have no fabricated memories, links or seeded entities', ({ M, w }) => {
    const state = M.state(w);
    assert.equal(state.sources.length, 0);
    assert.equal(state.items.length, 0);
    assert.equal(state.relationships.contacts.length, 0);
    assert.equal(M.retrieve(w, { query: 'Alex Northstar' }).hits.length, 0);
});

checked('ingest uses canonical note limits, duplicate checks, event dates and records channel origin', ctx => {
    const { M, w, D } = ctx;
    const { n } = fixture(ctx, { origin: 'web' });
    assert.equal(D.noteDetail(w, n.id).body, n.body);
    assert.equal(M.getSource(w, n.id).origin, 'web');
    assert.throws(() => M.ingest(w, { title: n.title, body: n.body, contact_id: n.contact_id, project_id: n.project_id }), e => e.code === 'duplicate_note');
    assert.throws(() => M.ingest(w, { title: 'Future source', body: 'Future is not a past memory.', occurred_on: '2999-01-01' }), /past or current/);
    assert.throws(() => M.ingest(w, { title: 'Invented channel', body: 'Channel test.', origin: 'implicit-sync' }), /origin/);
});

checked('every source, item, filter and replacement access remains owner scoped', ctx => {
    const { M, D, w, other } = ctx, { n, c, p } = fixture(ctx);
    const memory = proposal(ctx, n);
    assert.equal(M.state(other).sources.length, 0);
    assert.equal(M.retrieve(other, { query: 'email Alex Northstar' }).hits.length, 0);
    assert.throws(() => M.getSource(other, n.id), e => e.status === 404);
    assert.throws(() => M.review(other, memory.id, { version: memory.version, decision: 'confirm' }), e => e.status === 404);
    assert.throws(() => M.forgetSource(other, n.id, { version: n.version }), e => e.status === 404);
    assert.throws(() => M.retrieve(other, { query: 'Alex', contact_id: c.id }), e => e.status === 404);
    assert.throws(() => M.retrieve(other, { query: 'Northstar', project_id: p.id }), e => e.status === 404);
    const foreign = D.createContact(other, { name: 'Other owner person' });
    assert.throws(() => proposal(ctx, n, { contact_id: foreign.id }), e => e.status === 404);
    assert.equal(M.state(w).items.length, 1);
});

checked('proposals require unique exact quotations, preserve Unicode offsets and stay unconfirmed', ctx => {
    const { M, w } = ctx, { n } = fixture(ctx, { body: '🌿 Alex prefers email updates. Café notes stay private.' });
    const memory = proposal(ctx, n);
    assert.equal([...n.body].slice(memory.start_cp, memory.end_cp).join(''), memory.quote);
    assert.equal(memory.status, 'proposed');
    assert.equal(memory.provenance.provider, 'test-contract');
    assert.equal(M.retrieve(w, { query: 'email' }).hits[0].items.length, 0);
    assert.throws(() => proposal(ctx, n, { quote: 'Alex wants SMS.' }), e => e.code === 'invalid_quote');
    const repeated = fixture(ctx, { body: 'Hello. Hello.' }).n;
    assert.throws(() => proposal(ctx, repeated, { quote: 'Hello.' }), e => e.code === 'ambiguous_quote');
});

checked('proposal batch is atomic and retries do not create duplicate pending items', ctx => {
    const { M, w } = ctx, { n } = fixture(ctx);
    const a = proposal(ctx, n), b = proposal(ctx, n);
    assert.equal(a.id, b.id);
    assert.equal(proposal(ctx, n, { text: 'Rewording of the same exact quoted preference.' }).id, a.id);
    assert.equal(M.state(w).items.length, 1);
    assert.throws(() => M.propose(w, n.id, { source_version: n.version, items: [
        { kind: 'commitment', text: 'I promised an overview.', quote: 'I promised to send the overview by Friday.', topic: 'overview' },
        { kind: 'fact', text: 'Invented budget.', quote: 'The budget is approved.', topic: 'budget' }
    ] }), e => e.code === 'invalid_quote');
    assert.equal(M.state(w).items.length, 1);
});

checked('a model cannot invent people/projects or choose an unrelated existing entity', ctx => {
    const { D, M, w } = ctx, { n } = fixture(ctx);
    const unrelated = D.createContact(w, { name: 'Unrelated contact' });
    const unrelatedProject = D.createProject(w, { name: 'Unrelated project' });
    assert.throws(() => proposal(ctx, n, { contact_id: 'made-up-id' }), e => e.status === 404);
    assert.throws(() => proposal(ctx, n, { contact_id: unrelated.id }), e => e.code === 'invalid_memory_context');
    assert.throws(() => proposal(ctx, n, { project_id: unrelatedProject.id }), e => e.code === 'invalid_memory_context');
    assert.equal(M.state(w).items.length, 0);
    assert.equal(D.state(w).contacts.length, 2);
});

checked('project-linked notes inherit only the already linked person', ctx => {
    const { D, M, w } = ctx;
    const c = D.createContact(w, { name: 'Dana' }), p = D.createProject(w, { name: 'Orchard', contact_id: c.id });
    const n = M.ingest(w, { title: 'Project preference', body: 'Alex prefers email updates.', project_id: p.id, occurred_on: '2026-10-10' }).source;
    const memory = proposal(ctx, n);
    assert.equal(memory.contact_id, c.id);
    assert.equal(M.retrieve(w, { query: 'Dana' }).hits[0].source_id, n.id);
    assert.equal(M.state(w).relationships.contacts[0].source_count, 1);
});

checked('human confirmation contributes to recall; rejection does not resurface on repeated extraction', ctx => {
    const { M, w } = ctx, { n } = fixture(ctx);
    let memory = proposal(ctx, n);
    memory = M.review(w, memory.id, { version: memory.version, decision: 'confirm' });
    assert.equal(memory.status, 'confirmed');
    assert.equal(M.retrieve(w, { query: 'communication' }).hits[0].items[0].id, memory.id);
    assert.throws(() => M.review(w, memory.id, { version: 1, decision: 'reject' }), e => e.code === 'stale_version');
    const promise = proposal(ctx, n, { kind: 'commitment', text: 'Send overview on Friday.', quote: 'I promised to send the overview by Friday.', topic: 'overview' });
    M.review(w, promise.id, { version: promise.version, decision: 'reject' });
    const retry = proposal(ctx, n, { kind: 'commitment', text: 'Send overview on Friday.', quote: 'I promised to send the overview by Friday.', topic: 'overview' });
    assert.equal(retry.status, 'rejected');
    assert.equal(M.state(w).items.length, 2);
});

checked('source edits through the ordinary domain scrub and invalidate derived memory immediately', ctx => {
    const { D, M, w, store } = ctx, { n } = fixture(ctx);
    const memory = proposal(ctx, n, { text: 'An extracted preference with distinctderivedword.', topic: 'distinctderivedtopic' });
    M.review(w, memory.id, { version: 1, decision: 'confirm' });
    const edited = D.editNote(w, n.id, { version: n.version, body: 'Alex now prefers a monthly meeting.' });
    assert.equal(M.retrieve(w, { query: 'distinctderivedword' }).hits.length, 0);
    const stale = M.state(w).items[0];
    assert.equal(stale.status, 'stale');
    assert.equal(stale.text, '');
    assert.equal(stale.quote, '');
    assert.equal(store.db.prepare('SELECT text,quote,topic FROM memory_items WHERE id=?').get(memory.id).text, '');
    assert.throws(() => M.propose(w, n.id, { source_version: n.version, items: [] }), e => e.code === 'stale_version');
    assert.equal(M.getSource(w, n.id).version, edited.version);
    assert.equal(M.retrieve(w, { query: 'monthly meeting' }).hits[0].source_version, edited.version);
});

checked('forget uses normal deletion policy and removes all source/derived content from retrieval', ctx => {
    const { M, D, w, store } = ctx, { n } = fixture(ctx);
    const memory = proposal(ctx, n);
    M.review(w, memory.id, { version: 1, decision: 'confirm' });
    assert.throws(() => M.forgetSource(w, n.id, { version: 99 }), e => e.code === 'stale_version');
    assert.equal(M.forgetSource(w, n.id, { version: n.version }).deleted, true);
    assert.equal(M.retrieve(w, { query: 'Alex email' }).hits.length, 0);
    assert.equal(M.state(w).sources.length, 0);
    assert.equal(M.state(w).items[0].status, 'forgotten');
    assert.equal(M.state(w).items[0].quote, '');
    assert.throws(() => D.noteDetail(w, n.id), e => e.status === 404);
    const row = store.db.prepare('SELECT body,title FROM notes WHERE id=?').get(n.id);
    assert.deepEqual({ ...row }, { body: '', title: 'Deleted note' });
});

checked('deleting a note through the existing API also forgets its derived memory', ctx => {
    const { M, D, w } = ctx, { n } = fixture(ctx);
    proposal(ctx, n);
    D.deleteNote(w, n.id, { version: n.version });
    assert.equal(M.state(w).stats.forgotten, 1);
    assert.equal(M.state(w).items[0].text, '');
});

checked('a newer source creates a reviewable comparison, never silently resolves memory', ctx => {
    const { M, w } = ctx, { n, c, p } = fixture(ctx);
    const first = proposal(ctx, n);
    M.review(w, first.id, { version: first.version, decision: 'confirm' });
    const newer = M.ingest(w, { title: 'Changed preference', body: 'Alex now prefers brief calls.', contact_id: c.id, project_id: p.id, occurred_on: '2026-10-16' }).source;
    const next = proposal(ctx, newer, { text: newer.body, quote: newer.body });
    assert.equal(M.state(w).conflicts.length, 1);
    assert.equal(M.state(w).conflicts[0].status, 'needs_review');
    assert.equal(M.state(w).items.find(i => i.id === first.id).status, 'confirmed');
    assert.throws(() => M.supersede(w, next.id, { version: next.version, replaces_id: first.id }), /confirmed/);
    const confirmed = M.review(w, next.id, { version: next.version, decision: 'confirm' });
    const replaced = M.supersede(w, confirmed.id, { version: confirmed.version, replaces_id: first.id });
    assert.equal(replaced.replaces_id, first.id);
    const previous = M.state(w).items.find(i => i.id === first.id);
    assert.equal(previous.status, 'superseded');
    assert.equal(previous.quote, n.body.split(' I')[0]);
    assert.equal(previous.superseded_by, replaced.id);
    assert.equal(M.state(w).conflicts.length, 0);
    assert.equal(M.retrieve(w, { query: 'communication' }).hits.length, 1);
    const oldSource = M.retrieve(w, { query: 'email' }).hits.find(h => h.source_id === n.id);
    assert.equal(oldSource.items.length, 0);
    assert.equal(oldSource.history[0].status, 'superseded');
});

checked('replacement rejects older dates, different people/topics and cross-owner IDs', ctx => {
    const { M, w, other } = ctx, { n, c, p } = fixture(ctx);
    let old = proposal(ctx, n);
    old = M.review(w, old.id, { version: old.version, decision: 'confirm' });
    const earlier = M.ingest(w, { title: 'Uploaded later but earlier event', body: 'Alex prefers short phone calls.', contact_id: c.id, project_id: p.id, occurred_on: '2026-10-01' }).source;
    let candidate = proposal(ctx, earlier, { text: earlier.body, quote: earlier.body });
    candidate = M.review(w, candidate.id, { version: candidate.version, decision: 'confirm' });
    assert.throws(() => M.supersede(w, candidate.id, { version: candidate.version, replaces_id: old.id }), /later source event/);
    assert.throws(() => M.supersede(other, candidate.id, { version: candidate.version, replaces_id: old.id }), e => e.status === 404);
    const otherContext = fixture(ctx, { body: 'Alex prefers in-person reviews.', occurred_on: '2026-10-16' }).n;
    let different = proposal(ctx, otherContext, { text: otherContext.body, quote: otherContext.body });
    different = M.review(w, different.id, { version: different.version, decision: 'confirm' });
    assert.throws(() => M.supersede(w, different.id, { version: different.version, replaces_id: old.id }), /same kind, topic, person and project/);
});

checked('changing a project person makes inherited-context memories stale', ctx => {
    const { D, M, w } = ctx;
    const first = D.createContact(w, { name: 'First owner' }), second = D.createContact(w, { name: 'Second owner' });
    const p = D.createProject(w, { name: 'Shared delivery', contact_id: first.id });
    const n = D.createNote(w, { title: 'Preference', body: 'Alex prefers email updates.', project_id: p.id });
    const memory = proposal(ctx, n);
    M.review(w, memory.id, { version: memory.version, decision: 'confirm' });
    D.editProject(w, p.id, { version: p.version, contact_id: second.id });
    assert.equal(M.state(w).items[0].status, 'stale');
    assert.equal(M.retrieve(w, { query: 'communication' }).hits.length, 0);
});

checked('contact and project deletion preserve ordinary domain behavior and stale derived links', ctx => {
    const { D, M, w } = ctx, { n, c, p } = fixture(ctx);
    proposal(ctx, n);
    D.deleteContact(w, c.id, { version: c.version });
    assert.equal(M.state(w).items[0].status, 'stale');
    const updatedP = D.row('projects', w, p.id);
    D.deleteProject(w, p.id, { version: updatedP.version });
    assert.equal(M.state(w).relationships.projects.length, 0);
    assert.equal(M.getSource(w, n.id).project_id, null);
});

checked('retrieval is actual lexical and linked recall with no unrelated fallback or SQL grammar execution', ctx => {
    const { M, w } = ctx, { n } = fixture(ctx);
    assert.equal(M.retrieve(w, { query: 'Northstar' }).hits[0].source_id, n.id);
    assert.equal(M.retrieve(w, { query: 'quantum submarine' }).hits.length, 0);
    assert.equal(M.retrieve(w, { query: 'OR NOT * "; DROP TABLE notes;' }).hits.length, 0);
    assert.equal(M.retrieve(w, { query: 'Alex' }).method, 'lexical-and-linked-memory');
    assert.throws(() => M.retrieve(w, { query: 'Alex', limit: 1000000 }), /1 to 25/);
});

test('memory records, confirmations, source origin and history survive a real SQLite restart', () => {
    const dir = mkdtempSync(join(tmpdir(), 'threadline-memory-')), path = join(dir, 'memory.sqlite');
    let ctx = setup(path);
    try {
        const { n } = fixture(ctx, { origin: 'web' });
        let memory = proposal(ctx, n);
        memory = ctx.M.review(ctx.w, memory.id, { version: memory.version, decision: 'confirm' });
        const w = ctx.w;
        ctx.store.close();
        const store = openStore(path), D = createDomain(store), M = createMemoryStore(store, D);
        ctx = { store };
        assert.equal(M.getSource(w, n.id).origin, 'web');
        assert.equal(M.retrieve(w, { query: 'communication' }).hits[0].items[0].id, memory.id);
        assert.equal(M.state(w).stats.confirmed, 1);
        assert.equal(store.db.prepare('SELECT count(*) AS count FROM memory_history WHERE workspace_id=?').get(w).count, 3);
    } finally { ctx.store.close(); rmSync(dir, { recursive: true, force: true }); }
});

checked('independent sentences in one source are not presented as changed memory', ctx => {
    const { M, w } = ctx, { n } = fixture(ctx);
    M.propose(w, n.id, { source_version: n.version, items: [
        {kind:'fact',text:'Alex prefers email updates.',quote:'Alex prefers email updates.',topic:'source-note'},
        {kind:'fact',text:'I promised to send the overview by Friday.',quote:'I promised to send the overview by Friday.',topic:'source-note'}
    ] }, {provider:'local',model:'',run_id:'local-sentence-review'});
    assert.equal(M.state(w).stats.conflict_count, 0);
});

checked('retired messaging origins cannot be used to ingest new sources', ctx => {
    const before = ctx.M.state(ctx.w).sources.length;
    for (const origin of ['photon', 'asi'])
        assert.throws(() => ctx.M.ingest(ctx.w, { title: 'Rejected external source', body: 'This must not be stored.', origin }), e => e.code === 'invalid_input');
    assert.equal(ctx.M.state(ctx.w).sources.length, before);
});
