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
        const multilingualInputFiles = new Set(['src/personal-conversation.js','integrations/photon/assistant.test.mjs','integrations/photon/bridge.test.mjs','integrations/agentverse/test_personal_transport.py','tests/memory-quick-capture.test.js','tests/memory-import.test.js']);
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
const required = ['README.md', 'AGENTS.md', 'LICENSE', 'server.js', 'public/index.html', 'public/app.js', 'public/styles.css', 'public/guide.html', 'public/welcome.html', 'docs/USER_GUIDE.md', 'docs/API.md', 'docs/OPERATIONS.md', 'docs/VERIFICATION.md', 'docs/MARKET_RESEARCH.md', 'docs/GO_TO_MARKET.md', 'docs/PITCH.md', 'tests/browser/README.md', 'examples/fictional-workspace.json', 'src/warm-schema.js', 'src/warm-start.js', 'src/chat-connectors.js', 'public/warm-ui.js', 'public/warm.css', 'docs/WARM_START.md', 'docs/CHAT_INTEGRATIONS.md', 'docs/competition/READ_FIRST.md', 'integrations/slack/manifest.json', 'integrations/discord/commands.json', 'public/first-task.css', 'src/clarity-fixture.js', 'scripts/demo-clear.js', 'public/guide-clarity.html', 'PROVENANCE.md', 'submission/README_FIRST.md', 'submission/PROJECT_STORY.md', 'public/guide-judges.html', 'scripts/demo-judge.js', 'docs/competition/JUDGE_STORY_EN.md', 'docs/competition/JUDGE_QA_EN.md'];
for (const f of required)
    if (!existsSync(join(root, f)))
        errors.push('Missing ' + f);
const js = readFileSync(join(root, 'public/app.js'), 'utf8');
for (const needle of ['localApi(', 'fullState', 'preState', 'api/demo/reset', 'ensureCanonicalProposal', 'insertCanonicalAction'])
    if (js.includes(needle))
        errors.push('Staged execution marker: ' + needle);
const archive = JSON.parse(readFileSync(join(root, 'examples/fictional-workspace.json'), 'utf8'));
if (archive.format !== 'threadline-export' || archive.version !== 1)
    errors.push('Invalid optional example export.');
if (readFileSync(join(root, 'public/sample-workspace.json'), 'utf8') !== readFileSync(join(root, 'examples/fictional-workspace.json'), 'utf8'))
    errors.push('Optional example copies differ.');
const r = { status: errors.length ? 'failed' : 'passed', javascript_syntax_files: scripts, english_text_files: english, json_files: json, errors, scope: 'Syntax, English-language text scan, JSON, required artifacts, staged-path absence. Functional/security/browser checks are separate.' };
console.log(JSON.stringify(r, null, 2));
if (errors.length)
    process.exitCode = 1;
