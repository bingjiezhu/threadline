# Personal memory

## Save and inspect

Save a note in Memory or select local Markdown/text files to import. Preview the selection, then confirm the files to copy. Inspect the original text, source version, date, links and import provenance from the source detail view.

Supported import labels are Codex, Claude and local files. Only selected files are read by the browser; Threadline does not crawl account folders. Imports leave external originals unchanged. Each request permits up to 50 files, 1 MiB per file and 4 MiB total; long files are split into inspectable parts. Duplicate content is recognized by its provenance and hash.

## Markdown storage

Each original is stored as `<memory-root>/<workspace-id>/notes/<source-id>.md`. Front matter carries managed identity and version fields. Edit the title or body below the identity fields, then synchronize in the app. The per-workspace MEMORY.md is a generated index, not an editable replacement for the notes.

SQLite also retains cached text, provenance, accounts, relationships, tasks, derived memory and durable write state. Both database and vault are required for complete recovery. A missing original or a concurrent edit blocks stale retrieval until resolved. The app never silently recreates a missing original from a cached copy.

## Find and ask

Search terms return original excerpts. Questions can explicitly target Codex or Claude imports. The personal agent cites saved sources; it does not independently verify their truth. Optional model requests require consent and may disclose selected content to the configured provider.

Search is lexical and local. Chinese questions are split into words, and question words such as "what" or "when" are ignored; a word found in many sources counts for less than a rare one. Chinese words are not matched to English translations, though a Latin word in a Chinese question (such as pnpm) still finds English notes. When a Codex or Claude file is imported again with changed content, both snapshots stay searchable: the earlier one ranks lower and is marked as an earlier version when most of its content lines (front matter and headings aside) carry over into the newest import of that path. A snapshot you edited in Threadline, one holding a memory you confirmed, and a different file that only shares the name stay current. Gemini is told which sources are earlier versions, answers in the language of the question, and a citation marker such as [1] in an answer must refer to a listed citation (bracketed code such as argv[2] is not a marker); an answer that cites nothing is shown as the standard "could not find" reply.

To measure search on your own data, keep a JSON list of questions with the source titles you expect outside the repository, for example `[{"question": "...", "expect": ["part of a source title or import path"]}]`, then run `npm run eval-retrieval -- --questions ~/threadline-questions.json`. It reads a temporary copy of the database, never calls a model, and reports where the expected source ranked.

A proposed task is a preview until separately confirmed. Editing or forgetting a supporting source invalidates old derived answers and actions. Forget removes the active source and its managed Markdown file; existing operator backups and prior exports remain separate copies.
