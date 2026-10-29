"""Smoke test against a running bridge (simulator or real board).

    python smoke_test.py            # bridge on http://127.0.0.1:8000
    python smoke_test.py 8765

Sends output commands, so only run it when the board may change its LEDs and buzzer.
"""
from __future__ import annotations

import asyncio
import json
import sys
import urllib.error
import urllib.request

import websockets

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
BASE = f"http://127.0.0.1:{PORT}"


def post(command: str, args: str = "") -> tuple[int, dict]:
    req = urllib.request.Request(f"{BASE}/api/command", method="POST",
                                 data=json.dumps({"command": command, "args": args}).encode(),
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, json.load(e)


def get(path: str) -> dict:
    with urllib.request.urlopen(BASE + path, timeout=5) as r:
        return json.load(r)


CASES = [
    # (command, args, expected HTTP status, expected result/code)
    ("PING", "", 200, "applied"),
    ("SIGNAL", "1", 200, "applied"),
    ("SIGNAL", "2", 200, "applied"),
    ("TEMP", "18 28", 200, "applied"),
    ("HUM", "30 80", 200, "applied"),
    ("BUZZ", "0", 200, "applied"),
    ("BUZZ", "1", 200, "applied"),
    ("BEEP", "", 200, "applied"),
    ("MSG", "Open window", 200, "applied"),
    ("MSG", "", 200, "applied"),
    ("AUTO", "1", 200, "applied"),
    ("STATUS", "", 200, "state"),
    ("SIGNAL", "3", 422, "range"),
    ("TEMP", "28 18", 422, "order"),
    ("TEMP", "10 60", 422, "range"),
    ("HUM", "30", 422, "arg_count"),
    ("BEEP", "1", 422, "arg_count"),
    ("NOISE", "200 400", 422, "unknown_command"),
    ("MSG", "가나다", 422, "not_ascii"),
    ("MSG", "x" * 17, 422, "too_long"),
    ("SIGNAL", "1\n2 STOP", 422, "newline"),
    ("STOP", "", 200, "applied"),
]


async def main() -> int:
    failures = 0
    async with websockets.connect(f"ws://127.0.0.1:{PORT}/ws") as ws:
        hello = json.loads(await ws.recv())
        print("hello:", hello["type"], "connected" if hello["connected"] else "NOT connected",
              hello.get("profile"), "(simulated)" if hello["simulated"] else "")
        for cmd, args, want_http, want in CASES:
            code, body = post(cmd, args)
            got = body.get("result") if code != 422 else body["detail"]["code"]
            ok = code == want_http and got == want
            failures += not ok
            print(f"{'ok ' if ok else 'FAIL'} {cmd} {args!r:22} -> {code} {got}")
        kinds = set()
        deadline = asyncio.get_running_loop().time() + 2.5
        try:
            while (left := deadline - asyncio.get_running_loop().time()) > 0:
                kinds.add(json.loads(await asyncio.wait_for(ws.recv(), left))["type"])
        except asyncio.TimeoutError:
            pass
        print("ws event types:", sorted(kinds))
        if "state" not in kinds:
            failures += 1
            print("FAIL no state events over WebSocket")
    st = get("/api/status")["state"]
    print("after STOP: signal", st["signal"], "auto", st["auto"], "buzzing", st["buzzing"])
    if st["signal"] != 0 or st["auto"] or st["buzzing"]:
        failures += 1
        print("FAIL STOP did not turn outputs off")
    for key in ("temp_state", "hum_state", "alarm", "blinking", "buzzer_enabled", "temp_range", "hum_range", "lcd_alert"):
        if key not in st:
            failures += 1
            print("FAIL state missing", key)
    if "sound_p2p" in st:
        failures += 1
        print("FAIL state still has sound fields")
    print("history rows (60 s):", get("/api/history?seconds=60")["count"])
    print("FAILURES:", failures)
    return failures


if __name__ == "__main__":
    sys.exit(1 if asyncio.run(main()) else 0)
