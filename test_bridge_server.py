import asyncio
import json
import logging
import sys

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

try:
    import websockets
except ImportError:
    print("Please install websockets: py -3.12 -m pip install websockets")
    sys.exit(1)

HOST = "127.0.0.1"
PORT = 8765
EXPECTED_TOKEN = "nanobrowser-secret-key"

connected_clients = set()


async def handler(websocket):
    logging.info(f"[+] Incoming connection from {websocket.remote_address}")
    client_authenticated = False

    try:
        async for message in websocket:
            data = json.loads(message)
            msg_type = data.get("type")
            logging.info(f"[<--] Received: {msg_type}")

            if msg_type == "hello":
                token = data.get("auth_token")
                if token == EXPECTED_TOKEN:
                    client_authenticated = True
                    connected_clients.add(websocket)
                    logging.info("[✓] Client authenticated successfully via token!")
                    await websocket.send(json.dumps({"type": "auth_ack", "ok": True}))

                    # Schedule status query and Direct Tool RPC demo
                    asyncio.create_task(demo_flow(websocket))
                else:
                    logging.warning(f"[!] Invalid auth token: {token}")
                    await websocket.send(json.dumps({"type": "auth_ack", "ok": False, "error": "Invalid auth token"}))
                    await websocket.close()
                    return

            elif msg_type == "ping":
                await websocket.send(json.dumps({"type": "pong", "ts": data.get("ts")}))

            elif msg_type == "task_accepted":
                logging.info(f"[✓] Task {data.get('task_id')} accepted on tab {data.get('tab_id')}")

            elif msg_type == "task_progress":
                logging.info(f"[*] Progress [{data.get('task_id')}] Step {data.get('step')}: {data.get('summary')}")

            elif msg_type == "task_result":
                logging.info(f"[★] TASK COMPLETED [{data.get('task_id')}]: status={data.get('status')}")
                logging.info(f"    Output: {data.get('output')}")
                logging.info(f"    Steps: {data.get('steps_count')}, Duration: {data.get('duration_ms')}ms")

            elif msg_type == "status_result":
                tabs = data.get("open_tabs", [])
                logging.info(f"[i] Open tabs in browser ({len(tabs)} total):")
                for t in tabs[:5]:
                    logging.info(f"    - Tab {t.get('id')}: {t.get('title')} ({t.get('url')})")

            elif msg_type == "tool_result":
                req_id = data.get("request_id")
                ok = data.get("ok")
                sess_id = data.get("session_id")
                tab_id = data.get("tab_id")
                if ok:
                    logging.info(f"[✓ Tool RPC] Req {req_id} succeeded (session: {sess_id}, tab: {tab_id})")
                    tool_data = data.get("data", {})
                    if "text" in tool_data:
                        # Print outline snapshot snippet
                        snippet = tool_data["text"][:300].replace("\n", " ")
                        logging.info(f"    DOM Snapshot snippet: {snippet}...")
                    else:
                        logging.info(f"    Result payload: {tool_data}")
                else:
                    err = data.get("error", {})
                    logging.error(f"[✗ Tool RPC] Req {req_id} failed: {err.get('message')} (code: {err.get('code')})")

    except websockets.exceptions.ConnectionClosed:
        logging.info("[-] Client disconnected")
    finally:
        connected_clients.discard(websocket)


async def demo_flow(websocket):
    await asyncio.sleep(1)
    logging.info("[-->] 1. Requesting browser status & open tabs...")
    await websocket.send(json.dumps({
        "type": "get_status",
        "auth_token": EXPECTED_TOKEN,
        "request_id": "status-req-1"
    }))

    await asyncio.sleep(2)
    logging.info("[-->] 2. Demonstrating Direct Tool RPC: 'observe' with compact pruning...")
    await websocket.send(json.dumps({
        "type": "call_tool",
        "auth_token": EXPECTED_TOKEN,
        "request_id": "tool-observe-1",
        "tool": "observe",
        "pruning": "compact"
    }))


async def main():
    logging.info(f"Starting Nanobrowser Agent Bridge Server on ws://{HOST}:{PORT}")
    async with websockets.serve(handler, HOST, PORT):
        await asyncio.Future()  # run forever


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logging.info("Server stopped.")
