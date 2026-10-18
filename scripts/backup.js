// Operator-only full SQLite snapshot. Unlike a raw file copy, VACUUM INTO includes committed WAL data.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, chmodSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { requireDatabase, root, arg } from './operator.js';
try {
    const destination = resolve(arg('--out') || resolve(root, 'backups', `threadline-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`));
    if (existsSync(destination))
        throw new Error('Destination already exists. Choose a new backup filename.');
    mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
    const previousMask = process.umask(0o077);
    const db = new DatabaseSync(requireDatabase());
    try {
        db.exec('PRAGMA busy_timeout=10000');
        db.exec(`VACUUM INTO '${destination.replaceAll("'", "''")}'`);
    }
    finally {
        db.close();
        process.umask(previousMask);
    }
    chmodSync(destination, 0o600);
    const check = new DatabaseSync(destination, { readOnly: true });
    try {
        if (check.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok')
            throw new Error('Backup integrity check failed.');
    }
    finally {
        check.close();
    }
    console.log(`Verified backup created: ${destination}\nThis is unencrypted, sensitive operator data. Encrypt and store it separately. Existing sessions are included; restore instructions revoke them.`);
}
catch (e) {
    console.error(e.message);
    process.exitCode = 1;
}
