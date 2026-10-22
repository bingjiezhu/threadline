import test from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../src/store.js';
import { createDomain } from '../src/domain.js';
import { createMemoryStore } from '../src/memory-store.js';
import { createMemoryImport } from '../src/memory-import.js';
import { createMemoryAgent } from '../src/memory-agent.js';
import { analyzeMemoryQuery, isMemoryRecallRequest, memoryQueryTerms } from '../src/memory-query.js';
import { now, uid } from '../src/util.js';

// Fictional fixtures exercise the actual import and retrieval services, without reading private memory.
function setup() {
    const store = openStore(':memory:'), domain = createDomain(store), memory = createMemoryStore(store, domain);
    const owner = name => {
        const user = uid(), workspace = uid();
        store.db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(user, `${user}@example.invalid`, name, 'fixture', now());
        store.db.prepare('INSERT INTO workspaces(id,owner_id,name,created_at) VALUES(?,?,?,?)').run(workspace, user, name, now());
        return workspace;
    };
    const w = owner('Owner'), other = owner('Other'), imports = createMemoryImport(store, domain, memory);
    function file(provider, path, content, workspace = w) {
        const input = { provider, files: [{ path, content }] }, preview = imports.preview(workspace, input);
        const result = imports.commit(workspace, { ...input, confirm: true, preview_hash: preview.preview_hash, selected: preview.files.map(({ path, hash }) => ({ path, hash })) });
        return memory.getSource(workspace, result.files[0].source_id);
    }
    return { store, domain, memory, imports, w, other, file };
}
function check(name, body) { test(name, async () => { const c = setup(); try { await body(c); } finally { c.store.close(); } }); }
// A Vertex contract stub: the answer is built from the payload Threadline sends, and every request is kept.
function geminiAgent(c, answerFor, seen = []) {
    const fetchImpl = async (url, options) => {
        const body = JSON.parse(options.body), payload = JSON.parse(body.contents[0].parts[0].text);
        seen.push({ body, payload });
        return { ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(answerFor(payload)) }] } }], modelVersion: 'gemini-contract-fixture' }) };
    };
    return createMemoryAgent(c.store, c.domain, c.memory, { vertexProject: 'test-memory-project', vertexModel: 'gemini-3.8-flash', vertexAccessToken: 'contract-test-token-not-real', fetchImpl });
}

test('memory query scope distinguishes the import provider from the requested topic', () => {
    assert.deepEqual(analyzeMemoryQuery('Search my Codex memory for mechanical parallelism.'), { query: 'mechanical parallelism', providers: ['codex'] });
    assert.deepEqual(analyzeMemoryQuery('Find my Claude memory about language preferences.'), { query: 'language preference', providers: ['claude'] });
    assert.deepEqual(analyzeMemoryQuery('What do my Codex and Claude memories say about my working style?'), { query: 'work style', providers: ['claude', 'codex'] });
    assert.deepEqual(analyzeMemoryQuery('Search my Codex memory for Claude integration.'), { query: 'claude integration', providers: ['codex'] });
    assert.deepEqual(analyzeMemoryQuery('Tell me about Claude integration.'), { query: 'claude integration', providers: [] });
    assert.deepEqual(analyzeMemoryQuery('Find memory from Claude about language preferences.'), { query: 'language preference', providers: ['claude'] });
    assert.deepEqual(analyzeMemoryQuery('Search my Claude Code memory for language preferences.'), { query: 'language preference', providers: ['claude'] });
    assert.equal(isMemoryRecallRequest('Search my Claude memory for language preferences.'), true);
    assert.equal(isMemoryRecallRequest('Remember this: Claude prefers coffee.'), false);
    assert.equal(isMemoryRecallRequest('Save this memory about Codex.'), false);
    assert.equal(isMemoryRecallRequest('Please remind me to check my Claude memory tomorrow.'), false);
    assert.equal(isMemoryRecallRequest('Draft an update from my Codex memory.'), false);
    assert.equal(isMemoryRecallRequest('Create a task about my Codex memory.'), false);
});

