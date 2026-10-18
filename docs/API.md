> The 1.3 Warm Start and signed chat API additions are specified in `ARCHITECTURE_WARM.md`. Owner security rules below still apply.

# Actual HTTP API — Threadline 1.2.0

This document describes the shipped SQLite application, not the earlier proposed Postgres API. Start the server with `npm start`. All paths below are relative to its exact configured origin. No endpoint sends a message or takes a payment.

## Authentication, writes and errors

1. `GET /api/auth/status` reports setup/registration state and, for a valid session, user and CSRF token.
2. Create an account or log in. The response sets an HttpOnly, SameSite=Strict session cookie (Secure in production) and returns a CSRF token.
3. Every authenticated mutation requires the session cookie, `X-CSRF-Token`, `Content-Type: application/json`, and a unique `Idempotency-Key` of 12–100 characters. Auth/logout/password/account routes apply their own idempotency exceptions.
4. Every edit, delete or event for an existing record supplies the integer `version` last read. A mismatch is HTTP 412. The next successful read includes the new version. This release uses a JSON version field, not the earlier spec's If-Match header.
5. The server derives workspace from the session. Clients cannot choose a different workspace ID.

Same key and same body replay the prior result while the workspace generation is unchanged. Same key with different content returns 409. Evidence invalidation clears cached write responses, so a deleted quotation cannot be recovered through an old cached response.

Typical errors: 400 invalid fields; 401 signed out; 403 invitation/CSRF/origin/host failure; 404 missing or other-workspace record; 409 business state, duplication or generation conflict; 412 old version; 413 size limit; 415 wrong content type; 429 rate/request limit; 502 provider failure; 503 optional AI not configured. Error body is `{ "error": { "code": "...", "message": "...", "requestId": "..." } }`. Private API responses use `Cache-Control: private, no-store`.

## Routes

| Method | Path | Input / result |
|---|---|---|
| GET | `/api/health` | Public `{ok, version}`; no private data or filesystem paths |
| GET | `/api/auth/status` | Setup, registration and session status |
| POST | `/api/auth/register` | `name, email, password, workspace?, inviteCode?` |
| POST | `/api/auth/login` | `email, password` |
| POST | `/api/auth/logout` | Revokes current session |
| POST | `/api/auth/password` | `currentPassword, newPassword`; revokes other sessions |
| DELETE | `/api/account` | `password, confirm: "DELETE"`; deletes this account and its workspace |
| GET | `/api/state` | Current workspace, own contacts/projects/notes/claims/reviews/tasks/events, AI status and user |
| PATCH | `/api/settings` | `name, timezone, version` |
| POST | `/api/contacts` | `name`, optional `email, company, role, phone, tags, notes, contact_policy, archived` |
| GET / PATCH / DELETE | `/api/contacts/:id` | Read / partial contact edit with version / delete with version |
| POST | `/api/contacts/import` | `{csv}`; atomic validation, created count and skipped duplicate-email rows |
| POST | `/api/projects` | `name`, optional `company, goal, status, contact_id, value, currency, unknowns, next_review` |
| GET / PATCH / DELETE | `/api/projects/:id` | Detail with history / partial edit with version / delete with version |
| POST | `/api/notes` | `title, body`, optional `kind, project_id, contact_id, occurred_on` |
| GET / PATCH / DELETE | `/api/notes/:id` | Original text and evidence / revise with version / withdraw and purge with version |
| POST | `/api/notes/:id/scan` | Local heuristic candidates; never auto-approved |
| POST | `/api/notes/:id/extract` | `{consent: true}`; actual optional provider job (202) |
| POST | `/api/claims` | `note_id, kind, topic, quote`, optional `project_id, statement, certainty, valid_until` |
| POST | `/api/claims/:id/decision` | `version, decision` (approve/reject/withdraw), optional corrected `kind, topic, certainty, valid_until` |
| POST | `/api/reviews/refresh` | Recompute approved exact-topic matches; returns created/updated count |
| GET | `/api/reviews/:id` | Review, current evidence, linked project and contact |
| POST | `/api/reviews/:id/accept` | `version, project_version`; confirm context without overwriting commercial stage/unknowns |
| POST | `/api/reviews/:id/draft` | `version, evidence_ids`, optional `use_ai`; local draft or actual provider job (202) |
| PATCH | `/api/reviews/:id/draft` | `version, draft`; edit a permitted existing draft |
| POST | `/api/reviews/:id/events` | `version, type`; actual events also need `occurred_at`; snooze needs `until`; outcome needs `outcome` |
| POST | `/api/events/:id/correct` | Current review `version`; append correction of the latest uncorrected business event |
| POST | `/api/tasks` | `title`, optional `due_on, status, project_id, contact_id, notes, claim_id` |
| PATCH / DELETE | `/api/tasks/:id` | Edit with version / delete with version |
| GET | `/api/search?q=...` | Authorized note full-text, contact and project results |
| GET | `/api/jobs/:id` | Actual async job state/error/result/token usage |
| GET | `/api/ai/status` | Configured state, model, daily request count and cap; never the key |
| POST | `/api/export` | `{password}`; authorized JSON data archive, no credentials |
| POST | `/api/restore` | `{password, archive}`; atomic core-record reconstruction into an empty workspace |
| POST | `/api/pilot-requests` | Public consented inquiry: `name, email, company, goal, consent: true, website: ""` |

