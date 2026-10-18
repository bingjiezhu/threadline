> For the 1.3 onboarding mode and real synthetic preflight see `ARCHITECTURE_WARM.md` and `npm run ai:warm-smoke -- --run`. Model quality remains unverified without a live receipt.

# Optional AI integration

Core use does not require a model: contacts, projects, notes, manual evidence, local candidate scanning, exact-topic matches, tasks, local templates, search and export work without a key.

## Real provider path

Set OPENAI_API_KEY in private server configuration and restart. The default compatible model is gpt-4.1-mini, not a claim that it is the newest or strongest model. OPENAI_MODEL is configurable after verifying access, structured outputs, latency and quality. The app uses the official `/v1/responses` endpoint, `text.format` with a strict JSON schema, `store:false`, no tools, and a 45-second timeout.

Extraction sends the consented note (maximum 20,000 characters), title, date and whether a project is linked. It returns up to 12 candidates. Each quotation must uniquely match the actual original source. Output IDs, authorization and approval are owned by code and user actions, not the model.

Drafting sends only explicitly selected approved quotations plus minimal project/recipient context. It does not send the entire private workspace. The result is editable and is never sent automatically.

## Before real client data

```bash
cp .env.example .env
# Privately configure a permitted key/model.
npm run ai-smoke -- --confirm-cost
```

The smoke test uses synthetic text, makes a real provider request, may incur a provider charge, and verifies quote integrity and strict fields. It is intentionally not run without a key. It is only connectivity/contract evidence, not a task-quality benchmark.

Build an authorized evaluation set covering plans versus deliveries, negation, ambiguous identity, unknown dates, reported statements, internal opinions and exact source quotations. Have a human review semantic truth; schema correctness is not semantic correctness. Record model/version/prompt/test data partition, false positives, false negatives, abstention, latency and actual usage.

## Costs

OpenAI's checked model page lists standard GPT-4.1 mini prices of $0.40 per million input tokens and $1.60 per million output tokens. A hypothetical workload of 1,000,000 input and 200,000 output tokens therefore costs $0.72 before other services or special pricing. This is arithmetic, not a measured product bill. Hosting and especially human support can dominate a $49 pilot offer.

Daily attempted-job caps, maximum output tokens and two in-flight jobs per workspace bound use. They are not a transactional dollar budget, an assurance of provider availability, or a promise of zero failed-call cost. Set upstream account budgets and alerting.

## Executed versus unexecuted

The repository has contract tests with a supplied `fetchImpl` stub. These exercise JSON, exact quote validation, failure, consent, quota and deletion-race handling. They are labeled as stubs. There was no credential in the build environment and no live external model evaluation was performed.

Official sources (checked October 17, 2026 UTC):
- https://developers.openai.com/api/docs/models/gpt-4.1-mini
- https://developers.openai.com/api/docs/guides/structured-outputs
- https://developers.openai.com/api/docs/guides/your-data

`store:false` does not eliminate all possible provider retention. Review current data controls and customer authorization before transmitting private material.
