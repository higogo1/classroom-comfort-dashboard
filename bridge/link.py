"""Owns the one serial port and turns board lines into events.

Rules from the course handoff:
- wait 2 s after opening (the UNO resets), then confirm the profile with STATUS
- one program owns the COM port; the web only talks to this program
- never resend an output command automatically, not on timeout, not on reconnect
- ack means the board applied the command, not that the LED was seen to light
"""
from __future__ import annotations

import asyncio
import json
import time
from collections import deque
from typing import Any, Awaitable, Callable

import serial

from protocol import BAUD, PROFILE, build_line

ACK_TIMEOUT_S = 2.0
STALE_AFTER_S = 3.0
BOOT_WAIT_S = 6.0  # some PCs reset the UNO ~2.6 s after open; wait for its first state line
HISTORY_LEN = 3600  # about one hour of 1-second states

Emit = Callable[[dict[str, Any]], Awaitable[None]]


def now_ms() -> int:
    return int(time.time() * 1000)


class BoardLink:
    def __init__(self, port: str | None, simulate: bool, emit: Emit):
        self.port = port
        self.simulate = simulate
        self.emit = emit
        self.ser: Any = None
        self.connected = False
        self.error: str | None = None
        self.profile: str | None = None
        self.last_state: dict[str, Any] | None = None
        self.last_state_at: float | None = None  # monotonic
        self.last_state_ms: int | None = None  # wall clock, for the UI
        self.history: deque[tuple[int, dict[str, Any]]] = deque(maxlen=HISTORY_LEN)
        self.bad_lines = 0
        self._next_id = 1
        self._pending: dict[int, asyncio.Future] = {}
        self._write_lock = asyncio.Lock()
        self._booted = asyncio.Event()  # set by the first state line after (re)open

    # ---------- status ----------
    def status(self) -> dict[str, Any]:
        age = None if self.last_state_at is None else round(time.monotonic() - self.last_state_at, 1)
        return {
            "connected": self.connected,
            "port": "SIMULATOR" if self.simulate else self.port,
            "simulated": self.simulate,
            "profile": self.profile,
            "error": self.error,
            "last_state_ms": self.last_state_ms,
            "last_state_age_s": age,
            "stale": age is None or age > STALE_AFTER_S,
            "bad_lines": self.bad_lines,
        }

    async def _link_event(self) -> None:
        await self.emit({"type": "link", **self.status()})

    # ---------- open / read loop ----------
    def _open(self) -> Any:
        if self.simulate:
            from simulator import SimulatedBoard
            return SimulatedBoard()
        if not self.port:
            raise serial.SerialException("포트를 지정하지 않았습니다. --port COM5 처럼 실행하세요.")
        return serial.Serial(self.port, BAUD, timeout=0.5, write_timeout=1)

    async def run(self) -> None:
        while True:
            try:
                self.ser = await asyncio.to_thread(self._open)
                self._booted.clear()
                if not self.simulate:
                    await asyncio.sleep(2.0)  # UNO restarts when the port opens
                    await asyncio.to_thread(self.ser.reset_input_buffer)
                reader = asyncio.create_task(self._read_loop())
                try:
                    if not self.simulate:
                        # A STATUS sent while the bootloader runs is lost, so wait until
                        # the sketch speaks. Lines from before the reset have ms > BOOT_WAIT_S.
                        try:
                            await asyncio.wait_for(self._booted.wait(), BOOT_WAIT_S)
                        except asyncio.TimeoutError:
                            raise serial.SerialException("보드가 상태를 보내지 않습니다. PL3 펌웨어와 USB 연결을 확인하세요.")
                    await self._handshake()
                    await reader
                finally:
                    reader.cancel()
            except (serial.SerialException, OSError, ProfileMismatch) as exc:
                self.error = str(exc)
            except asyncio.CancelledError:
                await self._close()
                raise
            await self._close()
            await asyncio.sleep(2.0)

    async def _handshake(self) -> None:
        result = await self.send("STATUS")
        if result["result"] != "state":
            raise serial.SerialException("STATUS 응답이 없습니다. 보드에 PL3 펌웨어가 올라갔는지 확인하세요.")
        profile = result["state"].get("profile")
        self.profile = profile
        if profile != PROFILE:
            raise ProfileMismatch(f"보드 회로가 {profile}입니다. PL3 펌웨어를 업로드하세요.")
        self.connected = True
        self.error = None  # keep the last failure visible until a handshake succeeds
        await self._link_event()

    async def _read_loop(self) -> None:
        while True:
            raw = await asyncio.to_thread(self.ser.readline)
            if not raw:
                continue
            line = raw.decode("utf-8", errors="replace").strip()
            if not line:
                continue
            try:
                msg = json.loads(line)
            except json.JSONDecodeError:
                self.bad_lines += 1
                await self.emit({"type": "log", "line": line[:200]})
                continue
            await self._handle(msg)

    async def _handle(self, msg: dict[str, Any]) -> None:
        kind = msg.get("type")
        request = msg.get("request", 0)
        if kind == "state":
            if isinstance(msg.get("ms"), int) and msg["ms"] < BOOT_WAIT_S * 1000:
                self._booted.set()
            received = now_ms()
            self.last_state = msg
            self.last_state_at = time.monotonic()
            self.last_state_ms = received
            self.history.append((received, msg))
            await self.emit({"type": "state", "received_ms": received, "data": msg})
        fut = self._pending.get(request) if request else None
        if fut and not fut.done():
            if kind == "ack":
                fut.set_result({"result": "applied"})
            elif kind == "error":
                fut.set_result({"result": "rejected", "code": msg.get("code")})
            elif kind == "state":
                fut.set_result({"result": "state", "state": msg})
        elif kind == "error":
            await self.emit({"type": "board_error", "code": msg.get("code"), "request": request})

    async def _close(self) -> None:
        was = self.connected
        self.connected = False
        for fut in self._pending.values():
            if not fut.done():
                fut.set_result({"result": "link_lost"})
        self._pending.clear()
        if self.ser is not None:
            try:
                await asyncio.to_thread(self.ser.close)
            except Exception:
                pass
            self.ser = None
        if was or self.error:
            await self._link_event()

    # ---------- commands ----------
    def _take_id(self) -> int:
        rid = self._next_id
        self._next_id = 1 if rid >= 65535 else rid + 1
        return rid

    async def send(self, command: str, args: str = "") -> dict[str, Any]:
        """Send one command and wait for its reply. Never retries.

        result: applied | rejected | state | timeout | not_connected | link_lost
        timeout means the outcome is unknown: the board may or may not have applied it.
        """
        line = build_line(command, args)  # raises CommandError
        if self.ser is None or (not self.connected and command.upper() != "STATUS"):
            return {"result": "not_connected", "command": line}
        rid = self._take_id()
        fut: asyncio.Future = asyncio.get_running_loop().create_future()
        self._pending[rid] = fut
        try:
            async with self._write_lock:
                await asyncio.to_thread(self.ser.write, f"{rid} {line}\n".encode("ascii"))
            reply = await asyncio.wait_for(fut, ACK_TIMEOUT_S)
        except asyncio.TimeoutError:
            reply = {"result": "timeout"}
        except (serial.SerialException, OSError) as exc:
            reply = {"result": "link_lost", "detail": str(exc)}
        finally:
            self._pending.pop(rid, None)
        return {"request": rid, "command": line, **reply}


class ProfileMismatch(Exception):
    pass
