import { ensure, hash, now, oneOf, only, uid } from './util.js';

const maxFiles = 50, maxTotalBytes = 4 * 1024 * 1024, maxFileBytes = 1024 * 1024;
const names = { codex: 'Codex', claude: 'Claude' };
const codepoints = value => [...value].length;
const brief = value => [...value].slice(0, 360).join('');
function splitContent(content) {
    const points = [...content], parts = [];
    for (let offset = 0; offset < points.length;) {
        let end = Math.min(points.length, offset + 90000);
        if (end < points.length) {
            const newline = points.slice(offset, end).lastIndexOf('\n');
            if (newline >= 45000) end = offset + newline + 1;
        }
        const body = points.slice(offset, end).join('');
        parts.push({ body, hash: hash(body) });
        offset = end;
    }
    return parts;
}

function relativePath(value) {
    ensure(typeof value === 'string' && value.length > 0 && codepoints(value) <= 1024, 'Choose a relative file path of 1–1,024 characters.');
    ensure(!/^[\/\\~]/.test(value) && !/^[A-Za-z]:/.test(value) && !/[\\\u0000-\u001f\u007f]/.test(value), 'Import paths must be relative and contain no control characters.');
    ensure(value.split('/').every(part => part && part !== '.' && part !== '..'), 'Import paths cannot contain empty, dot or parent-directory segments.');
    return value;
}

