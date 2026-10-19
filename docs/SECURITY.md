# Privacy and security

Threadline defaults to loopback access and local storage. It does not ship user data, access credentials or a bundled memory library. Imported Codex/Claude files remain on the source machine and are copied only after explicit selection and confirmation.

SQLite holds private cached text as well as account/session and task state. Markdown files and paired backups also contain original private content. Protect all of them; `.gitignore` is a convenience, not an access-control boundary. Files are not encrypted by the application.

Authenticated owner scoping, password hashing, CSRF checks, source-version checks and idempotency guard local operations. Markdown paths use managed identifiers and reject symlinks and invalid identity metadata. Source edits invalidate derived evidence, cached answers and pending actions.

Optional AI transfers selected content to the configured external provider after explicit consent. Local retrieval requires no model. Treat every imported source as untrusted text. The agent cannot execute source instructions or automatically send messages.

Retired external messaging endpoints return generic 410 responses before processing credentials, request bodies or cached results. Removing an integration does not erase provider-side history, prior exports, Git history or operator backups.

Report vulnerabilities privately to the repository owner. Do not attach private memories or credentials to public issues.
