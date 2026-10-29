"""A fake PL3 board with the same serial behaviour as firmware/PL3/PL3.ino.

For building the dashboard without hardware. The bridge marks every status
from it as simulated, so the UI can say so; its numbers are not measurements.
"""
from __future__ import annotations

import json
import math
import queue
import random
import threading
import time

STATE_NAMES = {0: "ok", 1: "low", 2: "high"}


class SimulatedBoard:
    def __init__(self) -> None:
        self._out: queue.Queue[bytes] = queue.Queue()
        self._lock = threading.Lock()
        self._start = time.monotonic()
        self._closed = threading.Event()
        self.signal = 0
        self.auto = False
        self.buzzer = True
        self.temp_range = [18, 28]
        self.hum_range = [30, 80]
        self.message = ""
        self.alarm = False
        self.ok_readings = 0
        self.dht: dict | None = None
        self.alert = ""
        threading.Thread(target=self._tick, daemon=True).start()

    # ---------- serial-like interface ----------
    def readline(self) -> bytes:
        try:
            return self._out.get(timeout=0.5)
        except queue.Empty:
            if self._closed.is_set():
                raise OSError("simulator closed")
            return b""

    def write(self, data: bytes) -> int:
        for line in data.decode("ascii").splitlines():
            self._dispatch(line)
        return len(data)

    def reset_input_buffer(self) -> None:
        pass

    def close(self) -> None:
        self._closed.set()

    # ---------- board behaviour ----------
    def _ms(self) -> int:
        return int((time.monotonic() - self._start) * 1000)

    def _send(self, obj: dict) -> None:
        self._out.put((json.dumps(obj, separators=(",", ":")) + "\n").encode())

    @staticmethod
    def _range_state(v: float, lo: int, hi: int) -> int:
        return 1 if v < lo else 2 if v > hi else 0

    def _read_dht(self) -> None:
        """Every 2 s like the firmware. Temperature drifts slowly past 28 °C so alarms appear."""
        t = time.monotonic() - self._start
        if t < 2.0 or random.random() < 0.003:
            self.dht = None
            return
        temp = round(26.5 + 2.6 * math.sin(t / 60), 1)
        hum = round(55 + 22 * math.sin(t / 95 + 1), 1)
        ts, hs = self._range_state(temp, *self.temp_range), self._range_state(hum, *self.hum_range)
        self.dht = {"temp": temp, "hum": hum, "ts": ts, "hs": hs,
                    "di": round(0.81 * temp + 0.01 * hum * (0.99 * temp - 14.3) + 46.3, 1)}
        if ts or hs:
            self.alarm, self.ok_readings = True, 0
        elif self.alarm:
            self.ok_readings += 1
            if self.ok_readings >= 3:
                self.alarm, self.ok_readings = False, 0
        if ts:
            self.alert = f"TEMP {'HIGH' if ts == 2 else 'LOW'} {temp:4.1f}C"
        elif hs:
            self.alert = f"HUMID {'HIGH' if hs == 2 else 'LOW'} {int(hum)}%"
        elif not self.alarm:
            self.alert = ""

    def _state(self, request: int) -> dict:
        d = self.dht
        active = self.auto and self.alarm
        if self.auto:
            self.signal = 1 if self.alarm else 2 if d else 0
        return {
            "v": 1, "type": "state", "profile": "PL3", "request": request, "ms": self._ms(),
            "temperature_c": d["temp"] if d else None,
            "humidity_pct": d["hum"] if d else None,
            "discomfort_index": d["di"] if d else None,
            "temp_state": STATE_NAMES[d["ts"]] if d else None,
            "hum_state": STATE_NAMES[d["hs"]] if d else None,
            "alarm": self.alarm, "signal": self.signal, "blinking": active, "auto": self.auto,
            "buzzer_enabled": self.buzzer, "buzzing": active and self.buzzer,
            "temp_range": list(self.temp_range), "hum_range": list(self.hum_range),
            "lcd_ready": True, "lcd_message": self.message, "lcd_alert": self.alert if active else "",
        }

    def _tick(self) -> None:
        n = 0
        while not self._closed.wait(1.0):
            with self._lock:
                if n % 2 == 0:
                    self._read_dht()
                n += 1
                self._send(self._state(0))

    def _dispatch(self, line: str) -> None:
        with self._lock:
            head, _, rest = line.partition(" ")
            if not head.isdigit() or not 1 <= int(head) <= 65535:
                self._send({"v": 1, "type": "error", "request": 0, "code": "request"})
                return
            rid = int(head)
            name, _, args = rest.partition(" ")
            ack = {"v": 1, "type": "ack", "request": rid, "applied": True}
            nums = args.split()
            if name == "STATUS" and not args:
                self._send(self._state(rid)); return
            if name in ("PING", "BEEP") and not args:
                self._send(ack); return
            if name == "STOP" and not args:
                self.auto, self.signal = False, 0
                self._send(ack); self._send(self._state(rid)); return

            def pair(lo: int, hi: int) -> list[int] | None:
                if len(nums) != 2 or not all(x.lstrip("-").isdigit() for x in nums):
                    return None
                a, b = int(nums[0]), int(nums[1])
                return [a, b] if lo <= a < b <= hi else None

            ok = True
            if name == "SIGNAL" and nums in (["0"], ["1"], ["2"]):
                self.auto, self.signal = False, int(nums[0])
            elif name == "AUTO" and nums in (["0"], ["1"]):
                self.auto = nums[0] == "1"
            elif name == "BUZZ" and nums in (["0"], ["1"]):
                self.buzzer = nums[0] == "1"
            elif name == "TEMP" and (p := pair(0, 50)):
                self.temp_range = p; self._read_dht()
            elif name == "HUM" and (p := pair(0, 100)):
                self.hum_range = p; self._read_dht()
            elif name == "MSG" and len(args) <= 16 and all(0x20 <= ord(c) <= 0x7E for c in args):
                self.message = args
            else:
                ok = False
            self._send(ack if ok else {"v": 1, "type": "error", "request": rid, "code": "unsupported_or_range"})
