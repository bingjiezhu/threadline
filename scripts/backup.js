// Operator-only SQLite snapshot plus its canonical Markdown vault.
import { DatabaseSync } from 'node:sqlite';
import { constants, mkdirSync, lstatSync, chmodSync, readdirSync, openSync, closeSync, fstatSync, readFileSync, writeFileSync, fsyncSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, join, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireDatabase, root, arg } from './operator.js';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function stat(path) { try { return lstatSync(path); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } }
function safePath(path) {
    let at = resolve(path);
    while (true) {
        // macOS itself exposes /var and /tmp through fixed /private aliases.
        const systemAlias = process.platform === 'darwin' && ['/var', '/tmp'].includes(at) && realpathSync(at) === `/private${at}`;
        if (stat(at)?.isSymbolicLink() && !systemAlias) throw new Error('Backup paths cannot contain symbolic links. Use the real local path.');
        const parent = dirname(at); if (parent === at) break; at = parent;
    }
}
function fileBytes(path) {
    safePath(path);
    const before = stat(path);
    if (!before?.isFile() || before.nlink !== 1) throw new Error('Backup sources must be regular files without links.');
    const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    try {
        const opened = fstatSync(fd);
        if (!opened.isFile() || opened.nlink !== 1 || opened.ino !== before.ino || opened.dev !== before.dev) throw new Error('A backup source changed while being opened. Retry after saving has finished.');
        const data = readFileSync(fd), after = fstatSync(fd);
        if (opened.size !== after.size || opened.mtimeMs !== after.mtimeMs || opened.ctimeMs !== after.ctimeMs) throw new Error('A backup source changed while being read. Retry after saving has finished.');
        return data;
    } finally { closeSync(fd); }
}
function tree(path) {
    safePath(path);
    const result = [];
    function walk(at, prefix = '') {
        if (!stat(at)?.isDirectory()) throw new Error('The memory vault is not a regular directory.');
        for (const name of readdirSync(at).sort()) {
            const child = join(at, name), rel = prefix ? `${prefix}/${name}` : name, info = stat(child);
            if (info?.isSymbolicLink()) throw new Error('The memory vault contains a symbolic link. No backup was verified.');
            if (info?.isDirectory()) { result.push({ path: rel, type: 'directory' }); walk(child, rel); }
            else if (info?.isFile() && info.nlink === 1) result.push({ path: rel, type: 'file', hash: digest(fileBytes(child)) });
            else throw new Error('The memory vault contains a non-regular file or hard link. No backup was verified.');
        }
    }
    walk(path); return result;
}
function within(parent, child) { const rel = relative(parent, child); return rel === '' || rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel); }
function table(db, name) { return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name)); }
function verifyVault(db, memoryRoot, manifest) {
    if (table(db, 'markdown_vault_config')) {
        const config = db.prepare('SELECT root FROM markdown_vault_config WHERE singleton=1').get();
        if (config && resolve(config.root) !== memoryRoot) throw new Error('The configured memory folder differs from this database. Set THREADLINE_MEMORY_DIR to its original vault path.');
    }
    if (table(db, 'markdown_vault_outbox') && db.prepare('SELECT count(*) AS n FROM markdown_vault_outbox').get().n) throw new Error('Memory saves are pending. Finish synchronization in Threadline before taking a backup.');
    if (!table(db, 'markdown_vault_files')) return;
    const files = new Map(manifest.filter(item => item.type === 'file').map(item => [item.path, item.hash]));
    for (const item of db.prepare('SELECT * FROM markdown_vault_files').all()) {
        if (!uuid.test(item.workspace_id) || !uuid.test(item.source_id)) throw new Error('The memory manifest contains an invalid identifier.');
        const path = `${item.workspace_id}/notes/${item.source_id}.md`;
        if (item.state === 'deleted') {
            if (item.error_code || files.has(path)) throw new Error('A forgotten memory has an unresolved storage conflict. Resolve it before backup.');
        } else if (item.state !== 'ready' || item.error_code || !item.file_hash || files.get(path) !== item.file_hash) {
            throw new Error('Markdown and its database index differ. Synchronize the vault in Threadline and resolve any storage issues before backup.');
        }
    }
}

