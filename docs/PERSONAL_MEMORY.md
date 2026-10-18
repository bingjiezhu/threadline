# Personal memory system (1.4.0)

This is post-submission work. The LA Hacks tag and release remain the competition snapshot.

## Small, inspectable memory

The main screen lists saved sources. Each source is an existing canonical note, not a second hidden document. Save a note, optionally connect it to a person/project, open its full original text, search it, edit it, or forget it. A new account has no sample content; the operator's local demonstration uses clearly fictional records.

Optional organization creates typed proposals: facts, preferences, decisions, commitments, goals and open questions. Every proposal stores a source ID/version and a unique exact quote. Confirmation keeps an interpretation; it is not a factual truth guarantee. Repeated extraction deduplicates the same quote and category. Explicit supersession requires a later dated source and preserves metadata history.

The minimal lifecycle was informed by [Mem0's open-source API](https://github.com/mem0ai/mem0/blob/main/docs/open-source/features/rest-api.mdx): add, list, search, update, delete and history. Threadline does not embed Mem0, copy its implementation, or require a hosted memory provider. SQLite is sufficient for this small version. Retrieval is lexical plus explicit people/project/topic links; vector embeddings and learned ranking are not implemented.

## Collect, inspect, organize, use

All entry points write to the same owner-scoped source library: website notes, explicitly saved iMessage/ASI messages and imported agent memory files. Keep the original content first; optional extracted memories and agent answers link back to it. The original relationship and project tools remain in the navigation.

### Local Codex / Claude import

The browser reads only files selected with the file or folder picker. Supported input is UTF-8 `.md` / `.txt`, including frontmatter and Markdown. File contents are sent only to the Threadline server after **Preview import**; preview has no database writes or response-cache persistence. **Import selected** saves exact originals and provider, relative filename, import time and hash provenance. It makes no model call and follows no embedded instructions or referenced paths.

Limits: 50 files, 1 MiB per original file, 4 MiB per batch. Files are split losslessly at newline boundaries where possible, with at most 90,000 Unicode code points per part. Source detail links the parts. Reimporting exact content reuses it; a changed file preserves earlier sources and creates only missing content. Preview/confirmation are scoped to the owner. Edits are labeled as edited since import; forgetting a part removes that part and its provenance, not the other parts or original disk file.

Claude's [official memory documentation](https://code.claude.com/docs/en/memory) describes `~/.claude/projects/<project>/memory/MEMORY.md` and topical files. Codex's local memory folder on this installation is `~/.codex/memories/`; the [OpenAI memory guide](https://developers.openai.com/api/docs/guides/agents/sandboxes#persist-memory-across-runs) documents the Markdown registry/summary pattern for sandbox memory. The importer reads ordinary text and does not depend on a fixed private schema. Instructions such as `CLAUDE.md` remain reference content.

Import metadata is included in JSON export, but current JSON restore restores canonical notes rather than extension metadata. SQLite backups preserve complete provenance.

### Fast channel capture

The shared backend enables one-step saving for leading `Remember this:`, `Note this:`, `Log this:` and `Save this:` commands (equivalent Chinese input also works). Original message whitespace and wording are preserved. An ambiguous person requires selection; plain questions and ordinary statements are not silently stored. Inferred reminders are not created during capture. Explicit task requests retain preview/confirm. Stable incoming IDs and durable receipts guard retries and restarts. An interrupted save with uncertain outcome asks the owner to inspect the workspace before retrying.

## Actual backend

- `src/memory-store.js`: additive SQLite memory tables, canonical sources, exact-quote validation, owner-scoped retrieval and review/history.
- `src/memory-agent.js`: durable conversations, runs, bounded source retrieval, optional real Vertex/Gemini generation, validated citations and explicit task proposals.
- `src/conversation-service.js`: shared authenticated channel dialogue with durable SQLite previews/receipts and concurrency checks.
- `src/personal-conversation.js`: natural capture/confirm/task commands and conservative relationship workflows.
- `integrations/photon/assistant.mjs` and the ASI bridge: thin transport clients. Their channels refer to the same website workspace.
- `public/memory-ui.js`: renders and edits these backend records; it contains no fabricated memory dataset or browser-only persistence.

No model call executes tools. The backend checks source ownership/version, quote spans, linked entities and action type. Task creation requires a separate owner confirmation and returns the same task on duplicate confirmation. Unsupported questions may yield no result. Local mode is labeled and returns original excerpts rather than claiming AI reasoning. Gemini failure is visible and never replaced with a fabricated answer. Model synthesis still requires human review for semantic accuracy.

## Data lifecycle

Memory and agent tables use additive version metadata; the original schema remains compatible. Source edits/deletion immediately invalidate and scrub derived memory text, answers, citations and channel reply caches. An in-flight model request cannot restore forgotten context. Superseded memories are labeled historical and cannot support a new task. Generated task content is invalidated with its source; independently edited task content is preserved while source quotation material is removed. An independently requested task is a separate user record and is not automatically deleted when a conversation note is forgotten.

SQLite contains the complete working state. `npm run backup -- --out /private/path/backup.sqlite` makes a consistent full snapshot. JSON export includes canonical records and memory/agent views; the existing JSON restore restores core records, not a complete agent-session replay. Full-state recovery uses the operator SQLite backup procedure. Forgetting does not erase copies the owner previously exported, operator backups, external chat transcripts or provider retention.

## API

All routes require the existing authenticated owner session. Writes require Origin, CSRF and Idempotency-Key.

| Route | Purpose |
| --- | --- |
| `GET /api/memory` | Sources, typed memories, links, statuses and provider availability |
| `POST /api/memory/sources` | Persist original content |
| `POST /api/memory/imports/preview` | Inspect selected files and duplicates without persistence |
| `POST /api/memory/imports/commit` | Atomically save selected file snapshots and provenance |
| `GET/PATCH /api/memory/sources/:id` | Read or revise original source |
| `POST /api/memory/sources/:id/organize` | Local extraction or consented Gemini proposals |
| `POST /api/memory/items/:id/review` | Confirm or reject a proposal |
| `POST /api/memory/items/:id/supersede` | Explicitly replace an older confirmed interpretation |
| `POST /api/memory/sources/:id/forget` | Remove source text and invalidate derivatives |
| `GET /api/memory/search?q=...` | Retrieve current owner-scoped sources |
| `POST /api/memory/agent/ask` | Persist a question, answer, citations and task proposals |
| `GET /api/memory/agent/history` | Read conversations and runs |
| `POST /api/memory/agent/runs/:id/actions/:index/confirm` | Create one selected task |
| `POST /api/memory/conversations/message` | Channel-neutral capture/confirm/recall entry |

Gemini is opt-in per website request. In a connected private chat, `Ask AI: ...` explicitly allows that question and retrieved excerpts; normal commands use local logic. Intent parsing has its own opt-in. Default replies are English. There is no background account scraping, autonomous outreach or scheduled phone notification service.

## Verification

```sh
node --test tests/*.test.js integrations/photon/*.test.mjs
npm run validate
```

Tests use real SQLite and authenticated HTTP for persistence, isolation, stale-source rejection, restart recovery, idempotency and action confirmation. Provider contract tests use clearly labeled fake HTTP responses; they are not model quality evidence. The local browser walkthrough separately used real Gemini 3.8 Flash to extract a fictional preference/commitment and answer with exact quotations, then created a task only after the owner-confirmation UI action. This single walkthrough is not a broad accuracy benchmark.

A live ASI:One query also retrieved the newly saved website preference through the shared backend and returned its exact quote. The upgraded Photon transport was restarted against the same service; this iteration was not independently re-confirmed on the owner's phone.

Earlier memory-system baseline: 292 Node tests passed, no skips; release syntax/English/JSON checks passed. Browser checks covered save, real Gemini organization, memory confirmation, grounded question, explicit task creation, persistence after restart, and full-text matches beyond the preview excerpt.

Import and quick-capture verification: 323 Node tests passed with no skips; release checks passed. Browser tests imported synthetic Codex and Claude files and displayed their full original text and provenance. A real ASI:One message saved immediately and appeared in the shared web library. The iMessage endpoint uses the same quick-capture service and passed HTTP/retry tests; the new phone-side flow has not been independently re-confirmed in this iteration.
