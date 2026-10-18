import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync, unlinkSync, statSync, symlinkSync, linkSync, existsSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from '../src/store.js';
import { createDomain } from '../src/domain.js';
import { createMemoryStore } from '../src/memory-store.js';
import { createMarkdownVault } from '../src/markdown-vault.js';
import { uid, now } from '../src/util.js';

function owner(store, label) { const u = uid(), w = uid(); store.db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(u, `${u}@example.invalid`, label, 'test-only', now()); store.db.prepare('INSERT INTO workspaces(id,owner_id,name,created_at) VALUES(?,?,?,?)').run(w, u, label, now()); return w; }
function setup() {
    const folder = mkdtempSync(join(tmpdir(), 'threadline-md-'));
    const dbPath = join(folder, 'workspace.sqlite');
    const store = openStore(dbPath), D = createDomain(store), M = createMemoryStore(store, D);
    const w = owner(store, 'Owner'), other = owner(store, 'Other');
    const V = createMarkdownVault(store, D); V.migrate();
    return { folder, dbPath, store, D, M, V, w, other, file(id, workspace = w) { return join(V.root, workspace, 'notes', id + '.md'); } };
}
function run(name, fn) { test(name, () => { const ctx = setup(); try { fn(ctx); } finally { try { ctx.store.close(); } catch { } rmSync(ctx.folder, { force: true, recursive: true }); } }); }
function note(c, body = 'Alex prefers short emails.\n\nKeep the original punctuation: 🌿 café.\n') { return c.D.createNote(c.w, { title: 'Alex conversation', body, occurred_on: '2026-10-15' }); }
function patchFile(c, n, body) { const path = c.file(n.id); const before = readFileSync(path, 'utf8'), separator = before.indexOf('\n---\n') + 5; writeFileSync(path, before.slice(0, separator) + body); }

run('existing notes migrate losslessly into private Markdown originals and a readable index', c => {
    const n = note(c); const result = c.V.migrate(), md = c.V.readMarkdown(c.w, n.id);
    assert.equal(result.issues.length, 0); assert.equal(md.markdown.slice(md.markdown.indexOf('\n---\n') + 5), n.body);
    assert.match(md.markdown, /title: "Alex conversation"/); assert.match(md.markdown, /format: "threadline-memory"/);
    assert.equal(statSync(c.file(n.id)).mode & 0o777, 0o600);
    assert.equal(statSync(join(c.V.root, c.w, 'notes')).mode & 0o777, 0o700);
    assert.match(readFileSync(join(c.V.root, c.w, 'MEMORY.md'), 'utf8'), new RegExp(n.id));
    assert.equal(c.store.db.prepare('SELECT version FROM schema_meta').get().version, 3);
});

run('ordinary web/domain changes enqueue durable snapshots and replace the managed file on flush', c => {
    const n = note(c); assert.equal(c.V.status(c.w).pending_count, 1); assert.equal(existsSync(c.file(n.id)), false);
    c.V.flush(c.w); const next = c.D.editNote(c.w, n.id, { version: n.version, title: 'Revised title', body: 'The updated original.' });
    assert.equal(c.V.status(c.w).pending_count, 1); c.V.flush(c.w);
    const md = c.V.readMarkdown(c.w, n.id); assert.equal(md.version, next.version); assert.match(md.markdown, /Revised title/); assert.ok(md.markdown.endsWith('The updated original.'));
    assert.equal(c.V.status(c.w).pending_count, 0);
});

run('external edits update search and invalidate derived memory through the domain revision path', c => {
    const n = note(c); c.V.flush(c.w);
    const m = c.M.propose(c.w, n.id, { source_version: n.version, items: [{ kind: 'preference', text: 'Alex prefers short emails.', quote: 'Alex prefers short emails.', topic: 'communication' }] }).items[0];
    c.M.review(c.w, m.id, { version: m.version, decision: 'confirm' });
    const generation = c.D.workspace(c.w).generation;
    patchFile(c, n, 'Alex now prefers a weekly phone call.');
    const result = c.V.reconcile(c.w); assert.deepEqual(result.issues, []); assert.ok(result.changed.includes(n.id));
    assert.equal(c.D.noteDetail(c.w, n.id).body, 'Alex now prefers a weekly phone call.');
    assert.equal(c.D.noteDetail(c.w, n.id).version, 2); assert.ok(c.D.workspace(c.w).generation > generation);
    assert.equal(c.M.state(c.w).items.find(x => x.id === m.id).status, 'stale');
    assert.equal(c.D.search(c.w, 'weekly').notes[0].id, n.id);
    assert.equal(c.V.reconcile(c.w).changed.length, 0); assert.equal(c.D.noteDetail(c.w, n.id).version, 2);
});

