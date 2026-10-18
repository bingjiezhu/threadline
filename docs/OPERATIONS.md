> 1.3 operator note: back up before automatic schema-3 migration; never point old code at an upgraded database. See `CHAT_INTEGRATIONS.md` for protected signed hooks and `ARCHITECTURE_WARM.md` for new export/invalidation boundaries.

# Operator guide

## Local install and first owner

Run from the extracted `Threadline` directory with Node >=22.16:

```bash
npm start
```

The default listener is `127.0.0.1:4173`; the database is `.data/threadline.sqlite`. Keep the process running. Create the first account on localhost before exposing a service. With no invitation code, further registration is closed. No default password is installed.

For configuration:

```bash
cp .env.example .env
# Edit values in a private editor, then restart with npm start.
```

On Windows, `copy .env.example .env` can be used in Command Prompt. The portable Node implementation is provided, but this release was executed only on Linux. Check the chosen Node build includes `node:sqlite`.

## Configuration

| Variable | Behavior |
|---|---|
| PORT | Default 4173 |
| HOST | Default 127.0.0.1; use an internal interface only behind a reverse proxy |
| THREADLINE_DB | Durable SQLite path; do not point at the old prototype's database |
| REGISTRATION_TOKEN | Long operator-held invitation code; additional accounts are separate private workspaces |
| APP_ORIGIN | Exact public origin, such as https://relationships.example.com; no trailing path |
| NODE_ENV | production requires HTTPS APP_ORIGIN and invitation code >=24 characters |
| OPENAI_API_KEY | Optional server-side provider credential; absent means local/manual mode |
| OPENAI_MODEL | Default gpt-4.1-mini; check account access and strict-output compatibility before changing |
| AI_DAILY_LIMIT | Default 30 attempted AI jobs per workspace per UTC day, max two running simultaneously |

Do not advertise shared workspaces: this version has one owner per workspace. Do not tell users an inquiry form created an account or payment: those are different records and actions.

## HTTPS deployment recipe

The repository includes a Dockerfile and Compose recipe. Docker execution and an actual public TLS domain were **not tested in this build environment**. The Node runtime path was tested directly.

```bash
cp .env.example .env
# Set production mode, a real HTTPS origin, invitation code, and optional key.
docker compose up --build -d
docker compose logs -f
```

Compose binds the backend port only on the host loopback address and uses a persistent named volume. Terminate TLS with your chosen reverse proxy and preserve the browser's public Host header. For a reverse proxy on the same host, point it at `127.0.0.1:4173`. Never make a bare development port public as a substitute for HTTPS. Use the deployment platform's secret storage, not a committed `.env`.

Read `/api/health` for liveness. It reports only `{ok:true, version:"1.3.0"}`. In production, probes must supply the configured public Host header; otherwise the Host guard correctly rejects them. The supplied Docker health check uses a native HTTP request for this reason.

Use a service supervisor or container restart policy. Back up before deploying changes. The schema guard refuses an incompatible database; it does not silently modify an earlier prototype schema. No data migration from the earlier staged prototype is claimed.

## Full backup

```bash
npm run backup -- --out /private-backups/threadline-2026-10-17.sqlite
```

The command uses SQLite `VACUUM INTO`, then verifies `PRAGMA integrity_check`. Unlike copying only the main file during a running WAL session, this produces a consistent snapshot of committed data. The destination cannot already exist and gets private permissions where supported. Protect it with encryption outside this tool.

The snapshot contains all accounts, credentials, sessions, notes, inquiry records and history. Never distribute it in a code release. The user-facing JSON export is different: it excludes secrets and can reconstruct core records, not exact account/history state.

## Exact restore after an incident

1. Stop the application and ensure no process has the database open.
2. Preserve the current main database and its `-wal` / `-shm` files in a protected incident directory. Do not leave old WAL sidecars beside a replacement database.
3. Verify the chosen backup's integrity with SQLite, then place the snapshot at the configured `THREADLINE_DB` path with private owner-only permissions.
4. Before reopening remote access, revoke restored sessions and interrupted jobs:

