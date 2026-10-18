# Optional Gemini on Vertex AI

Threadline can use either the original OpenAI Responses adapter or the Vertex Gemini structured-output adapter. Choose the provider explicitly; there is no fallback between providers.

```sh
THREADLINE_AI_PROVIDER=vertex
THREADLINE_VERTEX_PROJECT=your-google-cloud-project
THREADLINE_VERTEX_MODEL=your-available-gemini-model
npm start
```

Authenticate with Application Default Credentials on the operator machine (`gcloud auth application-default login`) or provide a short-lived `THREADLINE_VERTEX_ACCESS_TOKEN` in the process environment. The runtime captures `gcloud auth application-default print-access-token` into memory for a call and does not print or persist it. Never put credentials, a service-account file or an access token in the source archive. Project and model must be explicitly configured; the template contains no private project identifier.

`src/vertex-provider.js` sends only the selected, consented payload to the fixed `aiplatform.googleapis.com` host. It requests JSON matching the existing schema, supplies no tools and accepts only a completed `STOP` response with parseable JSON. A request timeout, credential failure, provider error or invalid plan remains a visible failure. The same source/date/person/generation checks apply before a plan is saved.

An optional source-review operation can now propose an unconfirmed annotation of an already saved allowed colleague explicitly named in one selected note. A unique exact quotation and separate human confirmation are required before any guide is established. Ambiguous output asks questions. See SOURCE_REVIEW.md. This source annotation is not an executable action recipient or a permission decision.

Plan wording does not select a different colleague, modify permissions, send a message, grant access or create a task. The user separately approves selected steps. Source removal invalidates the AI plan and cancels unfinished derived tasks.

Provider and model are explicit in the UI, plan body and job result. Schema 3 retains its legacy `mode='openai'` storage value for any AI-authored plan to preserve existing databases; `body.provider='vertex'` identifies actual Vertex output. This internal legacy value is not an assertion that OpenAI ran. No database schema change is required.

`tools/media/capture_vertex.py` and `vertex_server.mjs` record an isolated native-browser workflow using a temporary in-memory application database and clearly fictional records. The harness stores only safe receipt metadata: actual response ID, model version, usage, completion status, request-body hash and HTTP path/status. Tokens and raw private prompts are excluded. The resulting receipt proves that bounded synthetic request, not model accuracy on real employee data.

Check `release-evidence/2026-10-18/` outside the clean source ZIP for actual execution status. Contract tests are marked as contract stubs and remain distinct from a live call.