run('external title/date/link edits use the same owner scoped domain validation', c => {
    const n = note(c), contact = c.D.createContact(c.w, { name: 'Alex' }); c.V.flush(c.w);
    let md = readFileSync(c.file(n.id), 'utf8').replace('title: "Alex conversation"', 'title: "A clearer title"').replace('contact_id: null', `contact_id: "${contact.id}"`);
    writeFileSync(c.file(n.id), md); assert.deepEqual(c.V.reconcile(c.w).issues, []);
    assert.equal(c.D.noteDetail(c.w, n.id).contact_id, contact.id); assert.equal(c.D.noteDetail(c.w, n.id).title, 'A clearer title');
    const foreign = c.D.createContact(c.other, { name: 'Other person' });
    md = readFileSync(c.file(n.id), 'utf8').replace(`contact_id: "${contact.id}"`, `contact_id: "${foreign.id}"`); writeFileSync(c.file(n.id), md);
    assert.equal(c.V.reconcile(c.w).issues[0].code, 'markdown_invalid'); assert.equal(c.D.noteDetail(c.w, n.id).contact_id, contact.id);
});

run('deliberately removed managed files are never silently rebuilt by migrate, flush or restart', c => {
    const n = note(c); c.V.flush(c.w); unlinkSync(c.file(n.id));
    assert.equal(c.V.reconcile(c.w).issues[0].code, 'markdown_missing');
    assert.throws(() => c.V.readMarkdown(c.w, n.id), e => e.code === 'markdown_missing');
    c.V.migrate(); assert.equal(existsSync(c.file(n.id)), false);
    c.D.editNote(c.w, n.id, { version: n.version, title: 'Pending change' });
    assert.equal(c.V.flush(c.w).issues[0].code, 'markdown_missing'); assert.equal(existsSync(c.file(n.id)), false);
    assert.equal(c.V.status(c.w).pending_count, 1);
});

run('restoring an unchanged missing file resolves its error without inventing a revision', c => {
    const n = note(c); c.V.flush(c.w); const saved = readFileSync(c.file(n.id)); unlinkSync(c.file(n.id)); c.V.reconcile(c.w);
    writeFileSync(c.file(n.id), saved); assert.equal(c.V.reconcile(c.w).issues.length, 0); assert.equal(c.V.syncSource(c.w, n.id).version, 1);
});

run('conflicting application and external edits preserve the disk version and pending database version', c => {
    const n = note(c); c.V.flush(c.w); patchFile(c, n, 'External editor version.');
    c.D.editNote(c.w, n.id, { version: n.version, body: 'Application version.' });
    const result = c.V.flush(c.w); assert.equal(result.issues[0].code, 'markdown_conflict');
    assert.ok(readFileSync(c.file(n.id), 'utf8').endsWith('External editor version.')); assert.equal(c.D.noteDetail(c.w, n.id).body, 'Application version.');
    assert.equal(c.V.status(c.w).pending_count, 1); assert.throws(() => c.V.syncSource(c.w, n.id), e => e.code === 'markdown_conflict');
});

