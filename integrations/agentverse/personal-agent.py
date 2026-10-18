"""Run the private personal assistant on the existing registered ACP identity.

Use THREADLINE_ASI_CONFIG to point at an external private operator config.
This entry point never creates a seed, registers a new account or seeds app data.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import fcntl
import json
import logging
import os
from pathlib import Path
import sys
from uuid import UUID

from personal_transport import (
    JsonLineAssistant, PersonalTransport, PrivateConfigurationError,
    load_private_config, timestamp_iso,
)


def build_agent(config: dict, config_path: Path):
    # Imports are delayed so the transport can be tested without the SDK or network.
    from uagents import Agent, Context, Protocol, Model
    import uagents.asgi as asgi_server
    from uagents_core.contrib.protocols.chat import (
        ChatMessage, ChatAcknowledgement, TextContent, chat_protocol_spec,
    )
    from uagents_core.types import DeliveryStatus

    here = Path(__file__).resolve().parent
    runtime = Path(config["runtimeDir"])
    # uAgents 0.26.1 has a module-level bind constant rather than a host option.
    # Limit this process's HTTP listener to loopback; no installed SDK file changes.
    asgi_server.HOST = "127.0.0.1"
    seed = Path(config["seedFile"]).read_text(encoding="utf-8").strip()
    if not seed:
        raise PrivateConfigurationError("The existing registered identity seed is missing.")
    # uAgents mailbox credentials remain alongside the existing private runtime.
    os.chdir(runtime)
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    agent = Agent(
        name="Threadline Personal Demo", seed=seed, port=config["port"],
        mailbox=True, enable_agent_inspector=False, log_level="WARNING",
        readme_path=str(here / "PERSONAL_ASSISTANT.md"),
        description="A private relationship and project assistant. Recall context, prepare for meetings, and preview notes and commitments before confirming saves. No automatic outreach.",
        handle_messages_concurrently=False, loop=loop,
    )
    transport = PersonalTransport(runtime, config["allowedSender"], config["allowedSession"], agent.address, config.get("selfHandle"))
    bridge = JsonLineAssistant(here / "personal-assistant.mjs", config_path, runtime)
    protocol = Protocol(spec=chat_protocol_spec)

    class Health(Model):
        status: str

    # In 0.26.1, a mailbox-only run with no REST routes exits after scheduling its
    # poller. A non-sensitive loopback health route keeps the supported server
    # lifecycle alive, without enabling inspector administration endpoints.
    @agent.on_rest_get("/health", Health)
    async def health(ctx: Context):
        return Health(status="ok")

    @protocol.on_message(ChatMessage)
    async def chat(ctx: Context, sender: str, message: ChatMessage):
        # ACK is protocol transport, not authorization or an application write.
        try:
            await ctx.send(sender, ChatAcknowledgement(timestamp=datetime.now(timezone.utc), acknowledged_msg_id=message.msg_id))
        except Exception:
            pass
        session = str(ctx.session)

        async def send(outbox: dict) -> bool:
            reply = ChatMessage(timestamp=datetime.fromisoformat(outbox["timestamp"].replace("Z", "+00:00")),
                                msg_id=UUID(outbox["msg_id"]),
                                content=[TextContent(type="text", text=outbox["text"])])
            status = await ctx.send(sender, reply)
            return status.status in {DeliveryStatus.SENT, DeliveryStatus.DELIVERED}

        # Even missing or naive timestamps are passed through to the strict transport.
        try:
            result = await transport.handle(sender, session, str(message.msg_id), message.text(), message.timestamp, bridge.request, send)
            for delay in (1, 2, 4):
                if result.get("status") != "pending":
                    break
                await asyncio.sleep(delay)
                result = await transport.handle(sender, session, str(message.msg_id), message.text(), message.timestamp, bridge.request, send)
            print(json.dumps({"event": "chat_processed", "message_id": str(message.msg_id), **result}), flush=True)
        except Exception:
            # No exception details: upstream/provider errors can include request content.
            print(json.dumps({"event": "chat_processing_failed", "message_id": str(message.msg_id)}), flush=True)

    @protocol.on_message(ChatAcknowledgement)
    async def acknowledgement(ctx: Context, sender: str, message: ChatAcknowledgement):
        try:
            await transport.acknowledge(sender, str(ctx.session), str(message.acknowledged_msg_id))
        except Exception:
            print(json.dumps({"event": "ack_processing_failed", "response_id": str(message.acknowledged_msg_id)}), flush=True)

    @agent.on_event("shutdown")
    async def shutdown(ctx: Context):
        await bridge.close()

    agent.include(protocol, publish_manifest=True)
    return agent, bridge


def main() -> int:
    lock_stream = None
    try:
        os.umask(0o077)
        config_path = Path(os.environ.get("THREADLINE_ASI_CONFIG", ""))
        config = load_private_config(os.environ.get("THREADLINE_ASI_CONFIG", ""))
        lock_path = Path(config["runtimeDir"]) / "personal-agent.lock"
        descriptor = os.open(lock_path, os.O_WRONLY | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0), 0o600)
        lock_stream = os.fdopen(descriptor, "w")
        os.fchmod(lock_stream.fileno(), 0o600)
        fcntl.flock(lock_stream.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        agent, _ = build_agent(config, config_path)
        print(json.dumps({"event": "personal_agent_starting", "agent_address": agent.address,
                          "at": timestamp_iso(datetime.now(timezone.utc)), "private_owner_binding": True}), flush=True)
        agent.run()
        return 0
    except Exception:
        print(json.dumps({"event": "personal_agent_stopped", "error": "Check private configuration, existing mailbox identity, and the local app. No credentials or request content are logged."}), file=sys.stderr, flush=True)
        return 1
    finally:
        if lock_stream is not None:
            lock_stream.close()


if __name__ == "__main__":
    raise SystemExit(main())
