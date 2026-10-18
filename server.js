import { createMemoryImport } from './src/memory-import.js';
import { createMemoryStore } from './src/memory-store.js';
import { createMemoryAgent } from './src/memory-agent.js';
import { createConversationService } from './src/conversation-service.js';
import { createWarmStart } from './src/warm-start.js';
import { createChatConnectors } from './src/chat-connectors.js';
import { createRelationships } from './src/relationships.js';
import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openStore } from './src/store.js';
import { createAuth } from './src/auth.js';
import { createDomain } from './src/domain.js';
import { createAI } from './src/ai.js';
import { createSourceReview } from './src/source-review.js';
import { uid, now, hash, text, email, ensure, only, safeEqual, AppError } from './src/util.js';
const ROOT = dirname(fileURLToPath(import.meta.url));
export function makeApp(config = {}) {
    const store = openStore(config.dbPath), domain = createDomain(store), auth = createAuth(store, config), ai = createAI(store, domain, { key: config.openaiKey, model: config.openaiModel, dailyLimit: config.dailyLimit, fetchImpl: config.fetchImpl, requestTimeoutMs: config.aiRequestTimeoutMs, provider: config.aiProvider, vertexProject: config.vertexProject, vertexAccessToken: config.vertexAccessToken, tokenProvider: config.tokenProvider });
    const memory = createMemoryStore(store, domain);
    const memoryImport = createMemoryImport(store, domain, memory);
    const memoryAgent = createMemoryAgent(store, domain, memory, { vertexProject: config.vertexProject, vertexModel: config.openaiModel, tokenProvider: config.tokenProvider, vertexAccessToken: config.vertexAccessToken, fetchImpl: config.fetchImpl });
    const conversations = createConversationService(store, domain, memoryAgent, dispatch, config);
    const relationships = createRelationships(store, domain);
    const warm = createWarmStart(store, domain);
    const sourceReview = createSourceReview(store, domain, warm);
    const chats = createChatConnectors(store, domain, relationships, config);
    const inflight = new Set();
    const security = { 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'x-frame-options': 'DENY', 'permissions-policy': 'camera=(), microphone=(), geolocation=()', 'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'" };
    function send(res, status, data, extra = {}) { res.writeHead(status, { ...security, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'private, no-store', ...extra }); res.end(JSON.stringify(data)); }
    async function body(req) {
        const chunks = [];
        let size = 0;
        for await (const b of req) {
            size += b.length;
            ensure(size <= 12 * 1024 * 1024, 'Request exceeds 12 MB.', 413, 'too_large');
            chunks.push(b);
        }
        if (!size)
            return {};
        ensure((req.headers['content-type'] || '').startsWith('application/json'), 'Use application/json.', 415, 'unsupported_media');
        try {
            return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)));
        }
        catch {
            throw new AppError('Request must be valid UTF-8 JSON.');
        }
    }
    const cookie = session => `threadline_session=${session.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${config.secureCookies ? '; Secure' : ''}`;
    const getToken = req => (req.headers.cookie || '').split(';').map(s => s.trim()).find(s => s.startsWith('threadline_session='))?.slice(19);
    const wrap = fn => store.tx(fn);
    async function dispatch(req, url, input, s) {
        const w = s.user.workspace_id, p = url.pathname, m = req.method, match = (re) => p.match(re);
        if (m === 'GET' && p === '/api/state')
            return { ...domain.state(w), ai: ai.status(w), memoryAgent: memoryAgent.status(w), user: s.user, release: '1.4.0', demo: config.demo === true };
        if (m === 'GET' && p === '/api/memory') { const current=memory.state(w), imports=memoryImport.sources(w); return { ...current, sources: current.sources.map(source => ({...source, imports: imports[source.id] || []})), agent: memoryAgent.status(w) }; }
        if (m === 'POST' && p === '/api/memory/imports/preview') return memoryImport.preview(w,input);
        if (m === 'POST' && p === '/api/memory/imports/commit') return memoryImport.commit(w,input);
        if (m === 'GET' && p === '/api/memory/search') return memory.retrieve(w, { query: url.searchParams.get('q') || '', limit: Math.min(25, Math.max(1, Number(url.searchParams.get('limit')) || 20)), contact_id: url.searchParams.get('contact_id') || undefined, project_id: url.searchParams.get('project_id') || undefined });
        if (m === 'POST' && p === '/api/memory/sources') return memory.ingest(w, input);
        let mem = match(/^\/api\/memory\/sources\/([\w-]+)$/);
        if (mem && m === 'GET') return { ...memory.getSource(w, mem[1]), imports: memoryImport.provenance(w,mem[1]) };
        if (mem && m === 'PATCH') return wrap(() => domain.editNote(w, mem[1], input));
        mem = match(/^\/api\/memory\/sources\/([\w-]+)\/(organize|forget)$/);
        if (mem && m === 'POST') return mem[2] === 'forget' ? memory.forgetSource(w, mem[1], input) : memoryAgent.organize(w, mem[1], { use_ai: false, ...input });
        mem = match(/^\/api\/memory\/items\/([\w-]+)\/(review|supersede)$/);
        if (mem && m === 'POST') return mem[2] === 'review' ? memory.review(w, mem[1], input) : memory.supersede(w, mem[1], input);
        if (m === 'POST' && p === '/api/memory/agent/ask') return memoryAgent.ask(w, { use_ai: false, ...input });
        if (m === 'GET' && p === '/api/memory/agent/history') return memoryAgent.history(w, url.searchParams.get('thread_id') || undefined);
        mem = match(/^\/api\/memory\/agent\/runs\/([\w-]+)(?:\/actions\/(\d+)\/(confirm))?$/);
        if (mem && m === 'GET' && !mem[3]) return memoryAgent.getRun(w, mem[1]);
        if (mem && m === 'POST' && mem[3]) return memoryAgent.confirmAction(w, mem[1], Number(mem[2]), input);
        if (m === 'POST' && p === '/api/memory/conversations/message') return conversations.message(s, input);
        if (m === 'GET' && p === '/api/warm')
            return warm.home(w);
        const sr = match(/^\/api\/warm\/source-reviews\/([\w-]+)(?:\/(confirm))?$/);
        if (sr && m === 'GET' && !sr[2]) return sourceReview.read(w, sr[1]);
        if (sr && m === 'POST' && sr[2] === 'confirm') return sourceReview.confirm(w, sr[1], input);
        const sg = match(/^\/api\/warm\/goals\/([\w-]+)\/source-review$/);
        if (sg && m === 'POST') return ai.reviewSource(w, sg[1], input, sourceReview);
        if (m === 'POST' && p === '/api/warm/routes')
            return wrap(() => warm.createRoute(w, input));
        let wa = match(/^\/api\/warm\/routes\/([\w-]+)$/);
        if (wa && m === 'DELETE')
            return wrap(() => warm.revoke(w, wa[1], input));
        if (m === 'POST' && p === '/api/warm/goals')
            return wrap(() => warm.createGoal(w, input));
        wa = match(/^\/api\/warm\/goals\/([\w-]+)$/);
        if (wa && m === 'GET')
            return warm.goal(w, wa[1]);
        if (wa && m === 'PATCH')
            return wrap(() => warm.editGoal(w, wa[1], input));
        wa = match(/^\/api\/warm\/goals\/([\w-]+)\/plan$/);
        if (wa && m === 'POST') {
            only(input, ['use_ai', 'consent']);
            return input.use_ai ? ai.warmPlan(w, wa[1], { consent: input.consent }, warm) : warm.plan(w, wa[1]);
        }
        wa = match(/^\/api\/warm\/plans\/([\w-]+)\/approve$/);
        if (wa && m === 'POST')
            return warm.approve(w, wa[1], input);
        wa = match(/^\/api\/warm\/plans\/([\w-]+)\/draft$/);
        if (wa && m === 'PATCH')
            return wrap(() => warm.saveDraft(w, wa[1], input));
        if (m === 'GET' && p === '/api/connections')
            return chats.home(w);
        if (m === 'POST' && p === '/api/connections/code')
            return chats.issue(w, input);
        wa = match(/^\/api\/connections\/([\w-]+)$/);
        if (wa && m === 'DELETE') {
            only(input, []);
            return chats.unlink(w, wa[1]);
        }
        wa = match(/^\/api\/inbox\/([\w-]+)\/(confirm|dismiss)$/);
        if (wa && m === 'POST')
            return wa[2] === 'confirm' ? chats.confirm(w, wa[1], input) : chats.dismiss(w, wa[1], input);
        if (m === 'POST' && p === '/api/capture')
            return relationships.capture(w, input);
        if (m === 'GET' && p === '/api/people/find')
            return relationships.findPeople(w, url.searchParams.get('q') || '');
        if (m === 'GET' && p === '/api/week')
            return relationships.week(w);
        if (m === 'POST' && p === '/api/discovery/feedback')
            return wrap(() => relationships.feedback(w, input));
        const contactBrief = match(/^\/api\/contacts\/([\w-]+)\/brief$/);
        if (contactBrief && m === 'GET')
            return relationships.brief(w, contactBrief[1]);
        const taskICS = match(/^\/api\/tasks\/([\w-]+)\/calendar$/);
        if (taskICS && m === 'GET')
            return { filename: 'threadline-reminder.ics', content_type: 'text/calendar', content: relationships.calendar(w, taskICS[1]) };
        if (m === 'PATCH' && p === '/api/settings')
            return wrap(() => domain.settings(w, input));
        if (m === 'POST' && p === '/api/contacts')
            return wrap(() => domain.createContact(w, input));
        if (m === 'POST' && p === '/api/contacts/import')
            return wrap(() => domain.importContacts(w, input));
        let a = match(/^\/api\/contacts\/([\w-]+)$/);
        if (a && m === 'GET')
            return domain.row('contacts', w, a[1]);
        if (a && m === 'PATCH')
            return wrap(() => domain.editContact(w, a[1], input));
        if (a && m === 'DELETE')
            return wrap(() => domain.deleteContact(w, a[1], input));
        if (m === 'POST' && p === '/api/projects')
            return wrap(() => domain.createProject(w, input));
        a = match(/^\/api\/projects\/([\w-]+)$/);
        if (a && m === 'GET')
            return domain.projectDetail(w, a[1]);
        if (a && m === 'PATCH')
            return wrap(() => domain.editProject(w, a[1], input));
        if (a && m === 'DELETE')
            return wrap(() => domain.deleteProject(w, a[1], input));
        if (m === 'POST' && p === '/api/notes')
            return wrap(() => domain.createNote(w, input));
        a = match(/^\/api\/notes\/([\w-]+)$/);
        if (a && m === 'GET')
            return domain.noteDetail(w, a[1]);
        if (a && m === 'PATCH')
            return wrap(() => domain.editNote(w, a[1], input));
        if (a && m === 'DELETE')
            return wrap(() => domain.deleteNote(w, a[1], input));
        a = match(/^\/api\/notes\/([\w-]+)\/scan$/);
        if (a && m === 'POST')
            return wrap(() => domain.scan(w, a[1]));
        a = match(/^\/api\/notes\/([\w-]+)\/extract$/);
        if (a && m === 'POST')
            return ai.extract(w, a[1], input);
        if (m === 'POST' && p === '/api/claims')
            return wrap(() => domain.createClaim(w, input));
        a = match(/^\/api\/claims\/([\w-]+)\/decision$/);
        if (a && m === 'POST')
            return wrap(() => domain.decideClaim(w, a[1], input));
        if (m === 'POST' && p === '/api/reviews/refresh')
            return wrap(() => domain.refresh(w));
        a = match(/^\/api\/reviews\/([\w-]+)$/);
        if (a && m === 'GET')
            return domain.reviewDetail(w, a[1]);
        a = match(/^\/api\/reviews\/([\w-]+)\/accept$/);
        if (a && m === 'POST')
            return wrap(() => domain.accept(w, a[1], input));
        a = match(/^\/api\/reviews\/([\w-]+)\/events$/);
        if (a && m === 'POST')
            return wrap(() => domain.reviewEvent(w, a[1], input));
        a = match(/^\/api\/reviews\/([\w-]+)\/draft$/);
        if (a && m === 'POST')
            return input.use_ai ? ai.draft(w, a[1], input) : wrap(() => domain.localDraft(w, a[1], input));
        if (a && m === 'PATCH')
            return wrap(() => domain.saveDraft(w, a[1], input));
        if (m === 'POST' && p === '/api/tasks')
            return wrap(() => domain.createTask(w, input));
        a = match(/^\/api\/tasks\/([\w-]+)$/);
        if (a && m === 'PATCH')
            return wrap(() => domain.editTask(w, a[1], input));
        if (a && m === 'DELETE')
            return wrap(() => domain.deleteTask(w, a[1], input));
        a = match(/^\/api\/events\/([\w-]+)\/correct$/);
        if (a && m === 'POST')
            return wrap(() => domain.correctEvent(w, a[1], input));
        if (m === 'GET' && p === '/api/search')
            return domain.search(w, url.searchParams.get('q'));
        a = match(/^\/api\/jobs\/([\w-]+)$/);
        if (a && m === 'GET')
            return domain.row('jobs', w, a[1]);
        if (m === 'POST' && p === '/api/export') {
            auth.rate('reauth:' + s.user.id, 10);
            only(input, ['password']);
            await auth.confirm(s.user.id, input.password);
            return { ...domain.export(w), extensions: { warm_start: warm.export(w), chat: chats.export(w), memory: memory.state(w), agent: memoryAgent.history(w), memory_imports: memoryImport.sources(w) } };
        }
        if (m === 'POST' && p === '/api/restore') {
            auth.rate('reauth:' + s.user.id, 10);
            only(input, ['password', 'archive']);
            await auth.confirm(s.user.id, input.password);
            return domain.restore(w, { archive: input.archive });
        }
        if (m === 'GET' && p === '/api/ai/status')
            return ai.status(w);
        throw new AppError('Endpoint not found.', 404, 'not_found');
    }
    const server = http.createServer(async (req, res) => {
        const requestId = uid();
        res.setHeader('x-request-id', requestId);
        try {
            const host = req.headers.host || '';
            const address = server.address();
            const actualPort = typeof address === 'object' ? address?.port : 4173;
            const defaultHosts = [`localhost:${actualPort}`, `127.0.0.1:${actualPort}`];
            const origin = config.origin || `http://localhost:${actualPort}`;
            const allowed = [new URL(origin).host, ...(config.origin ? [] : defaultHosts)];
            ensure(allowed.includes(host), 'Unrecognized Host header.', 403, 'invalid_host');
            const url = new URL(req.url, 'http://' + host);
            const p = url.pathname;
            if (['/hooks/slack', '/hooks/discord'].includes(p)) {
                ensure(req.method === 'POST', 'Use POST.', 405);
                auth.rate('webhook:' + req.socket.remoteAddress, 180, 60000);
                const ct = req.headers['content-type'] || '';
                ensure(p.endsWith('slack') ? ct.startsWith('application/x-www-form-urlencoded') : ct.startsWith('application/json'), 'Unsupported webhook content type.', 415);
                let total = 0;
                const chunks = [];
                for await (const chunk of req) {
                    total += chunk.length;
                    ensure(total <= 128 * 1024, 'Webhook too large.', 413);
                    chunks.push(chunk);
                }
                const raw = Buffer.concat(chunks);
                const result = p.endsWith('slack') ? chats.slack(req.headers, raw) : chats.discord(req.headers, raw);
                return send(res, 200, result);
            }
            const mutating = !['GET', 'HEAD'].includes(req.method);
            if (mutating) {
                const given = req.headers.origin;
                ensure(!given || allowed.map(h => `${new URL(origin).protocol}//${h}`).includes(given), 'Cross-origin writes are not allowed.', 403, 'invalid_origin');
                ensure(!req.headers['sec-fetch-site'] || req.headers['sec-fetch-site'] !== 'cross-site', 'Cross-site requests are not allowed.', 403, 'invalid_origin');
            }
            if (p === '/api/health' && req.method === 'GET')
                return send(res, 200, { ok: true, version: '1.4.0' });
            if (p === '/api/auth/status' && req.method === 'GET') {
                const session = auth.resolve(getToken(req));
                return send(res, 200, { setupRequired: !auth.configured(), registrationOpen: auth.registrationOpen(), invitationRequired: !!config.registrationToken, authenticated: !!session, user: session?.user ?? null, csrf: session?.csrf ?? null });
            }
            if (['/api/auth/register', '/api/auth/login'].includes(p) && req.method === 'POST') {
                auth.rate('auth:' + req.socket.remoteAddress);
                const i = await body(req);
                only(i, p.endsWith('register') ? ['name', 'email', 'password', 'workspace', 'inviteCode'] : ['email', 'password']);
                auth.rate('email:' + String(i.email || '').trim().toLowerCase(), 15);
                const session = p.endsWith('register') ? await auth.register(i) : await auth.login(i);
                return send(res, 200, { user: session.user, csrf: session.csrf }, { 'set-cookie': cookie(session) });
            }
            if (p === '/api/pilot-requests' && req.method === 'POST') {
                auth.rate('lead:' + req.socket.remoteAddress, 5, 3600000);
                const i = await body(req);
                only(i, ['name', 'email', 'company', 'goal', 'consent', 'website']);
                ensure(!i.website, 'Please leave the hidden field empty.');
                ensure(i.consent === true, 'Consent is required to store a pilot request.');
                const id = uid();
                store.db.prepare('INSERT INTO pilot_requests VALUES(?,?,?,?,?,?,?)').run(id, text(i.name, 'Name', 100), email(i.email), text(i.company, 'Company', 160), text(i.goal, 'Goal', 2000), 1, now());
                return send(res, 201, { id, stored: true, message: 'Your request is saved for this server’s operator. No payment has been taken and no email has been sent.' });
            }
            if (p.startsWith('/api/')) {
                const session = auth.resolve(getToken(req));
                ensure(session, 'Sign in to continue.', 401, 'unauthorized');
                if (mutating)
                    ensure(safeEqual(req.headers['x-csrf-token'], session.csrf), 'Your session changed. Refresh and try again.', 403, 'csrf_required');
                const input = mutating ? await body(req) : {};
                if (p === '/api/auth/logout' && req.method === 'POST') {
                    auth.logout(getToken(req));
                    return send(res, 200, { ok: true }, { 'set-cookie': `threadline_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${config.secureCookies ? '; Secure' : ''}` });
                }
                if (p === '/api/auth/password' && req.method === 'POST') {
                    auth.rate('password:' + session.user.id, 10);
                    only(input, ['currentPassword', 'newPassword']);
                    const news = await auth.change(session.user.id, input);
                    return send(res, 200, { user: news.user, csrf: news.csrf }, { 'set-cookie': cookie(news) });
                }
                if (p === '/api/account' && req.method === 'DELETE') {
                    auth.rate('delete:' + session.user.id, 5);
                    only(input, ['password', 'confirm']);
                    return send(res, 200, await auth.deleteAccount(session.user.id, input), { 'set-cookie': 'threadline_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' });
                }
                const w = session.user.workspace_id;
                const key = req.headers['idempotency-key'];
                let ikey, requestHash;
                if (mutating) {
                    auth.rate('write:' + w, 150, 60000);
                    ensure(typeof key === 'string' && key.length >= 12 && key.length <= 100, 'A unique Idempotency-Key is required.', 400, 'idempotency_required');
                    ikey = w + ':' + key;
                    requestHash = hash(req.method + ':' + p + ':' + JSON.stringify(input));
                    const saved = store.db.prepare('SELECT * FROM idempotency WHERE workspace_id=? AND key=?').get(w, key);
                    if (saved) {
                        ensure(saved.request_hash === requestHash, 'This request key was used with different data.', 409, 'idempotency_conflict');
                        ensure(saved.generation === domain.workspace(w).generation, 'The workspace changed. Use a new request key.', 409, 'generation_changed');
                        return send(res, 200, JSON.parse(saved.response));
                    }
                    ensure(!inflight.has(ikey), 'This request is already running.', 409, 'request_running');
                    inflight.add(ikey);
                }
                try {
                    const result = await dispatch(req, url, input, session);
                    if (mutating && p != '/api/export' && p != '/api/connections/code' && p != '/api/memory/imports/preview') {
                        const g = domain.workspace(w).generation;
                        store.db.prepare('INSERT OR REPLACE INTO idempotency VALUES(?,?,?,?,?,?)').run(w, key, requestHash, JSON.stringify(result), g, now());
                        store.db.prepare('DELETE FROM idempotency WHERE created_at<?').run(new Date(Date.now() - 86400000).toISOString());
                    }
                    return send(res, result?.job_id ? 202 : 200, result);
                }
                finally {
                    if (ikey)
                        inflight.delete(ikey);
                }
            }
            ensure(['GET', 'HEAD'].includes(req.method), 'Method not allowed.', 405);
            const names = { '/': 'index.html', '/app': 'index.html', '/welcome': 'welcome.html', '/guide': 'guide.html' };
            const requested = names[p] || decodeURIComponent(p).slice(1);
            const path = resolve(ROOT, 'public', requested), rel = relative(resolve(ROOT, 'public'), path);
            ensure(!rel.startsWith('..') && !rel.startsWith('/') && !rel.split('/').some(s => s.startsWith('.')), 'File not found.', 404);
            let data;
            try {
                const info = await stat(path);
                ensure(info.isFile(), 'File not found.', 404);
                data = await readFile(path);
            }
            catch {
                throw new AppError('File not found.', 404, 'not_found');
            }
            const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
            res.writeHead(200, { ...security, 'content-type': mime[extname(path)] || 'application/octet-stream', 'cache-control': 'no-cache' });
            res.end(req.method === 'HEAD' ? undefined : data);
        }
        catch (e) {
            if (!res.headersSent) {
                const status = e instanceof AppError ? e.status : 500;
                send(res, status, { error: { code: e.code || 'internal_error', message: status === 500 ? 'The request failed. Your data has not been replaced.' : e.message, requestId } });
                if (status === 500)
                    console.error(JSON.stringify({ requestId, error: e.name, message: e.message }));
            }
            else
                res.end();
        }
    });
    server.requestTimeout = 60000;
    server.headersTimeout = 20000;
    return { server, store, domain, auth, ai, warm, chats, memory, memoryAgent, memoryImport, conversations, async close() { await conversations.close(); await memoryAgent.drain(); await ai.drain(); await chats.drain(); await new Promise(r => server.close(r)); store.close(); } };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        const production = process.env.NODE_ENV === 'production';
        if (production)
            ensure(process.env.APP_ORIGIN?.startsWith('https://') && process.env.REGISTRATION_TOKEN?.length >= 24, 'Production requires HTTPS APP_ORIGIN and a REGISTRATION_TOKEN of at least 24 characters.');
        const app = makeApp({ dbPath: process.env.THREADLINE_DB, registrationToken: process.env.REGISTRATION_TOKEN, origin: process.env.APP_ORIGIN, secureCookies: production, openaiKey: process.env.OPENAI_API_KEY, openaiModel: process.env.THREADLINE_AI_PROVIDER === 'vertex' ? process.env.THREADLINE_VERTEX_MODEL : process.env.OPENAI_MODEL, aiProvider: process.env.THREADLINE_AI_PROVIDER, vertexProject: process.env.THREADLINE_VERTEX_PROJECT, vertexAccessToken: process.env.THREADLINE_VERTEX_ACCESS_TOKEN, dailyLimit: Number(process.env.AI_DAILY_LIMIT) || 30, slackBotToken: process.env.SLACK_BOT_TOKEN, slackSigningSecret: process.env.SLACK_SIGNING_SECRET, slackTeamId: process.env.SLACK_TEAM_ID, discordPublicKey: process.env.DISCORD_PUBLIC_KEY, discordApplicationId: process.env.DISCORD_APPLICATION_ID });
        const port = Number(process.env.PORT) || 4173;
        app.server.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`Threadline is ready at ${process.env.APP_ORIGIN || 'http://localhost:' + port}. Data persists in ${app.store.path}.`));
        const stop = () => app.close().then(() => process.exit(0));
        process.on('SIGINT', stop);
        process.on('SIGTERM', stop);
    }
    catch (e) {
        console.error(e.message);
        process.exit(1);
    }
}
