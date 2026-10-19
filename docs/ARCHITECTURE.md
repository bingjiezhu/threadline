# Architecture

A dependency-free Node.js server serves the browser UI and an authenticated local API. SQLite provides owner-scoped records, full-text indexing, session state, agent history and a durable Markdown write queue.

`markdown-vault.js` writes one Markdown original per note and a generated MEMORY.md index. Reconciliation detects local edits and invalidates derived results before retrieval. Missing originals, conflicting edits and invalid metadata fail visibly.

`memory-import.js` previews selected files before committing exact text and provenance. `memory-store.js` manages sources and reviewed memory. `memory-query.js` performs local retrieval with explicit import-provider scope. `memory-agent.js` returns cited context and proposes actions; task creation requires a separate confirmation.

`domain.js` retains contacts, projects, evidence, follow-ups and tasks. Legacy schema migrations remain for existing databases; retired messaging and onboarding services are not initialized.

No external message listener or cloud synchronization is included. Optional provider adapters run only for consented requests. See AI.md and SECURITY.md.