check('Codex recall finds the substantive anchor in a long source, not provider words or its preamble', c => {
    const target = c.file('codex', 'MEMORY.md', '# Workspace notes\n\n' + 'An unrelated setup excerpt and configuration block.\n'.repeat(50) + '\n## Parallel execution\nAvoid mechanical parallelism: split independent investigations and retain ownership.\n\nOther material follows.');
    c.file('codex', 'unrelated.md', '# Codex local memory\nA local search engine stores memory.');
    c.file('claude', 'parallelism.md', '# Mechanical parallelism\nThis belongs to a different source provider.');
    const result = c.memory.retrieve(c.w, { query: 'Search my Codex memory for mechanical parallelism.' });
    assert.equal(result.hits.length, 1);
    const hit = result.hits[0];
    assert.equal(hit.source_id, target.id); assert.match(hit.quote, /Avoid mechanical parallelism/);
    assert.doesNotMatch(hit.body_excerpt, /unrelated setup/); assert.ok(target.body.includes(hit.quote));
    assert.equal(hit.import_provider, 'codex'); assert.equal(hit.import_path, 'MEMORY.md');
});

check('equally relevant import matches prefer a dedicated short note over a large aggregate', c => {
    const short = c.file('codex', 'preferences/mechanical-parallelism.md', '# Mechanical parallelism\nAvoid mechanical parallelism; split independent work with clear owners.');
    c.file('codex', 'archive/mechanical-parallelism.md', '# Mechanical parallelism\nAvoid mechanical parallelism; split independent work with clear owners.\n\n' + 'Unrelated archived background.\n'.repeat(150));
    const hits = c.memory.retrieve(c.w, { query: 'Search my Codex memory for mechanical parallelism.' }).hits;
    assert.equal(hits.length, 2); assert.equal(hits[0].score, hits[1].score);
    assert.equal(hits[0].source_id, short.id);
    assert.equal('_sourceLength' in hits[0], false);
});

check('Claude preference recall uses meaningful import filenames even when the original body is Chinese', c => {
    const target = c.file('claude', 'feedback_language_preferences.md', '---\nname: reply preferences\ntype: feedback\n---\n\n默认用中文回答，代码标识符保留英文。');
    c.file('claude', 'personal-ai-workspace.md', '# Personal workspace\nUse a local memory search library for a personal assistant.');
    c.file('codex', 'language-preferences.md', '# Language preference\nPrefer English.');
    const hits = c.memory.retrieve(c.w, { query: 'Find my Claude memory about language preferences.' }).hits;
    assert.equal(hits.length, 1); assert.equal(hits[0].source_id, target.id);
    assert.equal(hits[0].quote, '默认用中文回答，代码标识符保留英文。');
    assert.ok(target.body.includes(hits[0].quote));
});

check('a two-provider scope searches their union and excludes fictional contacts and other owner imports', c => {
    const a = c.file('codex', 'working-style.md', '# Working style\nPrefer concise explanations and direct implementation.'), b = c.file('claude', 'feedback_work_style.md', '# Communication\nFavor a clear next action.');
    c.memory.ingest(c.w, { title: 'Alex working style', body: 'Alex prefers a short agenda before a meeting.', origin: 'web' });
    c.file('claude', 'private_work_style.md', '# Working style\nAnother owner keeps private engineering preferences.', c.other);
    const hits = c.memory.retrieve(c.w, { query: 'What do my Codex and Claude memories say about my working style?' }).hits;
    assert.deepEqual(new Set(hits.map(hit => hit.source_id)), new Set([a.id, b.id]));
    assert.deepEqual(new Set(hits.map(hit => hit.import_provider)), new Set(['codex', 'claude']));
    assert.equal(c.memory.retrieve(c.other, { query: 'mechanical parallelism', providers: ['codex'] }).hits.length, 0);
});

