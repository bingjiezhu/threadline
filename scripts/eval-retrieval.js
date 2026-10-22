// Operator-only retrieval check against your own questions. Reads a snapshot copy; never calls a model.
// Questions file: [{ "question": "...", "expect": ["part of the expected source title or import path"] }]
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { openStore } from '../src/store.js';
import { createDomain } from '../src/domain.js';
import { createMemoryStore } from '../src/memory-store.js';
import { createMemoryImport } from '../src/memory-import.js';
import { analyzeMemoryQuery, memoryQueryTerms } from '../src/memory-query.js';
import { requireDatabase, arg } from './operator.js';

const dir = mkdtempSync(join(tmpdir(), 'threadline-eval-'));
// The snapshot holds the whole database; remove it even when the run is interrupted.
for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143]]) process.on(signal, () => { rmSync(dir, { recursive: true, force: true }); process.exit(code); });
try {
    const questionsPath = arg('--questions');
    if (!questionsPath) throw new Error('Usage: npm run eval-retrieval -- --questions questions.json [--workspace ID] [--limit 6]');
    // npm runs scripts from the package folder; read a relative path from where the command was typed.
    const questions = JSON.parse(readFileSync(resolve(process.env.INIT_CWD || process.cwd(), questionsPath), 'utf8'));
    const valid = q => typeof q?.question === 'string' && q.question.trim() && Array.isArray(q.expect) && q.expect.length && q.expect.every(value => typeof value === 'string' && value.trim());
    if (!Array.isArray(questions) || !questions.length) throw new Error('The questions file must hold a non-empty JSON list.');
    const invalid = questions.findIndex(q => !valid(q));
    if (invalid >= 0) throw new Error(`Question ${invalid + 1} needs a "question" and an "expect" list of non-empty title or path fragments.`);
    const limit = Number(arg('--limit') || 6);
    // A consistent copy, so the running app and its database are left untouched.
    const copy = join(dir, 'snapshot.sqlite'), live = new DatabaseSync(requireDatabase(), { readOnly: true });
    try { live.prepare('VACUUM INTO ?').run(copy); } finally { live.close(); }
    const store = openStore(copy), domain = createDomain(store), memory = createMemoryStore(store, domain);
    createMemoryImport(store, domain, memory);
    try {
        const workspaces = store.db.prepare('SELECT id FROM workspaces').all().map(row => row.id);
        const w = arg('--workspace') || (workspaces.length === 1 ? workspaces[0] : null);
        if (!w || !workspaces.includes(w)) throw new Error(`Choose one workspace with --workspace: ${workspaces.join(', ')}`);
        const results = [];
        for (const { question, expect } of questions) {
            // Yield between questions so Ctrl+C can stop a long run and remove the snapshot.
            await new Promise(resolve => setImmediate(resolve));
            const hits = memory.retrieve(w, { query: question, limit }).hits;
            const wanted = expect.map(value => value.trim().toLowerCase());
            const relevant = hit => wanted.some(value => `${hit.title}\n${hit.import_path || ''}`.toLowerCase().includes(value));
            const rank = hits.findIndex(relevant) + 1;
            results.push({ question, terms: memoryQueryTerms(analyzeMemoryQuery(question).query), rank: rank || null, top: hits.slice(0, 3).map(hit => hit.title) });
        }
        const share = test => Math.round(results.filter(test).length / results.length * 1000) / 1000;
        console.log(JSON.stringify({ questions: results.length, limit, hit_at_1: share(r => r.rank === 1), [`hit_at_${limit}`]: share(r => r.rank),
            mrr: Math.round(results.reduce((sum, r) => sum + (r.rank ? 1 / r.rank : 0), 0) / results.length * 1000) / 1000,
            missed: results.filter(r => !r.rank), results }, null, 2));
    } finally { store.close(); }
} catch (e) {
    console.error(e.message);
    process.exitCode = 1;
} finally { rmSync(dir, { recursive: true, force: true }); }
