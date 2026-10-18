# Continue from Warm Start 1.3.0

Read `AGENTS.md`, `README.md`, `docs/competition/READ_FIRST.md` and `docs/VERIFICATION.md` first. The runtime source and final executed reports outrank historical plans. Source is a real Node HTTP/SQLite app, not the older proposed Next.js/Postgres architecture.

## User intent and evolution

The original request was to preserve private relationship context across conversations, find the right person when a need appears, and follow through. A supplied relationship-brain/LLM-Wiki essay emphasized continuously revisable memory, sources and feedback rather than more summaries. Paid software in adjacent categories shows alternatives, not proof of Threadline demand.

The first implementation was substantially rewritten in English 1.0 to remove fixed-scenario paths. English 1.2 added person-first capture, recall, briefs and weekly activity. Preserve those workflows. The advertised 1.1 package was not a recovered build baseline; historical test claims are not evidence.

The user then supplied the actual LA AI Hackathon opening deck and Devpost. This release extends the actual 1.2 ZIP with a focused new-hire workflow: **Threadline Warm Start**, recommended for Applied Intelligence and the Workday new-hire challenge. It does not rename all historical work as hackathon work.

## What was implemented now

- SQLite schema 3: confirmed dated source-to-person routes, supersession, onboarding goals, bounded plans, approval/task links and signed chat ingress storage.
- First week / Knowledge map / Chat & capture English UI with persisted edits and mobile checks.
- Missing or conflicting owners pause planning. Changed or expired sources invalidate derived plans and unfinished generated tasks. Unknown access, training and availability stay unknown.
- Optional Responses plan generation after consent, constrained to server-selected references. No live model call was possible here. Local mode remains explicit.
- Slack and Discord signed selected-message/link/find adapters. Operator manifests, setup instructions and a private confirmation inbox. No live platform installation was performed.
- Current 161-second English film, 14-slide editable pitch (6 core + 8 appendix), guides, exact competition copy and test reports.

## Required next acceptance

1. Ask the organizer to confirm prior-work/public-baseline eligibility, real coding window, the deadline discrepancy and missing sponsor rubric percentage.
2. Before claiming AI inference, configure an authorized key and run `npm run ai:warm-smoke -- --run`; evaluate real task quality on permitted data. Contract stubs are not inference.
3. Run native-browser checks on the real target host. Managed navigation was blocked here; UI verification used a renderer bridge to the real backend, not mocked endpoint values.
4. Install each chat app with actual operator credentials, verify private replies, binding, confirmation, disconnect and retry behavior. No ordinary user-account token or history scraping.
5. Publish only reviewed safe files to a public repository and upload the full 2–3-minute video; fill actual team and URL fields in Devpost. Those external actions were not done by this build.
6. Validate with new hires and their managers. Manager-sponsored pilot pricing and demand remain hypotheses. Do not blend that cohort with the earlier owner-led consultancy price experiment.

## Data boundaries to preserve

One account is one private workspace, not shared enterprise access control. The server operator is trusted. No Workday API, full WeChat/iMessage ingestion, proactive colleague messaging, billing or public SaaS exists. A full database backup restores Warm Start state; core JSON restore does not reconstruct its route/plan links or chat bindings.

Do not ship `.env`, databases, session or linking tokens, logs containing passwords, third-party font binaries or dependency directories. Do not backdate commits, fabricate tests, claim external agent counts/model configurations, or convert synthetic practice records into traction.
