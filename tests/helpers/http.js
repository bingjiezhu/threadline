import test from 'node:test';
import http from 'node:http';
import assert from 'node:assert/strict';
import { makeApp } from '../../server.js';
import { uid, now, hash } from '../../src/util.js';
export const invite = 'local-test-invitation-code-32chars';
export async function setup(config = {}) {
    const app = makeApp({ dbPath: ':memory:', registrationToken: invite, ...config });
    await new Promise(r => app.server.listen(0, '127.0.0.1', r));
    const base = 'http://127.0.0.1:' + app.server.address().port;
    const client = () => ({ cookie: '', csrf: '', async call(path, method = 'GET', input, extra = {}) { const headers = { ...(this.cookie ? { cookie: this.cookie } : {}), ...(method === 'GET' ? {} : { 'content-type': 'application/json', 'origin': base, 'x-csrf-token': this.csrf, 'idempotency-key': uid() }), ...extra }; const res = await fetch(base + path, { method, headers, ...(method !== 'GET' ? { body: JSON.stringify(input ?? {}) } : {}) }); const set = res.headers.get('set-cookie'); if (set)
            this.cookie = set.split(';')[0]; const data = await res.json(); if (data.csrf)
            this.csrf = data.csrf; return { status: res.status, data, headers: res.headers }; }, async register(mail = 'owner@example.com') { const r = await this.call('/api/auth/register', 'POST', { name: 'Owner', email: mail, password: 'This is a real passphrase!', workspace: 'My real workspace', inviteCode: invite }); assert.equal(r.status, 200); return r.data; } });
    return { app, base, client };
}
export function apiTest(name, fn) { test(name, async () => { const c = await setup(); try {
    await fn(c);
}
finally {
    await c.app.close();
} }); }
