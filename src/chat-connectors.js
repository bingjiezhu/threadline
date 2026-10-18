/** Selected-message ingress only. No workspace crawler, ordinary user-account token, or outbound outreach. */
import { createHmac, randomBytes, createPublicKey, verify as edVerify } from 'node:crypto';
import { uid, now, hash, ensure, only, text, version, safeEqual, AppError } from './util.js';
const stampOK = s => typeof s === 'string' && /^\d{9,12}$/.test(s) && Math.abs(Date.now() / 1000 - Number(s)) <= 300;
export function verifySlack(headers, raw, secret) { ensure(secret, 'Slack is not configured.', 503, 'connector_not_configured'); const ts = headers['x-slack-request-timestamp']; ensure(stampOK(ts), 'Expired Slack request.', 401, 'invalid_signature'); const expected = 'v0=' + createHmac('sha256', secret).update(`v0:${ts}:`).update(raw).digest('hex'); ensure(safeEqual(expected, headers['x-slack-signature']), 'Invalid Slack signature.', 401, 'invalid_signature'); }
export function verifyDiscord(headers, raw, publicKey) { ensure(publicKey, 'Discord is not configured.', 503, 'connector_not_configured'); const ts = headers['x-signature-timestamp'], sig = headers['x-signature-ed25519']; ensure(stampOK(ts) && typeof sig === 'string' && /^[a-f0-9]{128}$/i.test(sig) && /^[a-f0-9]{64}$/i.test(publicKey), 'Invalid Discord signature.', 401, 'invalid_signature'); let ok = false; try {
    const key = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(publicKey, 'hex')]), format: 'der', type: 'spki' });
    ok = edVerify(null, Buffer.concat([Buffer.from(ts), raw]), key, Buffer.from(sig, 'hex'));
}
catch { } ensure(ok, 'Invalid Discord signature.', 401, 'invalid_signature'); }
const slackText = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function createChatConnectors(store, domain, relationships, config = {}) {
    const db = store.db, pending = new Set();
    const status = () => ({ slack: { configured: !!(config.slackSigningSecret && config.slackTeamId), confirmation_modal: !!config.slackBotToken, capability: 'Selected message or explicit slash command. Replies are private. No history sync.' }, discord: { configured: !!(config.discordPublicKey && config.discordApplicationId), capability: 'User-installed message command and private slash replies. No passive DM access.' }, live_verified: false });
    const bound = (p, s, a) => db.prepare('SELECT * FROM chat_connections WHERE platform=? AND scope_id=? AND actor_id=?').get(p, s, a);
    function expire(w) { db.prepare("UPDATE chat_inbox SET body='',source_url='',author_id='',channel_id='',status='dismissed',version=version+1 WHERE workspace_id=? AND status='pending' AND created_at<?").run(w, new Date(Date.now() - 7 * 86400000).toISOString()); db.prepare('DELETE FROM chat_link_codes WHERE expires_at<?').run(Date.now()); }
    function bind(p, s, a, code) { ensure(/^[A-Za-z0-9_-]{32}$/.test(code), 'Use a fresh link code from Connections.', 400, 'invalid_link'); return store.tx(() => { const c = db.prepare('SELECT * FROM chat_link_codes WHERE code_hash=? AND platform=?').get(hash(code), p); ensure(c && c.expires_at > Date.now(), 'The code expired or was already used.', 400, 'invalid_link'); const existing = bound(p, s, a); ensure(!existing || existing.workspace_id === c.workspace_id, 'This chat account is already linked. Unlink it in the original workspace first.', 409, 'binding_conflict'); db.prepare('DELETE FROM chat_link_codes WHERE code_hash=?').run(hash(code)); if (!existing) {
        db.prepare('INSERT INTO chat_connections VALUES(?,?,?,?,?,?)').run(uid(), c.workspace_id, p, s, a, now());
        domain.event(c.workspace_id, 'workspace', c.workspace_id, 'chat.connected', { platform: p });
    } return 'Connected to your private Threadline workspace. Selected messages are saved to Inbox for your review. Nothing is sent to coworkers.'; }); }
    function stage(conn, i) {
        expire(conn.workspace_id);
        const old = db.prepare('SELECT * FROM chat_inbox WHERE workspace_id=? AND connection_id=? AND external_key=?').get(conn.workspace_id, conn.id, i.external_key);
        if (old) {
            ensure(old.status === 'pending' && old.body === i.body, 'This message was already handled or changed. Review it in Threadline.', 409, 'message_already_handled');
            return old.id;
        }
        ensure(db.prepare("SELECT count(*) n FROM chat_inbox WHERE workspace_id=? AND status='pending'").get(conn.workspace_id).n < 100, 'Review the existing inbox before saving more messages.', 409, 'inbox_full');
        ensure(typeof i.body === 'string' && i.body.trim() && [...i.body].length <= 20000 && !i.body.includes('\u0000'), 'Select 1–20,000 characters of message text.');
        const id = uid();
        db.prepare('INSERT INTO chat_inbox(id,workspace_id,connection_id,external_key,platform,author_id,channel_id,body,occurred_on,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(id, conn.workspace_id, conn.id, i.external_key, conn.platform, text(i.author_id, 'Message author', 100, false), text(i.channel_id, 'Channel', 100, false), i.body, i.occurred_on || null, now());
        domain.event(conn.workspace_id, 'chat_inbox', id, 'chat.message.staged', { platform: conn.platform });
        return id;
    }
    function actor(p, s, a) { ensure(a && s, 'Missing chat identity.', 400); const c = bound(p, s, a); ensure(c, 'Link your account first: open Threadline > Connections, create a code, then use /threadline link CODE.', 403, 'not_linked'); config.syncWorkspace?.(c.workspace_id); return c; }
    function command(p, s, a, cmd, external, meta = {}) { const [verb, ...tail] = cmd.trim().split(/\s+/), arg = tail.join(' '); if (verb === 'link')
        return bind(p, s, a, arg); const c = actor(p, s, a); if (verb === 'find') {
        const r = relationships.findPeople(c.workspace_id, text(arg, 'Search query', 240));
        return r.people.length ? r.people.slice(0, 3).map(x => `${x.person.name}\n${x.evidence[0] ? `Saved context (${x.evidence[0].occurred_on || 'date unknown'}): ${x.evidence[0].quote.slice(0, 350)}` : 'Matches an entered profile field; no supporting conversation.'}`).join('\n\n') + '\n\nSaved context only. Availability and current responsibility are not confirmed.' : 'No saved match. Try the words from a conversation, or save more context.';
    } if (verb === 'save') {
        stage(c, { external_key: external, body: arg, author_id: a, channel_id: meta.channel_id || '', occurred_on: new Date().toISOString().slice(0, 10) });
        return 'Saved to your private review inbox. Confirm the original speaker, date and context in Threadline before adding it to memory.';
    } return 'Use /threadline save TEXT, /threadline find TOPIC, or the Remember this message action. Manage goals and approvals in Threadline. No message is sent to another person.'; }
    function notifySlack(url, message) { if (!url)
        return; let u; try {
        u = new URL(url);
    }
    catch {
        return;
    } if (u.protocol !== 'https:' || u.hostname !== 'hooks.slack.com' || u.port || u.username || u.password || !u.pathname.startsWith('/actions/'))
        return; const task = (async () => { try {
        const res = await (config.fetchImpl || fetch)(u.toString(), { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(6000), headers: { 'content-type': 'application/json' }, body: JSON.stringify({ response_type: 'ephemeral', replace_original: false, text: slackText(message), mrkdwn: false }) });
        if (!res.ok)
            console.warn('Slack acknowledgement was not delivered. Check the private Threadline inbox.');
    }
    catch {
        console.warn('Slack acknowledgement unavailable. No retry or public fallback.');
    } })(); pending.add(task); task.finally(() => pending.delete(task)); }
    function openSlackModal(conn, id, trigger) {
        if (!config.slackBotToken || !trigger)
            return false;
        const item = domain.row('chat_inbox', conn.workspace_id, id);
        const people = db.prepare("SELECT id,name FROM contacts WHERE workspace_id=? AND archived=0 AND contact_policy='allowed' ORDER BY name LIMIT 99").all(conn.workspace_id);
        const blocks = [{ type: 'section', text: { type: 'plain_text', text: item.body.slice(0, 1400), emoji: false } },
            { type: 'context', elements: [{ type: 'plain_text', text: 'Selected message only. Confirm its original speaker and date. No surrounding history was read.' }] },
            { type: 'input', block_id: 'title', label: { type: 'plain_text', text: 'Note title' }, element: { type: 'plain_text_input', action_id: 'value', initial_value: 'Selected Slack context', max_length: 200 } },
            { type: 'input', block_id: 'date', optional: true, label: { type: 'plain_text', text: 'Original event date (optional)' }, element: { type: 'datepicker', action_id: 'value', ...(item.occurred_on ? { initial_date: item.occurred_on } : {}) } }];
        if (people.length)
            blocks.push({ type: 'input', block_id: 'person', optional: true, label: { type: 'plain_text', text: 'Who is this about? (optional)' }, element: { type: 'static_select', action_id: 'value', placeholder: { type: 'plain_text', text: 'Do not infer the submitter is the speaker' }, options: people.map(c => ({ text: { type: 'plain_text', text: c.name.slice(0, 75) }, value: c.id })) } });
        blocks.push({ type: 'input', block_id: 'permission', label: { type: 'plain_text', text: 'Permission and context' }, element: { type: 'checkboxes', action_id: 'value', options: [{ text: { type: 'plain_text', text: 'I may keep this text and checked its original speaker and date.' }, value: 'confirmed' }] } });
        const task = (async () => { try {
            const res = await (config.fetchImpl || fetch)('https://slack.com/api/views.open', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(2500), headers: { 'content-type': 'application/json', authorization: 'Bearer ' + config.slackBotToken }, body: JSON.stringify({ trigger_id: trigger, view: { type: 'modal', callback_id: 'threadline_confirm', private_metadata: JSON.stringify({ id, version: item.version }), title: { type: 'plain_text', text: 'Keep this context' }, submit: { type: 'plain_text', text: 'Save privately' }, close: { type: 'plain_text', text: 'Not now' }, blocks } }) });
            const r = await res.json();
            if (!res.ok || !r.ok)
                console.warn('Slack confirmation modal unavailable. Review the private web inbox instead.');
        }
        catch {
            console.warn('Slack confirmation modal unavailable. No automatic confirmation.');
        } })();
        pending.add(task);
        task.finally(() => pending.delete(task));
        return true;
    }
    return {
        status,
        home(w) { domain.workspace(w); expire(w); return { providers: status(), connections: db.prepare('SELECT id,platform,scope_id,actor_id,created_at FROM chat_connections WHERE workspace_id=?').all(w), inbox: db.prepare('SELECT id,platform,author_id,channel_id,body,occurred_on,status,version,created_at FROM chat_inbox WHERE workspace_id=? AND status=\'pending\' ORDER BY created_at DESC').all(w), boundary: 'Capture only content you are authorized to retain. A linked account does not grant access to other conversations. Pending drafts expire after seven days.' }; },
        issue(w, i) { only(i, ['platform']); ensure(['slack', 'discord'].includes(i.platform), 'Choose a supported chat app.'); ensure(status()[i.platform].configured, 'Configure this platform on the server before linking.', 503, 'connector_not_configured'); domain.workspace(w); const code = randomBytes(24).toString('base64url'); return store.tx(() => { db.prepare('DELETE FROM chat_link_codes WHERE workspace_id=? AND platform=?').run(w, i.platform); db.prepare('INSERT INTO chat_link_codes VALUES(?,?,?,?,?)').run(hash(code), w, i.platform, Date.now() + 600000, now()); return { code, platform: i.platform, expires_in: 600, command: '/threadline link ' + code, notice: 'Single use. Never share this code. It binds the chat account that submits it to your private records.' }; }); },
        unlink(w, id) { domain.row('chat_connections', w, id); return store.tx(() => { domain.invalidate(w, []); db.prepare('DELETE FROM chat_connections WHERE workspace_id=? AND id=?').run(w, id); db.prepare('DELETE FROM chat_link_codes WHERE workspace_id=?').run(w); domain.event(w, 'connection', id, 'chat.disconnected'); return { deleted: true, notice: 'Pending inbox removed. Already confirmed notes remain until you delete them.' }; }); },
        confirm(w, id, i) { only(i, ['version', 'confirm', 'contact_id', 'new_contact', 'occurred_on', 'title', 'project_id', 'reminder']); ensure(i.confirm === true, 'Confirm your permission, original speaker and date.'); config.syncWorkspace?.(w); expire(w); const r = domain.row('chat_inbox', w, id); version(r, i.version); ensure(r.status === 'pending', 'This inbox item was already handled.', 409, 'message_already_handled'); const saved=store.tx(() => { const out = relationships.capture(w, { body: r.body, title: i.title || 'Selected ' + r.platform + ' message', contact_id: i.contact_id, new_contact: i.new_contact, project_id: i.project_id, reminder: i.reminder, occurred_on: i.occurred_on || null, channel: r.platform }); db.prepare("UPDATE chat_inbox SET status='saved',body='',source_url='',author_id='',channel_id='',note_id=?,version=version+1 WHERE workspace_id=? AND id=?").run(out.note.id, w, id); domain.event(w, 'chat_inbox', id, 'chat.message.confirmed', { note_id: out.note.id }); return out; }); config.flushWorkspace?.(w); return saved; },
        dismiss(w, id, i) { only(i, ['version']); const r = domain.row('chat_inbox', w, id); version(r, i.version); db.prepare("UPDATE chat_inbox SET status='dismissed',body='',source_url='',author_id='',channel_id='',version=version+1 WHERE workspace_id=? AND id=?").run(w, id); domain.invalidate(w, []); return { dismissed: true }; },
        slack(headers, raw) {
            verifySlack(headers, raw, config.slackSigningSecret);
            ensure(config.slackTeamId, 'Configure SLACK_TEAM_ID.', 503, 'connector_not_configured');
            const form = new URLSearchParams(new TextDecoder('utf-8', { fatal: true }).decode(raw));
            let payload;
            if (form.has('payload')) {
                try {
                    payload = JSON.parse(form.get('payload'));
                }
                catch {
                    throw new AppError('Invalid Slack payload.');
                }
                ensure(payload.team?.id === config.slackTeamId, 'This Slack workspace is not allowed.', 403, 'wrong_team');
                if (payload.type === 'view_submission') {
                    ensure(payload.view?.callback_id === 'threadline_confirm', 'Unknown confirmation view.');
                    try {
                        const conn = actor('slack', payload.team.id, payload.user?.id);
                        const meta = JSON.parse(payload.view.private_metadata || '{}');
                        only(meta, ['id', 'version']);
                        const values = payload.view.state?.values || {};
                        const out = this.confirm(conn.workspace_id, meta.id, { version: meta.version, confirm: values.permission?.value?.selected_options?.some(x => x.value === 'confirmed') === true, title: values.title?.value?.value || 'Selected Slack message', occurred_on: values.date?.value?.selected_date || null, contact_id: values.person?.value?.selected_option?.value || null });
                        return {};
                    }
                    catch (e) {
                        return { response_action: 'errors', errors: { permission: e instanceof AppError ? e.message : 'Unable to save. Review the private Threadline inbox.' } };
                    }
                }
                ensure(payload.type === 'message_action' && payload.callback_id === 'remember_message', 'Unsupported Slack interaction.');
                let response = '';
                try {
                    const c = actor('slack', payload.team.id, payload.user?.id), m = payload.message;
                    ensure(m?.ts && m.text, 'Select a text message. Attachments and full threads are not imported.');
                    const itemId = stage(c, { external_key: `message:${payload.channel?.id}:${m.ts}`, body: m.text, author_id: m.user || '', channel_id: payload.channel?.id || '', occurred_on: Number.isFinite(Number(m.ts)) ? new Date(Number(m.ts) * 1000).toISOString().slice(0, 10) : null });
                    openSlackModal(c, itemId, payload.trigger_id);
                    response = 'Selected message added to your private Threadline inbox. Confirm in the modal when available, or in Threadline. No surrounding messages were read.';
                }
                catch (e) {
                    response = e instanceof AppError ? e.message : 'The message could not be saved. Open Threadline to review.';
                }
                notifySlack(payload.response_url, response);
                return {};
            }
            ensure(form.get('team_id') === config.slackTeamId, 'This Slack workspace is not allowed.', 403, 'wrong_team');
            ensure(form.get('command') === '/threadline', 'Unknown slash command.');
            let msg;
            try {
                msg = command('slack', form.get('team_id'), form.get('user_id'), form.get('text') || '', `command:${form.get('trigger_id') || hash(raw)}`, { channel_id: form.get('channel_id') });
            }
            catch (e) {
                if (!(e instanceof AppError))
                    throw e;
                msg = e.message;
            }
            return { response_type: 'ephemeral', text: slackText(msg), mrkdwn: false };
        },
        discord(headers, raw) {
            verifyDiscord(headers, raw, config.discordPublicKey);
            let p;
            try {
                p = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(raw));
            }
            catch {
                throw new AppError('Invalid Discord payload.');
            }
            ensure(config.discordApplicationId && p.application_id === config.discordApplicationId, 'This application is not allowed.', 403, 'wrong_application');
            if (p.type === 1)
                return { type: 1 };
            ensure(p.type === 2, 'Unsupported Discord interaction.');
            const a = p.member?.user?.id || p.user?.id;
            let msg;
            try {
                if (p.data?.type === 3 && p.data?.name === 'Remember this') {
                    const c = actor('discord', 'user', a), m = p.data.resolved?.messages?.[p.data.target_id];
                    ensure(m?.content, 'Select one text message. Attachments and surrounding messages are not imported.');
                    const dt = m.timestamp && new Date(m.timestamp);
                    stage(c, { external_key: `message:${m.id || p.data.target_id}`, body: m.content, author_id: m.author?.id || '', channel_id: m.channel_id || p.channel_id || '', occurred_on: dt && !isNaN(dt) ? dt.toISOString().slice(0, 10) : null });
                    msg = 'Selected message added to your private Threadline inbox. Confirm its speaker, date and your permission before keeping it.';
                }
                else {
                    ensure(p.data?.name === 'threadline', 'Unknown command.');
                    const op = p.data.options?.[0];
                    const value = op?.options?.[0]?.value;
                    ensure(!value || typeof value === 'string', 'Use text options.');
                    msg = command('discord', 'user', a, (op?.name || 'help') + ' ' + (value || ''), `command:${p.id}`);
                }
            }
            catch (e) {
                if (!(e instanceof AppError))
                    throw e;
                msg = e.message;
            }
            return { type: 4, data: { content: msg.slice(0, 1900), flags: 64, allowed_mentions: { parse: [] } } };
        },
        export(w) { expire(w); return { connections: db.prepare('SELECT platform,created_at FROM chat_connections WHERE workspace_id=?').all(w), pending: db.prepare("SELECT platform,author_id,channel_id,body,occurred_on,created_at FROM chat_inbox WHERE workspace_id=? AND status='pending'").all(w), notice: 'Account bindings and link secrets are not exported or restored.' }; },
        async drain() { await Promise.allSettled([...pending]); }
    };
}