/** Selected UTF-8 text is supplied by the browser. This module never reads a host path. */
export function createMemoryImport(store, domain, memory) {
    const db = store.db;
    store.tx(() => db.exec(`
      CREATE TABLE IF NOT EXISTS memory_imports(
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        provider TEXT NOT NULL CHECK(provider IN('codex','claude')),
        path TEXT NOT NULL, content_hash TEXT NOT NULL, part_hash TEXT NOT NULL,
        part_index INTEGER NOT NULL, part_count INTEGER NOT NULL,
        source_id TEXT NOT NULL, source_version INTEGER NOT NULL,
        previous_source_id TEXT, imported_at TEXT NOT NULL,
        UNIQUE(workspace_id,provider,path,content_hash,part_index,source_id),
        FOREIGN KEY(workspace_id,source_id) REFERENCES notes(workspace_id,id) ON DELETE CASCADE,
        FOREIGN KEY(workspace_id,previous_source_id) REFERENCES notes(workspace_id,id)
      );
      CREATE INDEX IF NOT EXISTS memory_imports_content ON memory_imports(workspace_id,provider,content_hash);
      CREATE INDEX IF NOT EXISTS memory_imports_path ON memory_imports(workspace_id,provider,path,imported_at);
      CREATE TRIGGER IF NOT EXISTS memory_import_forget AFTER UPDATE OF deleted ON notes
      WHEN NEW.deleted=1 BEGIN
        DELETE FROM memory_imports WHERE workspace_id=NEW.workspace_id AND source_id=NEW.id;
        UPDATE memory_imports SET previous_source_id=NULL WHERE workspace_id=NEW.workspace_id AND previous_source_id=NEW.id;
      END;
    `));

    function owner(w) {
        ensure(typeof w === 'string' && db.prepare('SELECT id FROM workspaces WHERE id=?').get(w), 'Workspace not found.', 404, 'not_found');
    }

    function prepare(w, input, committing = false) {
        owner(w);
        only(input, committing ? ['provider', 'files', 'preview_hash', 'selected', 'confirm'] : ['provider', 'files']);
        const provider = oneOf(input.provider, ['codex', 'claude'], 'memory provider');
        ensure(Array.isArray(input.files) && input.files.length >= 1 && input.files.length <= maxFiles, 'Select 1–50 Markdown or text files.');
        const seen = new Set();
        let total = 0;
        const files = input.files.map(file => {
            only(file, ['path', 'content']);
            const path = relativePath(file.path);
            ensure(!seen.has(path), 'A file path was selected more than once.');
            seen.add(path);
            ensure(typeof file.content === 'string', 'Each selected file must contain text.');
            const content = file.content, bytes = Buffer.byteLength(content, 'utf8'), characters = codepoints(content);
            total += bytes;
            let reason = !/\.(md|txt)$/i.test(path) ? 'Only .md and .txt memory files can be imported.'
                : !content.trim() ? 'This file is empty.'
                : /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(content) || !content.isWellFormed() || content.includes('\ufffd') ? 'This file contains binary or invalid text. Export it as UTF-8 text first.'
                : bytes > maxFileBytes ? 'Each original file must be at most 1 MiB.' : '';
            const title = [...`${names[provider]} · ${path.split('/').at(-1)}`].slice(0, 200).join('');
            let chunks = reason ? [] : splitContent(content);
            // Canonical notes must each contain non-whitespace text. Do not silently trim
            // a huge blank segment merely to make it fit the source store's constraints.
            if (chunks.some(part => !part.body.trim())) {
                reason = 'A very large blank section cannot be stored losslessly as a source part. Select a smaller text file.';
                chunks = [];
            }
            return { path, content, hash: hash(content), title, bytes, characters, reason, chunks };
        });
        ensure(total <= maxTotalBytes, 'Selected memory files must total at most 4 MiB.');
        // The digest binds exactly the selected bytes and paths, not a transient database state.
        // A repeated commit can therefore safely re-evaluate current sources and deduplicate.
        const preview_hash = hash(JSON.stringify({ version: 1, workspace: w, provider,
            files: files.map(({ path, hash }) => ({ path, hash })).sort((a, b) => a.path.localeCompare(b.path)) }));
        return { provider, files, preview_hash };
    }

    function matchingPart(w, provider, file, part, index) {
        return db.prepare(`SELECT n.id,n.title,n.version FROM memory_imports i JOIN notes n
            ON n.workspace_id=i.workspace_id AND n.id=i.source_id
            WHERE i.workspace_id=? AND i.provider=? AND i.content_hash=? AND i.part_index=?
            AND i.part_hash=? AND n.deleted=0 AND n.body_hash=?
            ORDER BY i.imported_at DESC,i.rowid DESC LIMIT 1`).get(w, provider, file.hash, index + 1, part.hash, part.hash)
            || db.prepare(`SELECT id,title,version FROM notes WHERE workspace_id=? AND body_hash=?
                AND deleted=0 AND project_id IS NULL AND contact_id IS NULL ORDER BY created_at,id LIMIT 1`).get(w, part.hash);
    }
    function previousPart(w, provider, file, index) {
        return db.prepare(`SELECT n.id FROM memory_imports i JOIN notes n
            ON n.workspace_id=i.workspace_id AND n.id=i.source_id
            WHERE i.workspace_id=? AND i.provider=? AND i.path=? AND i.part_index=?
            AND n.deleted=0 ORDER BY i.imported_at DESC,i.rowid DESC LIMIT 1`).get(w, provider, file.path, index + 1);
    }
    function classify(w, provider, file) {
        const base = { path: file.path, hash: file.hash, title: file.title, characters: file.characters, bytes: file.bytes,
            parts: file.chunks.length, excerpt: file.reason ? '' : brief(file.content) };
        if (file.reason) return { ...base, status: 'blocked', reason: file.reason };
        const matches = file.chunks.map((part, index) => matchingPart(w, provider, file, part, index));
        if (matches.every(Boolean)) return { ...base, status: 'duplicate', source_id: matches[0].id,
            source_ids: matches.map(part => part.id), reason: 'This exact content is already saved. Confirmation retains its import provenance.' };
        const previous = previousPart(w, provider, file, 0);
        return { ...base, status: previous ? 'changed' : 'new', ...(previous ? { previous_source_id: previous.id,
            reason: 'This path has changed or has a missing part. Importing preserves existing sources and saves only missing content.' } : {}) };
    }

    const publicRow = row => ({ provider: row.provider, path: row.path, hash: row.content_hash, source_id: row.source_id,
        part_hash: row.part_hash, part_index: row.part_index, part_count: row.part_count,
        source_version: row.source_version, previous_source_id: row.previous_source_id, imported_at: row.imported_at,
        current_source_version: row.current_source_version, content_unchanged: row.current_hash === row.part_hash, edited_since_import: row.current_source_version !== row.source_version });
    const provenanceSql = `SELECT i.*,n.version AS current_source_version,n.body_hash AS current_hash
        FROM memory_imports i JOIN notes n ON n.workspace_id=i.workspace_id AND n.id=i.source_id`;

    return {
        preview(w, input) {
            const prepared = prepare(w, input);
            const files = prepared.files.map(file => classify(w, prepared.provider, file));
            const totals = { files: files.length, new: 0, changed: 0, duplicate: 0, blocked: 0, characters: 0, bytes: 0 };
            for (const file of files) { totals[file.status]++; totals.characters += file.characters; totals.bytes += file.bytes; }
            return { provider: prepared.provider, preview_hash: prepared.preview_hash, files, totals };
        },
        commit(w, input) {
            const prepared = prepare(w, input, true);
            ensure(input.confirm === true, 'Confirm the selected files before importing.');
            ensure(typeof input.preview_hash === 'string' && input.preview_hash === prepared.preview_hash, 'The selected content changed. Preview it again before importing.', 409, 'stale_import_preview');
            ensure(Array.isArray(input.selected) && input.selected.length >= 1 && input.selected.length <= maxFiles, 'Select at least one previewed file to import.');
            const selections = new Set(), byPath = new Map(prepared.files.map(file => [file.path, file]));
            for (const selected of input.selected) {
                only(selected, ['path', 'hash']);
                const file = byPath.get(selected.path);
                ensure(file && selected.hash === file.hash, 'Select only the files and content shown in this preview.', 409, 'stale_import_preview');
                ensure(!selections.has(selected.path), 'A file was selected more than once.');
                ensure(!file.reason, 'A blocked file cannot be imported.');
                selections.add(selected.path);
            }
            return store.tx(() => {
                const files = [];
                for (const file of prepared.files.filter(file => selections.has(file.path))) {
                    for (const [index, part] of file.chunks.entries()) {
                        const existing = matchingPart(w, prepared.provider, file, part, index);
                        const previous = previousPart(w, prepared.provider, file, index);
                        const title = file.chunks.length > 1 ? [...file.title].slice(0, 175).join('') + ` · Part ${index + 1}/${file.chunks.length}` : file.title;
                        const source = existing ? memory.getSource(w, existing.id) : memory.ingest(w, {
                            title, body: part.body, origin: 'import'
                        }).source;
                        const previousId = previous && previous.id !== source.id ? previous.id : null;
                        const already = db.prepare(`SELECT id FROM memory_imports WHERE workspace_id=? AND provider=?
                            AND path=? AND content_hash=? AND part_index=? AND source_id=?`).get(w, prepared.provider, file.path, file.hash, index + 1, source.id);
                        if (!already) db.prepare(`INSERT INTO memory_imports(id,workspace_id,provider,path,content_hash,part_hash,
                            part_index,part_count,source_id,source_version,previous_source_id,imported_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(
                            uid(), w, prepared.provider, file.path, file.hash, part.hash, index + 1, file.chunks.length,
                            source.id, source.version, previousId, now());
                        files.push({ path: file.path, hash: file.hash, title: source.title, status: existing ? 'existing' : 'imported',
                            part_hash: part.hash, part_index: index + 1, part_count: file.chunks.length, source_id: source.id,
                            ...(previousId ? { previous_source_id: previousId } : {}) });
                    }
                }
                const imported = files.filter(file => file.status === 'imported');
                const skipped = files.filter(file => file.status === 'existing').map(file => ({ ...file, reason: 'Exact content already saved; import provenance retained.' }));
                return { provider: prepared.provider, files, imported, skipped, totals: { imported: imported.length, existing: skipped.length, skipped: skipped.length } };
            });
        },
        provenance(w, sourceId) {
            // Reading import metadata cannot reveal another workspace or forgotten source.
            memory.getSource(w, sourceId);
            return db.prepare(`${provenanceSql} WHERE i.workspace_id=? AND i.source_id=? AND n.deleted=0 ORDER BY i.imported_at,i.path,i.part_index`).all(w, sourceId).map(publicRow);
        },
        sources(w) {
            owner(w);
            const result = Object.create(null);
            for (const row of db.prepare(`${provenanceSql} WHERE i.workspace_id=? AND n.deleted=0 ORDER BY i.imported_at,i.path,i.part_index`).all(w)) {
                (result[row.source_id] ||= []).push(publicRow(row));
            }
            return result;
        }
    };
}