run('pending write survives restart and recovers a crash between file rename and receipt', c => {
    const n = note(c); c.V.flush(c.w); const original = c.store.db.prepare('SELECT * FROM markdown_vault_files WHERE source_id=?').get(n.id);
    c.D.editNote(c.w, n.id, { version: n.version, body: 'Durable new body.' }); const pending = c.store.db.prepare('SELECT * FROM markdown_vault_outbox WHERE source_id=?').get(n.id);
    c.V.flush(c.w); // Simulate only the SQLite receipt being lost after the completed atomic rename.
    c.store.db.prepare('UPDATE markdown_vault_files SET file_hash=?,indexed_version=? WHERE source_id=?').run(original.file_hash, original.indexed_version, n.id);
    c.store.db.prepare('INSERT INTO markdown_vault_outbox VALUES(?,?,?,?,?,?)').run(pending.workspace_id, pending.source_id, pending.payload, pending.operation, pending.revision, pending.created_at);
    c.store.close(); c.store = openStore(c.dbPath); c.D = createDomain(c.store); c.V = createMarkdownVault(c.store, c.D);
    assert.deepEqual(c.V.migrate().issues, []); assert.equal(c.V.status(c.w).pending_count, 0); assert.equal(c.V.readMarkdown(c.w, n.id).version, 2);
});

run('new pending writes survive process restart before any file exists', c => {
    const n = note(c); c.store.close(); c.store = openStore(c.dbPath); c.D = createDomain(c.store); c.V = createMarkdownVault(c.store, c.D);
    assert.deepEqual(c.V.migrate().issues, []); assert.ok(c.V.readMarkdown(c.w, n.id).markdown.endsWith(n.body));
});

run('rollback does not leave a file or queue entry for an uncommitted memory', c => {
    let id; assert.throws(() => c.store.tx(() => { id = note(c).id; throw new Error('cancel'); }), /cancel/);
    c.V.flush(c.w); assert.equal(c.V.status(c.w).managed_count, 0); assert.equal(existsSync(c.file(id)), false);
});

run('forget removes the managed original and leaves a durable deleted manifest', c => {
    const n = note(c); c.V.flush(c.w); c.D.deleteNote(c.w, n.id, { version: n.version }); c.V.flush(c.w);
    assert.equal(existsSync(c.file(n.id)), false); assert.equal(c.V.status(c.w).managed_count, 0); c.V.migrate(); assert.equal(existsSync(c.file(n.id)), false);
});

run('forget does not overwrite or delete an unrecognized external edit', c => {
    const n = note(c); c.V.flush(c.w); patchFile(c, n, 'Unsynced external content.'); c.D.deleteNote(c.w, n.id, { version: n.version });
    assert.equal(c.V.flush(c.w).issues[0].code, 'markdown_conflict'); assert.ok(readFileSync(c.file(n.id), 'utf8').endsWith('Unsynced external content.'));
});

run('source IDs and workspaces cannot escape managed paths or read another owner', c => {
    const n = note(c); c.V.flush(c.w);
    assert.throws(() => c.V.readMarkdown(c.other, n.id), e => e.status === 404);
    assert.throws(() => c.V.readMarkdown(c.w, '../../etc/passwd'), e => e.status === 400);
    assert.throws(() => c.V.reconcile('../'), e => e.status === 400);
    assert.equal(c.V.status(c.other).managed_count, 0);
});

run('symlink and hardlink source files fail closed without modifying their targets', c => {
    const n = note(c); c.V.flush(c.w); const outside = join(c.folder, 'outside.md'); writeFileSync(outside, 'Keep me.'); unlinkSync(c.file(n.id)); symlinkSync(outside, c.file(n.id));
    assert.equal(c.V.reconcile(c.w).issues[0].code, 'markdown_invalid'); assert.equal(readFileSync(outside, 'utf8'), 'Keep me.');
    unlinkSync(c.file(n.id)); linkSync(outside, c.file(n.id)); assert.equal(c.V.reconcile(c.w).issues[0].code, 'markdown_invalid'); assert.equal(readFileSync(outside, 'utf8'), 'Keep me.');
});

run('symlink notes directories cannot redirect writes outside the vault', c => {
    const n = note(c); c.V.flush(c.w); const notes = join(c.V.root, c.w, 'notes'), backup = join(c.folder, 'saved-notes'), outside = join(c.folder, 'outside');
    mkdirSync(outside); renameSync(notes, backup); symlinkSync(outside, notes); c.D.editNote(c.w, n.id, { version: n.version, body: 'Pending text.' });
    assert.equal(c.V.flush(c.w).issues[0].code, 'markdown_invalid'); assert.equal(existsSync(join(outside, n.id + '.md')), false);
});

