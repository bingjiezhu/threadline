# Selected-message integrations

Status: actual signed webhook code and synthetic signature/HTTP tests are shipped. No real Slack workspace or Discord installation was authorized or live-tested in the build. The UI distinguishes operator configuration from live verification. Do not claim a one-click production installation.

## Before either platform

Run a protected HTTPS deployment, set `APP_ORIGIN` to its exact external origin and configure a trusted reverse proxy that preserves the raw request body. Preserve the external Host expected by the application. Follow `OPERATIONS.md` for secure cookies and backups. Do not expose an unprotected development server containing real people or company records. Use isolated test data first.

The owner creates a Threadline account, then opens Chat & capture. A configured platform can issue a ten-minute one-use link code; only its hash is stored. Issue a replacement to revoke an unused code. Bind only in a private interaction. Linking does not import contacts or chat history, and does not share data between Threadline workspaces.

## Slack

1. Create a Slack application in the authorized workspace from `integrations/slack/manifest.json`. Replace both `https://YOUR_HOST.invalid/hooks/slack` values with the exact deployed URL. This template is for one allowed workspace, not an OAuth-distributed multi-team marketplace app.
2. Install the `commands` scope. Configure `SLACK_SIGNING_SECRET` and the exact `SLACK_TEAM_ID` on the Threadline server. Restart. For a native confirmation modal, also supply the app's bot token as `SLACK_BOT_TOKEN`. Do not provide user tokens or add history scopes merely to make the example run.
3. In Threadline, generate a Slack linking code. In Slack enter `/threadline link CODE`. The private response confirms your own binding.
4. Select a message and choose **Remember in Threadline**. Its text enters a short-lived private review inbox. If the bot token is configured, Slack opens a confirmation modal containing the selected text. Confirm a title, source date and optional existing contact, and check permission before saving.
5. Without a modal, open Chat & capture in Threadline to review and save the pending item. No message becomes approved evidence merely because a user selected it.
6. `/threadline save TEXT` stages chosen text; `/threadline find TOPIC` privately searches this bound user's linked notes. It is lexical lookup, not a promise of semantic search over the whole company.

The runtime verifies raw-body `v0` HMAC-SHA256 signatures and rejects timestamps outside a five-minute window. Slack responses are ephemeral. The only permitted deferred response host/path is the Slack response URL actions endpoint, with redirects refused. Native modal calls go only to Slack's fixed `views.open` endpoint. A missing/failed platform API does not grant permanent save authorization or fall back to a public message.

## Discord

1. Create a Discord developer application. Enable **User Install**, with `applications.commands`. Set the interaction endpoint to `https://YOUR_HOST/hooks/discord`.
2. Set `DISCORD_APPLICATION_ID` and the application public key as `DISCORD_PUBLIC_KEY`; restart Threadline. Discord's signed PING verification is handled. A normal user token is never accepted or used.
3. Review `integrations/discord/commands.json`. From a trusted operator shell, set the application's bot token and run:

```bash
npm run register:discord                # Offline preview only
npm run register:discord -- --apply     # Explicit external registration
```

The second command upserts only the supplied command names/types; it does not delete unrelated app commands. It can affect your developer application and was not executed against a real account during this build. Application-wide command propagation may require waiting.

4. Install the app to your user account. Generate a Discord link code in Threadline, then use `/threadline link code:CODE`.
5. On a message, choose **Apps -> Remember this**. Only the selected resolved message is received. The response is private and the item awaits Threadline review. `/threadline save text:...` and `/threadline find topic:...` are also supported.

The runtime verifies Ed25519 signatures on the raw timestamp + body and enforces the application ID. Responses use ephemeral flags and disable mention parsing. There is no whole-inbox scanning, message-content privileged intent, guild directory synchronization or self-bot.

## Data lifecycle and boundaries

Pending selected text expires in seven days (pruned on connector access); a private database backup may still retain it according to the operator's schedule. Confirming a pending item atomically creates the note/metadata and optional task, then clears duplicate pending plaintext. Discarding clears it. Disconnecting deletes pending items and the binding, not notes you already chose to save. Account deletion removes bindings and records; exports exclude signing keys, codes and tokens.

These selected-message adapters do not subscribe to message-edited/deleted events. Deleting a message in Slack/Discord therefore does not automatically delete a previously confirmed Threadline note. Delete it in Threadline when required. Do not advertise source-lifecycle mirroring, end-to-end encryption or employer-approved cross-platform sharing.

WeChat is manual selected-text capture. iMessage, OpenClaw, full Slack thread history and proactive scheduled platform messages are not implemented. Forwarder identity and original speaker are not interchangeable.

## Required live acceptance before advertising a connection

Use two real test users with separate Threadline workspaces. Check linking, code expiry, selected-message context, unsupported channels, private replies, modal confirmation, disconnect, duplicate delivery and deleted notes. Try a foreign-workspace ID and an invalid signature; both must fail. Inspect actual client behavior and provider scopes. Record deployment URL, versions and test date without recording secrets. No success may be marked from local payload fixtures alone.

Primary documentation checked for this implementation: [Slack shortcuts](https://docs.slack.dev/interactivity/implementing-shortcuts/), [Slack signatures](https://docs.slack.dev/authentication/verifying-requests-from-slack/), [Discord user-installable apps](https://docs.discord.com/developers/tutorials/developing-a-user-installable-app), [Discord interactions](https://docs.discord.com/developers/interactions/receiving-and-responding).