```bash
node --input-type=module -e "import {DatabaseSync} from 'node:sqlite'; const d=new DatabaseSync('.data/threadline.sqlite'); d.exec(\"DELETE FROM sessions; UPDATE jobs SET state='failed',error='Restored backup: retry explicitly' WHERE state='running'; PRAGMA wal_checkpoint(TRUNCATE)\"); d.close();"
```

Use the actual configured path. Replay deletion/retention requests that occurred after the snapshot; the snapshot may contain older private data. Start the app privately, inspect a known account and its records, test the health endpoint, then restore remote access. The release's offline restore test checks database integrity and persistence, not your provider's disaster recovery infrastructure.

## Forgotten password

There is no unauthenticated web reset endpoint. An operator with filesystem authority can perform an offline reset:

```bash
# Stop the server. Create a private UTF-8 file containing a new passphrase.
chmod 600 /private/new-password.txt
npm run recover -- --email owner@example.com --password-file /private/new-password.txt --confirm
# Remove the temporary file securely according to your platform's policy; restart.
```

The password must have at least 12 characters. The tool stores a new scrypt hash and revokes every session for that user. It does not send an email. Do not put a password directly into shell history or command arguments.

## Pilot-inquiry operations

The landing page at `/welcome` saves consented inquiries to this server. It does not email anyone or process payments.

```bash
npm run leads
npm run leads -- --export /private/pilot-inquiries.csv
npm run leads -- --delete INQUIRY_ID --confirm
```

Only the operator CLI exposes these inquiries; an arbitrary logged-in workspace cannot list them. Agree to the offer, data handling, support and billing with a real customer before charging. Use your own authorized billing provider or invoice process. Do not insert a fake checkout or invent paid users.

Set a retention policy for inquiries, for example review and remove unneeded leads after an agreed period. Protect exports and honor deletion requests. This sample policy is not legal advice.

## AI failures and costs

An unconfigured adapter returns an explicit service error. Failed/incomplete/refused outputs are not written as successful facts. Running jobs become visible failures after restart rather than being automatically repeated. Each attempt counts toward the daily cap. Provider usage may still be charged on a failed or cancelled request. The cap bounds request count, not total dollars.

Disable new provider requests by removing the key and restarting; local records remain usable. Rotate a compromised key in the provider console. Never put model input/output bodies in general server logs.

## Troubleshooting

- **Port in use:** stop the previous process or change PORT, then use that port in the browser.
- **Invalid Host/Origin:** check APP_ORIGIN, exact HTTPS scheme, browser address and reverse-proxy Host forwarding. Do not remove the guard.
- **SQLite unavailable:** use the supported Node build, not an older system Node.
- **Source edit rejected with 412:** retrieve the latest revision; do not blindly retry with an old version.
- **No matches:** check approved confirmed topics, event ordering, active/waiting stage, blocker evidence, expiry, contact restriction and snooze date.
- **Restore over 11 MB:** use a protected full SQLite snapshot for exact recovery; do not silently truncate an archive.
- **AI button disabled:** key absent on the server; browser storage must never hold it.
- **Clipboard denied:** the draft remains saved. Select and copy the visible text manually.
- **Downloads blocked by a managed browser:** permit appropriate downloads through your organization's normal administration or use a permitted browser; do not bypass policy. Data export generation can be verified separately via the authenticated API.


## English 1.0 to 1.2 upgrade

1. Stop the running service and take a verified full backup.
2. Preserve the configured database and its private permissions. Replace code, not `.data`.
3. Start 1.2 against that path. Schema 1 is migrated transactionally to schema 2 by adding `note_metadata`; incompatible schemas are refused.
4. Verify a known contact, project, source, evidence, export and new Capture entry. Restart again and verify persistence.
5. Roll back only with old code plus the pre-upgrade backup, not old code against the migrated database.

Old version-1 user exports with no capture metadata still restore into an empty workspace. New metadata is validated and remapped on restore. Export is not a full history/account backup.

`npm run demo` creates a separate temporary fictional workspace on loopback with random credentials and no AI key. Stop it to clean up. Never replace production records with these examples. The extension must be configured for the operator's exact approved origin. Calendar export is a one-time file.
