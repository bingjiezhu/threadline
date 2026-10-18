# Threadline — personal relationship user guide

## What you are using

A private relationship workspace for remembering the context behind a person and following through on promises. It runs on your machine or on a server operated for you. It is not a public social network and does not send messages for you.

**Fastest path:** Save a conversation -> find the person by topic -> open the original context -> keep a promise.

Optional first-task/onboarding and selected-message adapters remain available as secondary tools. They are not required for this personal relationship workflow. Full-database backup is needed to restore every optional extension.

## Start and sign in

Install Node.js 22.16 or newer with `node:sqlite`. Extract the code, enter the `Threadline` directory and run `npm start`. Visit `http://localhost:4173`. Keep the terminal running. The default service is accessible only on your own computer.

Create the first account with a password of at least 12 characters. A new workspace is empty. Further registrations need an invitation code from the operator. Separate accounts do not share contacts. No sample customer records are loaded unless you explicitly import an example.

Records live in `.data/threadline.sqlite` unless the operator configured another path. Browser refreshes and server restarts do not erase them. Never distribute this database or your `.env` file.

## 1. Capture an important conversation

Choose **Capture** in the navigation or **Capture a conversation** on Overview.

Paste the text you want to remember. You may save selected messages rather than an entire conversation. Preserve enough context to know who said what. Link an existing person or choose **Add a new person** to enter their name and optional company, role and email. A source with no linked person can still be saved, but it will not be attributed to an arbitrary person in discovery.

Select the event date, or leave it unknown. The date you save a note is not automatically the date it happened. Select a channel such as WeChat, email or meeting; this is a label, not a live connection. For forwarded or group messages, identify the actual speaker before attaching facts to a person.

Under **Keep a promise**, optionally write one reminder in your own words and set a date. A reminder is not a commitment inferred from ambiguous language. Under additional context, optionally choose a project, add tags or save a source URL label. URL credentials are rejected; query and fragment are removed. Threadline never opens the source URL to retrieve content.

Click **Save conversation**. The note, optional new person, metadata and optional reminder are saved together. A failure leaves no partially created person. You will see a confirmation with the original text and the next useful actions. No AI request or message is sent by saving.

## 2. Find someone through remembered context

Open **Find people**. Enter a topic that appeared in their profile, tags or a linked conversation, such as `robotics`, `private deployment` or `accessible onboarding`.

Results show the person, why the local terms matched, and exact excerpts from authorized notes with dates and channels. Click **Open brief** to recover the context. A result is not a recommendation that the person is currently available, willing or able to help. Search is local lexical matching, not a live semantic-model claim. Synonyms or missing notes may require another query.

A **Useful** vote records your feedback about that find. It does not record outreach or revenue. No result is also a valid result: the application does not invent a person to fill the page. Archived or Do-not-contact people are omitted from suggestions.

## 3. Open a person brief

A brief collects the person's saved profile, original linked conversations, open reminders and relevant project unknowns. It is source context, not a generated biography. Read the dates before treating an old statement as current. Edit their profile when you have confirmed new information. Respect a Do-not-contact flag; it remains visible in the brief.

Withdraw a source from Notes to remove its contents from future discovery and evidence-based material. A later capture of genuinely new information is separate from a stale retry of a deleted source.

## 4. Keep a promise

Complete an open reminder from Today, Tasks or the person brief. Use Tasks to edit its title, date and details, cancel it, or reopen a completed task.

For an open dated task, **Calendar** downloads an `.ics` reminder file. Import it in the calendar you actually use and check the date and notification settings there. It is a one-time all-day event, not a live sync. Changes in Threadline do not update the imported event automatically. A downloaded file does not guarantee a future notification; delivery depends on the destination calendar.

**This week** summarizes real recorded captures, usefulness feedback and task completions. These are activity events, not proof of business value or sales. Reopening a task does not erase the fact that an earlier completion was recorded.

## 5. Bring context from existing tools

### WeChat

Choose messages you have permission to retain, copy them, then paste in Capture. Confirm the participant and date yourself. Do not give the app your WeChat password or use unauthorized chat extraction. There is no automatic personal-WeChat inbox synchronization.

### Browser selection extension

In Chrome, open the extensions manager, enable developer mode, choose **Load unpacked** and select the repository's `extensions/chrome` folder. Open the extension's options and set your own workspace origin. Use HTTPS for remote hosting; HTTP localhost/loopback is allowed for local use.

Select up to 10,000 characters on a webpage, right-click, and choose **Save in Threadline**. A new tab opens an unsaved Capture draft. Review the text, source and person, then save explicitly. The draft travels in the URL fragment and is immediately cleared from the application's visible URL; do not regard fragments as a defense against a compromised browser, another extension or history retention. The extension does not read all tabs, record browsing history or run a page crawler.

