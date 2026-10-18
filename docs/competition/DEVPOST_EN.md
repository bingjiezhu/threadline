## Inspiration

Starting a job means joining a conversation halfway through. You have a task, but not the history behind it. A guide may name someone who no longer handles the work.

We focused on one question: **Who should I ask so I can start my first task?**

## What it does

Threadline Warm Start helps new employees find who to ask and what to do next, using team notes they can check.

In our fictional example, Alex wants to try the company's test site: a safe place to practice without changing the live app. The old guide names Maya. A later note names Jordan.

The user checks that note and confirms the change. Threadline stops the old plan, rechecks the saved information, and points to Jordan with the original words attached. The user chooses which steps to add as real tasks and can edit a message draft.

Access and training still need checking. Nothing is sent automatically, and creating a task does not mean the work is finished.

## How we built it

One Node.js server serves an English HTML/CSS/JavaScript interface and stores account-scoped records in SQLite. The core application runs with `npm start`, without third-party runtime packages or an AI key.

Original notes, their dates, the colleague's confirmed responsibility, and task plans are linked. Note or permission changes stop older plans. Approval creates only the selected tasks in one database transaction.

An optional OpenAI Responses API adapter can help word a plan after explicit consent. Code checks the allowed source, person and action. **The submitted recording uses saved-note mode, with AI off; no live model call is shown.**

Slack and Discord selected-message adapters are implemented, but real platform installation has not been verified. The recording uses the actual interface connected to a real local HTTP/SQLite backend through a documented renderer harness.

## What we built during the hackathon

We are extending a pre-existing Threadline codebase, not claiming the entire application was built from scratch at this event.

The submitted feature is Warm Start: first-task goals, dated responsibility records, reviewable plans, human-approved task creation, and signed selected-message intake. This presentation update adds a simpler first-task screen and a plain-language demonstration.

The source package includes baseline manifests and file differences. Event-window attribution and eligibility must be checked against the team's actual development records before final submission.

## Challenges we ran into

A new message is not automatically a trustworthy instruction. We kept responsibility changes explicit and preserved the original words and date.

An old plan can look useful after its source changes. We added validity checks that stop those steps until the user reviews the updated information.

The product also needed a simpler explanation. We replaced internal terms with “who to ask,” “read the note,” and “add to my tasks.”

## Accomplishments that we're proud of

A user can manage their own persistent records, confirm a changed contact, create selected tasks, and save an edited draft. The demonstration uses these real operations with clearly fictional records.

The final release includes automated tests, real-backend UI checks, fresh-install/restart checks, reproducible media tools, and an English user guide. Exact results and untested areas are recorded in the verification report.

## What we learned

The useful answer includes both a person and the reason to ask them. It also needs a next step the user controls.

Keeping that connection correct matters more than generating a longer answer. Clear wording helps people see the connection before they need to understand the technical design.

## What's next for Threadline

Test one real first-task workflow with a new employee and their teammate. Measure preparation time, corrections, wrong-person detours and a verified result against their current process.

Validate live model quality and real Slack/Discord installation separately. A team manager is a possible buyer; we have not established paying users, revenue or productivity gains.

## Track and company challenges

**Main track: Applied Intelligence.** We apply structured context and a bounded, optional AI workflow to a concrete workplace task.

**Proposed company challenge: Workday — Build the Future of Work with AI.** The feature addresses a new employee's first task, finding a relevant colleague and checking team knowledge. It preserves privacy, shows its sources and requires human approval before creating tasks. No Workday API integration, sponsorship or award is claimed.
