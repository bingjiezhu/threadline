# Optional AI

Local storage, import, search and excerpt-based answers work without a model. Enable a provider only when you want generated organization or answers.

Copy `.env.example` to a private `.env`, configure an accessible model and restart. Vertex Gemini and OpenAI Responses adapters are supported; provider selection is explicit and there is no automatic fallback. See VERTEX.md for local Vertex authentication.

The app requires explicit consent before sending selected source content. Models have no tools, filesystem access, messaging permission or authority to create tasks. Quotes must match current owner-scoped source text. Invalid responses and provider errors remain visible failures.

Credentials stay on the server. Do not commit configuration or provider receipts containing private prompts. Provider data-retention policies still apply to transmitted content.

`npm run ai-smoke -- --confirm-cost` performs an optional paid synthetic connectivity check. Unit tests use labeled contract stubs and do not measure live model quality.
