# Local operations

## Run

Use Node.js 22.16 or later. Run `npm start` and open http://localhost:4173. Defaults bind to `127.0.0.1`; a new account starts empty. `.env.example` documents server paths and optional AI settings.

The database defaults to `.data/threadline.sqlite`. Markdown defaults to `.data/memory`. Configure `THREADLINE_DB` and `THREADLINE_MEMORY_DIR` before first use if needed. Do not change an established vault path without a verified migration. Keep the directory private to your OS account.

## Back up

```sh
npm run backup -- --out /private/backups/threadline.sqlite
```

The backup creates the SQLite snapshot and its companion `threadline.sqlite.memory` directory, verifies hashes and refuses overwrites, links, unresolved Markdown conflicts or pending writes. Store both together outside Git and protect them as private data.

## Restore and recovery

Stop the server, preserve the current database and vault, then restore both matching backup parts to their original configured locations. Backups retain the original vault configuration; restoring only SQLite or only Markdown is incomplete.

For offline password recovery, run `npm run recover -- --email owner@example.invalid --password-file /private/password.txt --confirm` using a private permission-600 file and the actual account email. It revokes existing sessions. Do not run recovery against a running instance. Workspace JSON export is useful for portable core records but does not replace the paired operator backup.

## Verify

Run `npm test` and `npm run validate`. Check login, save, import preview/commit, source inspection, search and restart against a separate temporary workspace before changing private data.

No external channel listener is started by this project. Retired webhook and conversation-channel routes return 410.
