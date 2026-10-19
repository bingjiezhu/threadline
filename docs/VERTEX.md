# Optional Vertex Gemini

Configure a model available to your own Google Cloud project:

```sh
THREADLINE_AI_PROVIDER=vertex
THREADLINE_VERTEX_PROJECT=your-project
THREADLINE_VERTEX_MODEL=your-available-model
npm start
```

Authenticate privately with Application Default Credentials or a short-lived `THREADLINE_VERTEX_ACCESS_TOKEN`. Never include credentials or project-specific configuration in source archives.

The adapter sends consented payloads only to the fixed Vertex API host, requests structured JSON without tools and validates completion and response shape. Failure does not fall back to another provider. Exact quotations, source versions and workspace ownership are checked by application code.
