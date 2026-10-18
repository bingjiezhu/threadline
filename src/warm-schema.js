/** Schema 3: explicit knowledge ownership, personal onboarding and scoped chat ingress. */
export function migrateWarm(db) {
    const current = db.prepare('SELECT version FROM schema_meta').get().version;
    if (current >= 3)
        return;
    db.exec(`BEGIN IMMEDIATE;
    ALTER TABLE note_metadata RENAME TO note_metadata_v2;
    CREATE TABLE note_metadata(workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,note_id TEXT NOT NULL,channel TEXT NOT NULL DEFAULT 'other' CHECK(channel IN('wechat','email','meeting','browser','slack','discord','other')),source_url TEXT NOT NULL DEFAULT '',tags TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL,PRIMARY KEY(workspace_id,note_id),FOREIGN KEY(workspace_id,note_id) REFERENCES notes(workspace_id,id) ON DELETE CASCADE);
    INSERT INTO note_metadata SELECT * FROM note_metadata_v2;
    DROP TABLE note_metadata_v2;
    CREATE TABLE knowledge_routes(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,topic TEXT NOT NULL,contact_id TEXT NOT NULL,note_id TEXT NOT NULL,note_version INTEGER NOT NULL,quote TEXT NOT NULL,start_cp INTEGER NOT NULL,end_cp INTEGER NOT NULL,route_role TEXT NOT NULL CHECK(route_role IN('guide','approver','mentor')),effective_on TEXT NOT NULL,expires_on TEXT,status TEXT NOT NULL DEFAULT 'active' CHECK(status IN('active','superseded','revoked','stale')),supersedes_id TEXT,version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,UNIQUE(workspace_id,id),FOREIGN KEY(workspace_id,contact_id) REFERENCES contacts(workspace_id,id) ON DELETE CASCADE,FOREIGN KEY(workspace_id,note_id) REFERENCES notes(workspace_id,id) ON DELETE CASCADE);
    CREATE INDEX routes_topic ON knowledge_routes(workspace_id,topic,status);
    CREATE TABLE onboarding_goals(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,title TEXT NOT NULL,role TEXT NOT NULL,topic TEXT NOT NULL,success TEXT NOT NULL,due_on TEXT,status TEXT NOT NULL DEFAULT 'open' CHECK(status IN('open','done','archived')),version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(workspace_id,id));
    CREATE TABLE onboarding_plans(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,goal_id TEXT NOT NULL,goal_version INTEGER NOT NULL,generation INTEGER NOT NULL,mode TEXT NOT NULL CHECK(mode IN('local','openai')),status TEXT NOT NULL DEFAULT 'proposed' CHECK(status IN('proposed','approved','stale','rejected')),body TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,UNIQUE(workspace_id,id),FOREIGN KEY(workspace_id,goal_id) REFERENCES onboarding_goals(workspace_id,id) ON DELETE CASCADE);
    CREATE TABLE onboarding_plan_tasks(workspace_id TEXT NOT NULL,plan_id TEXT NOT NULL,task_id TEXT NOT NULL,step_id TEXT NOT NULL,PRIMARY KEY(workspace_id,plan_id,task_id),FOREIGN KEY(workspace_id,plan_id) REFERENCES onboarding_plans(workspace_id,id) ON DELETE CASCADE,FOREIGN KEY(workspace_id,task_id) REFERENCES tasks(workspace_id,id) ON DELETE CASCADE);
    CREATE TABLE chat_connections(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,platform TEXT NOT NULL CHECK(platform IN('slack','discord')),scope_id TEXT NOT NULL,actor_id TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(platform,scope_id,actor_id),UNIQUE(workspace_id,id));
    CREATE TABLE chat_link_codes(code_hash TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,platform TEXT NOT NULL CHECK(platform IN('slack','discord')),expires_at INTEGER NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE chat_inbox(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,connection_id TEXT NOT NULL,external_key TEXT NOT NULL,platform TEXT NOT NULL,author_id TEXT NOT NULL,channel_id TEXT NOT NULL,body TEXT NOT NULL,occurred_on TEXT,source_url TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN('pending','saved','dismissed')),note_id TEXT,version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,UNIQUE(workspace_id,connection_id,external_key),UNIQUE(workspace_id,id),FOREIGN KEY(workspace_id,connection_id) REFERENCES chat_connections(workspace_id,id) ON DELETE CASCADE,FOREIGN KEY(workspace_id,note_id) REFERENCES notes(workspace_id,id));
    CREATE TRIGGER warm_invalidate AFTER UPDATE OF generation ON workspaces WHEN NEW.generation<>OLD.generation BEGIN
      UPDATE tasks SET title='Context changed - review before continuing',notes='',status=CASE WHEN status='open' THEN 'cancelled' ELSE status END,version=version+1 WHERE workspace_id=NEW.id AND id IN(SELECT task_id FROM onboarding_plan_tasks WHERE workspace_id=NEW.id);
      UPDATE onboarding_plans SET body='{}',status='stale',version=version+1 WHERE workspace_id=NEW.id AND status<>'stale';
      UPDATE jobs SET result='{}' WHERE workspace_id=NEW.id AND type='warm-plan';
    END;
    CREATE TRIGGER warm_source_revised AFTER UPDATE OF version,deleted ON notes WHEN NEW.version<>OLD.version OR NEW.deleted<>OLD.deleted BEGIN
      UPDATE knowledge_routes SET status='stale',quote='',topic='',version=version+1 WHERE workspace_id=NEW.workspace_id AND note_id=NEW.id;
      UPDATE chat_inbox SET body='',source_url='',author_id='',channel_id='' WHERE workspace_id=NEW.workspace_id AND note_id=NEW.id;
    END;
    UPDATE schema_meta SET version=3;
    COMMIT;`);
}