check('a provider separated from memory by a filename remains scoped and retains its topic', c => {
    const question = 'Show the source for my Claude working-style-pragmatic memory.';
    assert.deepEqual(analyzeMemoryQuery(question), { query: 'work style pragmatic', providers: ['claude'] });
    const target = c.file('claude', 'working-style-pragmatic.md', '# Work style\nPrefer pragmatic implementation with a clear next step.');
    c.file('codex', 'working-style-pragmatic.md', '# Work style\nA pragmatic but differently sourced recommendation.');
    c.memory.ingest(c.w, { title: 'Pragmatic working style', body: 'A fictional person prefers short meetings.' });
    const hits = c.memory.retrieve(c.w, { query: question }).hits;
    assert.deepEqual(hits.map(hit => hit.source_id), [target.id]);
    assert.deepEqual(analyzeMemoryQuery('Show my Codex and Claude working-style-pragmatic memories.'), { query: 'work style pragmatic', providers: ['claude', 'codex'] });
});

check('a missing topic abstains rather than matching import labels and partial unrelated terms', async c => {
    c.file('codex', 'MEMORY.md', '# Codex memory\nA mechanical keyboard sits on the desk.');
    c.file('codex', 'parallelism.md', '# Parallelism\nIndependent tasks can run concurrently.');
    assert.equal(c.memory.retrieve(c.w, { query: 'Search my Codex memory for mechanical parallelism.' }).hits.length, 0);
    assert.equal(c.memory.retrieve(c.w, { query: 'Search my Codex memory for quantum penguins.' }).hits.length, 0);
    const run = await createMemoryAgent(c.store, c.domain, c.memory).ask(c.w, { question: 'Find my Codex memory about quantum penguins.', use_ai: false });
    assert.deepEqual(run.citations, []); assert.match(run.answer, /could not find a saved source/);
});

check('an explicit new provider scope does not inherit terms or scope from the prior conversation', async c => {
    const codex = c.file('codex', 'parallelism.md', '# Mechanical parallelism\nKeep task ownership explicit.'), claude = c.file('claude', 'language-preferences.md', '# Language preference\nPrefer concise English replies.');
    const agent = createMemoryAgent(c.store, c.domain, c.memory);
    const first = await agent.ask(c.w, { question: 'Search my Codex memory for mechanical parallelism.', use_ai: false });
    assert.equal(first.citations[0].source_id, codex.id);
    const second = await agent.ask(c.w, { question: 'What does my Claude memory say about this language preference?', thread_id: first.thread_id, use_ai: false });
    assert.equal(second.state, 'done'); assert.equal(second.citations.length, 1); assert.equal(second.citations[0].source_id, claude.id);
});

check('edited imports cite the current source version and forgetting removes them from recall', async c => {
    const source = c.file('claude', 'feedback_language_preferences.md', '# Language preference\nPrefer short English replies.');
    const agent = createMemoryAgent(c.store, c.domain, c.memory);
    const run = await agent.ask(c.w, { question: 'Find my Claude memory about language preferences.', use_ai: false });
    const edited = c.domain.editNote(c.w, source.id, { version: source.version, body: '# Language preference\nPrefer bilingual explanations.' });
    assert.equal(agent.getRun(c.w, run.id).state, 'stale');
    const hit = c.memory.retrieve(c.w, { query: 'Find my Claude memory about language preferences.' }).hits[0];
    assert.equal(hit.source_version, edited.version); assert.equal(hit.import_sources[0].edited_since_import, true);
    assert.match(hit.quote, /bilingual/); assert.doesNotMatch(hit.quote, /short English/);
    c.memory.forgetSource(c.w, source.id, { version: edited.version });
    assert.equal(c.memory.retrieve(c.w, { query: 'language preferences', providers: ['claude'] }).hits.length, 0);
});

