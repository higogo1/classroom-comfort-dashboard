"""PL3 bridge: one serial port in, REST + WebSocket out.

    python app.py --port COM5          # real board
    python app.py --simulate           # fake board for dashboard work

Binds to 127.0.0.1 by default so only this PC can send commands.
"""
from __future__ import annotations

import argparse
import asyncio
import json
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

import uvicorn
from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from serial.tools import list_ports

from link import BoardLink, now_ms
from protocol import CommandError

DASHBOARD_DIR = Path(__file__).resolve().parent.parent / "dashboard"


class Hub:
    """Fan-out of bridge events to every open dashboard tab."""

    def __init__(self) -> None:
        self.clients: set[WebSocket] = set()

    async def emit(self, event: dict[str, Any]) -> None:
        text = json.dumps(event, ensure_ascii=False, separators=(",", ":"))
        dead = []
        for ws in list(self.clients):
            try:
                await ws.send_text(text)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.clients.discard(ws)


class CommandIn(BaseModel):
    command: str = Field(..., examples=["SIGNAL"])
    args: str = Field("", examples=["3"])


def create_app(port: str | None, simulate: bool) -> FastAPI:
    hub = Hub()
    link = BoardLink(port, simulate, hub.emit)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        task = asyncio.create_task(link.run())
        yield
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    app = FastAPI(title="PL3 Bridge", lifespan=lifespan)
    app.state.link = link

    @app.get("/api/status")
    async def status() -> dict[str, Any]:
        return {**link.status(), "state": link.last_state}

    @app.get("/api/history")
    async def history(seconds: int = Query(600, ge=1, le=3600)) -> dict[str, Any]:
        since = now_ms() - seconds * 1000
        rows = [{"received_ms": t, "data": d} for t, d in link.history if t >= since]
        return {"seconds": seconds, "count": len(rows), "rows": rows}

    @app.get("/api/ports")
    async def ports() -> list[dict[str, str]]:
        return [{"device": p.device, "description": p.description} for p in list_ports.comports()]

    @app.post("/api/command")
    async def command(body: CommandIn) -> JSONResponse:
        try:
            result = await link.send(body.command, body.args)
        except CommandError as exc:
            raise HTTPException(422, {"result": "invalid", "code": exc.code, "message": exc.message})
        await hub.emit({"type": "command", **result})
        code = 200 if result["result"] in ("applied", "state") else 409 if result["result"] == "rejected" else 503
        return JSONResponse(result, status_code=code)

    @app.websocket("/ws")
    async def ws(socket: WebSocket) -> None:
        await socket.accept()
        hub.clients.add(socket)
        await socket.send_text(json.dumps({"type": "hello", **link.status(), "state": link.last_state},
                                          ensure_ascii=False))
        try:
            while True:
                await socket.receive_text()  # commands go through POST /api/command
        except WebSocketDisconnect:
            pass
        finally:
            hub.clients.discard(socket)

    if DASHBOARD_DIR.is_dir():
        app.mount("/", StaticFiles(directory=DASHBOARD_DIR, html=True), name="dashboard")
    return app


def main() -> None:
    parser = argparse.ArgumentParser(description="PL3 serial ↔ web bridge")
    src = parser.add_mutually_exclusive_group(required=True)
    src.add_argument("--port", help="보드 COM 포트 (예: COM5)")
    src.add_argument("--simulate", action="store_true", help="가상 PL3 보드 사용")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--http-port", type=int, default=8000)
    args = parser.parse_args()
    uvicorn.run(create_app(args.port, args.simulate), host=args.host, port=args.http_port)


if __name__ == "__main__":
    main()
