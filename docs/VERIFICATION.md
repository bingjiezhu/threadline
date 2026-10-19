# Verification

`npm test` runs dependency-free Node tests covering owner isolation, CSRF, source lifecycle, exact citations, task confirmation, local-file imports, Markdown synchronization/conflicts, paired backups, restart behavior and retired-channel rejection.

`npm run validate` checks JavaScript syntax, JSON, required artifacts and release text. It does not replace functional tests or a UI walkthrough.

Provider tests are labeled contract stubs. They verify boundaries and response handling, not live model availability, answer quality, production deployment or external account integration.

For a manual check, use a separate empty local account: save a note, inspect its Markdown, search it, import selected files, ask a question, reopen a cited source, confirm a task and restart the server. Verify private original files remain unchanged.
