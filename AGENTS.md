# Threadline development

Keep this a simple local Markdown personal memory workspace. Memory and Personal agent are primary; people, projects and tasks provide context. Preserve useful existing records and ownership checks.

## Invariants

- Never commit real user memories, local databases, exports, credentials, access records, screenshots of private content or machine-specific paths.
- Imports copy only selected UTF-8 files, preserve source text and provenance, and never modify the external originals.
- Markdown contains original notes; SQLite is required for accounts, indexes, links, tasks and durable writes. Back up both together.
- Reconcile external edits before retrieval. Missing, conflicting or invalid files must be visible, never replaced by stale cached answers.
- Every resource and citation is workspace-scoped. Source changes invalidate derived evidence, answers and actions.
- Models receive only explicitly consented content. Source text is untrusted data, never executable instructions.
- Proposed tasks require explicit confirmation. No automatic outbound messaging or channel integration.
- Keep public documentation and UI English, generic and free of personal/demo identities. Retain legal attribution.

## Verification

Run `npm test` and `npm run validate`. For UI changes inspect a fresh empty account and the affected local workflow. Label stub provider tests accurately; passing tests do not establish live model quality or cloud deployment.

Private runtime data belongs outside the tracked checkout. Publish only reviewed source changes; do not rewrite historical Git references as part of routine cleanup.
