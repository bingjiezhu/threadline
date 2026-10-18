import { migrateWarm } from './warm-schema.js';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
export function openStore(path = process.env.THREADLINE_DB || '.data/threadline.sqlite') {
    if (path !== ':memory:') {
        path = resolve(path);
        mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    }
    const db = new DatabaseSync(path);
    // Refuse incompatible databases before any schema or job-state mutation.
    const meta = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='schema_meta'").get();
    if (meta) {
        const v = db.prepare('SELECT version FROM schema_meta').all();
        if (v.length !== 1 || ![1, 2, 3].includes(v[0].version)) {
            db.close();
            throw new Error('Unsupported database schema. Preserve this database and follow the migration guide.');
        }
    }
    else if (db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' LIMIT 1").get()) {
        db.close();
        throw new Error('This is not a Threadline 1.0 database. Use a new path; do not overwrite a prototype database.');
    }
    db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA secure_delete=ON;
    BEGIN IMMEDIATE;
    CREATE TABLE IF NOT EXISTS schema_meta(version INTEGER NOT NULL);
    INSERT INTO schema_meta SELECT 1 WHERE NOT EXISTS(SELECT 1 FROM schema_meta);
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,name TEXT NOT NULL,password_hash TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS workspaces(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,name TEXT NOT NULL,timezone TEXT NOT NULL DEFAULT 'UTC',generation INTEGER NOT NULL DEFAULT 1,version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,csrf TEXT NOT NULL,expires_at TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS auth_attempts(bucket TEXT PRIMARY KEY,count INTEGER NOT NULL,reset_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS contacts(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,name TEXT NOT NULL,email TEXT NOT NULL DEFAULT '',company TEXT NOT NULL DEFAULT '',role TEXT NOT NULL DEFAULT '',phone TEXT NOT NULL DEFAULT '',tags TEXT NOT NULL DEFAULT '',notes TEXT NOT NULL DEFAULT '',contact_policy TEXT NOT NULL DEFAULT 'allowed' CHECK(contact_policy IN('allowed','blocked')),archived INTEGER NOT NULL DEFAULT 0,version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(workspace_id,id));
    CREATE UNIQUE INDEX IF NOT EXISTS contacts_email ON contacts(workspace_id,email) WHERE email<>'';
    CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,name TEXT NOT NULL,company TEXT NOT NULL DEFAULT '',goal TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'active' CHECK(status IN('active','waiting','won','lost','archived')),contact_id TEXT,value INTEGER NOT NULL DEFAULT 0 CHECK(value>=0),currency TEXT NOT NULL DEFAULT 'USD',unknowns TEXT NOT NULL DEFAULT '',next_review TEXT,summary TEXT NOT NULL DEFAULT '',summary_refs TEXT NOT NULL DEFAULT '[]',version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(workspace_id,id),FOREIGN KEY(workspace_id,contact_id) REFERENCES contacts(workspace_id,id));
    CREATE TABLE IF NOT EXISTS notes(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,project_id TEXT,contact_id TEXT,title TEXT NOT NULL,kind TEXT NOT NULL DEFAULT 'note',body TEXT NOT NULL,body_hash TEXT NOT NULL,occurred_on TEXT,deleted INTEGER NOT NULL DEFAULT 0,version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(workspace_id,id),FOREIGN KEY(workspace_id,project_id) REFERENCES projects(workspace_id,id),FOREIGN KEY(workspace_id,contact_id) REFERENCES contacts(workspace_id,id));
    CREATE TABLE IF NOT EXISTS claims(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,note_id TEXT NOT NULL,project_id TEXT,kind TEXT NOT NULL CHECK(kind IN('requirement','capability','blocker','commitment','context','contact_change','opinion')),topic TEXT NOT NULL,statement TEXT NOT NULL,quote TEXT NOT NULL,start_cp INTEGER NOT NULL,end_cp INTEGER NOT NULL,certainty TEXT NOT NULL DEFAULT 'uncertain' CHECK(certainty IN('confirmed','planned','uncertain','reported')),status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN('proposed','approved','rejected','withdrawn')),valid_until TEXT,origin TEXT NOT NULL DEFAULT 'manual',version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(workspace_id,id),FOREIGN KEY(workspace_id,note_id) REFERENCES notes(workspace_id,id),FOREIGN KEY(workspace_id,project_id) REFERENCES projects(workspace_id,id));
    CREATE TABLE IF NOT EXISTS reviews(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,project_id TEXT NOT NULL,contact_id TEXT,requirement_id TEXT NOT NULL,capability_id TEXT NOT NULL,fingerprint TEXT NOT NULL,base_version INTEGER NOT NULL,generation INTEGER NOT NULL,title TEXT NOT NULL,reason TEXT NOT NULL,state TEXT NOT NULL DEFAULT 'suggested' CHECK(state IN('suggested','accepted','dismissed','snoozed','contacted','replied','meeting','closed','stale')),outcome TEXT NOT NULL DEFAULT 'none',snooze_until TEXT,draft TEXT NOT NULL DEFAULT '',draft_refs TEXT NOT NULL DEFAULT '[]',version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(workspace_id,fingerprint),FOREIGN KEY(workspace_id,project_id) REFERENCES projects(workspace_id,id),FOREIGN KEY(workspace_id,contact_id) REFERENCES contacts(workspace_id,id),FOREIGN KEY(workspace_id,requirement_id) REFERENCES claims(workspace_id,id),FOREIGN KEY(workspace_id,capability_id) REFERENCES claims(workspace_id,id));
    CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,project_id TEXT,contact_id TEXT,claim_id TEXT,title TEXT NOT NULL,due_on TEXT,status TEXT NOT NULL DEFAULT 'open' CHECK(status IN('open','done','cancelled')),notes TEXT NOT NULL DEFAULT '',version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(workspace_id,id),FOREIGN KEY(workspace_id,project_id) REFERENCES projects(workspace_id,id),FOREIGN KEY(workspace_id,contact_id) REFERENCES contacts(workspace_id,id),FOREIGN KEY(workspace_id,claim_id) REFERENCES claims(workspace_id,id));
    CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,subject_type TEXT NOT NULL,subject_id TEXT NOT NULL,type TEXT NOT NULL,occurred_at TEXT NOT NULL,recorded_at TEXT NOT NULL,data TEXT NOT NULL DEFAULT '{}');
    CREATE TABLE IF NOT EXISTS project_versions(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,project_id TEXT NOT NULL,version INTEGER NOT NULL,snapshot TEXT NOT NULL,refs TEXT NOT NULL DEFAULT '[]',created_at TEXT NOT NULL,FOREIGN KEY(workspace_id,project_id) REFERENCES projects(workspace_id,id));
    CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,type TEXT NOT NULL,subject_id TEXT NOT NULL,generation INTEGER NOT NULL,state TEXT NOT NULL,model TEXT NOT NULL DEFAULT '',result TEXT NOT NULL DEFAULT '{}',error TEXT NOT NULL DEFAULT '',input_tokens INTEGER NOT NULL DEFAULT 0,output_tokens INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS idempotency(workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,key TEXT NOT NULL,request_hash TEXT NOT NULL,response TEXT NOT NULL,generation INTEGER NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(workspace_id,key));
    CREATE TABLE IF NOT EXISTS pilot_requests(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL,company TEXT NOT NULL,goal TEXT NOT NULL,consent INTEGER NOT NULL CHECK(consent=1),created_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS notes_workspace ON notes(workspace_id,deleted);
    CREATE INDEX IF NOT EXISTS claims_topic ON claims(workspace_id,topic,status);
    CREATE INDEX IF NOT EXISTS events_workspace ON events(workspace_id,recorded_at);
    CREATE INDEX IF NOT EXISTS tasks_workspace ON tasks(workspace_id,status,due_on);
    CREATE VIRTUAL TABLE IF NOT EXISTS notes_search USING fts5(note_id UNINDEXED,workspace_id UNINDEXED,title,body,tokenize='unicode61');
    CREATE TABLE IF NOT EXISTS note_metadata(
      workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
      note_id TEXT NOT NULL, channel TEXT NOT NULL DEFAULT 'other'
        CHECK(channel IN('wechat','email','meeting','browser','other')),
      source_url TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL, PRIMARY KEY(workspace_id,note_id),
      FOREIGN KEY(workspace_id,note_id) REFERENCES notes(workspace_id,id) ON DELETE CASCADE
    );
    UPDATE schema_meta SET version=MAX(version,2);
    COMMIT;
  `);
    migrateWarm(db);
    if (path !== ':memory:')
        chmodSync(path, 0o600);
    // An interrupted external call is visible as failed, never replayed automatically (which could double-charge).
    db.prepare("UPDATE jobs SET state='failed',error='The server restarted. Review the note and retry explicitly.' WHERE state='running'").run();
    let depth = 0;
    return { db, path, tx(fn) { const outer = depth === 0; const sp = 'nested_' + depth; db.exec(outer ? 'BEGIN IMMEDIATE' : 'SAVEPOINT ' + sp); depth++; try {
            const r = fn();
            if (r && typeof r.then === 'function')
                throw new Error('Do not hold a database transaction across async work.');
            db.exec(outer ? 'COMMIT' : 'RELEASE ' + sp);
            return r;
        }
        catch (e) {
            db.exec(outer ? 'ROLLBACK' : 'ROLLBACK TO ' + sp);
            if (!outer)
                db.exec('RELEASE ' + sp);
            throw e;
        }
        finally {
            depth--;
        } }, close() { db.close(); } };
}
