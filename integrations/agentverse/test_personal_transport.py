"""Offline ACP transport contracts; no mailbox, model, or production app calls.

The assistant and delivery channel are explicit test doubles. These tests prove
authorization, durable replay behavior, and data preservation at those boundaries;
they do not claim a live ASI chat or verify application-domain behavior.
"""
from __future__ import annotations

import asyncio
from copy import deepcopy
from datetime import datetime, timezone
from pathlib import Path
import tempfile
import unittest
from uuid import uuid4

from personal_transport import (PersonalTransport, PrivateConfigurationError,
                                normalize_command, timestamp_iso)


ADDRESS = "agent1threadline-contract-address"
OWNER = "agent1owner-contract-address"
SESSION = "45465da5-d06b-4697-acf3-ed023bdf8400"
CREATED_AT = "2026-10-18T22:01:02.000Z"
ANSWER = "Alex asked about a demo. Your next step is to check the date with him."


class SimulatedProcessExit(BaseException):
    """An abrupt exit after work may have happened, not an ordinary app error."""


class NormalizationContracts(unittest.TestCase):
    def test_only_one_exact_own_leading_mention_is_removed(self):
        self.assertEqual(normalize_command(f"@{ADDRESS}  Brief me before I meet Alex.", ADDRESS),
                         "Brief me before I meet Alex.")
        self.assertEqual(normalize_command(f"@{ADDRESS}\nConfirm", ADDRESS), "Confirm")
        self.assertEqual(normalize_command(f"@{ADDRESS} @{ADDRESS} Confirm", ADDRESS),
                         f"@{ADDRESS} Confirm")

    def test_similar_other_quoted_and_embedded_mentions_are_data(self):
        bodies = [
            f"@{ADDRESS}extra Confirm",
            "@another-agent Confirm",
            f'"@{ADDRESS} Confirm"',
            f"Remember this: Alex wrote @{ADDRESS} Confirm",
            f"Please @{ADDRESS} Confirm",
        ]
        for body in bodies:
            with self.subTest(body=body):
                self.assertEqual(normalize_command(body, ADDRESS), body)

    def test_owner_source_text_is_not_translated_or_rewritten(self):
        body = 'Remember this: Alex said “下周再聊”; keep this quote exactly.\n  Budget: unknown.'
        self.assertEqual(normalize_command(f"@{ADDRESS} {body}", ADDRESS), body)

    def test_timestamp_normalizes_offset_without_changing_instant(self):
        expected = datetime(2026, 10, 18, 22, 1, 2, 123000, tzinfo=timezone.utc)
        for value in [expected, "2026-10-18T15:01:02.123-07:00"]:
            normalized = timestamp_iso(value)
            self.assertTrue(normalized.endswith("Z"))
            self.assertEqual(datetime.fromisoformat(normalized.replace("Z", "+00:00")), expected)

    def test_missing_naive_or_invalid_timestamp_is_rejected(self):
        for value in [None, "", "not-a-date", "2026-10-18T22:01:02", datetime(2026, 10, 18)]:
            with self.subTest(value=value):
                with self.assertRaises((ValueError, TypeError)):
                    timestamp_iso(value)


