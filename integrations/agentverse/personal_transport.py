"""Private, replay-safe ACP transport, independent of the agent SDK and app domain.

An incoming command is claimed durably before the shared assistant is called.
An uncertain/interrupted command is never automatically run again. Replies are
kept in a private outbox and retries use the original ACP response ID.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import stat
from typing import Awaitable, Callable
from uuid import uuid4


DENIED = "This Threadline workspace is private. Use the owner's connected ASI chat to access it."
UNCONFIRMED = ("I couldn't confirm whether that request completed. Please check Threadline "
               "before retrying a change. I haven't automatically repeated it.")
INVALID = "I couldn't verify this message. Please send a new request in your connected chat."


class PrivateConfigurationError(ValueError):
    """A deliberately non-sensitive configuration failure."""


def normalize_command(text: str, self_address: str, self_handle: str | None = None) -> str:
    """Remove one exact leading self mention, never another person's mention."""
    value = text.strip()
    for name in (self_address, self_handle):
        if not name:
            continue
        prefix = "@" + name.lstrip("@")
        if value.startswith(prefix) and (len(value) == len(prefix) or value[len(prefix)].isspace()):
            return value[len(prefix):].lstrip()
    return value


def timestamp_iso(value: datetime | str) -> str:
    """Preserve the sender's time; never replace an invalid time with 'now'."""
    if isinstance(value, str):
        try:
            value = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except (ValueError, TypeError):
            raise ValueError("A valid timezone-aware message timestamp is required.") from None
    if not isinstance(value, datetime) or value.tzinfo is None or value.utcoffset() is None:
        raise ValueError("A valid timezone-aware message timestamp is required.")
    return value.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def _private_directory(path: Path, *, create: bool = False) -> None:
    if create and not path.exists():
        path.mkdir(parents=True, mode=0o700)
    info = path.lstat()
    if not stat.S_ISDIR(info.st_mode) or info.st_mode & 0o077:
        raise PrivateConfigurationError("The runtime directory must be private (mode 700).")


def _private_file(path: Path, *, parent: bool = True) -> None:
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or info.st_mode & 0o077:
        raise PrivateConfigurationError("Private inputs must be regular mode-600 files.")
    if parent:
        _private_directory(path.parent)


def _atomic_json(path: Path, value: dict) -> None:
    _private_directory(path.parent)
    if path.exists():
        _private_file(path)
    tmp = path.with_name(path.name + ".tmp-" + uuid4().hex)
    descriptor = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "w", encoding="utf-8") as stream:
            json.dump(value, stream, ensure_ascii=False, separators=(",", ":"))
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(tmp, path)
        directory_fd = os.open(path.parent, os.O_RDONLY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)
    finally:
        if tmp.exists():
            tmp.unlink()


def load_private_config(path: str | Path) -> dict:
    """Load operator-owned configuration without creating credentials or seeds."""
    if not path:
        raise PrivateConfigurationError("THREADLINE_ASI_CONFIG is required.")
    location = Path(path)
    try:
        if not location.is_absolute():
            raise PrivateConfigurationError("Use an absolute private configuration path.")
        _private_file(location)
        value = json.loads(location.read_text(encoding="utf-8"))
        required = {
            "runtimeDir", "seedFile", "allowedSender", "allowedSession", "appOrigin",
            "appAccessFile", "assistantStateFile", "vertexConfigFile", "replyLanguage", "port",
        }
        if not isinstance(value, dict) or not required.issubset(value) or set(value) - required - {"selfHandle"}:
            raise PrivateConfigurationError("Private configuration is incomplete or has unexpected fields.")
        for key in required - {"port"}:
            if not isinstance(value[key], str) or not value[key].strip() or value[key] != value[key].strip():
                raise PrivateConfigurationError("A required private configuration value is invalid.")
        if value["replyLanguage"] != "en":
            raise PrivateConfigurationError("This connection requires English replies.")
        if isinstance(value["port"], bool) or not isinstance(value["port"], int) or not 1024 <= value["port"] <= 65535:
            raise PrivateConfigurationError("The inspector port is invalid.")
        if value.get("selfHandle") is not None and (not isinstance(value["selfHandle"], str) or not value["selfHandle"].strip() or any(c.isspace() for c in value["selfHandle"])):
            raise PrivateConfigurationError("The verified self handle is invalid.")
        source_root = Path(__file__).resolve().parents[2]
        for key in ("runtimeDir", "seedFile", "appAccessFile", "assistantStateFile", "vertexConfigFile"):
            candidate = Path(value[key])
            if not candidate.is_absolute() or candidate.resolve().is_relative_to(source_root):
                raise PrivateConfigurationError("Private runtime inputs must stay outside the source tree.")
        _private_directory(Path(value["runtimeDir"]))
        for key in ("seedFile", "appAccessFile", "vertexConfigFile"):
            _private_file(Path(value[key]))
        state_path = Path(value["assistantStateFile"])
        _private_directory(state_path.parent)
        if state_path.exists():
            _private_file(state_path)
        return value
    except PrivateConfigurationError:
        raise
    except (OSError, ValueError, TypeError):
        raise PrivateConfigurationError("Unable to load the private ASI configuration.") from None