run('corrupt front matter, oversized files and invalid UTF-8 never reach the note index', c => {
    const n = note(c); c.V.flush(c.w); const original = readFileSync(c.file(n.id), 'utf8');
    for (const bad of [original.replace(`id: "${n.id}"`, `id: "${uid()}"`), original.replace('version: 1', 'version: 999'), original.replace('title: "Alex conversation"', 'title: !!js/function "do not execute"'), Buffer.from([0xff, 0xfe, 0x61]), 'x'.repeat(512 * 1024 + 1)]) {
        writeFileSync(c.file(n.id), bad); assert.equal(c.V.reconcile(c.w).issues[0].code, 'markdown_invalid'); assert.equal(c.D.noteDetail(c.w, n.id).version, 1);
    }
    writeFileSync(c.file(n.id), original); assert.deepEqual(c.V.reconcile(c.w).issues, []);
});

run('an unrecognized file at an initial note destination is preserved', c => {
    const n = note(c); mkdirSync(join(c.V.root, c.w, 'notes'), { recursive: true }); writeFileSync(c.file(n.id), '# Existing file\nDo not replace.');
    assert.equal(c.V.flush(c.w).issues[0].code, 'markdown_conflict'); assert.equal(readFileSync(c.file(n.id), 'utf8'), '# Existing file\nDo not replace.');
});

run('cleanup removes only this workspace managed originals and its unedited generated index', c => {
    const n = note(c); const otherNote = c.D.createNote(c.other, { title: 'Other', body: 'Other content.' }); c.V.flush();
    const unrelated = join(c.V.root, c.w, 'notes', 'my-file.md'); writeFileSync(unrelated, 'Unmanaged original.');
    assert.equal(c.V.clearWorkspace(c.w).cleared, true); assert.equal(existsSync(c.file(n.id)), false); assert.equal(readFileSync(unrelated, 'utf8'), 'Unmanaged original.'); assert.equal(existsSync(c.file(otherNote.id, c.other)), true);
});

run('a changed generated index is preserved while original sources still synchronize', c => {
    const n = note(c); c.V.flush(c.w); const index = join(c.V.root, c.w, 'MEMORY.md'); writeFileSync(index, '# My own index');
    c.D.editNote(c.w, n.id, { version: n.version, body: 'Source update.' }); assert.deepEqual(c.V.flush(c.w).issues, []); assert.equal(readFileSync(index, 'utf8'), '# My own index');
});

run('changing the configured vault path cannot silently recreate a second canonical library', c => {
    note(c); c.V.flush(c.w); assert.throws(() => createMarkdownVault(c.store, c.D, { root: join(c.folder, 'different') }), e => e.code === 'markdown_root_changed');
});

test('in-memory app tests do not create filesystem storage unless explicitly configured', () => {
    const store = openStore(':memory:'), D = createDomain(store); try { const V = createMarkdownVault(store, D); assert.equal(V.enabled, false); assert.equal(V.migrate().enabled, false); assert.equal(store.db.prepare("SELECT count(*) n FROM sqlite_master WHERE name='markdown_vault_files'").get().n, 0); } finally { store.close(); }
});

run('a committed pre-vault database is backfilled once without changing its source versions', c => {
    const secondPath = join(c.folder, 'legacy.sqlite'), legacy = openStore(secondPath), D = createDomain(legacy), w = owner(legacy, 'Legacy');
    try {
        const n = D.createNote(w, { title: 'Before Markdown', body: 'Original before migration.\nNo forced final newline.' });
        const V = createMarkdownVault(legacy, D, { root: join(c.folder, 'legacy-memory') });
        assert.deepEqual(V.migrate().issues, []); assert.equal(D.noteDetail(w, n.id).version, 1); assert.ok(V.readMarkdown(w, n.id).markdown.endsWith(n.body));
        unlinkSync(join(V.root, w, 'notes', n.id + '.md')); V.migrate(); assert.equal(existsSync(join(V.root, w, 'notes', n.id + '.md')), false);
    } finally { legacy.close(); }
});

run('cleanup is safe before the first queued file has been flushed', c => {
    note(c); assert.equal(c.V.clearWorkspace(c.w).cleared, true); assert.equal(c.V.status(c.w).pending_count, 0);
});
