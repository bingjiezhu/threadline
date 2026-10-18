/** Inbound-only Photon Beta iMessage transport. Runtime state is private and local. */
import { createHash } from 'node:crypto';
import { open, readFile, rename, mkdir, chmod, unlink, lstat } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const MAX_SEND_ATTEMPTS = 4;
const MAX_POLL_ERRORS = 6;
const RECOVERED_REPLY = 'The previous request was interrupted. Check Threadline before retrying; I did not repeat the action.';
const LOCAL_ERROR_REPLY = 'I could not finish this request. Check Threadline before retrying; no message was sent to your contacts.';

export function config(env = process.env) {
  for (const key of ['PHOTON_API_KEY', 'PHOTON_PROJECT_ID', 'PHOTON_TEST_SENDER', 'PHOTON_AGENT_HANDLE']) {
    if (!env[key]) throw Error('Missing ' + key);
  }
  if (!env.PHOTON_PROJECT_ID.startsWith('pho_prj_')) throw Error('Use a Beta pho_prj_ project.');
  const seconds = env.PHOTON_MAX_SECONDS ? Number(env.PHOTON_MAX_SECONDS) : 600;
  if (!Number.isFinite(seconds) || seconds < 10 || seconds > 7200) {
    throw Error('PHOTON_MAX_SECONDS must be between 10 and 7200; default is 600.');
  }
  return {
    key: env.PHOTON_API_KEY, project: env.PHOTON_PROJECT_ID,
    sender: env.PHOTON_TEST_SENDER, agent: env.PHOTON_AGENT_HANDLE,
    minCreatedAt: env.PHOTON_MIN_CREATED_AT ? Date.parse(env.PHOTON_MIN_CREATED_AT) : null,
    seconds, stateDir: resolve(env.PHOTON_STATE_DIR || join(HERE, '.runtime', 'transport')), env,
  };
}

/** Never widen this gate to groups, other senders, channels, or recipient handles. */
export function matching(m, c, start) {
  return typeof m?.id === 'string' && m.id.length > 0
    && m.platform === 'imessage' && m.status === 'received' && Date.parse(m.createdAt) >= start
    && m.sentBy?.platform === 'imessage' && m.sentBy.kind === 'human' && m.sentBy.handle === c.sender
    && typeof m.sentBy.id === 'string' && m.sentBy.id.length > 0
    && m.receivedBy?.platform === 'imessage' && m.receivedBy.kind === 'agent' && m.receivedBy.handle === c.agent
    && typeof m.receivedBy.id === 'string' && m.receivedBy.id.length > 0 && m.sentBy.id !== m.receivedBy.id
    && m.space?.platform === 'imessage' && m.space.kind === 'direct' && typeof m.space.id === 'string' && m.space.id.length > 0
    && m.content?.type === 'text' && m.content.format === 'plain' && typeof m.content.text === 'string';
}

export async function startWorkflow({ env = process.env } = {}) {
  const { createAssistant } = await import('./assistant.mjs');
  return createAssistant({ env });
}

const hash = text => createHash('sha256').update(text).digest('hex');
const retryDelay = attempt => Math.min(30000, 1000 * 2 ** (attempt - 1));
const apiStatus = error => Number.isInteger(error?.status) ? error.status : null;
const isRetryable = error => !error?.permanent && (!apiStatus(error) || [408, 409, 425, 429].includes(apiStatus(error)) || apiStatus(error) >= 500);

