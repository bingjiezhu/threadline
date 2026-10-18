# Threadline fictional personal-workflow ACP bridge

> Historical competition adapter. For the newer local personal agent connected to the current web workspace, use [PERSONAL_ASSISTANT.md](PERSONAL_ASSISTANT.md) and `personal-agent.py`. The legacy procedure below starts a separate disposable command-flow fixture.

**Agent name:** Threadline Personal Demo  
**Agent address:** `agent1qg9nvtv8gsj0zah5qe29pzu6f3dqr5k5mcxj56gqezvx63qwxk5mknxkgsr`

![tag:innovationlab](https://img.shields.io/badge/innovationlab-3D8BD3)
![tag:hackathon](https://img.shields.io/badge/hackathon-5F43F1)

Underlying personal-workspace source: https://github.com/bingjiezhu/threadline . Official ACP/Mailbox setup: https://uagents.fetch.ai/docs/agentverse/mailbox .

This is an optional experimental adapter to the personal workspace. It runs the unchanged Threadline_Final engine on a new disposable SQLite database. All contacts, quotes, projects and tasks are fictional. No real database, social account, secret or customer note is exposed.

Official uAgents ACP receives ChatMessage, acknowledges it, runs actual authenticated owner-scoped HTTP commands against that local app, and returns the persisted result. Mailbox must be explicitly connected in Agentverse Inspector. Startup is not registration or ASI success. No new ASI API key or model request is made by this bridge. ASI:One itself may use its own model.

## Chat workflow

Send REVIEW. Read the actual earlier requirement and later controlled-test capability, their dates, original quotes and unknown budget/owner/timing. Follow the displayed one-time review token:

1. `ACCEPT TOKEN` explicitly accepts the displayed source-backed follow-up in the real app.
2. `DRAFT TOKEN BOTH` (or REQUIREMENT / CAPABILITY) explicitly permits chosen quotations in a deterministic local draft.
3. `EDIT TOKEN your complete edited message` saves the user's text, without sending it.
4. `TASK TOKEN your reminder title` previews an ordinary app reminder, without creating it.
5. `CONFIRM TASK TOKEN` creates exactly the previewed task. Repeating confirmation returns the existing ID.
6. `STATUS` rereads the persisted draft/task. No outreach, purchase or customer result is implied.

The narrow demo uses existing human-approved fictional source annotations. It does not claim autonomous contact discovery, production authentication between ASI users and private accounts, general semantic understanding or a customer outcome. Commands use explicit phases and checked tokens; source text is never executed. Runtime identity material is in `.runtime/` and must never be published.

Run from the repository root with Node.js 22.16+ and Python:

```sh
python3 -m venv /tmp/threadline-agent-venv
/tmp/threadline-agent-venv/bin/pip install -r integrations/agentverse/requirements.txt
/tmp/threadline-agent-venv/bin/python integrations/agentverse/test_flow.py
/tmp/threadline-agent-venv/bin/python integrations/agentverse/agent.py
```

The test creates only temporary fictional records and requires no platform account; the optional agent run requires your own Agentverse Mailbox connection. Each local run generates its own private identity in `.runtime/`; it does not share the listed demo agent’s private seed. Keep the process running. The operator handles their own logged-in Inspector connection and actual ASI conversation. Do not select the sponsor category or publish a success claim unless registration and the complete actual ASI workflow are verified.
