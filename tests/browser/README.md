# Browser integration checks

The application runtime needs no Python. These optional QA scripts require Python 3.11+ and Playwright in your development environment. They start a real temporary Node/SQLite server and use newly registered fictional accounts; no application database is auto-populated or reset.

## Standard native browser test

```bash
python -m pip install playwright
python -m playwright install chromium
python tests/browser/run.py
```

Native navigation is the default. You may select an existing browser using `THREADLINE_BROWSER_PATH=/path/to/chromium`. Screenshots and reports go to `artifacts/browser/` (or `THREADLINE_UI_OUTPUT`). Use an isolated environment, not your live customer server.

The test imports an explicitly fictional archive through the actual UI/API, then creates a new random contact, a project, new requirement/capability evidence on an arbitrary topic, approves it, matches a follow-up, edits a draft, records a real-user-reported event, completes a task, searches the original text, revises source evidence and checks invalidation. It also visits desktop and 390px mobile views. All API responses come from the real server.

## Restricted build environment — executed evidence

The Chromium instance available during this build has a managed policy that blocks navigation to all URLs. The policy was not changed. Therefore the executed renderer run uses:

```bash
THREADLINE_BROWSER_MODE=renderer THREADLINE_BROWSER_PATH=/usr/bin/chromium python tests/browser/run.py
```

`bridge.py` loads the exact shipped HTML/CSS/JS in an isolated blank renderer, replacing only network transport with a Python relay to the actual temporary localhost API. It carries real server-side session cookies and CSRF values. **It does not mock endpoint results, seed hidden UI state, or change business logic.** It also embeds the shipped SVG as a data URL for that isolated rendering context.

This verifies UI behavior, rendering, real backend interaction and persistence in this environment. It does **not** verify native-browser cookie handling, CSP/Origin enforcement, native downloads or public TLS through a normally navigated browser. The Node HTTP tests independently test request security and cookie/header contents. Run the native test above on the eventual deployment. Read `docs/VERIFICATION.md` for executed results and limitations.

## Data and media discipline

Only synthetic names and `example.invalid` addresses appear in screenshots. Temporary passwords are generated at runtime and are not stored in reports. Source quotations and screenshot IDs are test data, not customer evidence. Do not publish production screenshots without permission.


## New relationship-first checks

Run `python tests/browser/run_focus.py` (or `npm run test:ui`) in a development environment. This creates a separate temporary database and checks fresh-account capture with an inline new contact, no project requirement, the exact saved source, topic retrieval, person briefs, helpful feedback, weekly activity and calendar file content. It also checks explicit selected-text fragment handling, draft cleanup after an expired session, source deletion, empty results, mobile layout and menu dismissal.

The executed 1.2 renderer run passed 34 checks with zero browser JavaScript errors. The original regression run passed 31 checks. A separate landing-page renderer test exercises the actual consented inquiry endpoint. These counts are separate test inventories, not independent users or a native-browser certificate. Use `THREADLINE_UI_OUTPUT` for the legacy run and `THREADLINE_FOCUS_OUTPUT` for the new run to select an output directory. Reports retain no passwords.

## October18 native-session maintenance

All three existing workflows were rerun on native macOS Google Chrome in iteration2. The harness now waits for a closed dialog using a selector (no CSP unsafe-eval), and audits use the same browser-context synthetic session after UI registration/relogin. The renderer implementation is retained as a separately labeled optional mode; no policy/CSP setting is bypassed. See external iteration2 evidence for exact results.
