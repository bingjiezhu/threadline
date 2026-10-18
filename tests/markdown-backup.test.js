import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, statSync, existsSync, symlinkSync, linkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { backupDatabase } from '../scripts/backup.js';

function fixture(t, { vault = true, custom = false } = {}) {
    const dir = mkdtempSync(join(tmpdir(), 'threadline-markdown-backup-'));
    t.after(() => rmSync(dir, { recursive: true, force: true }));
    const source = join(dir, 'active.sqlite'), destination = join(dir, 'saved.sqlite'), memoryDir = join(dir, custom ? 'my-notes' : 'memory');
    const db = new DatabaseSync(source); t.after(() => db.close());
    db.exec("PRAGMA journal_mode=WAL; CREATE TABLE example(value TEXT); INSERT INTO example VALUES('committed WAL content');");
    let sourcePath, body, workspace, id;
    if (vault) {
        workspace = randomUUID(); id = randomUUID(); sourcePath = `${workspace}/notes/${id}.md`;
        mkdirSync(join(memoryDir, workspace, 'notes'), { recursive: true });
        body = '---\ntitle: "Original note"\n---\n# Original\n\nExact text, including trailing spaces.  \n你好\n';
        writeFileSync(join(memoryDir, sourcePath), body);
        writeFileSync(join(memoryDir, workspace, 'MEMORY.md'), '# Threadline memory\n');
        mkdirSync(join(memoryDir, 'empty-folder'));
        db.exec(`CREATE TABLE markdown_vault_config(singleton INTEGER PRIMARY KEY,version INTEGER,root TEXT);
          CREATE TABLE markdown_vault_files(workspace_id TEXT,source_id TEXT,file_hash TEXT,state TEXT,error_code TEXT);
          CREATE TABLE markdown_vault_outbox(workspace_id TEXT,source_id TEXT);`);
        db.prepare('INSERT INTO markdown_vault_config VALUES(1,1,?)').run(memoryDir);
        db.prepare('INSERT INTO markdown_vault_files VALUES(?,?,?,?,?)').run(workspace, id, createHash('sha256').update(body).digest('hex'), 'ready', '');
    }
    return { dir, source, destination, memoryDir, db, sourcePath, body, workspace, id };
}

test('backup keeps the WAL snapshot and exact Markdown bytes together with private permissions', t => {
    const f = fixture(t); const result = backupDatabase({ source: f.source, destination: f.destination });
    assert.equal(result.memory, `${f.destination}.memory`); assert.equal(result.files, 2);
    assert.equal(readFileSync(join(result.memory, f.sourcePath), 'utf8'), f.body);
    assert.ok(statSync(join(result.memory, 'empty-folder')).isDirectory());
    const check = new DatabaseSync(result.destination, { readOnly: true });
    try { assert.equal(check.prepare('SELECT value FROM example').get().value, 'committed WAL content'); } finally { check.close(); }
    if (process.platform !== 'win32') {
        assert.equal(statSync(result.destination).mode & 0o777, 0o600);
        assert.equal(statSync(result.memory).mode & 0o777, 0o700);
        assert.equal(statSync(join(result.memory, f.sourcePath)).mode & 0o777, 0o600);
    }
    assert.equal(readFileSync(join(f.memoryDir, f.sourcePath), 'utf8'), f.body);
});

test('pre-vault databases retain the original SQLite-only backup behavior', t => {
    const f = fixture(t, { vault: false }); const result = backupDatabase({ source: f.source, destination: f.destination, memoryDir: f.memoryDir });
    assert.equal(result.memory, null); assert.equal(result.files, 0); assert.equal(existsSync(`${f.destination}.memory`), false);
});

test('custom configured vault paths are copied and incorrect paths are rejected', t => {
    const f = fixture(t, { custom: true });
    assert.throws(() => backupDatabase({ source: f.source, destination: f.destination }), /differs from this database/);
    assert.equal(existsSync(f.destination), false);
    assert.ok(backupDatabase({ source: f.source, destination: f.destination, memoryDir: f.memoryDir }).memory);
});

test('existing database and companion destinations are never overwritten', t => {
    const f = fixture(t); writeFileSync(f.destination, 'user-owned output');
    assert.throws(() => backupDatabase(f), /already exists/); assert.equal(readFileSync(f.destination, 'utf8'), 'user-owned output');
    const second = join(f.dir, 'second.sqlite'); mkdirSync(`${second}.memory`); writeFileSync(join(`${second}.memory`, 'keep.md'), 'keep');
    assert.throws(() => backupDatabase({ ...f, destination: second }), /already exists/);
    assert.equal(existsSync(second), false); assert.equal(readFileSync(join(`${second}.memory`, 'keep.md'), 'utf8'), 'keep');
});

test('symlinks in the vault and destination ancestry are refused without following their targets', t => {
    const f = fixture(t); const target = join(f.dir, 'outside.md'); writeFileSync(target, 'private outside content');
    symlinkSync(target, join(f.memoryDir, 'linked.md'));
    assert.throws(() => backupDatabase(f), /symbolic link/); assert.equal(existsSync(f.destination), false);
    const realOutput = join(f.dir, 'output'); mkdirSync(realOutput); symlinkSync(realOutput, join(f.dir, 'output-link'));
    assert.throws(() => backupDatabase({ ...f, destination: join(f.dir, 'output-link', 'copy.sqlite') }), /symbolic link/);
    assert.equal(existsSync(join(realOutput, 'copy.sqlite')), false); assert.equal(readFileSync(target, 'utf8'), 'private outside content');
});

test('hard-linked vault files are refused', t => {
    const f = fixture(t); linkSync(join(f.memoryDir, f.sourcePath), join(f.memoryDir, 'duplicate.md'));
    assert.throws(() => backupDatabase(f), /hard link/); assert.equal(existsSync(f.destination), false);
});

test('pending saves or changed Markdown cannot be mislabeled as a consistent backup', t => {
    const f = fixture(t);
    f.db.prepare('INSERT INTO markdown_vault_outbox VALUES(?,?)').run(f.workspace, f.id);
    assert.throws(() => backupDatabase(f), /saves are pending/); assert.equal(existsSync(f.destination), false);
    f.db.exec('DELETE FROM markdown_vault_outbox');
    writeFileSync(join(f.memoryDir, f.sourcePath), 'an external edit not yet indexed');
    assert.throws(() => backupDatabase(f), /database index differ/); assert.equal(existsSync(f.destination), false);
});

test('missing canonical vaults and unresolved storage errors refuse verification', t => {
    const f = fixture(t);
    f.db.exec("UPDATE markdown_vault_files SET state='conflict',error_code='markdown_conflict'");
    assert.throws(() => backupDatabase(f), /database index differ/);
    rmSync(f.memoryDir, { recursive: true });
    assert.throws(() => backupDatabase(f), /database index differ|vault is missing/); assert.equal(existsSync(f.destination), false);
});

test('a backup cannot be created inside the active vault', t => {
    const f = fixture(t);
    assert.throws(() => backupDatabase({ ...f, destination: join(f.memoryDir, 'backup.sqlite') }), /outside the active memory vault/);
    assert.equal(existsSync(join(f.memoryDir, 'backup.sqlite')), false);
});