test('a Chinese question becomes its content words, not one unbroken sentence', () => {
    const terms = memoryQueryTerms('我喜欢怎么写测试？');
    assert.ok(terms.includes('测试'));
    for (const word of ['我', '怎么', '我喜欢怎么写测试']) assert.equal(terms.includes(word), false);
    // Unknown two-character names are kept together rather than dropped as single characters.
    assert.ok(analyzeMemoryQuery('请帮我查一下关于小李的记录').query.split(' ').includes('小李'));
    assert.deepEqual(memoryQueryTerms('猫'), ['猫']);
    assert.deepEqual(memoryQueryTerms('我'), []);
    assert.deepEqual(memoryQueryTerms('什么时候？'), []);
    // Pronoun phrases, counts and Traditional function words are scaffolding too.
    assert.deepEqual(memoryQueryTerms('我的猫'), ['猫']);
    assert.deepEqual(memoryQueryTerms('我有一只猫吗？'), ['猫']);
    assert.deepEqual(memoryQueryTerms('我們什麼時候說過？'), []);
    // Words that contain a request word stay whole, and a date keeps its number.
    assert.ok(memoryQueryTerms('我什么时候请假？').includes('请假'));
    assert.ok(memoryQueryTerms('5月的安排').includes('5月'));
});

check('Han and Latin written together match their own words', c => {
    const pet = c.memory.ingest(c.w, { title: '宠物', body: 'Alex的猫叫咪咪。' }).source;
    c.memory.ingest(c.w, { title: 'Alex call', body: 'Alex asked about the budget.' });
    assert.equal(c.memory.retrieve(c.w, { query: 'Alex的猫' }).hits[0].source_id, pet.id);
    const frontend = c.file('claude', 'CLAUDE.md', '# 前端\n项目使用React组件库。');
    assert.deepEqual(c.memory.retrieve(c.w, { query: 'Search my Claude memory for React组件' }).hits.map(hit => hit.source_id), [frontend.id]);
});

check('a lone Chinese character ranks sources but cannot select one by itself', c => {
    const cat = c.memory.ingest(c.w, { title: '猫的疫苗', body: '猫下个月打疫苗。', occurred_on: '2026-01-01' }).source;
    c.memory.ingest(c.w, { title: '狗的疫苗', body: '狗已经打过疫苗。', occurred_on: '2026-10-01' });
    const ball = c.memory.ingest(c.w, { title: '周末', body: '周六打球。' }).source;
    const hits = c.memory.retrieve(c.w, { query: '我的猫什么时候打疫苗？' }).hits;
    assert.equal(hits[0].source_id, cat.id); assert.equal(hits.length, 2);
    assert.equal(hits.some(hit => hit.source_id === ball.id), false);
});

check('a Chinese question finds the Chinese note that answers it, and local ask cites it', async c => {
    const target = c.memory.ingest(c.w, { title: '测试习惯', body: '我喜欢先写集成测试，再补单元测试。' }).source;
    c.memory.ingest(c.w, { title: '周末', body: '周六去爬山，周日休息。' });
    const hits = c.memory.retrieve(c.w, { query: '我喜欢怎么写测试？' }).hits;
    assert.equal(hits.length, 1); assert.equal(hits[0].source_id, target.id);
    const run = await createMemoryAgent(c.store, c.domain, c.memory).ask(c.w, { question: '我喜欢怎么写测试？', use_ai: false });
    assert.equal(run.state, 'done'); assert.equal(run.citations[0].source_id, target.id);
    assert.equal(c.memory.retrieve(c.w, { query: '我们什么时候说过？' }).hits.length, 0);
});

check('a rare query word outranks a word that appears in many sources', c => {
    for (const [title, body] of [['项目周会', '周一开会。'], ['项目复盘', '上线后复盘。'], ['项目排期', '排到下个月。']]) c.memory.ingest(c.w, { title, body, occurred_on: '2026-10-01' });
    // Older than the others, so it would sort last if every single-word match scored the same.
    const budget = c.memory.ingest(c.w, { title: '预算', body: '上限五万。', occurred_on: '2020-01-01' }).source;
    const hits = c.memory.retrieve(c.w, { query: '项目预算' }).hits;
    assert.equal(hits.length, 4); assert.equal(hits[0].source_id, budget.id);
});

