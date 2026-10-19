// Offline, dependency-free release checks. Does not replace functional/browser/provider tests.
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, join, relative, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..'), errors = [];
let scripts = 0, english = 0, json = 0;
function walk(p) { return readdirSync(p, { withFileTypes: true }).flatMap(e => { if (['.git', '.data', '.runtime', '.venv', 'node_modules', 'backups', 'test-results', '__pycache__', 'release-evidence'].includes(e.name))
    return []; const q = join(p, e.name); return e.isDirectory() ? walk(q) : [q]; }); }
for (const f of walk(root)) {
    const rel = relative(root, f), ext = extname(f);
    if (['.js', '.mjs', '.cjs'].includes(ext)) {
        const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
        if (r.status !== 0)
            errors.push(`${rel}: ${r.stderr}`);
        scripts++;
    }
    if (['.md', '.js', '.mjs', '.cjs', '.html', '.css', '.json', '.yml', '.yaml', '.txt', '.svg', '.py', '.srt'].includes(ext) || ['README', 'NOTICE', 'Dockerfile'].includes(rel)) {
        const s = readFileSync(f, 'utf8');
        english++;
        // These exact implementation/test files intentionally accept multilingual input.
        // Public UI, documentation and other release content retain the English check.
        const multilingualInputFiles = new Set(['tests/memory-import.test.js','tests/markdown-backup.test.js','src/memory-query.js','tests/memory-query-retrieval.test.js']);
        if (!multilingualInputFiles.has(rel) && /[\u3400-\u4dbf\u4e00-\u9fff]/u.test(s))
            errors.push(`${rel}: unexpected CJK text; release materials must be English.`);
        if (/sk-[A-Za-z0-9_-]{30,}/.test(s))
            errors.push(`${rel}: possible secret.`);
    }
    if (ext === '.json') {
        try {
            JSON.parse(readFileSync(f, 'utf8'));
            json++;
        }
        catch (e) {
            errors.push(`${rel}: invalid JSON: ${e.message}`);
        }
    }
}
const required = [
    'README.md', 'AGENTS.md', 'LICENSE', 'server.js', '.env.example',
    'public/index.html', 'public/app.js', 'public/styles.css', 'public/memory-ui.js', 'public/memory.css', 'public/relationship-ui.js',
    'src/auth.js', 'src/store.js', 'src/domain.js', 'src/markdown-vault.js', 'src/memory-store.js', 'src/memory-import.js', 'src/memory-agent.js', 'src/memory-query.js',
    'scripts/start.js', 'scripts/backup.js', 'scripts/recover.js',
    'docs/API.md', 'docs/OPERATIONS.md', 'docs/VERIFICATION.md',
    'tests/channel-disabled.test.js', 'tests/markdown-vault.test.js', 'tests/memory-import.test.js'
];
for (const f of required)
    if (!existsSync(join(root, f)))
        errors.push('Missing ' + f);
const js = readFileSync(join(root, 'public/app.js'), 'utf8');
for (const needle of ['localApi(', 'fullState', 'preState', 'api/demo/reset', 'ensureCanonicalProposal', 'insertCanonicalAction'])
    if (js.includes(needle))
        errors.push('Staged execution marker: ' + needle);
const r = { status: errors.length ? 'failed' : 'passed', javascript_syntax_files: scripts, english_text_files: english, json_files: json, errors, scope: 'Syntax, English-language text scan, JSON, required artifacts, staged-path absence. Functional/security/browser checks are separate.' };
console.log(JSON.stringify(r, null, 2));
if (errors.length)
    process.exitCode = 1;
