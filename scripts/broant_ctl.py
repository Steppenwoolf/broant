#!/usr/bin/env python3
"""
BroAnt CLI Control Helper (broant_ctl.py)
Canonical helper script to interact with BroAnt Agent Bridge via WebSocket (ws://127.0.0.1:8765).
Usage:
    python scripts/broant_ctl.py status [--active-only] [--query KEYWORD] [--domain DOMAIN] [--limit N]
    python scripts/broant_ctl.py read [--tab-id ID] [--position {top,viewport,bottom}] [--find QUERY] [--max-chars N] [--ephemeral]
    python scripts/broant_ctl.py close [--session-id ID]
"""

import sys
import os
import json
import argparse
import asyncio
from pathlib import Path
try:
    import websockets
except ImportError:
    print(json.dumps({"ok": False, "error": "websockets package required: pip install websockets"}))
    sys.exit(1)

DEFAULT_URL = "ws://127.0.0.1:8765/mcp-client"
DEFAULT_TOKEN = "broant-secret-key"


def resolve_auth_token() -> str:
    for env_key in ("BROANT_BRIDGE_TOKEN", "NANOBROWSER_BRIDGE_TOKEN"):
        val = os.environ.get(env_key, "").strip()
        if val:
            return val
    for folder in (".broant", ".nanobrowser"):
        token_file = Path.home() / folder / "bridge.token"
        if token_file.is_file():
            try:
                val = token_file.read_text(encoding="utf-8").strip()
                if val:
                    return val
            except OSError:
                pass
    return DEFAULT_TOKEN


async def send_command(payload: dict, expect_terminal: str, url: str = DEFAULT_URL, token: str | None = None, timeout: float = 15.0):
    auth_token = token or resolve_auth_token()
    try:
        async with websockets.connect(
            url,
            ping_interval=None,
            additional_headers={"x-bridge-token": auth_token},
        ) as ws:
            payload["auth_token"] = auth_token
            if "request_id" not in payload:
                payload["request_id"] = "ctl-" + str(asyncio.get_event_loop().time())
            req_id = payload["request_id"]

            envelope = {
                "__relay": True,
                "correlation_id": req_id,
                "expect_terminal": expect_terminal,
                "payload": payload,
            }
            await ws.send(json.dumps(envelope))

            while True:
                raw = await asyncio.wait_for(ws.recv(), timeout=timeout)
                msg = json.loads(raw)
                if msg.get("type") in ("status_result", "tool_result", "task_result", "session_closed", "error"):
                    return msg
    except Exception as e:
        return {"ok": False, "error": f"Bridge error ({type(e).__name__}): {str(e) or repr(e)}"}

def main():
    parser = argparse.ArgumentParser(description="BroAnt CLI Control Helper")
    subparsers = parser.add_subparsers(dest="subcommand", required=True)

    # Status
    p_status = subparsers.add_parser("status", help="Get open tabs and status")
    p_status.add_argument("--active-only", action="store_true", help="Return active tab only (~10ms)")
    p_status.add_argument("--query", type=str, help="Search query in tab title or URL")
    p_status.add_argument("--domain", type=str, help="Domain filter")
    p_status.add_argument("--limit", type=int, default=20, help="Max tabs to return")

    # Read
    p_read = subparsers.add_parser("read", help="Read tab contents")
    p_read.add_argument("--tab-id", type=int, help="Target tab ID")
    p_read.add_argument("--session-id", type=str, help="Reuse sticky session ID")
    p_read.add_argument("--position", choices=["top", "viewport", "bottom"], default="top")
    p_read.add_argument("--find", type=str, help="Text to search on page")
    p_read.add_argument("--max-chars", type=int, default=20000)
    p_read.add_argument("--offset", type=int, default=0)
    p_read.add_argument("--ephemeral", action="store_true", default=True, help="Auto-close session after reading")

    # Close
    p_close = subparsers.add_parser("close", help="Close sticky session")
    p_close.add_argument("--session-id", type=str, default="", help="Session ID to close (blank closes all)")

    # Generic call
    p_call = subparsers.add_parser("call", help="Invoke any direct bridge tool")
    p_call.add_argument("tool", type=str, help="Tool name (observe, act, fill, upload, etc.)")
    p_call.add_argument("--tab-id", type=int, help="Target tab ID")
    p_call.add_argument("--session-id", type=str, help="Reuse sticky session ID")
    p_call.add_argument("--args-json", type=str, default="{}", help="JSON string of tool args")
    p_call.add_argument("--args-file", type=str, help="Path to JSON file of tool args")

    args = parser.parse_args()

    if args.subcommand == "status":
        cmd = {
            "type": "get_status",
            "active_only": args.active_only,
            "query": args.query,
            "domain": args.domain,
            "limit": args.limit
        }
        res = asyncio.run(send_command(cmd, expect_terminal="status_result"))
        print(json.dumps(res, indent=2, ensure_ascii=False))

    elif args.subcommand == "read":
        read_args = {
            "maxChars": args.max_chars,
            "offset": args.offset,
            "position": args.position,
            "ephemeral": args.ephemeral,
        }
        if args.find is not None:
            read_args["find"] = args.find
        cmd = {
            "type": "call_tool",
            "action": "call_tool",
            "tool": "text",
            "session_id": args.session_id or None,
            "target": {"mode": "tab_id", "tab_id": args.tab_id} if args.tab_id else {"mode": "active_tab"},
            "args": read_args,
        }
        res = asyncio.run(send_command(cmd, expect_terminal="tool_result"))
        print(json.dumps(res, indent=2, ensure_ascii=False))

    elif args.subcommand == "close":
        cmd = {
            "type": "close_session",
            "session_id": args.session_id
        }
        res = asyncio.run(send_command(cmd, expect_terminal="session_closed"))
        print(json.dumps(res, indent=2, ensure_ascii=False))

    elif args.subcommand == "call":
        if args.args_file:
            tool_args = json.loads(Path(args.args_file).read_text(encoding="utf-8"))
        else:
            tool_args = json.loads(args.args_json)
        cmd = {
            "type": "call_tool",
            "action": "call_tool",
            "tool": args.tool,
            "session_id": args.session_id or None,
            "target": {"mode": "tab_id", "tab_id": args.tab_id} if args.tab_id else {"mode": "active_tab"},
            "args": tool_args,
        }
        res = asyncio.run(send_command(cmd, expect_terminal="tool_result", timeout=30.0))
        print(json.dumps(res, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    main()
