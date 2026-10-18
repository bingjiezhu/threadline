/** Load a private operator handoff without shell eval or printing credentials. */
import { readFileSync, lstatSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { config, run } from './bridge.mjs';

const FIELDS = {
  apiKey: 'PHOTON_API_KEY', projectId: 'PHOTON_PROJECT_ID', testSender: 'PHOTON_TEST_SENDER', agentHandle: 'PHOTON_AGENT_HANDLE',
  minCreatedAt: 'PHOTON_MIN_CREATED_AT', maxSeconds: 'PHOTON_MAX_SECONDS', stateDir: 'PHOTON_STATE_DIR',
  appOrigin: 'THREADLINE_APP_ORIGIN', appAccessFile: 'THREADLINE_APP_ACCESS_FILE',
  assistantStateFile: 'THREADLINE_ASSISTANT_STATE_FILE', vertexConfigFile: 'THREADLINE_VERTEX_CONFIG_FILE',
  replyLanguage: 'THREADLINE_REPLY_LANGUAGE',
};

export function loadPrivateConfig(path, inheritedEnv = process.env) {
  if (!path) throw Error('Provide the private JSON path.');
  const stat = lstatSync(path);
  if (!stat.isFile() || (stat.mode & 0o077) !== 0) throw Error('Private handoff must be a regular mode-600 file.');
  const values = JSON.parse(readFileSync(path, 'utf8'));
  if (!values || Array.isArray(values) || typeof values !== 'object' || Object.keys(values).some(key => !Object.hasOwn(FIELDS, key))) {
    throw Error('Unexpected private handoff field.');
  }
  const env = { ...inheritedEnv };
  for (const [field, name] of Object.entries(FIELDS)) {
    if (values[field] !== undefined) env[name] = String(values[field]);
  }
  return config(env);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await run(loadPrivateConfig(process.argv[2])); }
  catch { console.error(JSON.stringify({ state: 'failed', message: 'Transport stopped. Check the private handoff and local app; credentials are not logged.' })); process.exitCode = 1; }
}
