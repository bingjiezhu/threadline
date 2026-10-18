import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (existsSync(resolve(root, '.env')))
    process.loadEnvFile(resolve(root, '.env'));
const child = spawn(process.execPath, ['server.js'], { cwd: root, stdio: 'inherit', env: process.env });
for (const s of ['SIGINT', 'SIGTERM'])
    process.on(s, () => child.kill(s));
child.on('exit', code => process.exit(code ?? 0));