class PersonalTransport:
    """One exact owner/session binding, one serialized persistent ACP outbox."""

    def __init__(self, runtime_dir, allowed_sender, allowed_session, self_address, self_handle=None):
        if not all(isinstance(value, str) and value.strip() for value in (allowed_sender, allowed_session, self_address)):
            raise PrivateConfigurationError("An exact owner, session and agent identity are required.")
        self.runtime = Path(runtime_dir)
        _private_directory(self.runtime, create=True)
        self.state_path = self.runtime / "personal-transport-state.json"
        self.events_path = self.runtime / "personal-events.jsonl"
        self.allowed_sender = allowed_sender
        self.allowed_session = allowed_session
        self.self_address = self_address
        self.self_handle = self_handle
        self.lock = asyncio.Lock()
        binding = self._digest([allowed_sender, allowed_session, self_address])
        if self.state_path.exists():
            _private_file(self.state_path)
            try:
                self.state = json.loads(self.state_path.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                raise PrivateConfigurationError("The private transport state cannot be read.") from None
            if (not isinstance(self.state, dict) or self.state.get("version") != 1
                    or self.state.get("binding") != binding or not isinstance(self.state.get("messages"), dict)):
                raise PrivateConfigurationError("The transport state does not match this owner/session binding.")
        else:
            self.state = {"version": 1, "binding": binding, "messages": {}}

    @staticmethod
    def _digest(value) -> str:
        return hashlib.sha256(json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()

    def _save(self) -> None:
        _atomic_json(self.state_path, self.state)

    def _event(self, event: str, message_id: str, response_id: str | None = None) -> None:
        # No prompts, replies, app records, identity seeds or errors are logged.
        item = {"at": timestamp_iso(datetime.now(timezone.utc)), "event": event, "message_id": message_id}
        if response_id:
            item["response_id"] = response_id
        if self.events_path.exists():
            _private_file(self.events_path)
        fd = os.open(self.events_path, os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
        with os.fdopen(fd, "a", encoding="utf-8") as stream:
            stream.write(json.dumps(item, separators=(",", ":")) + "\n")

    def authorized(self, sender: str, session: str) -> bool:
        return sender == self.allowed_sender and session == self.allowed_session

    @staticmethod
    def _outbox(text: str) -> dict:
        return {"msg_id": str(uuid4()), "timestamp": timestamp_iso(datetime.now(timezone.utc)), "text": text}

    async def _send_ephemeral(self, text, send):
        outbox = self._outbox(text)
        try:
            await send(outbox)
        except Exception:
            pass

    async def handle(self, sender: str, session: str, message_id: str, text: str,
                     created_at: datetime | str, request: Callable[[dict], Awaitable[str]],
                     send: Callable[[dict], Awaitable[bool]]) -> dict:
        # This check precedes app access, parsing, state reads and shared-assistant startup.
        if not self.authorized(sender, session):
            await self._send_ephemeral(DENIED, send)
            return {"authorized": False, "status": "rejected"}
        if not isinstance(message_id, str) or not message_id or len(message_id) > 256 or not isinstance(text, str) or not text.strip() or len(text) > 16000:
            await self._send_ephemeral(INVALID, send)
            return {"authorized": True, "status": "rejected"}
        try:
            original_time = timestamp_iso(created_at)
        except ValueError:
            await self._send_ephemeral(INVALID, send)
            return {"authorized": True, "status": "rejected"}
        async with self.lock:
            key = self._digest([sender, session, message_id])
            fingerprint = self._digest([text, original_time])
            entry = self.state["messages"].get(key)
            if entry is not None and entry.get("fingerprint") != fingerprint:
                self._event("message_id_conflict", message_id)
                await self._send_ephemeral(INVALID, send)
                return {"authorized": True, "status": "rejected"}
            if entry is not None and entry.get("status") in {"sent", "acknowledged"}:
                self._event("duplicate_suppressed", message_id, entry["outbox"]["msg_id"])
                return {"authorized": True, "status": "duplicate", "response_id": entry["outbox"]["msg_id"]}
            if entry is None:
                entry = {"fingerprint": fingerprint, "message_id": message_id, "status": "processing",
                         "outbox": self._outbox(UNCONFIRMED)}
                self.state["messages"][key] = entry
                self._save()  # Claim before crossing the app boundary, including read-only queries.
                self._event("request_claimed", message_id, entry["outbox"]["msg_id"])
                payload = {"id": message_id, "session": "asi:" + sender + ":" + session,
                           "text": normalize_command(text, self.self_address, self.self_handle),
                           "messageId": message_id, "createdAt": original_time}
                try:
                    reply = await request(payload)
                    if not isinstance(reply, str) or not reply.strip() or len(reply) > 24000:
                        raise ValueError("Invalid assistant reply.")
                    entry["outbox"]["text"] = reply
                except Exception:
                    # The app might have committed before a timeout; do not repeat a mutation.
                    entry["outbox"]["text"] = UNCONFIRMED
                    self._event("assistant_result_unconfirmed", message_id, entry["outbox"]["msg_id"])
                entry["status"] = "pending"
                self._save()
            elif entry.get("status") == "processing":
                # Crash recovery: preserve the preallocated response ID and never rerun the request.
                entry["outbox"]["text"] = UNCONFIRMED
                entry["status"] = "pending"
                self._save()
                self._event("interrupted_request_not_repeated", message_id, entry["outbox"]["msg_id"])
            elif entry.get("status") != "pending":
                raise PrivateConfigurationError("The private outbox contains an invalid state.")
            sent = False
            try:
                sent = await send(dict(entry["outbox"])) is True
            except Exception:
                pass
            if sent:
                entry["status"] = "sent"
                self._save()
            self._event("reply_sent" if sent else "reply_pending", message_id, entry["outbox"]["msg_id"])
            return {"authorized": True, "status": "sent" if sent else "pending", "response_id": entry["outbox"]["msg_id"]}

    async def acknowledge(self, sender: str, session: str, response_id: str) -> bool:
        if not self.authorized(sender, session):
            return False
        async with self.lock:
            for entry in self.state["messages"].values():
                if entry["outbox"]["msg_id"] == response_id and entry["status"] in {"pending", "sent", "acknowledged"}:
                    entry["status"] = "acknowledged"
                    self._save()
                    self._event("reply_acknowledged", entry["message_id"], response_id)
                    return True
        return False


class JsonLineAssistant:
    """Lazy local Node bridge. All domain logic lives in the shared JS assistant."""

    def __init__(self, script_path: Path, config_path: Path, runtime_dir: Path):
        self.script = script_path
        self.config = config_path
        self.runtime = runtime_dir
        self.process = None
        self.lock = asyncio.Lock()

    async def _start(self):
        env = dict(os.environ)
        env["THREADLINE_ASI_CONFIG"] = str(self.config)
        self.process = await asyncio.create_subprocess_exec(
            "node", str(self.script), cwd=str(self.runtime), env=env,
            stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL, limit=262144,
        )
        try:
            first = await asyncio.wait_for(self.process.stdout.readline(), timeout=30)
            if json.loads(first) != {"ready": True}:
                raise RuntimeError("Assistant bridge failed its ready contract.")
        except Exception:
            await self.close()
            raise RuntimeError("Assistant bridge is unavailable.") from None

    async def request(self, payload: dict) -> str:
        async with self.lock:
            if self.process is None or self.process.returncode is not None:
                await self._start()
            try:
                self.process.stdin.write((json.dumps(payload, ensure_ascii=False) + "\n").encode())
                await self.process.stdin.drain()
                line = await asyncio.wait_for(self.process.stdout.readline(), timeout=120)
                value = json.loads(line)
                if not isinstance(value, dict) or value.get("id") != payload["id"] or "error" in value or not isinstance(value.get("reply"), str):
                    raise RuntimeError("Assistant bridge rejected the request.")
                return value["reply"]
            except Exception:
                await self.close()
                raise RuntimeError("Assistant response could not be confirmed.") from None

    async def close(self):
        process = self.process
        self.process = None
        if process is not None and process.returncode is None:
            process.terminate()
            try:
                await asyncio.wait_for(process.wait(), timeout=5)
            except asyncio.TimeoutError:
                process.kill()
                await process.wait()
