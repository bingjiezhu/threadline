# Threadline

**Keep the context. Find the right moment.**

A private relationship workspace for people who manage their own professional network. Remember what someone asked for, what you promised, why a project paused, and what has changed since your last conversation.

Threadline brings contacts, projects, original notes, reviewed evidence, editable follow-ups and ordinary tasks into one persistent workspace. It starts empty and works with records you enter yourself. Fictional examples are optional.

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

An optional official ACP/Mailbox adapter executes the same app’s reviewed personal follow-up through ASI:One: dated source quotes, explicit acceptance, chosen-quote draft permission, edited draft and a separately confirmed app task. One actual ASI chat completed this flow on disposable fictional records. No customer was contacted and no private user database was exposed.

See [adapter setup and limits](integrations/agentverse/README.md). The live demo agent is [Threadline Personal Demo](https://agentverse.ai/agents/details/agent1qg9nvtv8gsj0zah5qe29pzu6f3dqr5k5mcxj56gqezvx63qwxk5mknxkgsr/profile); availability depends on its local process remaining online. This does not implement ASI access to a user’s real private account.
