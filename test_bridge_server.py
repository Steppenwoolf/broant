import asyncio
import json
import logging
import sys
import uuid

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

try:
    import websockets
except ImportError:
    print("Please install websockets: py -3.12 -m pip install websockets")
    sys.exit(1)

WS_HOST = "127.0.0.1"
WS_PORT = 8765
HTTP_PORT = 8766
VALID_TOKENS = {"nanobrowser-secret-key", "broant-secret-key"}

active_browser_ws = None
pending_requests: dict[str, asyncio.Future] = {}


async def ws_handler(websocket):
    global active_browser_ws
    logging.info(f"[+] Incoming WebSocket from {websocket.remote_address}")
    active_browser_ws = websocket

    try:
        async for message in websocket:
            data = json.loads(message)
            msg_type = data.get("type")
            req_id = data.get("request_id")

            if msg_type == "hello":
                token = data.get("auth_token")
                if token in VALID_TOKENS:
                    logging.info("[✓] Browser authenticated successfully via token!")
                    await websocket.send(json.dumps({"type": "auth_ack", "ok": True}))
                else:
                    logging.warning(f"[!] Invalid auth token: {token}")
                    await websocket.send(json.dumps({"type": "auth_ack", "ok": False, "error": "Invalid auth token"}))
                    await websocket.close()
                    return

            elif msg_type == "ping":
                await websocket.send(json.dumps({"type": "pong", "ts": data.get("ts")}))

            elif msg_type in ("status_result", "tool_result", "task_result", "task_progress", "task_accepted"):
                if req_id and req_id in pending_requests and not pending_requests[req_id].done():
                    pending_requests[req_id].set_result(data)
                if msg_type == "tool_result":
                    logging.info(f"[RPC result] req_id={req_id} ok={data.get('ok')}")
                elif msg_type == "status_result":
                    tabs = data.get("open_tabs", [])
                    logging.info(f"[Tabs updated] Total open tabs: {len(tabs)}")

    except websockets.exceptions.ConnectionClosed:
        logging.info("[-] Browser disconnected")
    finally:
        if active_browser_ws == websocket:
            active_browser_ws = None


async def send_to_browser(payload: dict, timeout: float = 30.0) -> dict:
    if not active_browser_ws:
        raise RuntimeError("No active browser WebSocket connection")

    req_id = payload.get("request_id") or f"req-{uuid.uuid4().hex[:8]}"
    payload["request_id"] = req_id
    payload["auth_token"] = "broant-secret-key"

    loop = asyncio.get_running_loop()
    fut = loop.create_future()
    pending_requests[req_id] = fut

    try:
        await active_browser_ws.send(json.dumps(payload))
        return await asyncio.wait_for(fut, timeout=timeout)
    finally:
        pending_requests.pop(req_id, None)


async def handle_http_client(reader: asyncio.StreamReader, writer: asyncio.StreamWriter):
    try:
        line = await reader.readline()
        if not line:
            writer.close()
            return
        parts = line.decode().strip().split()
        if len(parts) < 2:
            writer.close()
            return
        method, path = parts[0], parts[1]

        # Read headers
        headers = {}
        content_length = 0
        while True:
            hline = await reader.readline()
            if not hline or hline in (b"\r\n", b"\n"):
                break
            hparts = hline.decode().split(":", 1)
            if len(hparts) == 2:
                k, v = hparts[0].strip().lower(), hparts[1].strip()
                headers[k] = v
                if k == "content-length":
                    content_length = int(v)

        body_bytes = b""
        if content_length > 0:
            body_bytes = await reader.readexactly(content_length)

        body_json = {}
        if body_bytes:
            try:
                body_json = json.loads(body_bytes.decode())
            except Exception:
                pass

        status_code = 200
        response_data = {}

        if path == "/health":
            response_data = {"ok": True, "browser_connected": active_browser_ws is not None}

        elif path in ("/tabs", "/status"):
            try:
                res = await send_to_browser({"type": "get_status"}, timeout=10.0)
                response_data = res
            except Exception as e:
                status_code = 502
                response_data = {"ok": False, "error": str(e)}

        elif path == "/call_tool":
            try:
                req = {
                    "type": "call_tool",
                    "tool": body_json.get("tool", "observe"),
                    "args": body_json.get("args", {}),
                    "pruning": body_json.get("pruning", "compact"),
                }
                if "session_id" in body_json:
                    req["session_id"] = body_json["session_id"]
                if "target" in body_json:
                    req["target"] = body_json["target"]
                elif "tab_id" in body_json:
                    req["target"] = {"tab_id": body_json["tab_id"]}

                res = await send_to_browser(req, timeout=body_json.get("timeout_ms", 30000) / 1000.0)
                response_data = res
            except Exception as e:
                status_code = 502
                response_data = {"ok": False, "error": str(e)}

        elif path == "/close_session":
            try:
                req = {
                    "type": "close_session",
                    "session_id": body_json.get("session_id", ""),
                }
                res = await send_to_browser(req, timeout=10.0)
                response_data = res
            except Exception as e:
                status_code = 502
                response_data = {"ok": False, "error": str(e)}

        else:
            status_code = 404
            response_data = {"error": "Not Found"}

        resp_body = json.dumps(response_data, ensure_ascii=False).encode("utf-8")
        status_line = f"HTTP/1.1 {status_code} OK\r\n" if status_code == 200 else f"HTTP/1.1 {status_code} Error\r\n"
        headers_str = f"Content-Type: application/json; charset=utf-8\r\nContent-Length: {len(resp_body)}\r\nConnection: close\r\n\r\n"
        writer.write(status_line.encode() + headers_str.encode() + resp_body)
        await writer.drain()
    except Exception as e:
        logging.error(f"Error handling HTTP request: {e}")
    finally:
        writer.close()
        await writer.wait_closed()


async def main():
    logging.info(f"Starting Agent Bridge WebSocket on ws://{WS_HOST}:{WS_PORT}")
    logging.info(f"Starting Agent Bridge HTTP RPC on http://{WS_HOST}:{HTTP_PORT}")

    ws_server = await websockets.serve(ws_handler, WS_HOST, WS_PORT)
    http_server = await asyncio.start_server(handle_http_client, WS_HOST, HTTP_PORT)

    async with ws_server, http_server:
        await asyncio.Future()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logging.info("Server stopped.")