check('a Chinese phrase written together ranks above the same words apart', c => {
    const together = c.memory.ingest(c.w, { title: '测试习惯', body: '先跑集成测试。', occurred_on: '2026-01-01' }).source;
    c.memory.ingest(c.w, { title: '测试习惯', body: '集成环境很慢，单元测试很快。', occurred_on: '2026-10-01' });
    assert.equal(c.memory.retrieve(c.w, { query: '集成测试' }).hits[0].source_id, together.id);
});

check('a source that matches every word outranks one that matches a single rare word', c => {
    const alex = c.domain.createContact(c.w, { name: 'Alex Morgan' });
    for (let i = 1; i <= 48; i++) c.memory.ingest(c.w, { title: `Alex call ${i}`, body: `Call ${i} covered routine updates.`, contact_id: alex.id });
    const demo = c.memory.ingest(c.w, { title: 'Demo format', body: 'Alex prefers a short demo with time for questions.', contact_id: alex.id }).source;
    c.file('claude', 'feedback_language_preferences.md', '# Language preference\nReply in concise English.');
    assert.equal(c.memory.retrieve(c.w, { query: 'What does Alex prefer?' }).hits[0].source_id, demo.id);
});

check('a changed import ranks its newest snapshot first and marks the earlier one for answers', async c => {
    const lines = last => `# Reply language\nKeep identifiers unchanged.\nUse short sentences.\n${last}`;
    const old = c.file('claude', 'reply-language.md', lines('Reply in English by default.'));
    const current = c.file('claude', 'reply-language.md', lines('Reply in Chinese by default.'));
    assert.notEqual(old.id, current.id);
    for (const query of ['reply language', 'Find my Claude memory about reply language.']) {
        const hits = c.memory.retrieve(c.w, { query }).hits;
        assert.deepEqual(hits.map(hit => [hit.source_id, hit.older_snapshot]), [[current.id, false], [old.id, true]]);
        assert.equal(hits[1].newer_source_id, current.id);
    }
    assert.match((await createMemoryAgent(c.store, c.domain, c.memory).ask(c.w, { question: 'reply language', use_ai: false })).answer, /earlier import of a file that has changed since/);
    const seen = [];
    await geminiAgent(c, payload => ({ answer: 'Reply in Chinese [1].', citations: [{ source_id: payload.sources[0].source_id, source_version: payload.sources[0].source_version, quote: 'Reply in Chinese by default.' }], actions: [] }), seen)
        .ask(c.w, { question: 'reply language', use_ai: true, consent: true });
    assert.deepEqual(seen[0].payload.sources.map(source => source.older_snapshot), [false, true]);
    assert.match(seen[0].body.systemInstruction.parts[0].text, /older_snapshot true is an earlier import/);
    // Forgetting the newest snapshot makes the earlier one current again.
    c.memory.forgetSource(c.w, current.id, { version: current.version });
    assert.deepEqual(c.memory.retrieve(c.w, { query: 'reply language' }).hits.map(hit => [hit.source_id, hit.older_snapshot]), [[old.id, false]]);
});

check('an earlier import snapshot edited in Threadline is not marked as earlier', c => {
    const lines = last => `# Review style\nUse checklists.\nLink the issue.\n${last}`;
    const old = c.file('codex', 'review.md', lines('Short review notes.'));
    c.file('codex', 'review.md', lines('Detailed review notes.'));
    const marked = () => c.memory.retrieve(c.w, { query: 'review style' }).hits.find(hit => hit.source_id === old.id).older_snapshot;
    assert.equal(marked(), true);
    c.domain.editNote(c.w, old.id, { version: old.version, body: lines('Short review notes, plus one correction.') });
    assert.equal(marked(), false);
});

