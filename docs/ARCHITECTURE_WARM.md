# Warm Start architecture and contracts

The current runtime stays deliberately small: Node HTTP, SQLite, static English frontend, optional model adapter, signed selected-message webhooks. There is no Postgres RLS, distributed queue, shared HR directory, employee scoring or hidden agent swarm. See the existing `ARCHITECTURE.md` for the preserved baseline and this document for the 1.3 extension.

## Source -> person -> plan -> approved tasks

`knowledge_routes` ties an exact source quotation to a confirmed colleague, normalized topic, role, source version, effective date, optional expiry and explicit supersession. Source dates are user-declared, not independently certified. A quotation substring proves textual grounding, not semantic authority.

`onboarding_goals` records the user's role, task, topic, definition of done, due date and state. `onboarding_plans` freezes goal version, workspace generation, current routes, explanation, unknowns, three steps and mode. `onboarding_plan_tasks` links only the user-selected steps to ordinary persistent tasks.

A local plan is deterministic. The optional model receives a bounded goal and quoted context, returns a strict object, and cannot alter the chosen route/recipient, permissions or executable action types. The server only accepts read/ask/verify prose and retains its own immutable unknowns. Output still requires human semantic review; structured JSON is not truth validation.

## State and race checks

A route is usable only when active, unexpired, source-undeleted and source-version-matched, with an allowed, unarchived colleague. Two current same-role owners pause. Older event dates cannot replace newer responsibility. There is no latest-upload-wins fallback.

Planning snapshots goal version and workspace generation before a model request, then rechecks both and current route versions before commit. Approving verifies the current snapshot, goal state, selected unique visible step IDs, source dates and contact permission in a transaction. Approval creates tasks; it does not make an API request to grant access or send a colleague a message. Duplicate or stale approval cannot create duplicate tasks.

Note changes, route changes, goal changes and permission withdrawal increment the conservative workspace generation. A SQLite trigger invalidates plans, clears derived text and cancels unfinished generated tasks. Independent manual task history remains distinguishable. Time expiry is checked at read and approve time, even without a scheduled worker. This is deliberately broader than a minimal dependency closure.

## Schema 3

New tables: knowledge_routes, onboarding_goals, onboarding_plans, onboarding_plan_tasks, chat_connections, chat_link_codes, chat_inbox. The capture metadata table is rebuilt to allow Slack and Discord source labels. Existing schema 1/2 automatically migrate to 3 without replacing ordinary user data. Sources may be user-edited; old note bodies are not all archived.

Business foreign keys are account-scoped. The optional supersedes ID is service-validated and retained as an opaque historical pointer so deleting the old colleague does not delete the current route. No external input can choose an arbitrary table, owner or workspace.

## New API surface

| Method | Route | Meaning |
|---|---|---|
| GET | /api/warm | Current goals, routes and plans |
| POST | /api/warm/routes | Confirm a dated, exact quotation and responsibility |
| DELETE | /api/warm/routes/:id | Versioned withdrawal |
| POST | /api/warm/goals | Create a personal first-week goal |
| GET / PATCH | /api/warm/goals/:id | Read or versioned edit/status change |
| POST | /api/warm/goals/:id/plan | Local proposal, or explicit consented AI job |
| POST | /api/warm/plans/:id/approve | Version + selected step IDs + confirmation |
| PATCH | /api/warm/plans/:id/draft | Persist an edited displayed ask draft |
| GET | /api/connections | Configuration, account bindings and pending inbox |
| POST | /api/connections/code | One-use platform link code; never cache its plaintext |
| DELETE | /api/connections/:id | Disconnect own account binding |
| POST | /api/inbox/:id/confirm | Atomic owner-reviewed capture |
| POST | /api/inbox/:id/dismiss | Discard selected context |
| POST | /hooks/slack | Verified raw-body HMAC interaction |
| POST | /hooks/discord | Verified raw-body Ed25519 interaction |

The normal owner API retains session, Origin, CSRF, idempotency and version enforcement. Signed platform hooks use verified external identity -> hashed-code binding -> owner scope instead of a browser session. Response text is private. Link issuance deliberately bypasses generic response caching. The server provides setup-required status rather than pretending configured flags are a successful live installation.

## Operational constraints

One process, one SQLite writer; scale and load need measurement. Model calls are async in-process, with a daily request count and concurrency cap, not a durable distributed job queue or exact dollar budget. Timeouts may still incur charges. No silent provider fallback or uncontrolled retries. On shutdown, pending calls are drained; deployed process crashes have separate recovery behavior inherited from the job module.

The server operator and backups are trusted. Workspace scoping does not defend against an operator/root compromise. Native browser security and real platform configuration require acceptance on the target deployment. Selected captures do not mirror upstream source edits/deletions automatically. Export includes readable new sections; full restoration uses SQLite backup.
