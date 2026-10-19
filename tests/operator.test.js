import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, statSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { openStore } from '../src/store.js';
import { createAuth } from '../src/auth.js';
import { createDomain } from '../src/domain.js';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pass = 'Temporary operator test passphrase';
async function setup() { const dir = mkdtempSync(join(tmpdir(), 'threadline-operator-')), path = join(dir, 'actual.sqlite'); const store = openStore(path), auth = createAuth(store), session = await auth.register({ name: 'Test Owner', email: 'owner@example.invalid', password: pass }); const domain = createDomain(store); domain.createContact(session.user.workspace_id, { name: 'Persisted test contact' }); return { dir, path, store, auth, session, domain, run(file, args = []) { return spawnSync(process.execPath, [join(root, 'scripts', file), ...args], { cwd: root, env: { ...process.env, THREADLINE_DB: path }, encoding: 'utf8' }); }, clean() { try {
        store.close();
    }
    catch { } rmSync(dir, { recursive: true, force: true }); } }; }
test('Operator backup includes committed WAL data, is private and does not overwrite', async () => { const c = await setup(); try {
    const out = join(c.dir, 'backup.sqlite');
    let r = c.run('backup.js', ['--out', out]);
    assert.equal(r.status, 0, r.stderr);
    const backup = new DatabaseSync(out, { readOnly: true });
    assert.equal(backup.prepare('PRAGMA integrity_check').get().integrity_check, 'ok');
    assert.equal(backup.prepare('SELECT name FROM contacts').get().name, 'Persisted test contact');
    backup.close();
    if (process.platform !== 'win32')
        assert.equal(statSync(out).mode & 0o077, 0);
    r = c.run('backup.js', ['--out', out]);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /already exists/);
}
finally {
    c.clean();
} });
test('Offline recovery requires explicit confirmation and revokes existing sessions', async () => { const c = await setup(); try {
    c.store.close();
    const file = join(c.dir, 'private-password.txt');
    writeFileSync(file, 'New operator-controlled passphrase\n', { mode: 0o600 });
    let r = c.run('recover.js', ['--email', 'owner@example.invalid', '--password-file', file]);
    assert.notEqual(r.status, 0);
    r = c.run('recover.js', ['--email', 'owner@example.invalid', '--password-file', file, '--confirm']);
    assert.equal(r.status, 0, r.stderr);
    const st = openStore(c.path), a = createAuth(st);
    try {
        assert.equal(a.resolve(c.session.token), null);
        await assert.rejects(a.login({ email: 'owner@example.invalid', password: pass }));
        assert.ok((await a.login({ email: 'owner@example.invalid', password: 'New operator-controlled passphrase' })).user.id);
    }
    finally {
        st.close();
    }
}
finally {
    c.clean();
} });
test('Offline recovery rejects a world-readable password file on POSIX', async () => { if (process.platform === 'win32')
    return; const c = await setup(); try {
    c.store.close();
    const file = join(c.dir, 'not-private.txt');
    writeFileSync(file, 'Another temporary long passphrase');
    chmodSync(file, 0o644);
    const r = c.run('recover.js', ['--email', 'owner@example.invalid', '--password-file', file, '--confirm']);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /must be private/);
}
finally {
    c.clean();
} });
test('Unknown prototype schemas are refused before migration', () => { const dir = mkdtempSync(join(tmpdir(), 'threadline-old-')), path = join(dir, 'old.sqlite'); try {
    let db = new DatabaseSync(path);
    db.exec("CREATE TABLE previous_data(secret TEXT); INSERT INTO previous_data VALUES('preserved');");
    db.close();
    assert.throws(() => openStore(path), /not a Threadline 1.0 database/);
    db = new DatabaseSync(path);
    assert.equal(db.prepare('SELECT secret FROM previous_data').get().secret, 'preserved');
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name='users'").get(), undefined);
    db.close();
}
finally {
    rmSync(dir, { recursive: true, force: true });
} });
test('Unsupported schema versions are refused without overwriting them', () => { const dir = mkdtempSync(join(tmpdir(), 'threadline-future-')), path = join(dir, 'future.sqlite'); try {
    let db = new DatabaseSync(path);
    db.exec('CREATE TABLE schema_meta(version INTEGER); INSERT INTO schema_meta VALUES(999);');
    db.close();
    assert.throws(() => openStore(path), /Unsupported database schema/);
    db = new DatabaseSync(path);
    assert.equal(db.prepare('SELECT version FROM schema_meta').get().version, 999);
    db.close();
}
finally {
    rmSync(dir, { recursive: true, force: true });
} });
