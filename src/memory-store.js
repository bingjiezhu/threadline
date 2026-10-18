import { ensure, now, oneOf, only, quoteSpan, text, topic, uid, version } from './util.js';

export const memoryKinds = ['fact', 'preference', 'decision', 'commitment', 'goal', 'open_question'];
const origins = ['web', 'photon', 'asi', 'import'];
const activeStatuses = new Set(['proposed', 'confirmed']);
const stopWords = new Set('a an and are as at be before can could did do does for from give had has have how i in is it me my of on or please remember should tell that the their them there they this to was were what when where which who why will with would you your'.split(' '));
const normalize = value => String(value || '').normalize('NFKC').toLocaleLowerCase('en-US');
const words = value => [...new Set((normalize(value).match(/[\p{L}\p{N}]+/gu) || []).filter(v => v.length > 1 && !stopWords.has(v)))].slice(0, 40);
const excerpt = (body, terms, length = 800) => {
    const lower = normalize(body);
    const positions = terms.map(term => lower.indexOf(term)).filter(n => n >= 0);
    const start = Math.max(0, (positions.length ? Math.min(...positions) : 0) - 100);
    return body.slice(start, start + length);
};

/** Persistent derived memory over the existing owner-scoped notes; no second note store. */
export function createMemoryStore(store, domain) {
    const db = store.db;
    const existing = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='personal_memory_meta'").get();
    if (existing) {
        const rows = db.prepare('SELECT version FROM personal_memory_meta').all();
        ensure(rows.length === 1 && rows[0].version === 1, 'Unsupported personal memory schema.', 409, 'unsupported_memory_schema');
    }
    store.tx(() => db.exec(`
      CREATE TABLE IF NOT EXISTS personal_memory_meta(version INTEGER NOT NULL);
      INSERT INTO personal_memory_meta SELECT 1 WHERE NOT EXISTS(SELECT 1 FROM personal_memory_meta);
      CREATE TABLE IF NOT EXISTS memory_sources(
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        source_id TEXT NOT NULL, origin TEXT NOT NULL, created_at TEXT NOT NULL,
        PRIMARY KEY(workspace_id,source_id),
        FOREIGN KEY(workspace_id,source_id) REFERENCES notes(workspace_id,id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS memory_items(
        id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        source_id TEXT NOT NULL, source_version INTEGER NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN('fact','preference','decision','commitment','goal','open_question')),
        text TEXT NOT NULL, quote TEXT NOT NULL, topic TEXT NOT NULL,
        start_cp INTEGER NOT NULL, end_cp INTEGER NOT NULL,
        contact_id TEXT, project_id TEXT,
        status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN('proposed','confirmed','rejected','superseded','stale','forgotten')),
        prior_status TEXT, stale_reason TEXT NOT NULL DEFAULT '',
        provider TEXT NOT NULL DEFAULT '', model TEXT NOT NULL DEFAULT '', run_id TEXT NOT NULL DEFAULT '',
        replaces_id TEXT, superseded_by TEXT,
        version INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        UNIQUE(workspace_id,id),
        FOREIGN KEY(workspace_id,source_id) REFERENCES notes(workspace_id,id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS memory_items_source ON memory_items(workspace_id,source_id,source_version);
      CREATE INDEX IF NOT EXISTS memory_items_topic ON memory_items(workspace_id,topic,status);
      CREATE TABLE IF NOT EXISTS memory_history(
        id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        item_id TEXT, source_id TEXT NOT NULL, action TEXT NOT NULL, version INTEGER,
        related_id TEXT, created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS memory_history_owner ON memory_history(workspace_id,source_id,created_at);
      CREATE TRIGGER IF NOT EXISTS memory_note_revised AFTER UPDATE OF version,deleted ON notes
      WHEN NEW.version<>OLD.version OR NEW.deleted<>OLD.deleted BEGIN
        UPDATE memory_items SET prior_status=status,
          status=CASE WHEN NEW.deleted=1 THEN 'forgotten' ELSE 'stale' END,
          text='',quote='',topic='',start_cp=0,end_cp=0,
          stale_reason=CASE WHEN NEW.deleted=1 THEN 'The source was forgotten.' ELSE 'The source changed. Organize its current version again.' END,
          contact_id=CASE WHEN NEW.deleted=1 THEN NULL ELSE contact_id END,
          project_id=CASE WHEN NEW.deleted=1 THEN NULL ELSE project_id END,
          version=version+1,updated_at=NEW.updated_at
        WHERE workspace_id=NEW.workspace_id AND source_id=NEW.id AND status<>'forgotten';
      END;
      CREATE TRIGGER IF NOT EXISTS memory_contact_deleted BEFORE DELETE ON contacts BEGIN
        UPDATE memory_items SET prior_status=status,status='stale',contact_id=NULL,
          text='',quote='',topic='',start_cp=0,end_cp=0,
          stale_reason='The linked person was deleted.',version=version+1
        WHERE workspace_id=OLD.workspace_id AND contact_id=OLD.id AND status<>'forgotten';
      END;
      CREATE TRIGGER IF NOT EXISTS memory_project_deleted BEFORE DELETE ON projects BEGIN
        UPDATE memory_items SET prior_status=status,status='stale',project_id=NULL,
          text='',quote='',topic='',start_cp=0,end_cp=0,
          stale_reason='The linked project was deleted.',version=version+1
        WHERE workspace_id=OLD.workspace_id AND project_id=OLD.id AND status<>'forgotten';
      END;
    `));

    const owner = w => {
        ensure(typeof w === 'string' && db.prepare('SELECT id FROM workspaces WHERE id=?').get(w), 'Workspace not found.', 404, 'not_found');
    };
    const history = (w, sourceId, action, item = null, relatedId = null) => db.prepare('INSERT INTO memory_history VALUES(?,?,?,?,?,?,?,?)').run(uid(), w, item?.id || null, sourceId, action, item?.version || null, relatedId, now());
    const sourceSql = `SELECT n.*,COALESCE(ms.origin,'existing') AS origin,
      c.name AS contact_name,p.name AS project_name,p.contact_id AS project_contact_id,pc.name AS project_contact_name
      FROM notes n LEFT JOIN memory_sources ms ON ms.workspace_id=n.workspace_id AND ms.source_id=n.id
      LEFT JOIN contacts c ON c.workspace_id=n.workspace_id AND c.id=n.contact_id
      LEFT JOIN projects p ON p.workspace_id=n.workspace_id AND p.id=n.project_id
      LEFT JOIN contacts pc ON pc.workspace_id=n.workspace_id AND pc.id=p.contact_id`;
    function source(w, id, includeDeleted = false) {
        owner(w);
        const n = db.prepare(`${sourceSql} WHERE n.workspace_id=? AND n.id=?`).get(w, id);
        ensure(n && (includeDeleted || !n.deleted), 'Memory source not found.', 404, 'not_found');
        return { ...n, source_id: n.id, source_version: n.version };
    }
    const itemSql = `SELECT m.*,n.title AS source_title,n.occurred_on,n.version AS current_source_version,n.deleted AS source_deleted,
          n.contact_id AS current_contact_id,n.project_id AS current_project_id,np.contact_id AS current_project_contact_id,
          c.name AS contact_name,p.name AS project_name FROM memory_items m
          JOIN notes n ON n.workspace_id=m.workspace_id AND n.id=m.source_id
          LEFT JOIN contacts c ON c.workspace_id=m.workspace_id AND c.id=m.contact_id
          LEFT JOIN projects p ON p.workspace_id=m.workspace_id AND p.id=m.project_id
          LEFT JOIN projects np ON np.workspace_id=n.workspace_id AND np.id=n.project_id`;
    function decorateItem(r) {
        const contextMatches = r.contact_id === (r.current_contact_id || r.current_project_contact_id || null) && r.project_id === r.current_project_id;
        const valid = !r.source_deleted && contextMatches && r.source_version === r.current_source_version && !['stale', 'forgotten'].includes(r.status);
        const status = r.source_deleted ? 'forgotten' : !valid ? 'stale' : r.status;
        return { ...r, status, valid, text: valid ? r.text : '', quote: valid ? r.quote : '', topic: valid ? r.topic : '', stale_reason: !contextMatches ? 'The linked context changed. Organize this source again.' : r.stale_reason, provenance: { provider: r.provider, model: r.model, run_id: r.run_id } };
    }
    function item(w, id) {
        owner(w);
        const r = db.prepare(`${itemSql} WHERE m.workspace_id=? AND m.id=?`).get(w, id);
        ensure(r, 'Memory item not found.', 404, 'not_found');
        return decorateItem(r);
    }
    function checkCurrent(w, memory) {
        const n = source(w, memory.source_id);
        ensure(memory.valid && n.version === memory.source_version, 'The source changed. Organize its current version again.', 409, 'stale_memory');
        quoteSpan(n.body, memory.quote);
        const cid = n.contact_id || n.project_contact_id || null;
        ensure(memory.contact_id === cid && memory.project_id === n.project_id, 'The linked context changed. Organize this source again.', 409, 'stale_memory');
        return n;
    }
    const allItems = w => db.prepare(`${itemSql} WHERE m.workspace_id=? ORDER BY m.created_at DESC,m.id`).all(w).map(decorateItem);

    const api = {
        getSource: source,
        state(w) {
            owner(w);
            const sources = db.prepare(`${sourceSql} WHERE n.workspace_id=? AND n.deleted=0 ORDER BY COALESCE(n.occurred_on,n.created_at) DESC,n.id`).all(w);
            const items = allItems(w);
            const active = items.filter(m => m.valid && activeStatuses.has(m.status));
            const groups = new Map();
            for (const m of active) {
                const key = JSON.stringify([m.contact_id, m.project_id, m.topic, m.kind]);
                if (!groups.has(key)) groups.set(key, []);
                groups.get(key).push(m);
            }
            const conflicts = [...groups.values()].filter(group => group[0].topic !== 'source-note' && new Set(group.map(m => m.source_id)).size > 1 && new Set(group.map(m => normalize(m.text))).size > 1).map(group => ({
                kind: group[0].kind, topic: group[0].topic, contact_id: group[0].contact_id, project_id: group[0].project_id,
                item_ids: group.map(m => m.id), status: 'needs_review',
                reason: 'Different statements share a topic and context. Compare their sources; they may coexist or need an explicit replacement.'
            }));
            const counts = (key, id) => ({
                source_count: sources.filter(n => key === 'contact_id' ? (n.contact_id || n.project_contact_id) === id : n[key] === id).length,
                item_count: active.filter(m => m[key] === id).length,
                topics: [...new Set(active.filter(m => m[key] === id).map(m => m.topic))]
            });
            const relationships = {
                contacts: db.prepare('SELECT id,name,company,role,archived FROM contacts WHERE workspace_id=? ORDER BY name').all(w).map(c => ({ ...c, ...counts('contact_id', c.id) })),
                projects: db.prepare('SELECT id,name,contact_id,status,goal FROM projects WHERE workspace_id=? ORDER BY name').all(w).map(p => ({ ...p, ...counts('project_id', p.id) })),
                topics: [...new Set(active.map(m => m.topic))].map(t => ({ topic: t, item_ids: active.filter(m => m.topic === t).map(m => m.id), source_ids: [...new Set(active.filter(m => m.topic === t).map(m => m.source_id))] }))
            };
            const stats = { source_count: sources.length, item_count: items.length, conflict_count: conflicts.length };
            for (const status of ['proposed', 'confirmed', 'rejected', 'superseded', 'stale', 'forgotten']) stats[status] = items.filter(m => m.status === status).length;
            return {
                sources: sources.map(({ body, body_hash, ...n }) => ({ ...n, source_id: n.id, source_version: n.version, excerpt: body.slice(0, 400), item_count: items.filter(m => m.source_id === n.id && m.valid).length })),
                items, stats, relationships, conflicts,
                history: db.prepare('SELECT * FROM memory_history WHERE workspace_id=? ORDER BY created_at DESC,id LIMIT 100').all(w)
            };
        },
        ingest(w, input) {
            owner(w);
            only(input, ['title', 'body', 'occurred_on', 'contact_id', 'project_id', 'origin']);
            const origin = oneOf(input.origin || 'web', origins, 'memory origin');
            return store.tx(() => {
                const { origin: ignored, ...note } = input;
                const n = domain.createNote(w, note);
                db.prepare('INSERT INTO memory_sources VALUES(?,?,?,?)').run(w, n.id, origin, now());
                history(w, n.id, 'source.saved');
                return { source: source(w, n.id) };
            });
        },
        retrieve(w, input = {}) {
            owner(w);
            only(input, ['query', 'limit', 'contact_id', 'project_id']);
            const query = text(input.query ?? '', 'Memory query', 2000, false);
            const limit = input.limit ?? 8;
            ensure(Number.isInteger(limit) && limit > 0 && limit <= 25, 'Choose a retrieval limit from 1 to 25.');
            if (input.contact_id) domain.row('contacts', w, input.contact_id);
            if (input.project_id) domain.row('projects', w, input.project_id);
            const terms = words(query);
            const all = allItems(w);
            const memories = all.filter(m => m.valid && m.status === 'confirmed');
            const notes = db.prepare(`${sourceSql} WHERE n.workspace_id=? AND n.deleted=0`).all(w);
            const hits = [];
            for (const n of notes) {
                if (input.contact_id && (n.contact_id || n.project_contact_id) !== input.contact_id) continue;
                if (input.project_id && n.project_id !== input.project_id) continue;
                const linked = memories.filter(m => m.source_id === n.id && m.source_version === n.version);
                const fields = [[n.title, 6], [n.body, 2], [n.contact_name || n.project_contact_name, 8], [n.project_name, 6], [linked.map(m => `${m.text} ${m.topic}`).join(' '), 4]];
                let score = terms.reduce((total, term) => total + fields.reduce((sum, [value, weight]) => sum + (normalize(value).includes(term) ? weight : 0), 0), 0);
                if (!query.trim() && (input.contact_id || input.project_id)) score = 1;
                if (score <= 0) continue;
                const matching = linked.find(m => terms.some(t => normalize(`${m.text} ${m.topic}`).includes(t)));
                const bodyExcerpt = excerpt(n.body, terms);
                hits.push({ source_id: n.id, title: n.title, quote: matching?.quote || bodyExcerpt, body_excerpt: bodyExcerpt,
                    occurred_on: n.occurred_on, source_version: n.version, contact_id: n.contact_id || n.project_contact_id || null,
                    project_id: n.project_id, contact_name: n.contact_name || n.project_contact_name, project_name: n.project_name,
                    origin: n.origin, score, items: linked,
                    history: all.filter(m => m.valid && m.source_id === n.id && m.status === 'superseded').map(m => ({ item_id: m.id, status: 'superseded', quote: m.quote, superseded_by: m.superseded_by })),
                    evidence_status: linked.length ? 'contains_confirmed_memory' : 'source_only' });
            }
            hits.sort((a, b) => b.score - a.score || (b.occurred_on || '').localeCompare(a.occurred_on || '') || a.source_id.localeCompare(b.source_id));
            return { hits: hits.slice(0, limit), method: 'lexical-and-linked-memory' };
        },
        propose(w, sourceId, input, provenance = {}) {
            owner(w);
            only(input, ['source_version', 'items']);
            only(provenance, ['provider', 'model', 'run_id']);
            ensure(Array.isArray(input.items) && input.items.length <= 50, 'Provide up to 50 proposed memories.');
            const prov = { provider: text(provenance.provider, 'Provider', 100, false), model: text(provenance.model, 'Model', 200, false), run_id: text(provenance.run_id, 'Run ID', 200, false) };
            return store.tx(() => {
                const n = source(w, sourceId);
                version(n, input.source_version);
                const normalized = input.items.map(value => {
                    only(value, ['kind', 'text', 'quote', 'topic', 'contact_id', 'project_id']);
                    const span = quoteSpan(n.body, value.quote);
                    const cid = n.contact_id || n.project_contact_id || null;
                    if (value.contact_id) domain.row('contacts', w, value.contact_id);
                    if (value.project_id) domain.row('projects', w, value.project_id);
                    ensure(!value.contact_id || value.contact_id === cid, 'A proposed memory must retain the source person.', 422, 'invalid_memory_context');
                    ensure(!value.project_id || value.project_id === n.project_id, 'A proposed memory must retain the source project.', 422, 'invalid_memory_context');
                    const t = topic(value.topic);
                    ensure(t, 'A proposed memory needs a topic.');
                    return { kind: oneOf(value.kind, memoryKinds, 'memory kind'), text: text(value.text, 'Memory text', 4000), quote: value.quote, topic: t,
                        start_cp: span.start, end_cp: span.end, contact_id: cid, project_id: n.project_id };
                });
                const ids = [];
                for (const value of normalized) {
                    const old = db.prepare('SELECT id FROM memory_items WHERE workspace_id=? AND source_id=? AND source_version=? AND kind=? AND topic=? AND quote=?').get(w, sourceId, n.version, value.kind, value.topic, value.quote);
                    if (old) { ids.push(old.id); continue; }
                    ensure(db.prepare('SELECT COUNT(*) AS count FROM memory_items WHERE workspace_id=?').get(w).count < 10000, 'This workspace supports up to 10,000 memory items.', 409, 'workspace_limit');
                    const id = uid(), stamp = now();
                    db.prepare(`INSERT INTO memory_items(id,workspace_id,source_id,source_version,kind,text,quote,topic,start_cp,end_cp,contact_id,project_id,provider,model,run_id,created_at,updated_at)
                      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, w, sourceId, n.version, value.kind, value.text, value.quote, value.topic, value.start_cp, value.end_cp, value.contact_id, value.project_id, prov.provider, prov.model, prov.run_id, stamp, stamp);
                    ids.push(id);
                    history(w, sourceId, 'memory.proposed', { id, version: 1 });
                }
                return { items: [...new Set(ids)].map(id => item(w, id)) };
            });
        },
        review(w, id, input) {
            only(input, ['version', 'decision']);
            const decision = oneOf(input.decision, ['confirm', 'reject'], 'memory decision');
            return store.tx(() => {
                const m = item(w, id);
                version(m, input.version);
                checkCurrent(w, m);
                ensure(m.status === 'proposed', 'This memory is no longer awaiting review.', 409, 'memory_not_pending');
                db.prepare('UPDATE memory_items SET status=?,version=version+1,updated_at=? WHERE workspace_id=? AND id=?').run(decision === 'confirm' ? 'confirmed' : 'rejected', now(), w, id);
                const result = item(w, id);
                history(w, result.source_id, `memory.${decision}`, result);
                return result;
            });
        },
        supersede(w, id, input) {
            only(input, ['version', 'replaces_id']);
            return store.tx(() => {
                const m = item(w, id), old = item(w, input.replaces_id);
                version(m, input.version);
                const n = checkCurrent(w, m), oldSource = checkCurrent(w, old);
                ensure(id !== old.id && m.status === 'confirmed' && old.status === 'confirmed', 'Replacement requires two different confirmed memories.', 409, 'invalid_memory_replacement');
                ensure(!m.replaces_id && !old.superseded_by, 'This replacement was already recorded.', 409, 'invalid_memory_replacement');
                ensure(m.kind === old.kind && m.topic === old.topic && m.contact_id === old.contact_id && m.project_id === old.project_id, 'Replacement must keep the same kind, topic, person and project.', 422, 'invalid_memory_replacement');
                ensure(n.occurred_on && oldSource.occurred_on && n.occurred_on > oldSource.occurred_on, 'The replacement needs a later source event date.', 422, 'invalid_memory_replacement');
                db.prepare("UPDATE memory_items SET status='superseded',superseded_by=?,version=version+1,updated_at=? WHERE workspace_id=? AND id=?").run(id, now(), w, old.id);
                db.prepare('UPDATE memory_items SET replaces_id=?,version=version+1,updated_at=? WHERE workspace_id=? AND id=?').run(old.id, now(), w, id);
                const result = item(w, id);
                history(w, m.source_id, 'memory.replaced', result, old.id);
                return result;
            });
        },
        forgetSource(w, noteId, input) {
            only(input, ['version']);
            return store.tx(() => {
                source(w, noteId);
                const result = domain.deleteNote(w, noteId, input);
                history(w, noteId, 'source.forgotten');
                return { ...result, source_id: noteId };
            });
        }
    };
    return api;
}
