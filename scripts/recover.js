// Requires filesystem authority. There is deliberately no unauthenticated web password-reset route.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, statSync } from 'node:fs';
import { arg, args, requireDatabase } from './operator.js';
import { email, passwordHash } from '../src/util.js';
try {
    if (!arg('--email') || !arg('--password-file') || !args.includes('--confirm'))
        throw new Error('Stop the server, then run: npm run recover -- --email person@example.com --password-file /private/password.txt --confirm');
    const f = arg('--password-file');
    if (process.platform !== 'win32' && (statSync(f).mode & 0o077))
        throw new Error('Password file must be private (chmod 600).');
    const mail = email(arg('--email')), password = readFileSync(f, 'utf8').replace(/\r?\n$/, '');
    const encoded = await passwordHash(password);
    const db = new DatabaseSync(requireDatabase());
    try {
        const user = db.prepare('SELECT id FROM users WHERE email=?').get(mail);
        if (!user)
            throw new Error('No matching account.');
        db.exec('BEGIN IMMEDIATE');
        try {
            db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(encoded, user.id);
            db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
            db.exec('COMMIT');
        }
        catch (e) {
            db.exec('ROLLBACK');
            throw e;
        }
    }
    finally {
        db.close();
    }
    console.log('Password replaced and all sessions for this account revoked. Securely remove the temporary password file; restart the application.');
}
catch (e) {
    console.error(e.message);
    process.exitCode = 1;
}