The build tested helper logic and the application's incoming-fragment flow. Install/navigation behavior must be accepted in your normal browser; managed build Chromium blocks native navigation. The extension cannot capture text directly from the native WeChat desktop/mobile app.

### Existing records

Contacts accepts the CSV template supplied in the app. Notes accepts UTF-8 TXT or Markdown. Import does not resolve every possible account alias or transcript format. Check identity and event time before approving evidence.

## 6. Use project evidence when needed

Projects are optional for simple relationship memory. Create one when you are working toward a specific outcome. Add a primary contact, goal, stage and unresolved questions, such as budget or procurement ownership.

A useful pattern is a requirement that could not be met earlier and a later confirmed capability. Add an exact quotation from each source and a shared, specific topic such as `private-deployment`. Correctly label requirement versus capability and planned versus confirmed. Approve only what the source supports. Local scanning may propose candidates; it does not verify them. Optional external AI requires configuration and consent.

Refresh **Follow-ups**. Matching is deterministic and conservative: it requires approved dated evidence and checks ordering, certainty, expiration, contact restrictions and blockers. A future roadmap is not a completed delivery. A matching capability does not confirm the client's current budget or willingness.

Compare both source quotations and every remaining unknown. Accept the context update only after review. This does not automatically mark a project won or alter your commercial stage. Select the evidence that may appear in a message draft, prepare a draft, edit it and copy it if appropriate. You send any message yourself.

Record an actual contact, reply, meeting or business outcome separately. A click on Copy is not contact. Correct an erroneous event using the supported correction flow rather than inventing a new sale.

## 7. Data ownership and account settings

Use Settings to change your profile/timezone/password, export records, restore a core-record export into an empty workspace, or delete the account. Export omits passwords, sessions and provider secrets. It is not an exact database backup of all history. Original version-1 exports remain readable; new exports may include optional capture metadata.

Withdraw a note to invalidate derived claims and drafts. Stale requests cannot reintroduce the same deleted material during the idempotency key's retention period. The hosted operator may retain protected backups; source withdrawal does not erase every historical backup instantly. Read the operator's policy before storing confidential material.

The SQLite database and exports contain plaintext private information. Use device security and encrypted storage/backups. No end-to-end encryption or legal certification is claimed.

## 8. Practice without touching your data

Run `npm run demo`. Open the printed local URL and use the printed random practice password. This is a separate, temporary database with clearly fictional people and projects. The live example uses real application operations. Stop with Ctrl+C when finished; the normal `.data` directory is untouched.

For a 90-second sequence see `docs/hackathon/DEMO_RUNBOOK.md`. Existing code must be disclosed for events that require work during a build window.

## Troubleshooting

| Problem | What to check |
|---|---|
| The URL does not open | Keep the server running; use the printed local address; check Node supports `node:sqlite` and the port is free. |
| The phone cannot reach localhost | Localhost refers to that phone, not your computer. Use an operator-managed HTTPS deployment; do not expose the development service casually. |
| Registration is closed | Ask the operator for an invitation; this protects an already initialized service. |
| A capture failed | Correct the inline error, person ID, date or size. Retrying an unchanged network-failed save is safe; a deleted-source replay requires a genuinely new capture. |
| A person is missing from search | Link the original note, try exact words or tags, and check archive/contact restrictions. |
| No project match | Check topic spelling, approval, dates, certainty and blockers. Unknowns are deliberately not guessed. |
| Session expired | Sign in again. The app clears unsaved private capture text on expiry; save important permitted material before leaving. |
| AI is unavailable | The core app still works. The operator must configure a key and test live behavior; no local output is mislabeled as provider success. |
| Calendar event did not appear | Import the `.ics` file and check the destination calendar. A file export is not a sync or notification service. |
| Forgot the password | The operator can use the protected offline recovery command. There is no unauthenticated reset endpoint. |

## Before an upgrade or public deployment

Stop the app and make a consistent backup. Preserve `.data`, replace only application code, then restart. 1.2 migrates the supported English 1.0 schema by adding metadata. Use the backup if rolling back to older code. Never point at the incompatible earlier staged prototype database.

For HTTPS, invitations, backups, restore, retention and recovery, read `docs/OPERATIONS.md`. Native browser, extension, calendar-client and device acceptance remain deployment responsibilities. No customer revenue, fundraising or live external-model accuracy has been validated by the source release.


### Revising a source

Saving a conversation preserves its wording as submitted. Explicitly editing a note replaces the current body and withdraws evidence that depended on the old version. Project version history is available, but this is not a permanent raw-note archive. Keep original source material separately when your work requires it.