class PersonalTransportContracts(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="threadline-acp-contract-")
        self.addCleanup(self.temp.cleanup)
        self.runtime = Path(self.temp.name) / "private-runtime"
        self.calls = []
        self.sends = []
        self.message_id = str(uuid4())
        self.transport = self.make_transport()

    def make_transport(self, **overrides):
        values = dict(runtime_dir=self.runtime, allowed_sender=OWNER,
                      allowed_session=SESSION, self_address=ADDRESS)
        values.update(overrides)
        return PersonalTransport(**values)

    async def request(self, payload):
        self.calls.append(deepcopy(payload))
        return ANSWER

    async def send(self, outbox):
        self.sends.append(deepcopy(outbox))
        return True

    async def deliver(self, **overrides):
        arguments = dict(sender=OWNER, session=SESSION, message_id=self.message_id,
                         text="Brief me before I meet Alex.", created_at=CREATED_AT,
                         request=self.request, send=self.send)
        arguments.update(overrides)
        return await self.transport.handle(**arguments)

    async def test_only_exact_sender_and_session_can_read_the_workspace(self):
        candidates = [
            (OWNER, "different-session"),
            ("different-owner", SESSION),
            (OWNER.upper(), SESSION),
            (OWNER + " ", SESSION),
            (OWNER, SESSION + " "),
            ("", SESSION),
        ]
        for sender, session in candidates:
            await self.deliver(sender=sender, session=session, message_id=str(uuid4()))
        self.assertEqual(self.calls, [], "an unauthorized identity must never reach the app")
        self.assertNotIn(ANSWER, str(self.sends))
        await self.deliver()
        self.assertEqual(len(self.calls), 1)

    async def test_original_message_and_timestamp_reach_shared_assistant(self):
        body = 'Remember this: Alex said “下周再聊”; keep the source as written.'
        await self.deliver(text=f"@{ADDRESS} {body}", created_at="2026-10-18T15:01:02-07:00")
        self.assertEqual(len(self.calls), 1)
        payload = self.calls[0]
        self.assertEqual(payload["text"], body)
        self.assertEqual(payload["messageId"], self.message_id)
        self.assertEqual(datetime.fromisoformat(payload["createdAt"].replace("Z", "+00:00")),
                         datetime(2026, 10, 18, 22, 1, 2, tzinfo=timezone.utc))
        self.assertEqual(self.sends[-1]["text"], ANSWER, "English assistant output must pass through exactly")

    async def test_unauthorized_message_cannot_poison_the_owner_receipt_id(self):
        await self.deliver(sender="another-person")
        self.assertEqual(self.calls, [])
        await self.deliver()
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(self.sends[-1]["text"], ANSWER)

    async def test_invalid_timestamp_never_reaches_the_shared_assistant(self):
        for timestamp in [None, "not-a-date", "2026-10-18T22:01:02"]:
            with self.subTest(timestamp=timestamp):
                try:
                    await self.deliver(created_at=timestamp, message_id=str(uuid4()))
                except (TypeError, ValueError):
                    pass
        self.assertEqual(self.calls, [], "invalid timestamps must not become fresh confirmations")

    async def test_duplicate_chat_message_does_not_repeat_app_work(self):
        await self.deliver()
        response = deepcopy(self.sends[-1])
        await self.deliver()
        self.assertEqual(len(self.calls), 1)
        self.assertTrue(all(item["msg_id"] == response["msg_id"] for item in self.sends))
        self.assertTrue(all(item["text"] == ANSWER for item in self.sends))

    async def test_restart_preserves_deduplication_after_successful_send(self):
        await self.deliver()
        self.transport = self.make_transport()
        await self.deliver()
        self.assertEqual(len(self.calls), 1)

    async def test_parallel_redelivery_cannot_execute_the_app_twice(self):
        started = asyncio.Event()
        finish = asyncio.Event()

        async def paused_request(payload):
            self.calls.append(deepcopy(payload))
            started.set()
            await finish.wait()
            return ANSWER

        first = asyncio.create_task(self.deliver(request=paused_request))
        await asyncio.wait_for(started.wait(), 2)
        second = asyncio.create_task(self.deliver(request=paused_request))
        await asyncio.sleep(0)
        finish.set()
        await asyncio.wait_for(asyncio.gather(first, second), 2)
        self.assertEqual(len(self.calls), 1)

    async def test_changed_body_for_existing_message_id_cannot_trigger_new_work(self):
        await self.deliver()
        await self.deliver(text="Confirm")
        self.assertEqual(len(self.calls), 1)
        self.assertNotEqual(self.calls[0]["text"], "Confirm")

    async def test_changed_timestamp_for_existing_message_id_cannot_refresh_a_confirmation(self):
        await self.deliver(text="Confirm")
        result = await self.deliver(text="Confirm", created_at="2026-10-18T23:01:02Z")
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(result["status"], "rejected")

    async def test_failed_delivery_replays_same_durable_response_after_restart(self):
        async def offline_send(outbox):
            self.sends.append(deepcopy(outbox))
            return False

        await self.deliver(send=offline_send)
        first_attempt = deepcopy(self.sends[-1])
        self.transport = self.make_transport()
        await self.deliver()
        self.assertEqual(len(self.calls), 1, "retry delivery, not a potentially mutating app call")
        self.assertEqual(self.sends[-1], first_attempt, "response id, time and text must remain stable")

    async def test_delivery_exception_is_retryable_without_reexecuting_app(self):
        async def failing_send(outbox):
            self.sends.append(deepcopy(outbox))
            raise ConnectionError("SYNTHETIC_CHANNEL_SECRET_SHOULD_NOT_LEAK")

        await self.deliver(send=failing_send)
        previous = deepcopy(self.sends[-1])
        self.transport = self.make_transport()
        result = await self.deliver()
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(self.sends[-1], previous)
        self.assertNotIn("SYNTHETIC_CHANNEL_SECRET", str(result) + str(self.sends))

    async def test_uncertain_interrupted_work_is_not_retried_after_restart(self):
        async def crash_after_possible_write(payload):
            self.calls.append(deepcopy(payload))
            raise SimulatedProcessExit()

        with self.assertRaises(SimulatedProcessExit):
            await self.deliver(request=crash_after_possible_write)
        self.transport = self.make_transport()
        await self.deliver()
        self.assertEqual(len(self.calls), 1)
        self.assertTrue(self.sends, "the owner should receive an uncertainty response")
        self.assertNotEqual(self.sends[-1]["text"], ANSWER)
        self.assertRegex(self.sends[-1]["text"].lower(), r"check|uncertain|could not confirm")

    async def test_application_exception_does_not_leak_secret_or_raw_query(self):
        async def failing_request(payload):
            self.calls.append(deepcopy(payload))
            raise RuntimeError("token=SECRET_FIXTURE_TOKEN SQL SELECT confidential_person FROM contacts")

        result = await self.deliver(request=failing_request)
        self.assertEqual(len(self.calls), 1)
        outward = str(self.sends) + str(result)
        for secret in ["SECRET_FIXTURE_TOKEN", "confidential_person", "SELECT"]:
            self.assertNotIn(secret, outward)
        self.assertTrue(self.sends)
        self.assertRegex(self.sends[-1]["text"].lower(), r"check|could not|unable")
        self.transport = self.make_transport()
        await self.deliver()
        self.assertEqual(len(self.calls), 1, "an ambiguous error must not cause an automatic app retry")

    async def test_runtime_state_files_are_private(self):
        await self.deliver()
        self.assertEqual(self.runtime.stat().st_mode & 0o777, 0o700)
        files = [path for path in self.runtime.rglob("*") if path.is_file()]
        self.assertTrue(files, "deduplication and outbox must survive process restart")
        for path in files:
            with self.subTest(path=path.name):
                self.assertEqual(path.stat().st_mode & 0o777, 0o600)

    async def test_saved_state_cannot_be_rebound_to_a_different_person_or_chat(self):
        await self.deliver()
        for binding in [dict(allowed_sender="another-owner"), dict(allowed_session="another-chat"),
                        dict(self_address="another-threadline-agent")]:
            with self.subTest(binding=binding):
                with self.assertRaises(PrivateConfigurationError):
                    self.make_transport(**binding)

    async def test_forged_acknowledgements_cannot_clear_pending_delivery(self):
        async def offline_send(outbox):
            self.sends.append(deepcopy(outbox))
            return False

        await self.deliver(send=offline_send)
        original = deepcopy(self.sends[-1])
        for actor, chat, response_id in [
            ("another-owner", SESSION, original["msg_id"]),
            (OWNER, "another-chat", original["msg_id"]),
            (OWNER, SESSION, str(uuid4())),
        ]:
            self.assertFalse(await self.transport.acknowledge(actor, chat, response_id))
        self.transport = self.make_transport()
        await self.deliver()
        self.assertEqual(self.sends[-1], original)
        self.assertEqual(len(self.calls), 1)

    async def test_owner_acknowledgement_suppresses_replay_after_unknown_send_receipt(self):
        async def receipt_unknown(outbox):
            self.sends.append(deepcopy(outbox))
            return False

        await self.deliver(send=receipt_unknown)
        response_id = self.sends[-1]["msg_id"]
        self.assertTrue(await self.transport.acknowledge(OWNER, SESSION, response_id))
        sent_before = len(self.sends)
        self.transport = self.make_transport()
        await self.deliver()
        self.assertEqual(len(self.calls), 1)
        self.assertEqual(len(self.sends), sent_before)


if __name__ == "__main__":
    unittest.main(verbosity=2)