async function openStore(c) {
  await mkdir(c.stateDir, { recursive: true, mode: 0o700 });
  if (!(await lstat(c.stateDir)).isDirectory()) throw Error('State directory must be a real directory.');
  await chmod(c.stateDir, 0o700);
  const lockPath = join(c.stateDir, 'transport.lock');
  let lock;
  for (let attempt = 0; attempt < 2; attempt++) {
    try { lock = await open(lockPath, 'wx', 0o600); break; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const oldPid = Number(await readFile(lockPath, 'utf8'));
      if (!Number.isSafeInteger(oldPid) || oldPid <= 0) throw Error('Transport lock needs operator review.');
      try { process.kill(oldPid, 0); throw Error('Another transport is already using this state directory.'); }
      catch (cause) { if (cause.code !== 'ESRCH') throw cause; }
      await unlink(lockPath);
    }
  }
  if (!lock) throw Error('Could not acquire transport lock.');
  await lock.writeFile(String(process.pid));
  await lock.sync();
  const path = join(c.stateDir, 'state.json');
  const binding = hash(JSON.stringify([c.project, c.sender, c.agent]));
  let data = { version: 1, binding, inbox: {}, outbox: {}, seen: {} };
  try {
    try {
      const info = await lstat(path);
      if (!info.isFile() || (info.mode & 0o077)) throw Error('Transport state must be a private regular file.');
      data = JSON.parse(await readFile(path, 'utf8'));
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (data.version !== 1 || data.binding !== binding || !data.inbox || !data.outbox || !data.seen) {
      throw Error('Transport state does not match this configured conversation.');
    }
    const store = {
      data,
      async save() {
        try {
        const temp = join(c.stateDir, `.state-${process.pid}.tmp`);
        const file = await open(temp, 'w', 0o600);
        try { await file.writeFile(JSON.stringify(data)); await file.sync(); } finally { await file.close(); }
        await chmod(temp, 0o600);
        await rename(temp, path);
        const directory = await open(c.stateDir, 'r');
        try { await directory.sync(); } finally { await directory.close(); }
        } catch (error) { error.name = 'StatePersistenceError'; throw error; }
      },
      async close() { await lock.close(); await unlink(lockPath); },
    };
    await store.save();
    return store;
  } catch (error) {
    await lock.close(); await unlink(lockPath); throw error;
  }
}

/** deps inject only the channel contract for offline tests; no fake is used by CLI. */
export async function run(c, deps = {}) {
  const now = deps.now || Date.now;
  const wait = deps.sleep || sleep;
  const log = deps.log || (event => console.log(JSON.stringify(event)));
  const started = now();
  const minTime = c.minCreatedAt ?? started;
  if (!Number.isFinite(minTime) || minTime > started || minTime < started - 15 * 60 * 1000) {
    throw Error('Authorized message cutoff must be within the last 15 minutes.');
  }
  const store = await openStore(c);
  let workflow;
  let stopping = false;
  const stop = () => { stopping = true; };
  const alive = () => !stopping && now() - started < c.seconds * 1000;
  process.once('SIGTERM', stop); process.once('SIGINT', stop);
  const attempts = new Map();
  const nextAttempt = new Map();
  let polls = 0, pollErrors = 0;
  try {
    const Photon = deps.Photon || (await import('@photon-ai/api')).Photon;
    const photon = new Photon({ headers: { Authorization: `Bearer ${c.key}` }, timeoutMs: 15000, retry: false });
    workflow = await (deps.workflowFactory || startWorkflow)({ env: c.env || process.env });
    // A crash between an application write and reply persistence is ambiguous. Do not replay
    // that write. Preserve the inbox and prepare a concise check-before-retrying response.
    for (const [key, incoming] of Object.entries(store.data.inbox)) {
      if (!store.data.seen[key] && !store.data.outbox[key]) {
        store.data.outbox[key] = makeOutbox(incoming, RECOVERED_REPLY);
      }
    }
    await store.save();
    log({ state: 'ready', channel: 'Photon Beta iMessage', max_seconds: c.seconds, note: 'Only configured inbound messages; no delivery claim.' });

    async function flush() {
      for (const [key, outbound] of Object.entries(store.data.outbox)) {
        if (!alive() || store.data.seen[key] || (attempts.get(key) || 0) >= MAX_SEND_ATTEMPTS || now() < (nextAttempt.get(key) || 0)) continue;
        const incoming = store.data.inbox[key];
        if (!incoming || !matching(incoming, c, 0)) throw Error('Outbox conversation binding is invalid.');
        const count = (attempts.get(key) || 0) + 1;
        attempts.set(key, count);
        outbound.attempts = (outbound.attempts || 0) + 1;
        await store.save();
        try {
          const sent = await photon.projects.sendMessage({
            path: { id: c.project }, headers: { 'idempotency-key': outbound.idempotencyKey },
            body: { spaceId: incoming.space.id, senderId: incoming.receivedBy.id, content: { type: 'text', format: 'plain', text: outbound.reply } },
          });
          if (sent?.status === 'failed') {
            const failure = new Error('The provider did not accept delivery.');
            failure.permanent = true;
            throw failure;
          }
          const outboundId = sent?.id ?? sent?.message?.id;
          if (!outboundId || !['accepted', 'dispatched', 'delivered'].includes(sent.status)) throw Error('Ambiguous send response');
          store.data.seen[key] = { sentAt: new Date(now()).toISOString(), outboundId };
          delete store.data.outbox[key];
          await store.save();
          log({ state: 'dispatch_accepted', incoming_id: incoming.id, outbound_id: store.data.seen[key].outboundId, delivery_confirmed: false, app_outreach_sent: false });
        } catch (error) {
          if (error.name === 'StatePersistenceError') throw error;
          const retryable = isRetryable(error);
          if (!retryable) attempts.set(key, MAX_SEND_ATTEMPTS);
          nextAttempt.set(key, now() + retryDelay(count));
          log({ state: 'reply_pending', incoming_id: incoming.id, attempt: count, status: apiStatus(error), retryable });
        }
      }
    }

    while (alive() && polls < (deps.maxPolls ?? Infinity)) {
      await flush();
      if (!alive()) break;
      polls++;
      let pageToken;
      const visited = new Set();
      try {
        do {
          const page = await photon.projects.listMessages({ path: { id: c.project }, query: {
            createdSince: new Date(minTime).toISOString(), direction: 'received', order: 'asc', pageSize: 100, platform: 'imessage', ...(pageToken ? { pageToken } : {}),
          } });
          for (const m of page.items || []) {
            if (!alive()) break;
            if (!matching(m, c, minTime)) continue;
            const key = hash(m.id);
            if (store.data.inbox[key] || store.data.seen[key]) continue;
            store.data.inbox[key] = m;
            await store.save();
            log({ state: 'matched_inbound', incoming_id: m.id, created_at: m.createdAt, channel: 'imessage' });
            let reply;
            try {
              reply = await workflow.call(m.space.id + ':' + m.sentBy.id, m.content.text, { messageId: m.id, createdAt: m.createdAt });
              if (typeof reply !== 'string' || !reply.trim()) throw Error('Empty reply');
            } catch {
              reply = LOCAL_ERROR_REPLY;
              log({ state: 'app_action_needs_review', incoming_id: m.id });
            }
            store.data.outbox[key] = makeOutbox(m, reply);
            await store.save(); // Persist the exact response before any network send.
            await flush();
          }
          pageToken = page.nextPageToken;
          if (pageToken && visited.has(pageToken)) throw Error('Repeated page token');
          visited.add(pageToken);
        } while (pageToken && alive());
        pollErrors = 0;
      } catch (error) {
        if (error.name === 'StatePersistenceError') throw error;
        pollErrors++;
        log({ state: 'poll_unavailable', consecutive_failures: pollErrors, status: apiStatus(error) });
        if (!isRetryable(error) || pollErrors >= MAX_POLL_ERRORS) break;
      }
      if (alive() && polls < (deps.maxPolls ?? Infinity)) await wait(pollErrors ? retryDelay(pollErrors) : 2000);
    }
    log({ state: 'stopped', pending_replies: Object.keys(store.data.outbox).length });
    return { polls, pending: Object.keys(store.data.outbox).length, seen: Object.keys(store.data.seen).length };
  } finally {
    try { await workflow?.close(); }
    finally { process.removeListener('SIGTERM', stop); process.removeListener('SIGINT', stop); await store.close(); }
  }
}

function makeOutbox(incoming, reply) {
  return { reply, idempotencyKey: 'threadline-photon-v2:' + hash(incoming.id), attempts: 0 };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await run(config()); }
  catch { console.error(JSON.stringify({ state: 'failed', message: 'Transport stopped. Check private configuration and local service; no credentials are logged.' })); process.exitCode = 1; }
}
