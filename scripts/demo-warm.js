/** Isolated new-hire practice; never loads or resets your personal database. */
import { makeApp } from '../server.js';
import { seedWarmFixture } from '../src/warm-fixture.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
const dir = mkdtempSync(join(tmpdir(), 'threadline-warm-')), password = 'Practice-' + randomBytes(12).toString('hex');
const app = makeApp({ dbPath: join(dir, 'practice.sqlite'), demo: true });
const s = await app.auth.register({ name: 'Alex Rivera', email: 'practice@example.invalid', password, workspace: 'Fictional first-week practice' });
const fixture = seedWarmFixture(app, s.user.workspace_id);
const port = Number(process.env.DEMO_PORT || 4174);
if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error('DEMO_PORT must be a valid port.');
app.server.listen(port, '127.0.0.1', () => console.log(JSON.stringify({ url: 'http://localhost:' + app.server.address().port + '/#warmstart', email: 'practice@example.invalid', password, ...fixture, notice: 'Fictional records. Real application operations. No external model or platform configured. Follow docs/hackathon/DEMO_RUNBOOK.md. Your normal data is untouched.' }, null, 2)));
let stop = false;
async function close() { if (stop)
    return; stop = true; await app.close(); rmSync(dir, { recursive: true, force: true }); process.exit(0); }
process.on('SIGINT', close);
process.on('SIGTERM', close);
