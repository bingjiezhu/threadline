# Threadline Personal Demo — personal agent

![tag:innovationlab](https://img.shields.io/badge/innovationlab-3D8BD3)
![tag:hackathon](https://img.shields.io/badge/hackathon-5F43F1)

This is a **local post-submission iteration**. The original competition source, video and submission remain frozen. This version uses the same personal-workspace conversation logic as the newer Photon adapter.

In the owner's already connected ASI chat, select **Threadline Personal Demo** as the recipient and write naturally:

- “Brief me before I meet Alex. What should I remember?”
- “Remember this: I just spoke with Alex. He wants a demo next week, and I promised to send him the overview by Friday.”
- Explicit “Remember this:” notes save directly. For a task, ask “Remind me to send Alex the overview tomorrow”, then confirm its preview.
- “What did I last discuss with Alex?”
- “What is the next step for the Northstar project?”
- “Who should I follow up with, and why?”
- “Draft a short follow-up to Alex about the private-deployment update.”

English replies, one useful next step, no random confirmation codes. Notes, project context, drafts and date-based tasks come from the **same application workspace shown in the browser**. Original source dates and wording are preserved. “Change to …” edits a preview; “Cancel” discards it. Explicit memory commands save their original text immediately. Other writes, including tasks and drafts, require confirmation of the displayed change. Drafts are not sent to contacts, and tasks do not schedule phone notifications.

The current workspace contains fictional demonstration records. This connection is restricted to one verified sender/session pair; unknown chats cannot read or change it. It is not a general account-linking service for arbitrary ASI users.

Optional Gemini parsing is off until the owner enables it after reading Help. It receives incoming message text and the local date only, not the entire notes or contact database. It does not control permissions or record IDs. The app checks source versions and performs normal authenticated HTTP writes with idempotency keys.

## Operator setup

Requires Node 22.16+, Python and `uagents==0.26.1`. Use an external private mode-600 JSON configuration, selected by `THREADLINE_ASI_CONFIG`, with runtimeDir, seedFile, allowedSender, allowedSession, appOrigin, appAccessFile, assistantStateFile, vertexConfigFile, replyLanguage (`en`), and port (`8127`). The runtime and immediate credential-parent directories must be mode700. The app account must own the intended workspace. All private files stay outside the repository.

Run `personal-agent.py`, not the legacy `agent.py`. The supplied seed path must already exist; this entry point never generates a new identity. Do not run two consumers of the same Mailbox identity. The operator must establish a legitimate existing Mailbox connection before starting.

`personal-assistant.mjs` delegates to `integrations/photon/assistant.mjs`; it does not duplicate business logic. Exact sender/session checks occur before starting the app client. Replies have stable IDs and a durable private outbox. Interrupted writes are not automatically replayed; ambiguous outcomes require checking the app.

## Verification

`python3 -m unittest -v test_personal_transport.py` covers the offline ACP transport contract. Node tests cover the shared assistant against isolated real HTTP/SQLite workspaces. These are separate from a real ASI browser round-trip; current live evidence is maintained privately by the operator.
