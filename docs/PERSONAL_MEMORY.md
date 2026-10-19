# Local Markdown memory and personal agent (1.4.0)

This is post-submission work. The LA Hacks tag and release remain the competition snapshot.

## Purpose and local storage

Memory and Personal agent are Threadline's starting points: collect content, inspect what was saved, and recall it before deciding what to do next. Overview, Contacts, Projects, Notes & evidence, Follow-ups, Tasks, Capture, Find people and This week remain available. The memory library connects that familiar relationship and project context without replacing it with a separate complicated system.

With the default `npm start` setup, the Node server listens on `127.0.0.1`. Original notes persist as ordinary Markdown files in `.data/memory/`. SQLite at `.data/threadline.sqlite` stores cached source text and the search index, relationships, accounts, tasks, provenance and agent state. The website is a view of these local stores, not a separate browser-only memory store. Records survive browser refreshes and server restarts. `THREADLINE_DB` chooses the database path; its sibling `memory/` directory is the default vault. `THREADLINE_MEMORY_DIR` can select another vault before initialization. A deployment on a remote machine stores both pieces there; visiting it does not make storage local to the visitor.

Saving, importing, searching and local extraction do not require a cloud service. Optional Gemini requests send explicitly consented content to the model provider. iMessage and ASI:One messages pass through their external providers before reaching the Threadline backend. Local storage does not make those optional connections fully offline.

## Markdown vault

```text
.data/
  threadline.sqlite
  memory/
    <workspace UUID>/
      MEMORY.md
      notes/
        <source UUID>.md
```

Each source file has a small `---` frontmatter header followed immediately by the exact original body. Header values use JSON scalars, a constrained YAML-compatible format, to avoid executing or interpreting arbitrary YAML features. IDs, version and timestamps preserve identity and edit checks; title, original date, kind and person/project links describe the source. Managed filenames are generated identifiers, never a path supplied by an imported document or model. Directories use owner-only permissions and files use `0600` on supported local filesystems.

`MEMORY.md` is a generated reading index. Open the linked files in any text editor. You can edit a source's body, title or other supported descriptive header fields, then use the website's synchronization control or refresh the workspace. Keep identity, version and timestamps unchanged. Imported originals remain separate untouched files; the vault holds Threadline's own copy. New standalone files are added through the importer, not by treating every file dropped into the vault as trusted input.

Existing active notes are migrated into the vault once, without clearing the database. App changes enter a durable SQLite outbox in the same transaction as the note change, then write through a private temporary file, hash check and atomic rename. Completed writes record their file hash and clear the queue. An interrupted write can be recovered; a failed write is not reported as a complete Markdown save. This is coordinated recovery across two stores, not a single filesystem-and-SQLite atomic transaction.

External edits reconcile through the normal source-edit operation, invalidating derived content and updating local search. A competing application edit, malformed header, unreadable file, missing file or link is a visible storage issue; the system does not silently substitute cached old text or recreate a missing source from SQLite. Restore the file or explicitly forget the source in Threadline. The generated index and unlisted files are preserved if edited externally. Forget removes the managed source and its derived text, but cannot erase external copies.

## Small, inspectable memory

The Memory screen lists saved sources. Each source corresponds to one canonical note and its Markdown original, with a database index for the application. Save a note, optionally connect it to a person/project, open its full original text, search it, edit it, or forget it. A new account has no sample content; the operator's local demonstration uses clearly fictional records.

Optional organization creates typed proposals: facts, preferences, decisions, commitments, goals and open questions. Every proposal stores a source ID/version and a unique exact quote. Confirmation keeps an interpretation; it is not a factual truth guarantee. Repeated extraction deduplicates the same quote and category. Explicit supersession requires a later dated source and preserves metadata history.

