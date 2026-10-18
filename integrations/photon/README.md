# Optional Photon Beta 2.0 iMessage demo

This isolated adapter connects a Photon shared iMessage line to the existing Threadline personal-relationship workflow through normal authenticated HTTP. It imports the neighboring agentverse/flow.py module and starts its own disposable fictional backend; the main app is unchanged.

Verified live: one authorized participant sent REVIEW over iMessage, the adapter read the actual fictional backend evidence, and a 709-character source-aware response was read back from Photon with status delivered in the same direct conversation. This proves live read/review transport only. Task creation through Photon was not live-verified. Local tests separately exercise the optional ordinary-reminder preview and exact-confirmation path.

The first threaded-send attempt was rejected because that shared Space did not support replies. The adapter omits optional parentMessageId and sends ordinary text in the same authorized Space with a distinct idempotency key after the known rejection. The failed attempt remains in the private operator evidence, outside this repository.

## Run

Requires an existing Photon Beta project/key, shared-line capacity, an assigned agent number and the real participant Messages identity. The participant starts the conversation; there is no unsolicited first-message operation.

```sh
cd integrations/photon
npm ci --ignore-scripts
# Privately set PHOTON_API_KEY, PHOTON_PROJECT_ID, PHOTON_TEST_SENDER,
# and PHOTON_AGENT_HANDLE, then:
node bridge.mjs
```

PHOTON_PROJECT_ID must be a Beta pho_prj_ project. PHOTON_MIN_CREATED_AT is optional and permits only a cutoff within the last 15 minutes; without it only post-start messages are handled. PHOTON_MAX_SECONDS defaults to 180 and is capped at 600. Only recent direct iMessages from the exact configured sender to the exact assigned agent are accepted.

Send REVIEW to inspect two dated fictional sources and unresolved questions. Optional short path: TASK your reminder title, then CONFIRM TASK displayed-token, then STATUS. A reminder is an ordinary app record, not customer outreach. The longer selected-evidence/editable-draft sequence remains available. Photon sends agent replies to the participant; the app does not send the drafted client follow-up.

For private JSON handoff, launch-private.mjs reads a mode-600 file with apiKey, projectId, testSender, agentHandle and optional minCreatedAt/maxSeconds. Never commit that file, keys, real phone numbers or runtime output.

```sh
node --test bridge.test.mjs
```

Tests use real isolated local app HTTP operations and a channel/sender guard; they do not claim a live Photon channel. No public webhook or new model call is required. This module implements iMessage only, not Discord or Voice. General Free pricing can still include paid usage; verify account/event allowances before assignment or sending.

Sources: https://photon.codes/docs/beta/get-started/imessage and https://photon.codes/docs/beta/photon . SDK is @photon-ai/api 0.5.0; do not mix this Beta API with Spectrum credentials.
