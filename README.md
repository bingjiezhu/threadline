# Threadline

**Your memory, in local Markdown. Your people and projects, in context.**

Threadline is a local personal memory workspace with a personal agent. Save conversations, ideas and project updates; see exactly what you have stored; and recall the context when you need it. Memory and Personal agent are the starting points. Overview, Contacts, Projects, Notes & evidence, Follow-ups, Tasks, Capture, Find people and This week remain available for managing the people and commitments behind that memory.

## Start

Requires Node.js 22.16 or newer. No dependency installation is needed for the core app.

```sh
npm start
```

Open **http://localhost:4173/#memory** and create an account. New accounts start empty. Keep the server running while using the website.

The default setup listens on `127.0.0.1`. Original memory content is saved as Markdown under `.data/memory/`, with one folder per workspace and one `.md` file per source. A generated `MEMORY.md` links to those files. SQLite at `.data/threadline.sqlite` keeps the search index, cached source text, accounts, relationships, tasks and agent state. Keep both the vault and database; Markdown alone does not restore the entire application.

The browser displays the workspace; the local Node server saves it on this computer. Core storage, search, import and relationship workflows need no cloud account or model key. `THREADLINE_DB` selects a database path; the default vault is its sibling `memory/` directory. Set `THREADLINE_MEMORY_DIR` before first use to choose another vault. If the server is hosted elsewhere, both stores are on that server.

## See what you remember

Save a conversation, preference or project update and optionally link it to a person or project. The **Memory** library shows the original content you saved. Search or open a source to inspect it, use optional organization to review extracted facts and commitments, or ask the **Personal agent** for context before the next conversation. Answers link back to their sources; local mode returns retrieved excerpts and Gemini synthesis is optional.

The Markdown body preserves the original text. A small frontmatter header records its identity, date and links. You can edit the body in a text editor and synchronize it in Threadline; ordinary workspace requests also check for disk changes. Keep identity, version and timestamps unchanged. Missing files, invalid headers or competing edits are reported instead of silently overwriting your content. Use **Forget** in Threadline to remove a saved source; use the importer to add existing files. Unlisted files in the vault are left untouched.

Editing a source invalidates dependent memories and answers. Forgetting removes its active text and derived quotations. Existing backups are separate.

Task proposals require a separate confirmation. Photon and ASI:One are optional message channels to this same backend; they do not have separate copies of your memory.

## Bring in existing memory

Choose **Memory → Import local memory**, select **Codex** or **Claude**, then choose Markdown/text files or a memory folder. Preview the originals and select what to import. Identical content is reused; changed files become new snapshots. Large files are preserved as linked parts. You can filter the memory library by Codex, Claude, iMessage, ASI:One or web notes.

Import copies the chosen content into Threadline's Markdown vault and indexes it locally. It leaves your original Codex/Claude files unchanged and does not set up automatic synchronization with those source folders. In the default local setup, preview and import stay between your browser and the local server: no model call or cloud upload is part of import. Only files you select are read.

## Capture from iMessage or ASI:One

In your connected private chat, send:

> Remember this: I just spoke with Alex. He prefers a short agenda before a meeting.

This saves the original message directly to Memory. Questions do not become notes. A separate request such as **Remind me to send Alex the agenda tomorrow** still previews the task and waits for **Confirm**. No inferred task or external message is created just because you saved a note.

These optional messaging channels use external providers to transport messages; they are not an offline connection. Explicitly saved messages use the same Markdown write pipeline and local search index as website notes.

## Back up both parts

```sh
npm run backup -- --out /private/path/threadline-backup.sqlite
```