check('a file reverted to earlier content is previewed as changed and makes that snapshot current again', c => {
    const lines = last => `# Tone\nShort sentences.\nNo emoji.\n${last}`;
    const first = c.file('claude', 'tone.md', lines('Formal tone.'));
    const second = c.file('claude', 'tone.md', lines('Casual tone.'));
    // Import as the page does: preview, then commit the files it pre-selects (new and changed).
    const input = { provider: 'claude', files: [{ path: 'tone.md', content: lines('Formal tone.') }] }, preview = c.imports.preview(c.w, input);
    assert.equal(preview.files[0].status, 'changed'); assert.equal(preview.files[0].source_id, first.id);
    c.imports.commit(c.w, { ...input, confirm: true, preview_hash: preview.preview_hash, selected: preview.files.filter(file => ['new', 'changed'].includes(file.status)).map(({ path, hash }) => ({ path, hash })) });
    assert.deepEqual(c.memory.retrieve(c.w, { query: 'tone' }).hits.map(hit => [hit.source_id, hit.older_snapshot]), [[first.id, false], [second.id, true]]);
    assert.equal(c.imports.preview(c.w, input).files[0].status, 'duplicate');
});

check('a file with the same name from another project is not marked as an earlier snapshot', c => {
    const a = c.file('claude', 'MEMORY.md', '# Project A\nDeploy with Fly.\nUse pnpm for installs.');
    const b = c.file('claude', 'MEMORY.md', '# Project B\nWrite tests first.\nPrefer small pull requests.');
    assert.deepEqual(c.memory.retrieve(c.w, { query: 'deploy fly' }).hits.map(hit => [hit.source_id, hit.older_snapshot]), [[a.id, false]]);
    assert.deepEqual(c.memory.retrieve(c.w, { query: 'tests first' }).hits.map(hit => [hit.source_id, hit.older_snapshot]), [[b.id, false]]);
    // Shared front matter and generated headings are not content: two projects' files stay current.
    const header = '# CLAUDE.md\n\nThis file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.\n\n';
    const api = c.file('claude', 'CLAUDE.md', header + '## Commands\n\nnpm test runs the Vitest suite.\n\n## Architecture\n\nExpress API with Postgres via Prisma.');
    c.file('claude', 'CLAUDE.md', header + '## Commands\n\ncargo test runs the suite.\n\n## Architecture\n\nA Rust command line tool.');
    assert.equal(c.memory.retrieve(c.w, { query: 'Prisma Postgres' }).hits.find(hit => hit.source_id === api.id).older_snapshot, false);
    const role = c.file('claude', 'memory/user_role.md', '---\nname: User role\ndescription: Role of the user\ntype: user\n---\nThe user is on the payments team.');
    c.file('claude', 'memory/user_role.md', '---\nname: User role\ndescription: Role of the user\ntype: user\n---\nThe user leads a data platform group.');
    assert.equal(c.memory.retrieve(c.w, { query: 'payments team' }).hits.find(hit => hit.source_id === role.id).older_snapshot, false);
    // Half of the lines in common is not most of them.
    const index = c.file('claude', 'memory/MEMORY.md', '# Memory index\n- [User role](user_role.md)\n- [Testing](feedback_testing.md): integration tests hit a real database');
    c.file('claude', 'memory/MEMORY.md', '# Memory index\n- [User role](user_role.md)\n- [Deploys](deploys.md): deploy with Fly');
    assert.equal(c.memory.retrieve(c.w, { query: 'integration tests database' }).hits.find(hit => hit.source_id === index.id).older_snapshot, false);
});

check('provider scope marks a snapshot that is current only under another provider', c => {
    const content = '# Build\nUse pnpm for installs.\nRun lint before commits.\nKeep commits small.';
    const shared = c.file('claude', 'CLAUDE.md', content);
    assert.equal(c.file('codex', 'AGENTS.md', content).id, shared.id);
    const codex = c.file('codex', 'AGENTS.md', content + '\nSquash before merge.');
    assert.deepEqual(c.memory.retrieve(c.w, { query: 'Search my Codex memory for pnpm installs.' }).hits.map(hit => [hit.source_id, hit.older_snapshot]), [[codex.id, false], [shared.id, true]]);
    assert.deepEqual(c.memory.retrieve(c.w, { query: 'Search my Claude memory for pnpm installs.' }).hits.map(hit => [hit.source_id, hit.older_snapshot]), [[shared.id, false]]);
    const unscoped = c.memory.retrieve(c.w, { query: 'pnpm installs' }).hits.find(hit => hit.source_id === shared.id);
    assert.equal(unscoped.older_snapshot, false); assert.equal(unscoped.import_provider, 'claude');
});

