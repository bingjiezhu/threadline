# Implementation review — Warm Start 1.3

## Baseline and scope
The actual `Threadline_App_v1.2.0.zip` was extracted and its original file hashes recorded before editing. The previous 127-test baseline passed. Formatting-only changes are not separately invented product capabilities. See `docs/competition/BASELINE_DIFF.json` and `IMPLEMENTED_DELTA.md` for the final comparison.

## Key design and correction decisions

- Sources, people, goals and approval/task records remain real account-scoped SQLite entities. Explicit ownership cannot be inferred from a profile label.
- Conflicting current owners yield no executable plan. A replacement must target the same topic/responsibility and carry a later source event date; late uploads are not automatically newer facts.
- Source, permission and goal revisions recheck generations before model commit and task creation. Date expiry is enforced on access, including invalidation of stale task prose; it does not rely on a background timer.
- The model cannot switch the recipient to another merely permitted colleague: each step uses the server-selected route, then may vary bounded wording. The regression suite tests that case.
- Confirming selected steps is atomic. Editing an introduction does not create a send event. Completing a read task does not certify training or goal success.
- The route supersession pointer deliberately does not cascade deletion of a prior person into deletion of an independently supported current person. Service checks validate that pointer and its tenant.
- Signed Slack/Discord raw-body validation is separate from browser session/CSRF checks. One-use linking codes are hashed and expire. Raw linking codes do not enter generic idempotency response caches.
- Pending selected text is bounded, short-lived, private and untrusted. It is removed after successful confirmation; withdrawing a saved note clears its staging duplicate. No prior screenshot or dummy response replaces runtime results.
- Full SQLite backup is the comprehensive recovery mechanism. JSON core-record restore remains intentionally narrower and is documented rather than silently dropping extension state.

- Served guides now load same-origin CSS instead of inline style blocks, keeping the existing strict CSP intact. A real HTTP regression checks both guide routes and stylesheet responses; the standalone downloadable guide remains self-contained.

## Review limits
The automated and UI reports use synthetic isolated records. Provider tests use explicit contract stubs. No independent penetration test, real workspace installation, customer interview or paid-pilot result was performed. Native browser navigation was actually attempted and blocked, and is documented rather than represented as passed.
