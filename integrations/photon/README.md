# Threadline in iMessage — personal relationship assistant

This post-submission local improvement connects Photon to the same personal workspace used by the web app. The competition snapshot and published release stay unchanged.

## Useful conversations

- `我等会要见 Alex，用三句话告诉我重点。` — brief from real records and commitments.
- `记一下：刚和 Alex 聊完，他想下周看演示。我答应周五把介绍发给他。` — preview the exact note and dated task.
- `确认` — save the displayed change; then ask `Alex 最近聊了什么？` to retrieve it.
- `最近有哪些人值得重新联系？分别聊什么？` — explain reviewed requirement/progress matches.
- `这周我答应过哪些人？先做哪件？` — open tasks ordered by due date.
- `帮我给 Alex 写一条自然的跟进消息。` — preview a source-backed draft, saved only on confirmation, never sent to Alex.

`取消` cancels. `改成……` edits a preview. A conversation has one pending action, with a 15-minute expiry and workspace-version checks. Same-name contacts require disambiguation. No confirmation nonce is shown. Tasks support dates, not scheduled phone notifications; time-of-day requests are retained as notes and this limitation is explained.

## Run against an existing app

Keep Threadline running on loopback. Use a private mode-600 JSON handoff with apiKey, projectId, testSender, agentHandle, appOrigin, appAccessFile, assistantStateFile, stateDir, and optional maxSeconds/minCreatedAt/vertexConfigFile/replyLanguage. Set replyLanguage to en for English replies, zh for Chinese, or auto to follow the incoming language. Original quoted notes are preserved. appAccessFile points to a mode-600 JSON containing the existing workspace owner's email and password. All paths are local absolute paths. Never commit the handoff or runtime records.

```sh
cd integrations/photon
npm ci --ignore-scripts
node launch-private.mjs /absolute/private/photon-config.json
```

Default receive window is 600 seconds; an operator can explicitly request up to 7200 seconds. Only new messages from the exact configured human sender to the exact assigned agent in a direct iMessage space are accepted. No unsolicited first message or customer outreach is sent. The bridge logs into the app normally and uses owner-scoped HTTP, CSRF and stable idempotency keys. It does not read browser cookies or expose a public webhook. Phone responses refer to the computer app instead of offering a broken phone-local localhost URL.

Private durable inbox/outbox/seen files prevent ordinary retries and restarts from duplicating actions. Responses are saved before transmission. Ambiguous writes after an interrupted process require checking the app instead of automatic replay.

## Optional Gemini understanding

The examples above work locally. vertexConfigFile may point to private JSON with project and model (gemini-3.8-flash); operator ADC stays on the host. After reading the help text, the owner can send `启用AI理解` / `enable AI understanding`. Only subsequent incoming message text and the current local date are sent to Gemini for structured intent parsing, not the stored notes or whole contact database. Parsed fields must be literal spans of the incoming message. The server resolves actual IDs and enforces confirmation; the model cannot approve evidence, contact anyone or choose arbitrary API routes. There is a 30-attempt local-day limit. Failures explicitly fall back to local supported patterns. `关闭AI理解` disables it.

## Verification and provenance

```sh
node --test bridge.test.mjs assistant.test.mjs
```

Transport tests use an injected offline Photon contract. Assistant tests use real isolated Node/SQLite servers and normal HTTP authentication, owner checks, CSRF and idempotency. They cover capture/confirm/recall, task dates, draft saves, cancellation, stale/expired previews, ambiguity, contact restrictions, source-instruction isolation, uncertain writes and restarts.

The competition's earlier adapter was live-verified for one REVIEW message and a delivered reply. That evidence does not by itself prove this later version's complete phone workflow. Legacy Python files are retained for provenance; bridge.mjs now starts assistant.mjs. Runtime state, credentials and real phone numbers must remain private.

SDK: @photon-ai/api 0.5.0. Official setup: https://photon.codes/docs/beta/get-started/imessage .
