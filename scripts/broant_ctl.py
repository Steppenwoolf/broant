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
import json
import argparse
import asyncio
try:
    import websockets
except ImportError:
    print(json.dumps({"ok": False, "error": "websockets package required: pip install websockets"}))
    sys.exit(1)

DEFAULT_URL = "ws://127.0.0.1:8765"
DEFAULT_TOKEN = "broant-secret-key"

async def send_command(payload: dict, url: str = DEFAULT_URL, token: str = DEFAULT_TOKEN, timeout: float = 15.0):
    try:
        async with websockets.connect(url, ping_interval=None) as ws:
            # Send hello
            await ws.send(json.dumps({
                "type": "hello",
                "protocol_version": 1,
                "client": "broant-ctl",
                "auth_token": token,
                "capabilities": ["execute_task", "status"]
            }))
            
            # Send command
            payload["auth_token"] = token
            if "request_id" not in payload:
                payload["request_id"] = "ctl-" + str(asyncio.get_event_loop().time())
            await ws.send(json.dumps(payload))

            # Wait for response
            while True:
                raw = await asyncio.wait_for(ws.recv(), timeout=timeout)
                msg = json.loads(raw)
                if msg.get("type") in ("status_result", "tool_result", "task_result"):
                    return msg
                elif msg.get("type") == "error":
                    return msg
    except Exception as e:
        return {"ok": False, "error": f"Bridge error: {str(e)}"}

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

    args = parser.parse_args()

    if args.subcommand == "status":
        cmd = {
            "type": "get_status",
            "active_only": args.active_only,
            "query": args.query,
            "domain": args.domain,
            "limit": args.limit
        }
        res = asyncio.run(send_command(cmd))
        print(json.dumps(res, indent=2, ensure_ascii=False))

    elif args.subcommand == "read":
        cmd = {
            "type": "call_tool",
            "action": "call_tool",
            "tool": "text",
            "session_id": args.session_id or None,
            "target": {"mode": "tab_id", "tab_id": args.tab_id} if args.tab_id else {"mode": "active_tab"},
            "args": {
                "maxChars": args.max_chars,
                "offset": args.offset,
                "position": args.position,
                "find": args.find,
                "ephemeral": args.ephemeral
            }
        }
        res = asyncio.run(send_command(cmd))
        print(json.dumps(res, indent=2, ensure_ascii=False))

    elif args.subcommand == "close":
        cmd = {
            "type": "close_session",
            "session_id": args.session_id
        }
        res = asyncio.run(send_command(cmd))
        print(json.dumps(res, indent=2, ensure_ascii=False))

if __name__ == "__main__":
    main()