check('an earlier snapshot holding a confirmed memory is not marked as earlier', c => {
    const old = c.file('claude', 'CLAUDE.md', '# Tools\nUse pnpm for installs.\nRun the linter before commits.');
    const item = c.memory.propose(c.w, old.id, { source_version: old.version, items: [{ kind: 'preference', text: 'Prefers pnpm for installs.', quote: 'Use pnpm for installs.', topic: 'package-manager' }] }, { provider: 'local', model: 'fixture', run_id: 'run-one' }).items[0];
    c.memory.review(c.w, item.id, { version: item.version, decision: 'confirm' });
    const current = c.file('claude', 'CLAUDE.md', '# Tools\nUse pnpm for installs.\nRun the linter before commits.\nPrefer small commits.');
    const hits = c.memory.retrieve(c.w, { query: 'pnpm installs' }).hits;
    assert.deepEqual(new Set(hits.map(hit => hit.source_id)), new Set([old.id, current.id]));
    const kept = hits.find(hit => hit.source_id === old.id);
    assert.equal(kept.older_snapshot, false); assert.equal(kept.evidence_status, 'contains_confirmed_memory');
});

check('a note saved here is never marked as an earlier import snapshot', c => {
    const body = 'Standing desk in the morning.\nWalk after lunch.\nStretch every hour.';
    const manual = c.memory.ingest(c.w, { title: 'Desk setup', body }).source;
    assert.equal(c.file('codex', 'desk.md', body).id, manual.id);
    c.file('codex', 'desk.md', body + '\nStand for calls.');
    assert.equal(c.memory.retrieve(c.w, { query: 'standing desk morning' }).hits.find(hit => hit.source_id === manual.id).older_snapshot, false);
});

check('numbers written against Chinese words still match', c => {
    const october = c.memory.ingest(c.w, { title: '账单', body: '10月份的账单：电费320元。', occurred_on: '2026-10-01' }).source;
    c.memory.ingest(c.w, { title: '账单', body: '9月份的账单：电费280元。', occurred_on: '2026-10-02' });
    assert.equal(c.memory.retrieve(c.w, { query: '10月份的账单' }).hits[0].source_id, october.id);
    const room = c.memory.ingest(c.w, { title: '酒店', body: '住在302房间。' }).source;
    c.memory.ingest(c.w, { title: '酒店', body: '住在1302房间，楼层很高。' });
    assert.equal(c.memory.retrieve(c.w, { query: '302房间' }).hits[0].source_id, room.id);
});

check('a name followed by a one-character verb still finds the person', c => {
    const latte = c.memory.ingest(c.w, { title: '饮品', body: '李明只喝燕麦拿铁，不加糖。' }).source;
    c.memory.ingest(c.w, { title: '附近', body: '公司楼下新开了一家咖啡店。' });
    assert.equal(c.memory.retrieve(c.w, { query: '李明喝什么咖啡？' }).hits[0].source_id, latte.id);
});

check('a Chinese question is answered in its own language with valid citation markers', async c => {
    const target = c.memory.ingest(c.w, { title: '回复语言', body: '默认用中文回答，代码标识符保留英文。' }).source;
    const seen = [];
    const run = await geminiAgent(c, payload => ({ answer: '你希望默认用中文回答 [1]。', citations: [{ source_id: payload.sources[0].source_id, source_version: payload.sources[0].source_version, quote: '默认用中文回答' }], actions: [] }), seen)
        .ask(c.w, { question: '我希望你用什么语言回答？', use_ai: true, consent: true });
    assert.equal(run.state, 'done'); assert.equal(run.citations[0].source_id, target.id); assert.match(run.answer, /\[1\]/);
    const prompt = seen[0].body.systemInstruction.parts[0].text;
    assert.match(prompt, /same language as the question/); assert.doesNotMatch(prompt, /concise English/);
});

