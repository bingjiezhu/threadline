# Security and data handling

## What the application enforces

- Salted scrypt password hashes; no plaintext passwords persisted.
- Server-stored, hashed session tokens, HttpOnly and SameSite=Strict cookies. Secure flag in HTTPS production mode.
- Workspace derived from the session, not from a submitted owner identifier.
- Workspace filtering plus composite foreign-key references on linked records.
- CSRF token on authenticated mutations, Origin checks, cross-site request rejection, and Host allowlisting against DNS rebinding.
- Invitation-controlled registration after local first-owner setup.
- Rate limits on auth, reauthentication, writes and public inquiries.
- Strict field allowlists, parameterized SQL, HTML escaping, UTF-8/size validation, and controlled file formats.
- Private/no-store API responses, CSP with no arbitrary scripts, no framing, and blocked dotfile/path traversal.
- Optimistic versions and request idempotency.
- Reauthorization and generation checks before AI results become active.
- Explicit evidence permission before outward-facing drafts; no sending capability.
- Source redaction and account deletion, plus password-confirmed export.

Tests exercise these behaviors. Passing tests are not an independent penetration test or a certification.

## What it does not protect against

The server operator, root user, or someone who steals the SQLite file can read stored conversations. Disk content and exports are not end-to-end encrypted. Backups include credential hashes and may include session tokens. Session cookies cannot protect a compromised device. No built-in email verification, MFA, SAML, enterprise audit integration, antivirus scanner, automatic backup encryption, or regulatory certification is claimed.

The source quote may contain false information even when its characters are correct. The user must review meaning and permission. Optional AI output is untrusted and may misinterpret or fabricate a proposition within a schema. It must never make a business commitment on behalf of the user.

## Operator checklist before remote use

1. Serve the browser origin through HTTPS; set `NODE_ENV=production`, exact `APP_ORIGIN`, a strong `REGISTRATION_TOKEN`, and an appropriate private backend binding.
2. Use a current, supported Node release, non-root service account, OS updates, disk encryption and private file permissions.
3. Put the backend behind a trusted reverse proxy; do not expose a plaintext development port. Preserve the public Host header. Apply additional per-client rate limits at the proxy when multiple users share a proxy address.
4. Set an upstream AI project budget in the provider console; the app's daily request count is not a guaranteed dollar cap.
5. Review the privacy policy, provider agreement, retention, local law and intended data category with an appropriate professional before onboarding regulated or third-party confidential data. This document is not legal approval.
6. Encrypt operator backups, define retention, rehearse restoration and revoke sessions on restore. Do not restore removed data without replaying deletion obligations.
7. Replace any example credentials/codes with operator-owned secrets, and never place those secrets in source control or a pitch deck.
8. Validate the actual browser deployment, including cookies, proxy forwarding, clipboard/download behavior and origin configuration.

## Source deletion versus copies

Deleting a note removes the original body and exact quotations from current database records, retracts linked generated material, removes search hits, clears response caches, and blocks in-flight result resurrection. Previously copied text cannot be recalled. Old backup/export files and external provider logs are outside the live application. Define a retention and deletion procedure for those copies.

Deleting a contact is not an automatic personal-data sweep of every original conversation. The dialog explains that source notes can still mention that person. Delete/review those notes separately as appropriate, or use account deletion for the entire workspace.

## AI provider

The adapter calls the official OpenAI Responses API and requests `store: false`. No tool execution, arbitrary URL fetching, shell access, message sending or private-memory sharing tool is enabled. A note extraction requires consent for that note; drafting sends only selected evidence.

OpenAI's data-control documentation distinguishes application-state storage from other retention controls. `store: false` is not equivalent to zero retention. Review the current official policy: https://developers.openai.com/api/docs/guides/your-data (checked October 17, 2026 UTC).

## Disclosure workflow

If you find a vulnerability, share a minimal reproducible case privately with the deployment operator or repository owner. Never include another person's real notes, an API key or live session. Disable remote access or optional AI as needed, back up for controlled investigation, patch, rerun the regression suite, rotate affected secrets, and notify affected users according to the operator's obligations.


## 1.2 context bridge and capture scope

The extension requests contextMenus and storage, not browsing-history, content-script, clipboard or all-host access. A user configures the destination origin. HTTPS is required remotely; loopback HTTP is permitted. Selected text travels in a URL fragment and the app scrubs that fragment before asking the user to save. Browser history, other extensions and device compromise remain relevant risks; URL fragments are not encryption.

Capture does not auto-send to a model or create an external message. Group/forwarded speaker attribution requires user care. Multi-record capture is atomic, all referenced IDs are owner-scoped, source deletion keeps replay tombstones and 401 clears unsaved sensitive UI state.

Native extension/cookie/CSP/download/device acceptance was not performed in managed Chromium. Do not market a renderer bridge regression as an independent security audit or native client certification. No end-to-end encryption is claimed.
