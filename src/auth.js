import { uid, now, hash, token, ensure, text, email, passwordHash, passwordVerify, AppError, safeEqual } from './util.js';
export function createAuth(store, config = {}) {
    const d = store.db;
    const getUser = id => d.prepare('SELECT u.id,u.email,u.name,w.id workspace_id FROM users u JOIN workspaces w ON w.owner_id=u.id WHERE u.id=?').get(id);
    function session(userId) { const raw = token(), csrf = token(); const created = now(), expiry = new Date(Date.now() + 7 * 86400000).toISOString(); d.prepare('DELETE FROM sessions WHERE expires_at<?').run(created); d.prepare('INSERT INTO sessions VALUES(?,?,?,?,?)').run(hash(raw), userId, csrf, expiry, created); return { token: raw, csrf, expires_at: expiry, user: getUser(userId) }; }
    return {
        configured() { return !!d.prepare('SELECT 1 FROM users LIMIT 1').get(); },
        registrationOpen() { return !this.configured() || !!config.registrationToken; },
        rate(bucket, limit = 10, window = 15 * 60000) { const id = hash(bucket), t = Date.now(); const r = d.prepare('SELECT * FROM auth_attempts WHERE bucket=?').get(id); if (r && r.reset_at > t) {
            ensure(r.count < limit, 'Too many attempts. Please try again later.', 429, 'rate_limited');
            d.prepare('UPDATE auth_attempts SET count=count+1 WHERE bucket=?').run(id);
        }
        else
            d.prepare('INSERT OR REPLACE INTO auth_attempts VALUES(?,?,?)').run(id, 1, t + window); d.prepare('DELETE FROM auth_attempts WHERE reset_at<?').run(t - 86400000); },
        async register(input) {
            const mail = email(input.email), name = text(input.name, 'Name', 100), workspace = text(input.workspace || `${name}'s workspace`, 'Workspace name', 100);
            if (config.registrationToken)
                ensure(safeEqual(input.inviteCode, config.registrationToken), 'Enter the workspace operator’s invitation code.', 403, 'invitation_required');
            else
                ensure(!this.configured(), 'Registration is closed. Ask the operator for an invitation.', 403, 'registration_closed');
            const encoded = await passwordHash(input.password);
            const id = uid();
            return store.tx(() => {
                if (!config.registrationToken)
                    ensure(!this.configured(), 'Registration is closed.', 403, 'registration_closed');
                ensure(!d.prepare('SELECT 1 FROM users WHERE email=?').get(mail), 'This email cannot be registered. Try signing in.', 409, 'account_exists');
                d.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(id, mail, name, encoded, now());
                d.prepare('INSERT INTO workspaces(id,owner_id,name,created_at) VALUES(?,?,?,?)').run(uid(), id, workspace, now());
                return session(id);
            });
        },
        async login(input) { const mail = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''; const u = d.prepare('SELECT * FROM users WHERE email=?').get(mail); const fallback = 'scrypt:00000000000000000000000000000000:' + '00'.repeat(64); const valid = await passwordVerify(input.password, u?.password_hash || fallback); ensure(u && valid, 'Email or password is incorrect.', 401, 'invalid_credentials'); return session(u.id); },
        resolve(raw) { if (!raw)
            return null; const s = d.prepare('SELECT * FROM sessions WHERE token_hash=? AND expires_at>?').get(hash(raw), now()); if (!s)
            return null; return { ...s, user: getUser(s.user_id) }; },
        logout(raw) { if (raw)
            d.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(raw)); },
        async confirm(userId, password) { const u = d.prepare('SELECT password_hash FROM users WHERE id=?').get(userId); ensure(u && await passwordVerify(password, u.password_hash), 'Your current password is incorrect.', 403, 'reauth_failed'); },
        async change(userId, input) { await this.confirm(userId, input.currentPassword); const encoded = await passwordHash(input.newPassword); return store.tx(() => { d.prepare('UPDATE users SET password_hash=? WHERE id=?').run(encoded, userId); d.prepare('DELETE FROM sessions WHERE user_id=?').run(userId); return session(userId); }); },
        async deleteAccount(userId, input) { await this.confirm(userId, input.password); ensure(input.confirm === 'DELETE', 'Type DELETE to remove this account.'); store.tx(() => { const u = getUser(userId); d.prepare('DELETE FROM notes_search WHERE workspace_id=?').run(u.workspace_id); d.prepare('DELETE FROM users WHERE id=?').run(userId); }); d.exec('PRAGMA wal_checkpoint(TRUNCATE)'); return { deleted: true }; }
    };
}
