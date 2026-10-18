/** Offline channel-contract tests. These do not claim live Photon delivery. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, stat, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { config, matching, run } from './bridge.mjs';
import { loadPrivateConfig } from './launch-private.mjs';

const START = Date.parse('2026-10-18T20:00:00Z');
const ENV = {
  PHOTON_API_KEY: 'synthetic-contract-key', PHOTON_PROJECT_ID: 'pho_prj_contract_fixture',
  PHOTON_TEST_SENDER: 'human@example.invalid', PHOTON_AGENT_HANDLE: 'agent@example.invalid',
};
const message = (id = 'incoming-1', extra = {}) => ({
  id, platform: 'imessage', status: 'received', createdAt: new Date(START + 1000).toISOString(),
  sentBy: { id: 'human-1', kind: 'human', platform: 'imessage', handle: ENV.PHOTON_TEST_SENDER },
  receivedBy: { id: 'agent-1', kind: 'agent', platform: 'imessage', handle: ENV.PHOTON_AGENT_HANDLE },
  space: { id: 'direct-1', kind: 'direct', platform: 'imessage' },
  content: { type: 'text', format: 'plain', text: 'Who should I follow up with?' }, ...extra,
});

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'threadline-photon-contract-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const c = config({ ...ENV, PHOTON_STATE_DIR: join(dir, 'state') });
  return { dir, c };
}

function harness({ messages = [message()], send, call, list, start = START, maxPolls = 3 } = {}) {
  let clock = start;
  const calls = [], sends = [], lists = [], logs = [];
  class FakePhoton {
    constructor(options) {
      assert.equal(options.retry, false);
      assert.equal(options.timeoutMs, 15000);
      this.projects = {
        listMessages: async request => { lists.push(request); return list ? list(request, lists.length) : { items: messages }; },
        sendMessage: async request => { sends.push(request); return send ? send(request, sends.length) : { id: 'outbound-1', status: 'accepted' }; },
      };
    }
  }
  const deps = {
    Photon: FakePhoton, now: () => clock, sleep: async ms => { clock += ms; }, log: value => logs.push(value), maxPolls,
    workflowFactory: async () => ({
      call: async (...args) => { calls.push(args); return call ? call(...args) : 'Alex asked about private deployment. Recheck whether the need is current.'; },
      close: async () => {},
    }),
  };
  return { deps, calls, sends, lists, logs };
}

async function state(c) { return JSON.parse(await readFile(join(c.stateDir, 'state.json'), 'utf8')); }

test('channel contract: only exact configured human → agent direct iMessage text is eligible', () => {
  const c = config(ENV), m = message();
  assert.equal(matching(m, c, START), true);
  const rejected = [
    { platform: 'discord' }, { status: 'sent' }, { createdAt: new Date(START - 1).toISOString() },
    { sentBy: { ...m.sentBy, handle: 'someone-else@example.invalid' } },
    { sentBy: { ...m.sentBy, kind: 'agent' } }, { receivedBy: { ...m.receivedBy, handle: 'other-agent' } },
    { receivedBy: { ...m.receivedBy, id: m.sentBy.id } }, { space: { ...m.space, kind: 'group' } },
    { content: { ...m.content, format: 'html' } }, { id: '' }, { space: undefined },
  ];
  for (const override of rejected) assert.equal(matching({ ...m, ...override }, c, START), false, JSON.stringify(override));
});

test('channel contract: default 600-second window, explicit maximum 2 hours, invalid limits rejected', () => {
  assert.equal(config(ENV).seconds, 600);
  assert.equal(config({ ...ENV, PHOTON_MAX_SECONDS: '7200' }).seconds, 7200);
  for (const value of ['7201', '0', '-1', 'NaN']) assert.throws(() => config({ ...ENV, PHOTON_MAX_SECONDS: value }));
});

test('channel contract: wrong identities and historical messages never call app or send', async t => {
  const { c } = await fixture(t);
  const m = message();
  const h = harness({ messages: [message('old', { createdAt: new Date(START - 1).toISOString() }), message('wrong', { sentBy: { ...m.sentBy, handle: 'other' } })] });
  const result = await run(c, h.deps);
  assert.equal(result.seen, 0); assert.equal(h.calls.length, 0); assert.equal(h.sends.length, 0);
  assert.equal(h.lists[0].query.createdSince, new Date(START).toISOString());
});

test('channel contract: pending send survives outage; fixed key and persisted reply avoid duplicate app writes', async t => {
  const { c } = await fixture(t);
  const h = harness({
    send: async (request, attempt) => {
      const saved = await state(c);
      const entry = Object.values(saved.outbox)[0];
      assert.equal(entry.reply, request.body.content.text);
      assert.equal(entry.idempotencyKey, request.headers['idempotency-key']);
      if (attempt === 1) throw new Error('Synthetic network outage; do not log the detail');
      return { id: 'sent-after-retry', status: 'accepted' };
    },
  });
  const result = await run(c, h.deps);
  assert.deepEqual(result, { polls: 3, pending: 0, seen: 1 });
  assert.equal(h.calls.length, 1); assert.equal(h.sends.length, 2);
  assert.equal(h.calls[0][0], 'direct-1:human-1');
  assert.deepEqual(h.calls[0][2], { messageId: 'incoming-1', createdAt: message().createdAt });
  assert.deepEqual(h.sends[0], h.sends[1]);
  assert.equal(h.sends[0].body.spaceId, message().space.id);
  assert.equal(h.sends[0].body.senderId, message().receivedBy.id);
  assert.equal(Object.hasOwn(h.sends[0].body, 'parentMessageId'), false);
  assert.equal((await stat(c.stateDir)).mode & 0o777, 0o700);
  assert.equal((await stat(join(c.stateDir, 'state.json'))).mode & 0o777, 0o600);
  assert.doesNotMatch(JSON.stringify(h.logs), /synthetic-contract-key|Synthetic network outage|example.invalid/);
});

test('channel contract: process restart flushes saved outbox without re-running app, then durably deduplicates', async t => {
  const { c } = await fixture(t);
  const first = harness({ maxPolls: 1, send: async () => { throw new Error('offline'); } });
  assert.equal((await run(c, first.deps)).pending, 1);
  const savedKey = first.sends[0].headers['idempotency-key'];
  const second = harness({ start: START + 10000, messages: [], maxPolls: 1 });
  assert.equal((await run(c, second.deps)).seen, 1);
  assert.equal(second.calls.length, 0); assert.equal(second.sends.length, 1);
  assert.equal(second.sends[0].headers['idempotency-key'], savedKey);
  assert.equal(second.sends[0].body.content.text, first.sends[0].body.content.text);
  assert.equal(second.lists[0].query.createdSince, new Date(START + 10000).toISOString(), 'restart does not chase historical messages');
  const third = harness({ start: START + 20000, maxPolls: 1 });
  await run({ ...c, minCreatedAt: START }, third.deps);
  assert.equal(third.calls.length, 0); assert.equal(third.sends.length, 0);
});

test('channel contract: ambiguous interrupted app work is never automatically repeated after restart', async t => {
  const { c } = await fixture(t);
  const seed = harness({ messages: [], maxPolls: 1 });
  await run(c, seed.deps);
  const saved = await state(c);
  saved.inbox['interrupted'] = message('interrupted-message');
  await writeFile(join(c.stateDir, 'state.json'), JSON.stringify(saved), { mode: 0o600 });
  const recovered = harness({ messages: [], maxPolls: 1, start: START + 10000 });
  await run(c, recovered.deps);
  assert.equal(recovered.calls.length, 0);
  assert.equal(recovered.sends.length, 1);
  assert.match(recovered.sends[0].body.content.text, /did not repeat the action/);
});

test('channel contract: a local app exception gives a concise check-before-retrying reply without exposing exception', async t => {
  const { c } = await fixture(t);
  const h = harness({ call: async () => { throw new Error('secret-token and raw SQL'); } });
  await run(c, h.deps);
  assert.equal(h.calls.length, 1); assert.equal(h.sends.length, 1);
  assert.match(h.sends[0].body.content.text, /Check Threadline before retrying/);
  assert.doesNotMatch(JSON.stringify(h.logs) + h.sends[0].body.content.text, /secret-token|raw SQL/);
});

test('channel contract: send retries are bounded, durable pending remains available for operator restart', async t => {
  const { c } = await fixture(t);
  const h = harness({ maxPolls: 30, send: async () => { throw new Error('offline'); } });
  const result = await run(c, h.deps);
  assert.equal(result.pending, 1); assert.equal(h.calls.length, 1); assert.equal(h.sends.length, 4);
});

test('channel contract: poll failures back off and stop after six attempts without any unsolicited send', async t => {
  const { c } = await fixture(t);
  const h = harness({ maxPolls: 30, list: async () => { throw new Error('offline'); } });
  const result = await run(c, h.deps);
  assert.equal(result.polls, 6); assert.equal(h.calls.length, 0); assert.equal(h.sends.length, 0);
});

test('channel contract: state cannot be reused for a different authorized recipient', async t => {
  const { c } = await fixture(t);
  await run(c, harness({ messages: [], maxPolls: 1 }).deps);
  await assert.rejects(() => run({ ...c, agent: 'different-agent' }, harness().deps), /does not match/);
});

test('private handoff accepts assistant paths and forwards environment without printing credentials', async t => {
  const { dir } = await fixture(t);
  const path = join(dir, 'handoff.json');
  const value = { apiKey: ENV.PHOTON_API_KEY, projectId: ENV.PHOTON_PROJECT_ID, testSender: ENV.PHOTON_TEST_SENDER, agentHandle: ENV.PHOTON_AGENT_HANDLE,
    appOrigin: 'http://127.0.0.1:4173', appAccessFile: '/private/app-access.json', assistantStateFile: '/private/assistant.json',
    vertexConfigFile: '/private/vertex.json', stateDir: join(dir, 'another-state'), maxSeconds: 7200 };
  await writeFile(path, JSON.stringify(value), { mode: 0o600 });
  const c = loadPrivateConfig(path, {});
  assert.equal(c.seconds, 7200); assert.equal(c.env.THREADLINE_APP_ORIGIN, value.appOrigin);
  assert.equal(c.env.THREADLINE_APP_ACCESS_FILE, value.appAccessFile);
  assert.equal(c.env.THREADLINE_ASSISTANT_STATE_FILE, value.assistantStateFile);
  assert.equal(c.env.THREADLINE_VERTEX_CONFIG_FILE, value.vertexConfigFile);
  await writeFile(path, JSON.stringify({ ...value, unsupported: true }));
  assert.throws(() => loadPrivateConfig(path, {}), /Unexpected/);
});


test('channel contract: an explicit failed provider receipt remains pending and never becomes accepted proof', async t => {
  const { c } = await fixture(t);
  const h = harness({ maxPolls: 5, send: async () => ({ id: 'failed-outbound', status: 'failed' }) });
  const result = await run(c, h.deps);
  assert.equal(result.pending, 1); assert.equal(result.seen, 0); assert.equal(h.sends.length, 1);
  assert.equal(h.logs.some(event => event.state === 'dispatch_accepted'), false);
});