export function backupDatabase({ source, destination, memoryDir } = {}) {
    source = resolve(source || requireDatabase());
    destination = resolve(destination || resolve(root, 'backups', `threadline-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`));
    const memoryRoot = resolve(memoryDir || process.env.THREADLINE_MEMORY_DIR || join(dirname(source), 'memory'));
    const companion = `${destination}.memory`;
    for (const path of [source, destination, memoryRoot, companion]) safePath(path);
    if (!stat(source)?.isFile() || stat(source).nlink !== 1) throw new Error('The database must be an existing regular local file.');
    if (stat(destination) || stat(companion)) throw new Error('Destination already exists. Choose a new backup filename.');
    if (within(memoryRoot, destination) || within(memoryRoot, companion) || within(companion, memoryRoot)) throw new Error('Keep the backup destination outside the active memory vault.');
    mkdirSync(dirname(destination), { recursive: true, mode: 0o700 }); safePath(dirname(destination));
    const previousMask = process.umask(0o077);
    let lock, reader, locked = false;
    try {
        lock = new DatabaseSync(source); lock.exec('PRAGMA busy_timeout=10000');
        // A separate reader can VACUUM INTO while this connection prevents new DB writes.
        lock.exec('BEGIN IMMEDIATE'); locked = true;
        const hasVault = Boolean(stat(memoryRoot));
        const before = hasVault ? tree(memoryRoot) : [];
        verifyVault(lock, memoryRoot, before);
        if (table(lock, 'markdown_vault_config') && !hasVault) throw new Error('The configured Markdown vault is missing. Restore it before backup.');
        const reserved = openSync(destination, 'wx', 0o600); closeSync(reserved);
        reader = new DatabaseSync(source, { readOnly: true }); reader.exec('PRAGMA busy_timeout=10000');
        reader.exec(`VACUUM INTO '${destination.replaceAll("'", "''")}'`);
        reader.close(); reader = null; chmodSync(destination, 0o600);
        if (hasVault) {
            mkdirSync(companion, { mode: 0o700 });
            for (const item of before) {
                const target = join(companion, item.path);
                if (item.type === 'directory') { mkdirSync(target, { mode: 0o700 }); continue; }
                const bytes = fileBytes(join(memoryRoot, item.path));
                if (digest(bytes) !== item.hash) throw new Error('The vault changed during backup. This partial backup is not verified; retry with a new destination.');
                const fd = openSync(target, 'wx', 0o600);
                try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
            }
            if (JSON.stringify(before) !== JSON.stringify(tree(memoryRoot)) || JSON.stringify(before) !== JSON.stringify(tree(companion))) throw new Error('The vault changed during backup. This partial backup is not verified; retry with a new destination.');
        }
        const check = new DatabaseSync(destination, { readOnly: true });
        try {
            if (check.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('Backup integrity check failed.');
            verifyVault(check, memoryRoot, before);
        } finally { check.close(); }
        return { destination, memory: hasVault ? companion : null, files: before.filter(item => item.type === 'file').length };
    } finally {
        reader?.close();
        if (locked) lock.exec('ROLLBACK');
        lock?.close(); process.umask(previousMask);
    }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const result = backupDatabase({ destination: arg('--out') });
        console.log(`Verified backup created: ${result.destination}${result.memory ? `\nMarkdown vault: ${result.memory} (${result.files} files). Restore both parts together to the original configured locations.` : ''}\nThis is unencrypted, sensitive operator data. Encrypt and store it separately. Existing sessions are included; restore instructions revoke them.`);
    } catch (e) {
        console.error(`${e.message}\nNo complete backup was verified. If this attempt created partial output, preserve the originals and choose a new destination for the retry.`);
        process.exitCode = 1;
    }
}