The operator-only inquiry list/export/delete and offline password recovery exist as local CLI tools, not public administrative endpoints.

## Field semantics

Contact `contact_policy`: `allowed` or `blocked`; `archived`: boolean on input, 0/1 in stored records. A stable email is unique only within that workspace. A shared name never causes automatic merge. Tags are a comma-separated string, not a public graph.

Project `status`: active, waiting, won, lost, archived. `value` is a nonnegative integer **in minor units (cents)**; the UI converts entered dollar values to cents. It is a user estimate, not verified pipeline revenue. Currency is validated. `unknowns` remains user-managed text.

Source kind: note, meeting, email, delivery, conversation. `occurred_on` and due/review dates use YYYY-MM-DD or null. Unknown stays null; source event dates must not be in the future. Timestamps for real-world actions use ISO 8601 **with an explicit offset**, cannot be future-dated, and preserve the distinction from recording time.

Evidence kind: requirement, capability, blocker, commitment, context, contact_change, opinion. Certainty: confirmed, planned, uncertain, reported. Status: proposed, approved, rejected, withdrawn. All extracted claims start proposed. Requirements require a linked project. Confirmed capabilities require a known event date. The user must approve evidence before matching.

Topics are normalized to searchable kebab-style keys. Matching requires the same topic, a later/equal dated capability, and current approved confirmed evidence. It is deterministic topic matching, not vector or automatic relationship inference. A later confirmed blocker (or undated current blocker) on the same topic and project/workspace prevents the follow-up. All shared and project-specific capability behavior is explained in the user guide.

Quotes must occur exactly once in their saved source. Returned start_cp/end_cp are Unicode code-point offsets, left-closed/right-open, not JavaScript UTF-16 offsets. Original content is preserved. Repeated quotes require a longer uniquely identifying passage. A matching string is not proof that its interpretation is correct; review it.

Review event types: dismiss, snooze, copied, contacted, replied, meeting, outcome. Outcome values: progressed, won, lost, not_relevant. Recording an outcome does not silently overwrite the project's commercial stage. Copying or generating a draft never records actual contact. Contact/reply/meeting/outcome records are user-reported, not externally verified.

## Minimal example: authorized source to review

Use the frontend for ordinary work. A client integrating with the API follows this sequence:

