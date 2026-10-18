> Current release 1.3 adds schema 3 and the workflow in `ARCHITECTURE_WARM.md`. The document below describes the preserved relationship foundation.

# Implemented system architecture

## Deployment unit

One Node.js process serves static English assets and a JSON API. Node's builtin `DatabaseSync` persists workspaces and business records in SQLite. FTS5 indexes original note text. There is no runtime npm dependency or build step. Sessions, entities, jobs, and event history survive restarts. Optional model calls use asynchronous network requests; database transactions are short and synchronous.

```text
Browser UI
  │ account cookie + CSRF + idempotency key
Node HTTP API
  ├─ auth / input validation / workspace authorization
  ├─ domain commands / version checks / evidence lifecycle
  ├─ SQLite + FTS5 + server-side sessions
  └─ optional OpenAI request
       └─ JSON validation → source + generation recheck → candidate commit
```

## Modules

`src/auth.js`: scrypt password storage, login, invitation registration, session lifecycle, rate buckets, password confirmation and account deletion.
`src/domain.js`: contact/project/note/claim/task CRUD, match rules, drafts, review decisions, event correction, search, export/restore.
`src/store.js`: schema, composite workspace foreign keys, nested savepoints, schema compatibility guard, secure-delete setting, restart recovery of interrupted jobs.
`src/ai.js`: official Responses endpoint, explicit consent, strict JSON, request caps, async job tracking, selected-evidence drafting, generation protection.
`server.js`: HTTP routing, request validation, Host/Origin/CSRF protections, bounded bodies, private/no-store API responses and CSP.
`public/app.js`: real API client, account flow, forms, views, error states, keyboard navigation, responsive layouts.

## Data structure

The relational tables are: schema_meta, users, workspaces, sessions, auth_attempts, contacts, projects, notes, claims, reviews, tasks, events, project_versions, jobs, idempotency, pilot_requests. `notes_search` is a separate FTS5 virtual table (SQLite creates implementation shadow tables).

A contact belongs to a workspace. A project can point to one primary contact. A note optionally belongs to a project/person but can be workspace-wide. A claim belongs to an exact source quotation. A review joins an approved requirement and a newer approved capability. Task records work independently of a review. Events preserve who/what was recorded through the authenticated workspace, with occurrence and recording times.

Every business lookup includes the authenticated workspace ID. Linked-entity foreign keys are composite `(workspace_id, id)` references. This is application authorization plus relational integrity—not Postgres RLS and not protection against an operator who controls the database.

## Source and temporal semantics

Original source text is preserved verbatim. The event date can be a valid YYYY-MM-DD or unknown; the saved timestamp is separate. Exact quotation offsets use Unicode code points and a half-open interval. The app rejects a quote not found in the source and asks for a longer, unique passage when it appears more than once.

Evidence types: requirement, capability, blocker, commitment, context, contact_change, opinion.
Certainty: confirmed, planned, uncertain, reported.
Status: proposed, approved, rejected, withdrawn.

A local sentence scanner can propose candidates but cannot approve them. An optional model can propose an interpretation but cannot confirm it as a business decision. Users review the source and set type, topic, certainty and optional expiry.

## Matching algorithm

For each approved confirmed requirement on an active/waiting project:
1. Filter approved confirmed capabilities to non-deleted dated sources and non-expired evidence.
2. Require identical normalized topic, a different source, and a capability date no earlier than the requirement date when known.
3. Choose the newest qualifying capability.
4. Suppress the match when a same-topic confirmed blocker scoped to the project or workspace is later than the capability, or has unknown date.
5. Respect archived/blocked contacts and previous dismissal, completed business activity or future snooze.
6. Deduplicate the tuple of project, requirement, capability and primary contact.
7. Create a suggested review. The existing commercial stage and unknowns remain unchanged.

This is deliberately auditable and limited. It does not prove equivalent implementation, current need, buyer authority, trust, budget or purchase intent. It does not infer contacts two hops away. It does not use a fixed narrative or built-in sample IDs.

Acceptance records a source-backed project summary and snapshot; it does not mark the project won. Changing the project or a relevant source/person forces reevaluation. New approved blocking evidence revokes an old draft. All action entry points recheck evidence and contact restrictions.

## Draft and event semantics

The user selects one or both of the two matching quotations. The local template asks a neutral question; optional AI receives only selected quotations and minimal recipient/project context. Private opinions are not valid draft evidence. Generated text remains editable and requires human review. There is no send tool or send API.

A copy is an audit event, not contact. Actual contact, reply, meeting and outcome require a real, non-future occurrence timestamp and valid sequencing. “Won” recorded as a business outcome is still user-reported; it does not establish recognized revenue. Corrections append an event and rebuild the working state, with later dependent events corrected first.

## Deletion and concurrency

Source edits/withdrawals increment the workspace memory generation. Directly dependent source text, claim wording, recommendations, drafts, task annotations and project snapshots are cleared or redacted. Idempotent response caches are revoked. Async model jobs cannot commit against a changed source revision or generation. Interrupted jobs are visible failures after restart; they are not silently replayed and charged again.

The implemented graph has direct source/claim/review links. It is not the earlier proposal's general multi-hop inference graph. A future generalized inference layer must add complete dependency closure and deletion tests before release.

Full account deletion removes owned rows and search data. Tombstones/minimal event IDs do not contain the removed source wording. External exports, older backup files, provider retention and filesystem remnants require separate operator controls.

## Deliberate limits

1,000 contacts, 500 projects, 1,000 active notes, 10,000 stored evidence records, 3,000 tasks per workspace. A note is up to 100,000 code points. Browser TXT/MD import is under 500 KB. Optional AI extraction accepts up to 20,000 characters. JSON restore is capped at 11 MB in the UI; large workspaces should use a full database snapshot for exact recovery. State lists load the bounded workspace; this is not a high-scale multi-region service.

SQLite allows one writer and works well for the bounded self-hosted scope. Background workers, larger-tenancy storage, vector search, permissions and billing should be added only with corresponding operating requirements and measured bottlenecks.


## 1.2 person-first layer

`src/relationships.js` composes the existing domain within transactions. `note_metadata` is a small schema-2 addition; notes and evidence keep their existing raw-text and lifecycle model. `src/capture-utils.js` owns source URL normalization, local term segmentation, code-point excerpts and ICS escaping/folding.

`public/relationship-ui.js` supplies Today, Capture, Find people, Brief, This week and Bring context; `focus.css` supplies their responsive design. The existing project/evidence/task/outcome routes remain active. Session loss clears private in-memory drafts. No sensitive server response is substituted by a local fixture.

Person discovery is local lexical term matching, not embeddings or a learned trust score. Project matching still uses explicit approved topics, certainty, chronology, expiry and blockers. These are separate modes and are labeled. Explicit feedback is an event, not a model-training job.

The selected-text extension opens an unsaved fragment draft and needs no page host permissions. The calendar endpoint exports a one-time event, not a scheduler. The practice command uses the actual auth/domain/routes in a disposable, clearly fictional database.
