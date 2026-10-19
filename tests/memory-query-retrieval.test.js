import test from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../src/store.js';
import { createDomain } from '../src/domain.js';
import { createMemoryStore } from '../src/memory-store.js';
import { createMemoryImport } from '../src/memory-import.js';
import { createMemoryAgent } from '../src/memory-agent.js';
import { analyzeMemoryQuery, isMemoryRecallRequest } from '../src/memory-query.js';
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