The backup contains the SQLite snapshot plus `threadline-backup.sqlite.memory/`. The command verifies file hashes, the database index and SQLite integrity, and refuses a pending or conflicting save. Restore both parts together with the app stopped, to the original configured database and vault locations. The vault path is recorded in the database; simply moving the database does not relocate it. See [storage and recovery details](docs/PERSONAL_MEMORY.md#backup-and-restore). Private data is not included in the source repository.

## Optional Gemini

Set operator-held Vertex configuration in `.env`, authenticate Application Default Credentials, and restart:

```sh
THREADLINE_AI_PROVIDER=vertex
THREADLINE_VERTEX_PROJECT=your-project-id
THREADLINE_VERTEX_MODEL=gemini-3.8-flash
```

Use an available model in your project. Each website request explicitly chooses whether to send the selected source or bounded retrieved excerpts to the external Gemini service. Importing or storing a file does not grant this consent. No key or credential is delivered to the browser. See [the memory architecture and API](docs/PERSONAL_MEMORY.md) for data lifecycle, testing and limits.

## Release history

The current `main` branch includes the personal memory system developed **after** the LA Hacks submission. The immutable [`la-hacks-2026` release](https://github.com/bingjiezhu/threadline/releases/tag/la-hacks-2026) retains the competition snapshot. Current capabilities must not be attributed retroactively to that submission.

The relationship and follow-up workflows are described below. Earlier optional onboarding tools also remain available.

## A familiar situation

In the fictional walkthrough, Morgan Ellis spoke with Alex Morgan at Northstar on May 12. Alex needed a private deployment and asked Morgan to return with a relevant delivery example. You now have one—but the earlier conversation is buried in your notes.

Save the new delivery note, review its evidence, and refresh follow-ups. Threadline can connect a later confirmed capability with an earlier approved requirement on the same topic. Open both original quotations, check the dates and unresolved questions, then prepare a message you can edit and send yourself.

This is a reason to revisit the relationship, not proof that the client has a budget or wants to buy. Promises become useful when you follow through: create a due-dated task, record actual contact separately, and keep the next conversation's context.

## Your first useful workflow

1. Add a contact and a project or opportunity you care about.
2. Paste a conversation or import a UTF-8 `.txt` / `.md` note, retaining its original date.
3. Review an exact quotation and its meaning: a requirement, delivered capability, blocker, commitment or context.
4. Refresh follow-ups to compare approved requirements with later confirmed capabilities.
5. Choose the evidence for an editable draft, decide whether to contact the person, and record what happened.
6. Use tasks for promises and reminders, whether or not a follow-up match exists.

Contacts support tags, search, CSV import, archiving and contact restrictions. Projects retain goals and unknowns. Notes remain inspectable; later blockers, source changes and contact restrictions can make a previous follow-up inappropriate. Export and deletion controls are available. The app stores one owner's private workspace; additional accounts do not share records.

## Where AI helps

Optional OpenAI and Vertex adapters can assist with selected-note extraction and evidence-based drafting after explicit consent. Extracted claims remain proposals for review. The owner chooses what to believe, whom to contact and what to say.

The local workflow also works without a key. Candidate scanning is labeled as a heuristic; follow-up matching uses approved normalized topics, dates, certainty, expiry and blockers. It is not a semantic recommender or a model that learns your relationships from feedback. One explicitly consented fictional personal delivery note was extracted through real Gemini 3.8 Flash on Vertex. Its candidates matched unique exact quotations and all remained proposed; no task or message was created. This is one case, not a general accuracy evaluation. Personal drafting remains untested live. The inherited 83-second personal demo runs locally and contains no model call; the new extraction receipt is separate.

## Scope

The demonstration uses fictional people and projects with real application operations. Copying a draft does not send it or record contact. A match does not complete a commitment, change a commercial outcome or establish trust.

Capture is manual or file-based. Automatic WeChat history import, full social-platform synchronization, automatic messaging, scheduled notifications and shared-team relationship permissions are not part of the demonstrated personal workflow. Protect the machine and database backups when using private information.

## Development and provenance

```sh
npm test
npm run validate
```

See `docs/USER_GUIDE.md`, `docs/OPERATIONS.md` and `docs/ARCHITECTURE.md` for existing relationship workflows and operator procedures; [the current memory architecture](docs/PERSONAL_MEMORY.md) adds the Markdown vault and paired backup requirement.

Threadline builds on an existing Apache-2.0 application. The current memory entry retains the original relationship and project workflows. The inherited 83-second English walkthrough is earlier real-app evidence, not a claim that all code or footage was created in this pass. Preserve `LICENSE` and `NOTICE`; see `PROVENANCE.md` for the contribution boundary.

## Optional ASI:One fictional demo

The local post-submission personal agent now reuses the same conversation implementation as Photon and connects to the existing web workspace. It answers in English, immediately saves explicit **Remember this:** requests, and previews separately requested tasks for confirmation. It can recall the newly saved conversation. The current demo is restricted to its verified owner/chat pair.

See [personal-agent setup and examples](integrations/agentverse/PERSONAL_ASSISTANT.md). The original competition command-flow adapter remains documented [separately](integrations/agentverse/README.md). The live identity is still [Threadline Personal Demo](https://agentverse.ai/agents/details/agent1qg9nvtv8gsj0zah5qe29pzu6f3dqr5k5mcxj56gqezvx63qwxk5mknxkgsr/profile); availability depends on its local process remaining online. This is not general private-account linking for arbitrary ASI users.

Optional [Photon personal assistant](integrations/photon/README.md): this local post-submission branch connects iMessage to the same workspace, with explicit one-step conversation capture, project briefs, due-dated tasks and editable drafts. Task creation uses a preview and explicit confirmation. The competition snapshot remains unchanged; its earlier source-review delivery evidence is separate from testing this newer workflow.
