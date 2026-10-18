import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
export const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
if (existsSync(resolve(root, '.env')))
    process.loadEnvFile(resolve(root, '.env'));
export const dbPath = resolve(process.env.THREADLINE_DB || resolve(root, '.data/threadline.sqlite'));
export function requireDatabase() { if (!existsSync(dbPath))
    throw new Error('No database exists yet. Start the application and create an account first.'); return dbPath; }
export const args = process.argv.slice(2);
export function arg(name) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; }
