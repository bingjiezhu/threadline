# Threadline

A personal memory workspace that keeps your notes in local Markdown files. Import selected Codex or Claude memories, find the original context, and connect it to people, projects and tasks.

## Start

Requires Node.js 22.16 or later. No package installation or model key is needed for local search.

```sh
npm start
```

Open http://localhost:4173, create a local account, then save a note or import selected `.md` / `.txt` files in **Memory**. A fresh workspace starts empty.

## Everyday use

- **Memory:** browse original notes, search text, inspect provenance and open the generated Markdown.
- **Personal agent:** ask questions about saved content and inspect the supporting excerpts. Optional AI requires explicit consent; local retrieval works without it.
- **People and projects:** link notes to the context they belong to.
- **Tasks:** confirm a proposed task before creating it; track commitments without automatic outbound actions.

Existing notes, evidence review, follow-ups, capture and weekly activity remain under **Supporting tools**.

## Your files

The default server binds to `127.0.0.1`. Original notes live at:

```text
.data/memory/<workspace-id>/notes/<source-id>.md
.data/memory/<workspace-id>/MEMORY.md
```

SQLite at `.data/threadline.sqlite` also stores accounts, indexes, links and tasks. Back up both the database and its Markdown vault. Imported source files are copied and left unchanged; importing does not scan the whole machine or call a model.

The project does not include a bundled memory corpus, credentials or automatic messaging integrations. Hosting the server elsewhere stores the workspace on that host. Optional AI sends selected content to the configured external provider only after consent.

## Check and maintain

```sh
npm test
npm run validate
npm run backup -- --out /private/backups/threadline.sqlite
```

See [Operations](docs/OPERATIONS.md), [Memory](docs/PERSONAL_MEMORY.md), [API](docs/API.md) and [Security](docs/SECURITY.md). Optional provider configuration is documented in [AI](docs/AI.md).

Licensed under Apache-2.0; see [LICENSE](LICENSE) and [NOTICE](NOTICE).