```javascript
// base is the same-origin server. session cookies must be maintained by the client.
const auth = await (await fetch('/api/auth/status')).json();
async function write(path, payload) {
  const response = await fetch(path, {
    method: 'POST', credentials: 'same-origin',
    headers: {'content-type': 'application/json',
      'x-csrf-token': auth.csrf, 'idempotency-key': crypto.randomUUID()},
    body: JSON.stringify(payload)
  });
  const value = await response.json();
  if (!response.ok) throw new Error(value.error?.message ?? 'Request failed');
  return value;
}
const person = await write('/api/contacts', {name: 'Your authorized contact'});
const project = await write('/api/projects', {
  name: 'Your actual project', contact_id: person.id,
  unknowns: 'Budget and present-day ownership need confirmation.'
});
const note = await write('/api/notes', {
  title: 'Client conversation', kind: 'meeting', project_id: project.id,
  occurred_on: '2026-05-10', body: 'We require private deployment.'
});
const claim = await write('/api/claims', {
  note_id: note.id, kind: 'requirement', topic: 'private-deployment',
  quote: 'We require private deployment.', certainty: 'confirmed'
});
// Only approve after a person reviews the actual source and interpretation.
await write(`/api/claims/${claim.id}/decision`, {
  version: claim.version, decision: 'approve'
});
```

A separately recorded later confirmed capability on the same topic is needed before refresh can produce a match. No unseen data or fictional IDs are assumed. Source import duplicates and insufficient evidence return clear results, not fabricated recommendations.

## Async provider lifecycle

A configured, consented extraction/draft returns HTTP202 `{job_id, state: "running"}`. Poll the authorized job endpoint. States are running, succeeded, failed, or cancelled by invalidation. Check `error` for a human-readable reason. The server never retries external calls automatically. Generation/source-version validation happens again before saving output; changed/deleted source data cannot be resurrected by the completed job. Completed or interrupted calls can still be billed by the provider.

## Portability and limits

`/api/export` includes historical snapshots and events as well as working data, but no login secrets or provider key. `/api/restore` reconstructs core contacts/projects/notes/claims/tasks using new IDs and normal validation; it does not replay claims of real contact or old generated drafts into current state. Use the original JSON archive to examine those historical records. Use the operator full SQLite snapshot for exact disaster recovery.

Default stored-record limits are 1,000 contacts, 500 projects, 1,000 active notes, 10,000 claims and 3,000 tasks per workspace. A note allows 100,000 Unicode code points, optional AI extraction 20,000. JSON request cap is12MB and the UI rejects import files over11MB. Large exact recovery uses the operator backup. Limits are documented, not silent truncation.


## 1.2 person-first endpoints

All are authenticated and owner-scoped. POST capture/feedback additionally require normal CSRF, Origin and Idempotency-Key validation.

| Method | Path | Behavior |
|---|---|---|
| POST | /api/capture | Atomic source + optional contact + metadata + optional reminder/evidence annotation |
| GET | /api/people/find?q=topic | Local lexical top-five people with exact, authorized linked-note excerpts; no provider call |
| GET | /api/contacts/:id/brief | Original source timeline, contact policy, project unknowns and open tasks |
| GET | /api/week | Actual captures, useful feedback and task-completion events in workspace calendar time |
| POST | /api/discovery/feedback | Explicit useful/not_relevant feedback on a linked person/source; no query text stored |
| GET | /api/tasks/:id/calendar | JSON with filename, content_type and RFC5545 calendar text for an owned open dated task |

Capture body: `body`, optional `title`, `contact_id` OR `new_contact:{name,email,company,role}`, optional `project_id`, `occurred_on` date or empty/unknown, `channel` (wechat/email/meeting/browser/other), `source_url` label, `tags`, optional `reminder:{title,due_on}`, optional `annotation:{kind,topic,quote,certainty,approve}`. Explicit approval cannot be inferred from the source. The implementation and tests define exact size/type errors.

Incoming browser fragments populate only unsaved UI state; there is no ingestion GET side effect. Source URL query/fragment are removed and credentials are rejected; the app never fetches it.

Source withdrawal retains idempotency tombstones for the normal retention period, erases cached private response content, advances generation and rejects old-generation replays. This prevents the same retry resurrecting deleted text; it is not a permanent ban on a user deliberately entering new material.

The app manifest exposes shortcuts only; it does not implement a mobile share target, offline service worker or push notifications.
