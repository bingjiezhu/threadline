# Threadline

**Save your context. See what you remember.**

Threadline is a small, self-hosted personal memory system. Save a conversation, idea, preference or project update, then browse the original content in one place. Optional Gemini organization proposes useful memories; the website shows each one beside the exact source it came from.

## Start

Requires Node.js 22.16 or newer. No dependency installation is needed for the core app.

```sh
npm start
```

Open **http://localhost:4173/#memory** and create an account. New accounts start empty. Sources, memories and agent conversations persist in SQLite across refreshes and server restarts.

## The simple workflow

1. **Save:** choose **Add a memory**, paste the original content and optionally link a person or project.
2. **See everything:** the Memory page opens on **Sources**, showing what you actually saved. Open a card to inspect its full text.
3. **Organize:** use local sentence extraction, or explicitly send that one source to Gemini. Review suggested preferences, decisions, commitments and facts.
4. **Recall:** ask the Personal agent about saved context. Answers include source quotations. Gemini synthesis is optional; local mode returns retrieved excerpts.
5. **Correct or forget:** editing a source invalidates dependent memories and answers. Forgetting removes its active text and derived quotations. Existing backups are separate.

Task proposals require a separate confirmation. Photon and ASI:One are optional message channels to this same backend; they do not have separate copies of your memory.

## Optional Gemini

Set operator-held Vertex configuration in `.env`, authenticate Application Default Credentials, and restart:

```sh
THREADLINE_AI_PROVIDER=vertex
THREADLINE_VERTEX_PROJECT=your-project-id
THREADLINE_VERTEX_MODEL=gemini-3.8-flash
```

Use an available model in your project. Each website request explicitly chooses whether to send the selected source or bounded retrieved excerpts. No key or credential is delivered to the browser. See [the memory architecture and API](docs/PERSONAL_MEMORY.md) for data lifecycle, testing and limits.

## Release history

The current `main` branch includes the personal memory system developed **after** the LA Hacks submission. The immutable [`la-hacks-2026` release](https://github.com/bingjiezhu/threadline/releases/tag/la-hacks-2026) retains the competition snapshot. Current capabilities must not be attributed retroactively to that submission.

The earlier relationship, follow-up and optional onboarding tools remain available. Their original workflows and limitations are documented below.

## A familiar situation

In the fictional walkthrough, Morgan Ellis spoke with Alex Morgan at Northstar on May 12. Alex needed a private deployment and asked Morgan to return with a relevant delivery example. You now have one—but the earlier conversation is buried in your notes.

Save the new delivery note, review its evidence, and refresh follow-ups. Threadline can connect a later confirmed capability with an earlier approved requirement on the same topic. Open both original quotations, check the dates and unresolved questions, then prepare a message you can edit and send yourself.

This is a reason to revisit the relationship, not proof that the client has a budget or wants to buy. Promises become useful when you follow through: create a due-dated task, record actual contact separately, and keep the next conversation's context.

## Run locally

Requires **Node.js 22.16 or newer**.

```sh
npm start
```

Open **http://localhost:4173** and create an account. Keep the server running. Core use needs no dependency installation, cloud account or model key. Records persist in `.data/threadline.sqlite` across browser refreshes and server restarts.

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

See `docs/USER_GUIDE.md`, `docs/OPERATIONS.md` and `docs/ARCHITECTURE.md` for usage, full database backup and implemented behavior.

Threadline builds on an existing Apache-2.0 application. This final consolidation restores personal relationship management as the main entry while retaining the newer core. The inherited 83-second English walkthrough is earlier real-app evidence, not a claim that all code or footage was created in this pass. Preserve `LICENSE` and `NOTICE`; see `PROVENANCE.md` for the contribution boundary.

## Optional ASI:One fictional demo

The local post-submission personal agent now reuses the same conversation implementation as Photon and connects to the existing web workspace. It answers in English, previews notes and dated tasks, saves only after confirmation, and can recall the newly saved conversation. The current demo is restricted to its verified owner/chat pair.

See [personal-agent setup and examples](integrations/agentverse/PERSONAL_ASSISTANT.md). The original competition command-flow adapter remains documented [separately](integrations/agentverse/README.md). The live identity is still [Threadline Personal Demo](https://agentverse.ai/agents/details/agent1qg9nvtv8gsj0zah5qe29pzu6f3dqr5k5mcxj56gqezvx63qwxk5mknxkgsr/profile); availability depends on its local process remaining online. This is not general private-account linking for arbitrary ASI users.

Optional [Photon personal assistant](integrations/photon/README.md): this local post-submission branch connects iMessage to the same workspace, with conversation capture, project briefs, due-dated tasks and editable drafts. Changes use natural-language previews and explicit confirmation. The competition snapshot remains unchanged; its earlier source-review delivery evidence is separate from testing this newer workflow.