The minimal lifecycle was informed by [Mem0's open-source API](https://github.com/mem0ai/mem0/blob/main/docs/open-source/features/rest-api.mdx): add, list, search, update, delete and history. Threadline does not embed Mem0, copy its implementation, or require a hosted memory provider. Plain Markdown plus a local SQLite index keeps this version small and inspectable. Retrieval is lexical plus explicit people/project/topic links; vector embeddings and learned ranking are not implemented.

## Collect, inspect, organize, use

All entry points write to the same owner-scoped source library: website notes, explicitly saved iMessage/ASI messages and imported agent memory files. Keep the original content first; optional extracted memories and agent answers link back to it. The original relationship and project tools remain in the navigation.

### Local Codex / Claude import

The browser reads only files selected with the file or folder picker. Supported input is UTF-8 `.md` / `.txt`, including frontmatter and Markdown. File contents are sent only to the Threadline server after **Preview import**; preview has no database writes or response-cache persistence. In the default local setup, this request goes to the local server. **Import selected** copies exact originals into the Markdown vault, indexed locally with provider, relative filename, import time and hash provenance. Imported frontmatter stays part of the original body; it does not gain authority over Threadline's own metadata. The original disk files stay unchanged. Import makes no model call, performs no cloud synchronization, and follows no embedded instructions or referenced paths. It does not install a background watcher or edit the source Codex/Claude memory folder.

Limits: 50 files, 1 MiB per original file, 4 MiB per batch. Files are split losslessly at newline boundaries where possible, with at most 90,000 Unicode code points per part. Source detail links the parts. Reimporting exact content reuses it; a changed file preserves earlier sources and creates only missing content. Preview/confirmation are scoped to the owner. Edits are labeled as edited since import; forgetting a part removes that part and its provenance, not the other parts or original disk file.

Claude's [official memory documentation](https://code.claude.com/docs/en/memory) describes `~/.claude/projects/<project>/memory/MEMORY.md` and topical files. Codex's local memory folder on this installation is `~/.codex/memories/`; the [OpenAI memory guide](https://developers.openai.com/api/docs/guides/agents/sandboxes#persist-memory-across-runs) documents the Markdown registry/summary pattern for sandbox memory. The importer reads ordinary text and does not depend on a fixed private schema. Instructions such as `CLAUDE.md` remain reference content.

Import metadata is included in JSON export, but current JSON restore restores canonical notes rather than extension metadata. Paired SQLite and Markdown backups preserve the full application and source state.

### Fast channel capture

The shared backend enables one-step saving for leading `Remember this:`, `Note this:`, `Log this:` and `Save this:` commands (equivalent Chinese input also works). Original message whitespace and wording are preserved. An ambiguous person requires selection; plain questions and ordinary statements are not silently stored. Inferred reminders are not created during capture. Explicit task requests retain preview/confirm. Stable incoming IDs and durable receipts guard retries and restarts. An interrupted save with uncertain outcome asks the owner to inspect the workspace before retrying.

## Actual backend

- `src/markdown-vault.js`: canonical Markdown originals, constrained frontmatter, durable write queue, migration, file hashes and external-edit reconciliation.
- `src/memory-store.js`: additive SQLite memory tables, source indexing, exact-quote validation, owner-scoped retrieval and review/history.
- `src/memory-agent.js`: durable conversations, runs, bounded source retrieval, optional real Vertex/Gemini generation, validated citations and explicit task proposals.
- `src/conversation-service.js`: shared authenticated channel dialogue with durable SQLite previews/receipts and concurrency checks.
- `src/personal-conversation.js`: natural capture/confirm/task commands and conservative relationship workflows.
- `integrations/photon/assistant.mjs` and the ASI bridge: thin transport clients. Their channels refer to the same website workspace.
- `public/memory-ui.js`: renders and edits these backend records; it contains no fabricated memory dataset or browser-only persistence.

No model call executes tools. The backend checks source ownership/version, quote spans, linked entities and action type. Task creation requires a separate owner confirmation and returns the same task on duplicate confirmation. Unsupported questions may yield no result. Local mode is labeled and returns original excerpts rather than claiming AI reasoning. Gemini failure is visible and never replaced with a fabricated answer. Model synthesis still requires human review for semantic accuracy.

## Data lifecycle

Memory and agent tables use additive version metadata; the original schema remains compatible. Source edits/deletion immediately invalidate and scrub derived memory text, answers, citations and channel reply caches. An in-flight model request cannot restore forgotten context. Superseded memories are labeled historical and cannot support a new task. Generated task content is invalidated with its source; independently edited task content is preserved while source quotation material is removed. An independently requested task is a separate user record and is not automatically deleted when a conversation note is forgotten.

Markdown contains the original note content, while SQLite retains search/cache copies and the rest of the application state. Do not delete SQLite on the assumption that all accounts, tasks, review decisions or agent conversations can be rebuilt from Markdown. JSON export includes canonical records and memory/agent views; existing JSON restore restores core records, not a complete agent-session replay. Forgetting does not erase copies the owner previously exported, operator backups, external chat transcripts or provider retention.

## Backup and restore

```sh
npm run backup -- --out /private/path/backup.sqlite
```

The SQLite filename remains unchanged for existing operator tools. When the vault exists, the command also creates the sibling directory `backup.sqlite.memory/`. Keep these together. It briefly locks database writes, uses `VACUUM INTO` to include committed WAL data, refuses pending/error states, verifies managed note hashes against the database, and compares all vault bytes before and after copying. SQLite integrity and copied file hashes must pass before it prints success. Symbolic links, hard-linked files, existing destinations, a vault inside the backup destination and backups inside the active vault are refused. This is a consistency check, not encryption.

Finish synchronization and resolve storage issues before backup. If a concurrent external editor changes the vault, the command fails rather than certifying a mixed snapshot. A failed attempt may leave partial output; preserve the original workspace and use a new output filename after resolving the cause. It never removes or overwrites an existing backup. Databases created before the Markdown vault retain the SQLite-only backup behavior until migrated.

To restore, stop Threadline and its channel processes. Preserve the current database, its WAL/SHM files and vault before following the offline database replacement procedure in `docs/OPERATIONS.md`. Restore the saved SQLite file **and the contents of its `.memory/` companion** to their original configured locations before restarting. The database records an absolute vault root in `markdown_vault_config`; changing `THREADLINE_MEMORY_DIR` or moving only SQLite is refused rather than silently switching memory stores. This version does not provide a one-click vault relocation or Markdown-only full recovery. Revoke restored sessions as described in the operator procedure. Keep private backups outside the public repository.

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

Markdown-vault verification: 365 Node tests passed with no skips, including real filesystem/HTTP migration, edit synchronization, stale-response invalidation, missing/conflicting-file protection, owner isolation and paired backup checks. The live local workspace migrated 14 existing originals with unchanged body hashes and versions. A new fictional note was saved through the website, edited directly in its Markdown file, and reread in the website at revision 2 with the old extracted memory marked stale. A full paired SQLite/Markdown backup was verified.

## Messaging retrieval

Read-only Codex/Claude memory questions are routed to the source library before contact-brief matching. Explicit provider scopes use import provenance; combined scopes exclude unrelated notes. Query words and filename/topic matches determine local retrieval, with relevant excerpts and shorter dedicated notes preferred when relevance is equal. This is lexical retrieval, not a claim of general semantic reasoning. Messaging replies show up to two compact original excerpts instead of repeating the full web answer and quotations. Original source language is retained. Unknown topics return no result, and source edits still invalidate older answers.
