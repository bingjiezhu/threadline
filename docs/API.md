# API overview

All data routes require an authenticated workspace. Mutations also require a valid CSRF token. The browser client in `public/app.js` demonstrates the request contract. Resource IDs and source versions are validated by the server.

| Route | Purpose |
| --- | --- |
| `/api/auth/*` | Local registration, login and session management |
| `GET /api/state` | Owner-scoped people, projects, notes, evidence and tasks |
| `GET /api/memory` | Memory sources, items and vault status |
| `POST /api/memory/sources` | Save an original note |
| `GET /api/memory/sources/:id` | Read original text and provenance |
| `GET /api/memory/sources/:id/markdown` | Inspect managed Markdown |
| `POST /api/memory/sources/:id/forget` | Forget a current source |
| `POST /api/memory/imports/preview` | Validate selected files without writing |
| `POST /api/memory/imports/commit` | Copy explicitly selected files |
| `GET /api/memory/search?q=...` | Search owner-scoped originals |
| `POST /api/memory/agent/ask` | Ask with cited sources and optional AI consent |
| `/api/memory/agent/*` | Read history/runs and confirm proposed actions |
| `/api/contacts`, `/api/projects`, `/api/notes`, `/api/tasks` | Core workspace records |
| `/api/capture`, `/api/people/find`, `/api/week` | Supporting relationship tools |
| `/api/export`, `/api/restore` | Explicit core-record archive operations |

Source changes invalidate derived data. A stale version fails rather than overwriting content. Task proposals are not execution; confirmation is a separate request.

Legacy hooks, channel conversations, connections and inbox routes are retired and return 410 before auth/body/cache handling. Historical onboarding APIs are unavailable.
