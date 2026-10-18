import { constants, mkdirSync, lstatSync, chmodSync, openSync, closeSync, readFileSync, writeFileSync, fsyncSync, renameSync, unlinkSync, readdirSync, rmdirSync, fstatSync } from 'node:fs';
import { resolve, dirname, join, relative } from 'node:path';
import { randomUUID } from 'node:crypto';
import { AppError, ensure, hash, now } from './util.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_BYTES = 512 * 1024;
const FIELDS = ['format', 'format_version', 'id', 'workspace_id', 'version', 'title', 'kind', 'occurred_on', 'contact_id', 'project_id', 'created_at', 'updated_at'];
const EDITABLE = ['title', 'body', 'kind', 'occurred_on', 'contact_id', 'project_id'];
const payloadSql = prefix => `json_object('id',${prefix}.id,'workspace_id',${prefix}.workspace_id,'title',${prefix}.title,'body',${prefix}.body,'kind',${prefix}.kind,'occurred_on',${prefix}.occurred_on,'contact_id',${prefix}.contact_id,'project_id',${prefix}.project_id,'version',${prefix}.version,'deleted',${prefix}.deleted,'created_at',${prefix}.created_at,'updated_at',${prefix}.updated_at)`;

/** Local Markdown originals, with SQLite as the transactional index and durable write queue.
 * No source text is executed; front matter is a small JSON-scalar subset of YAML.
 * Managed filenames are generated UUIDs, never an imported filename or model output.
 */
