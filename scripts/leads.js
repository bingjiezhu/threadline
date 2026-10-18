// Pilot inquiries belong to the operator, never to an arbitrary workspace user.
import { DatabaseSync } from 'node:sqlite';
import { writeFileSync, chmodSync } from 'node:fs';
import { arg, args, requireDatabase } from './operator.js';
try {
    const db = new DatabaseSync(requireDatabase());
    db.exec('PRAGMA secure_delete=ON; PRAGMA busy_timeout=5000');
    try {
        if (arg('--delete')) {
            if (!args.includes('--confirm'))
                throw new Error('Add --confirm to permanently delete the selected inquiry.');
            db.prepare('DELETE FROM pilot_requests WHERE id=?').run(arg('--delete'));
            db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
            console.log('Selected inquiry deleted, if present.');
        }
        else {
            const rows = db.prepare('SELECT * FROM pilot_requests ORDER BY created_at DESC').all();
            if (arg('--export')) {
                const cols = ['id', 'name', 'email', 'company', 'goal', 'created_at'];
                const cell = v => '"' + String(v ?? '').replace(/^[=+@-]/, "'$&").replaceAll('"', '""') + '"';
                writeFileSync(arg('--export'), cols.join(',') + '\n' + rows.map(r => cols.map(c => cell(r[c])).join(',')).join('\n') + '\n', { mode: 0o600 });
                chmodSync(arg('--export'), 0o600);
                console.log(`Exported ${rows.length} consented inquiries. No messages sent.`);
            }
            else
                console.table(rows.map(({ consent, ...r }) => r));
        }
    }
    finally {
        db.close();
    }
}
catch (e) {
    console.error(e.message);
    process.exitCode = 1;
}