check('a bracketed number list copied from a source is not read as citation markers', async c => {
    c.memory.ingest(c.w, { title: 'Retry policy', body: 'Retry delays are [1, 5, 30] seconds. Scores are normalized to [0, 1].' });
    const cite = payload => ({ source_id: payload.sources[0].source_id, source_version: payload.sources[0].source_version, quote: 'Retry delays are [1, 5, 30] seconds.' });
    const ask = answer => geminiAgent(c, payload => ({ answer, citations: [cite(payload)], actions: [] })).ask(c.w, { question: 'retry policy', use_ai: true, consent: true });
    assert.equal((await ask('Retry delays are [1, 5, 30] seconds and scores are normalized to [0, 1] [1].')).state, 'done');
    assert.equal((await ask('Retry delays are listed [1, 3].')).error_code, 'invalid_citation');
});

check('local organize splits Chinese sentences at Chinese punctuation', async c => {
    const source = c.memory.ingest(c.w, { title: '会议', body: '我答应周五前发方案。预算还没确认！下次谁来主持？\n小李说：“我周五把报告发给你。”\n他问：「明天能来吗？」\n我同意。"发布"是周五的决定。' }).source;
    const run = await createMemoryAgent(c.store, c.domain, c.memory).organize(c.w, source.id, { use_ai: false, source_version: source.version });
    assert.deepEqual(run.items.map(item => item.quote), ['我答应周五前发方案。', '预算还没确认！', '下次谁来主持？', '小李说：“我周五把报告发给你。”', '他问：「明天能来吗？」', '我同意。', '"发布"是周五的决定。']);
    assert.deepEqual(run.items.map(item => item.kind === 'open_question'), [false, false, true, false, true, false, false]);
});

check('an AI answer that cites nothing becomes the standard abstention, in any language', async c => {
    const abstain = () => ({ answer: '我找不到能回答这个问题的已保存内容。', citations: [], actions: [] });
    const none = await geminiAgent(c, abstain).ask(c.w, { question: '企鹅什么时候搬家？', use_ai: true, consent: true });
    assert.equal(none.state, 'done'); assert.deepEqual(none.citations, []); assert.match(none.answer, /could not find a saved source/);
    // A weakly related source is retrieved, and the model still finds no answer in it.
    c.memory.ingest(c.w, { title: '附近', body: '公司楼下新开了一家咖啡店。' });
    const weak = await geminiAgent(c, abstain).ask(c.w, { question: '我妈妈喜欢喝什么咖啡？', use_ai: true, consent: true });
    assert.equal(weak.state, 'done'); assert.match(weak.answer, /could not find a saved source/);
});

test('provider-scoped retrieval also works before the optional import schema exists', () => {
    const store = openStore(':memory:'), domain = createDomain(store), memory = createMemoryStore(store, domain), user = uid(), w = uid();
    try {
        store.db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(user, `${user}@example.invalid`, 'Owner', 'fixture', now());
        store.db.prepare('INSERT INTO workspaces(id,owner_id,name,created_at) VALUES(?,?,?,?)').run(w, user, 'Workspace', now());
        memory.ingest(w, { title: 'Mechanical parallelism', body: 'Ordinary notes remain available for an unscoped search.' });
        assert.equal(memory.retrieve(w, { query: 'mechanical parallelism', providers: ['codex'] }).hits.length, 0);
        assert.equal(memory.retrieve(w, { query: 'mechanical parallelism' }).hits.length, 1);
        assert.throws(() => memory.retrieve(w, { query: 'mechanical', providers: ['invented'] }), /Codex or Claude/);
    } finally { store.close(); }
});
