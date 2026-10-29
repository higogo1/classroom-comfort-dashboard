"""PL3 command rules, mirrored from firmware/PL3/PL3.ino.

The board validates again; checking here first gives the dashboard a clear
reason before anything is sent, and keeps newlines out of the serial line.
"""
from __future__ import annotations

PROFILE = "PL3"
BAUD = 115200


class CommandError(ValueError):
    """Raised with a short machine code and a Korean message for the UI."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def _ints(args: str, count: int, low: int, high: int) -> list[int]:
    parts = args.split()
    if len(parts) != count:
        raise CommandError("arg_count", f"숫자 {count}개가 필요합니다.")
    try:
        values = [int(p) for p in parts]
    except ValueError:
        raise CommandError("not_integer", "정수만 입력할 수 있습니다.") from None
    for v in values:
        if not low <= v <= high:
            raise CommandError("range", f"{low}~{high} 사이 값만 됩니다.")
    return values


def _range(args: str, low: int, high: int) -> None:
    lo, hi = _ints(args, 2, low, high)
    if lo >= hi:
        raise CommandError("order", "하한은 상한보다 작아야 합니다.")


def build_line(command: str, args: str = "") -> str:
    """Return 'CMD args' (without request id) or raise CommandError."""
    command = command.strip().upper()
    args = args.strip() if command != "MSG" else args
    if any(c in args for c in "\r\n"):
        raise CommandError("newline", "줄바꿈 문자는 보낼 수 없습니다.")
    if command in ("STATUS", "PING", "STOP", "BEEP"):
        if args:
            raise CommandError("arg_count", f"{command}에는 인수가 없습니다.")
        return command
    if command == "SIGNAL":
        _ints(args, 1, 0, 2)
    elif command in ("AUTO", "BUZZ"):
        _ints(args, 1, 0, 1)
    elif command == "TEMP":
        _range(args, 0, 50)
    elif command == "HUM":
        _range(args, 0, 100)
    elif command == "MSG":
        if len(args) > 16:
            raise CommandError("too_long", "LCD 문구는 16자 이하입니다.")
        if any(not 0x20 <= ord(c) <= 0x7E for c in args):
            raise CommandError("not_ascii", "LCD는 영문·숫자·기본 기호만 표시합니다.")
        return f"MSG {args}" if args else "MSG"
    else:
        raise CommandError("unknown_command", f"{command}는 PL3에서 지원하지 않는 명령입니다.")
    return f"{command} {args}"