export function createMarkdownVault(store, domain, options = {}) {
    const enabled = Boolean(options.root || store.path !== ':memory:');
    const root = enabled ? resolve(options.root || join(dirname(store.path), 'memory')) : null;
    const db = store.db;
    let active = false;
    const disabled = () => ({ enabled: false, root: null, workspace_path: null, managed_count: 0, pending_count: 0, issues: [], changed: [] });
    if (!enabled) return { enabled, root, migrate: disabled, flush: disabled, reconcile: disabled, status: disabled, syncSource: () => null, readMarkdown() { throw new AppError('Markdown storage requires a local database path.', 409, 'markdown_disabled'); }, clearWorkspace: disabled };

    function validId(id) { ensure(typeof id === 'string' && UUID.test(id), 'Invalid memory identifier.', 400, 'invalid_input'); return id; }
    function workspace(w) { validId(w); domain.workspace(w); return w; }
    function paths(w, id) {
        validId(w); if (id != null) validId(id);
        const folder = join(root, w), notes = join(folder, 'notes');
        return { folder, notes, file: id == null ? null : join(notes, id + '.md'), index: join(folder, 'MEMORY.md') };
    }
    function stat(path) { try { return lstatSync(path); } catch (e) { if (e.code === 'ENOENT') return null; throw e; } }
    function dir(path, create = false) {
        const s = stat(path);
        if (!s && create) { mkdirSync(path, { recursive: true, mode: 0o700 }); }
        const checked = stat(path);
        ensure(checked && checked.isDirectory() && !checked.isSymbolicLink(), 'The memory folder is missing or is not a regular directory.', 409, 'markdown_invalid');
        chmodSync(path, 0o700);
    }
    function dirs(w, create = false) { const p = paths(w); dir(root, create); dir(p.folder, create); dir(p.notes, create); return p; }
    function read(path) {
        const s = stat(path);
        if (!s) return null;
        ensure(s.isFile() && !s.isSymbolicLink() && s.nlink === 1, 'Memory files must be regular files, not links.', 409, 'markdown_invalid');
        ensure(s.size <= MAX_BYTES, 'The Markdown memory file exceeds 512 KB.', 409, 'markdown_invalid');
        const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
        try {
            const opened = fstatSync(fd);
            ensure(opened.isFile() && opened.nlink === 1 && opened.ino === s.ino && opened.dev === s.dev && opened.size <= MAX_BYTES, 'The memory file changed while being read.', 409, 'markdown_conflict');
            const bytes = readFileSync(fd);
            ensure(bytes.length <= MAX_BYTES, 'The Markdown memory file exceeds 512 KB.', 409, 'markdown_invalid');
            let text; try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { throw new AppError('The Markdown memory file must be valid UTF-8.', 409, 'markdown_invalid'); }
            ensure(!text.includes('\u0000'), 'Memory files cannot contain NUL characters.', 409, 'markdown_invalid');
            chmodSync(path, 0o600);
            return { text, hash: hash(bytes) };
        } finally { closeSync(fd); }
    }
    function serialize(n) {
        ensure(typeof n.body === 'string' && n.body.isWellFormed(), 'This memory contains invalid Unicode. Fix the original text before saving it as UTF-8 Markdown.', 409, 'markdown_invalid');
        const meta = { format: 'threadline-memory', format_version: 1, id: n.id, workspace_id: n.workspace_id, version: n.version, title: n.title, kind: n.kind, occurred_on: n.occurred_on, contact_id: n.contact_id, project_id: n.project_id, created_at: n.created_at, updated_at: n.updated_at };
        return '---\n' + FIELDS.map(k => `${k}: ${JSON.stringify(meta[k])}`).join('\n') + '\n---\n' + n.body;
    }
    function parse(text, n, indexedVersion) {
        const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
        ensure(m && m[0].length < 64 * 1024, 'Keep the Threadline front matter and edit the content below it.', 409, 'markdown_invalid');
        const meta = {};
        for (const line of m[1].split(/\r?\n/)) {
            const pair = /^([a-z_]+): (.+)$/.exec(line);
            ensure(pair && FIELDS.includes(pair[1]) && !(pair[1] in meta), 'The memory front matter contains invalid or repeated fields.', 409, 'markdown_invalid');
            try { meta[pair[1]] = JSON.parse(pair[2]); } catch { throw new AppError('Use JSON values in the memory front matter, for example title: "Meeting notes".', 409, 'markdown_invalid'); }
        }
        ensure(FIELDS.every(k => k in meta) && meta.format === 'threadline-memory' && meta.format_version === 1 && meta.id === n.id && meta.workspace_id === n.workspace_id && meta.version === indexedVersion && meta.created_at === n.created_at && meta.updated_at === n.updated_at, 'Memory identity, version and timestamps must stay unchanged. Edit the title, links, date or body.', 409, 'markdown_invalid');
        ensure(typeof meta.title === 'string' && typeof meta.kind === 'string' && [meta.contact_id, meta.project_id].every(x => x === null || typeof x === 'string' && UUID.test(x)) && (meta.occurred_on === null || typeof meta.occurred_on === 'string'), 'Memory metadata has an invalid value.', 409, 'markdown_invalid');
        return Object.fromEntries(EDITABLE.map(k => [k, k === 'body' ? text.slice(m[0].length) : meta[k]]));
    }
    function issue(w, id, error) {
        const code = ['markdown_missing', 'markdown_conflict', 'markdown_invalid'].includes(error.code) ? error.code : 'markdown_invalid';
        const state = code.slice('markdown_'.length);
        const message = error instanceof AppError ? error.message : 'The local memory file could not be synchronized. Check its permissions and try again.';
        db.prepare('UPDATE markdown_vault_files SET state=?,error_code=?,error=?,updated_at=? WHERE workspace_id=? AND source_id=?').run(state, code, message, now(), w, id);
    }
    function atomic(path, text, expected) {
        const destination = read(path);
        const desired = hash(text);
        if (destination?.hash === desired) return desired; // Recovery after rename committed but SQLite receipt did not.
        ensure((destination?.hash ?? null) === expected, expected === null ? 'A file already exists at this memory path. It was preserved.' : 'This memory changed on disk while an application edit was pending. Both versions were preserved.', 409, 'markdown_conflict');
        const temp = join(dirname(path), `.threadline-${randomUUID()}.tmp`);
        let fd;
        try {
            fd = openSync(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | (constants.O_NOFOLLOW || 0), 0o600);
            writeFileSync(fd, text, 'utf8'); fsyncSync(fd); closeSync(fd); fd = undefined;
            // Recheck after the potentially slow write. No existing external edit is overwritten.
            ensure((read(path)?.hash ?? null) === expected, 'The memory file changed during this save. Both versions were preserved.', 409, 'markdown_conflict');
            renameSync(temp, path);
            const directory = openSync(dirname(path), constants.O_RDONLY); try { fsyncSync(directory); } finally { closeSync(directory); }
            return desired;
        } finally { if (fd !== undefined) closeSync(fd); try { unlinkSync(temp); } catch (e) { if (e.code !== 'ENOENT') throw e; } }
    }
    function initialize() {
        dir(root, true);
        db.exec(`
          CREATE TABLE IF NOT EXISTS markdown_vault_config(singleton INTEGER PRIMARY KEY CHECK(singleton=1),version INTEGER NOT NULL,root TEXT NOT NULL);
          CREATE TABLE IF NOT EXISTS markdown_vault_files(workspace_id TEXT NOT NULL,source_id TEXT NOT NULL,file_hash TEXT,indexed_version INTEGER NOT NULL DEFAULT 0,state TEXT NOT NULL DEFAULT 'pending',error_code TEXT NOT NULL DEFAULT '',error TEXT NOT NULL DEFAULT '',updated_at TEXT NOT NULL,PRIMARY KEY(workspace_id,source_id));
          CREATE TABLE IF NOT EXISTS markdown_vault_outbox(workspace_id TEXT NOT NULL,source_id TEXT NOT NULL,payload TEXT NOT NULL,operation TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,PRIMARY KEY(workspace_id,source_id));
          CREATE TABLE IF NOT EXISTS markdown_vault_indexes(workspace_id TEXT PRIMARY KEY,file_hash TEXT NOT NULL);
        `);
        const config = db.prepare('SELECT * FROM markdown_vault_config WHERE singleton=1').get();
        ensure(!config || config.version === 1 && config.root === root, 'This database already uses a different Markdown vault. Preserve that folder and configure its original path.', 409, 'markdown_root_changed');
        db.prepare('INSERT OR IGNORE INTO markdown_vault_config VALUES(1,1,?)').run(root);
        for (const [operation, prefix] of [['INSERT', 'NEW'], ['UPDATE', 'NEW'], ['DELETE', 'OLD']]) {
            const remove = operation === 'DELETE' ? "'delete'" : `CASE WHEN ${prefix}.deleted=1 THEN 'delete' ELSE 'write' END`;
            db.exec(`CREATE TRIGGER IF NOT EXISTS markdown_vault_note_${operation.toLowerCase()} AFTER ${operation} ON notes BEGIN
              INSERT OR IGNORE INTO markdown_vault_files(workspace_id,source_id,updated_at) VALUES(${prefix}.workspace_id,${prefix}.id,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
              INSERT INTO markdown_vault_outbox(workspace_id,source_id,payload,operation,created_at) VALUES(${prefix}.workspace_id,${prefix}.id,${payloadSql(prefix)},${remove},strftime('%Y-%m-%dT%H:%M:%fZ','now'))
              ON CONFLICT(workspace_id,source_id) DO UPDATE SET payload=excluded.payload,operation=excluded.operation,revision=revision+1;
            END;`);
        }
    }
    initialize();
    function index(w) {
        const p = dirs(w, true), prior = db.prepare('SELECT file_hash FROM markdown_vault_indexes WHERE workspace_id=?').get(w);
        const notes = db.prepare("SELECT n.id,n.title,n.occurred_on FROM notes n JOIN markdown_vault_files f ON f.workspace_id=n.workspace_id AND f.source_id=n.id WHERE n.workspace_id=? AND n.deleted=0 AND f.state='ready' ORDER BY n.occurred_on DESC,n.created_at DESC,n.id").all(w);
        const escape = s => s.replace(/[\\\[\]`*<>\r\n]/g, ' ');
        const text = '# Threadline memory\n\nYour original content lives in the Markdown files below. Edit a source file and refresh Threadline to update its search index. Keep the identity and version fields unchanged.\n\nThis index is generated. Import new files through Threadline; unlisted files are left untouched.\n\n' + notes.map(n => `- [${escape(n.title)}](notes/${n.id}.md)${n.occurred_on ? ' — ' + n.occurred_on : ''}`).join('\n') + '\n';
        try { const digest = atomic(p.index, text, prior?.file_hash ?? null); db.prepare('INSERT INTO markdown_vault_indexes VALUES(?,?) ON CONFLICT(workspace_id) DO UPDATE SET file_hash=excluded.file_hash').run(w, digest); }
        catch { /* The generated convenience index never overwrites an edited/unmanaged index. Source records remain authoritative. */ }
    }
    function result(w, changed = []) {
        if (w != null) workspace(w);
        const scope = w == null ? '' : ' WHERE workspace_id=?';
        const args = w == null ? [] : [w];
        const entries = db.prepare('SELECT * FROM markdown_vault_files' + scope).all(...args);
        return { enabled, root, workspace_path: w == null ? null : paths(w).folder, managed_count: entries.filter(f => f.state !== 'deleted').length, pending_count: db.prepare('SELECT count(*) n FROM markdown_vault_outbox' + scope).get(...args).n, issues: entries.filter(f => f.error_code).map(f => ({ source_id: f.source_id, path: relative(root, paths(f.workspace_id, f.source_id).file), code: f.error_code, message: f.error })), changed };
    }
    function flush(w) {
        if (w != null) workspace(w);
        if (active) return result(w);
        active = true;
        const touched = new Set(), changed = [];
        try {
            const queue = db.prepare('SELECT * FROM markdown_vault_outbox' + (w == null ? '' : ' WHERE workspace_id=?') + ' ORDER BY created_at,source_id').all(...(w == null ? [] : [w]));
            for (const item of queue) {
                try {
                    workspace(item.workspace_id); const p = dirs(item.workspace_id, true), file = join(p.notes, validId(item.source_id) + '.md');
                    const manifest = db.prepare('SELECT * FROM markdown_vault_files WHERE workspace_id=? AND source_id=?').get(item.workspace_id, item.source_id), n = JSON.parse(item.payload);
                    let digest = null;
                    if (item.operation === 'delete') {
                        const current = read(file);
                        ensure(!current || current.hash === manifest.file_hash, 'This removed memory was changed on disk. Its edited file was preserved.', 409, 'markdown_conflict');
                        if (current) unlinkSync(file);
                    } else {
                        // An established, deliberately removed file is never reconstructed from the cache.
                        ensure(manifest.file_hash === null || read(file) !== null, 'This memory file is missing. Restore it from your backup or forget the source in Threadline.', 409, 'markdown_missing');
                        digest = atomic(file, serialize(n), manifest.file_hash);
                    }
                    store.tx(() => {
                        db.prepare("UPDATE markdown_vault_files SET file_hash=?,indexed_version=?,state=?,error_code='',error='',updated_at=? WHERE workspace_id=? AND source_id=?").run(digest, n.version, item.operation === 'delete' ? 'deleted' : 'ready', now(), item.workspace_id, item.source_id);
                        db.prepare('DELETE FROM markdown_vault_outbox WHERE workspace_id=? AND source_id=? AND revision=?').run(item.workspace_id, item.source_id, item.revision);
                    });
                    touched.add(item.workspace_id); changed.push(item.source_id);
                } catch (e) { issue(item.workspace_id, item.source_id, e); }
            }
        } finally { active = false; }
        for (const owner of touched) index(owner);
        return result(w, changed);
    }
    function migrate() {
        store.tx(() => {
            for (const n of db.prepare('SELECT * FROM notes WHERE deleted=0').all()) {
                const added = db.prepare('INSERT OR IGNORE INTO markdown_vault_files(workspace_id,source_id,updated_at) VALUES(?,?,?)').run(n.workspace_id, n.id, now()).changes;
                if (added) db.prepare('INSERT INTO markdown_vault_outbox(workspace_id,source_id,payload,operation,created_at) VALUES(?,?,?,?,?)').run(n.workspace_id, n.id, JSON.stringify(n), 'write', now());
            }
        });
        return flush();
    }
    function reconcile(w) {
        workspace(w);
        if (active) return result(w);
        const initial = flush(w), changed = [...initial.changed];
        active = true;
        try {
            for (const manifest of db.prepare("SELECT * FROM markdown_vault_files WHERE workspace_id=? AND state<>'deleted'").all(w)) {
                if (db.prepare('SELECT 1 FROM markdown_vault_outbox WHERE workspace_id=? AND source_id=?').get(w, manifest.source_id)) continue;
                try {
                    dirs(w); const file = paths(w, manifest.source_id).file, current = read(file);
                    ensure(current, 'This memory file is missing. Restore it from your backup or forget the source in Threadline.', 409, 'markdown_missing');
                    const n = domain.row('notes', w, manifest.source_id);
                    if (current.hash !== manifest.file_hash) {
                        ensure(n.version === manifest.indexed_version, 'The source changed in Threadline and on disk. Both versions were preserved.', 409, 'markdown_conflict');
                        const patch = parse(current.text, n, manifest.indexed_version);
                        store.tx(() => {
                            db.prepare("UPDATE markdown_vault_files SET file_hash=?,state='ready',error_code='',error='' WHERE workspace_id=? AND source_id=?").run(current.hash, w, n.id);
                            domain.editNote(w, n.id, { ...patch, version: n.version });
                        });
                        changed.push(n.id);
                    } else db.prepare("UPDATE markdown_vault_files SET state='ready',error_code='',error='' WHERE workspace_id=? AND source_id=?").run(w, n.id);
                } catch (e) { issue(w, manifest.source_id, e); }
            }
        } finally { active = false; }
        flush(w); return result(w, [...new Set(changed)]);
    }
    function syncSource(w, id) {
        workspace(w); validId(id); domain.row('notes', w, id);
        reconcile(w);
        const f = db.prepare('SELECT * FROM markdown_vault_files WHERE workspace_id=? AND source_id=?').get(w, id);
        const pending = db.prepare('SELECT 1 FROM markdown_vault_outbox WHERE workspace_id=? AND source_id=?').get(w, id);
        const current = domain.row('notes', w, id);
        ensure(f && f.state === 'ready' && !f.error_code && !pending && f.indexed_version === current.version, f?.error || 'This memory has not yet been saved to Markdown.', 409, f?.error_code || 'markdown_pending');
        return { id, version: f.indexed_version, path: relative(root, paths(w, id).file), hash: f.file_hash };
    }
    function readMarkdown(w, id) { const source = syncSource(w, id); dirs(w); const content = read(paths(w, id).file); ensure(content && content.hash === source.hash, 'The memory file changed. Refresh and try again.', 409, 'markdown_conflict'); return { ...source, markdown: content.text }; }
    function clearWorkspace(w) {
        validId(w); const p = paths(w), issues = [];
        // Delete only paths in the managed manifest. Never walk or remove user-added files.
        for (const f of db.prepare('SELECT source_id FROM markdown_vault_files WHERE workspace_id=?').all(w)) {
            try {
                if ([root, p.folder, p.notes].some(path => stat(path) === null)) continue;
                dirs(w); const path = paths(w, f.source_id).file; if (read(path)) unlinkSync(path);
            }
            catch (e) { issues.push({ source_id: f.source_id, code: e.code || 'markdown_invalid', message: e instanceof AppError ? e.message : 'Could not remove this managed file.' }); }
        }
        const generated = db.prepare('SELECT file_hash FROM markdown_vault_indexes WHERE workspace_id=?').get(w);
        if (generated) try { dirs(w); const content = read(p.index); if (content?.hash === generated.file_hash) unlinkSync(p.index); } catch { }
        if (!issues.length) store.tx(() => { db.prepare('DELETE FROM markdown_vault_outbox WHERE workspace_id=?').run(w); db.prepare('DELETE FROM markdown_vault_files WHERE workspace_id=?').run(w); db.prepare('DELETE FROM markdown_vault_indexes WHERE workspace_id=?').run(w); });
        for (const folder of [p.notes, p.folder]) try { if (stat(folder)?.isDirectory() && !stat(folder).isSymbolicLink() && readdirSync(folder).length === 0) rmdirSync(folder); } catch { }
        return { enabled, cleared: issues.length === 0, issues };
    }
    return { enabled, root, migrate, flush, reconcile, syncSource, readMarkdown, status: result, clearWorkspace };
}
