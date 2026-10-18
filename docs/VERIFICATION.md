# Verification — Clarity edition 1.3.2

This report distinguishes application checks, editorial checks and external acceptance. The final outside-ZIP JSON records exact file hashes and the final extraction rerun.

## Iteration2 — selected-source review

The current bounded improvement and exact results are in `release-evidence/2026-10-18/iteration2/IMPROVEMENT_REPORT.md` and its machine JSON outside the clean source ZIP. The new native workflow passes18checks, including real Gemini responses for ambiguous and clear notes, no confirmed route/tasks before human decisions, and source-withdrawal invalidation. Original native regressions passed31legacy,34relationship,22WarmStart and17focused checks. A provider stalled on one take; the failed attempt is retained. A47-second full-operation timeout now prevents an unresponsive reader or late reply from committing output; existing45-second transport abort remains.

Native test harness corrections preserve product CSP: dialog readiness uses a DOM selector rather than unsafe-eval, and API audits use the actual browser's synthetic account session after UI registration/relogin. No browser security policy was bypassed. Original1.0/1.2 baseline reruns are not claimed this iteration: original runtime archives are unavailable locally; schema3 is unchanged and structural migration tests remain in the suite.

The new150-second SourceReview film uses actual native UI evidence freezes and a labeled retimed native replay. Synthetic English narration and original procedural music are disclosed. No general AI accuracy or real new-employee result is established. Earlier evidence below remains historical.

## October 18 release-readiness recheck

Current checks are recorded in `release-evidence/2026-10-18/VALIDATION.md`. The original 180 tests plus four meaningful Vertex transport/integration tests passed: 184 total, zero failures or skips. Provider contract stubs remain explicitly labeled. The focused 17-check UI suite also passed using **native Google Chrome navigation** on this Mac, including desktop and 390px mobile. This is new evidence beyond the earlier renderer-only run; it does not certify a public HTTPS deployment or installed platforms. Full clean-source installation/restart and archive checks are recorded separately.

The original narrated 122-second edition preserves the exact observed video packets. The recommended final 150-second film combines the first 101 seconds of that AI-off workflow with a separately labeled, real Gemini 3.8 Flash native-browser chapter, explicit detail freezes and an updated closing. It has disclosed local synthetic English narration and optional subtitles. The actual Vertex run passed 10 assertions including approval and source-deletion invalidation; model/version/response ID/usage and a request-body hash are in its safe receipt. Original films and all earlier evidence remain available outside the clean source ZIP.

## Earlier 1.3.2 executed evidence

| Group | Result | Evidence |
|---|---|---|
| Automated Node tests | 180 passed, 0 failed or skipped | artifacts/v1.3.2/automated-current.log |
| Legacy UI / real backend | 31 checks | artifacts/v1.3.2/browser/legacy/ |
| Relationship UI / real backend | 34 checks | artifacts/v1.3.2/browser/relationship/ |
| Warm Start UI / real backend | 22 checks | artifacts/v1.3.2/browser/warm/ |
| Focused clarity UI / real backend | 17 checks | artifacts/v1.3.2/browser/judge_check/ |
| Relationship landing inquiry | 10 checks | artifacts/v1.3.2/browser/landing/ |
| New-hire landing inquiry | 10 checks | artifacts/v1.3.2/browser/warm-landing/ |
| npm start, full restart, persistence, export, deletion | 37 checks | artifacts/v1.3.2/install-worktree.json |
| Actual workflow and initial-goal recording | State assertions passed | artifacts/v1.3.2/media/capture.json and setup/capture.json |

`run_clarity.py` invokes the focused suite. It is not an additional independent suite. Rerunning 180 cases does not create another 180 unique tests. The baseline 1.3.1 suite contained 174 cases; six view-contract cases were added. Text-label/version assertions were updated alongside intended changes. Privacy, authority, confirmation, stale-state and persistence behavior was not removed to make tests pass.

## Resolved verification issues

The first regression run found old expected version strings, old stylesheet names in tests, and a missing default Playwright browser path. These were corrected to the actual 1.3.2 metadata and the new same-origin CSS, and the system Chromium path was explicitly configured. The full groups were rerun successfully. An FFmpeg fade-duration syntax error was corrected before producing the final movies. Failed intermediate media is not presented as a deliverable.

## Browser method

Native navigation was attempted and blocked by managed Chromium with ERR_BLOCKED_BY_ADMINISTRATOR. No policy was changed. The tests load shipped HTML/CSS/JS into an isolated renderer and relay requests to the real local authenticated HTTP/SQLite backend. This is not a mock API, but it does not certify native cookie handling, public TLS, browser downloads, extension installation or external service behavior.

## Media method

Actual screen frames were captured with Chromium Page.startScreencast. The new employee, colleagues and team notes are fictional. Real API mutations create the goal, replace the confirmed responsibility, invalidate the old plan, create selected tasks, save a draft and complete one task step. The goal remains open.

Editorial additions are captions, cropping, light retiming, close-ups and labeled replay. The 42-second stage clip and 122-second submission film are not speed benchmarks. The UI says AI off; no external model or installed chat platform is represented. The instrumental is procedurally composed for the release without vocals or external samples.

## Not established

Live AI correctness, real Slack/Discord installation, actual client-device/TLS behavior, independent security review, native PowerPoint playback, paying users, retention, measured time savings and first-time-user comprehension remain unverified. Competition eligibility and actual development-window attribution are separate from test and file integrity results. No form, public repository or video host was changed.

## Reproduce

```bash
npm test
npm run validate
npm run test:clarity-ui
python3 scripts/verify-install.py --output /tmp/threadline-install-report.json
```

Use `tests/browser/README.md` for native versus explicitly labeled renderer tests. Full SQLite backup is required for complete app recovery; core JSON restore is not a full first-task/connector restore.
