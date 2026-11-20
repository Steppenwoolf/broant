# broant-mcp 🐜

Native Model Context Protocol (MCP) server for **BroAnt** — the Hardworking AI Browser Worker & MCP Bridge.

Connects AI coding assistants and LLMs (**Claude Code, Cursor, Antigravity, Cline, Roo Code**) directly to your live, authenticated browser tabs through the BroAnt Chrome Extension via high-performance WebSocket RPC.

---

## Why BroAnt?

- **Real Authenticated Browser**: Works inside your primary browser profile (Google, GitHub, trading platforms, internal dashboards) with **zero headless bot detections**, **no Cloudflare blocks**, and **no blank Playwright windows**.
- **Auto-Electing Hub (`127.0.0.1:8765`)**: The first MCP client auto-elects as the WebSocket Leader Hub; any additional IDEs or terminals seamlessly connect in Relay mode without `EADDRINUSE` port conflicts. If the Leader exits, a Relay automatically re-elects as the new Leader.
- **Strict Stdio Hygiene**: Pure JSON-RPC protocol frames on `stdout`. All logs, diagnostics, and progress updates are strictly routed to `stderr` to prevent JSON-RPC parsing corruption.
- **9 Native MCP Tools**: Sub-second execution of direct actions (`browser_navigate`, `browser_click`, `browser_fill`, `browser_observe`, `browser_read`, `browser_list_tabs`, `browser_screenshot`, `browser_close_session`, `browser_run_agent_task`).
- **Native Multimodal Vision**: `browser_screenshot` returns native MCP image content (`type: "image"`, base64 PNG/JPEG) with support for element crop (`ref`), full-page capture, and bounding box labels.
- **Instant Tab Resource (`browser://tabs`)**: Fast inspection of open tabs and active sessions without consuming tool-call turns.
- **Security Guardrails**:
  - Strict Cross-Site WebSocket Hijacking (CSWSH) origin validation.
  - Constant-time token verification (`crypto.timingSafeEqual`).
  - Gated message dispatching (commands dropped until explicit authentication handshake).
  - Prompt injection isolation wrapping (`<untrusted_browser_content>`).

---

## Quick Start

### 1. Enable Bridge in BroAnt Extension
1. Open BroAnt Settings → **Agent Bridge**.
2. Turn **Agent Bridge** ON (default port: `8765`).
3. Click **Copy Config** or copy your Auth Token.

### 2. Configure Your AI Assistant

#### Claude Desktop / Claude Code (`claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "broant": {
      "command": "npx",
      "args": ["-y", "broant-mcp"],
      "env": {
        "BROANT_BRIDGE_TOKEN": "your-auth-token-here"
      }
    }
  }
}
```

#### Cursor (`.cursor/mcp.json`)
```json
{
  "mcpServers": {
    "broant": {
      "command": "npx",
      "args": ["-y", "broant-mcp"],
      "env": {
        "BROANT_BRIDGE_TOKEN": "your-auth-token-here"
      }
    }
  }
}
```

#### Antigravity MCP Configuration (`mcp_config.json`)
```json
{
  "mcpServers": {
    "broant": {
      "command": "npx",
      "args": ["-y", "broant-mcp"],
      "env": {
        "BROANT_BRIDGE_TOKEN": "your-auth-token-here"
      }
    }
  }
}
```

---

## CLI Options

```text
Usage:
  broant-mcp [options]
  npx broant-mcp [options]

Options:
  -p, --port <number>      Bridge WebSocket port (default: 8765)
  -t, --token <string>     Shared auth token (default: env BROANT_BRIDGE_TOKEN or ~/.broant/bridge.token)
  --host <string>          Host interface to bind to (default: 127.0.0.1)
  --grace-ms <number>      Connection grace wait time in ms (default: 3000)
  -h, --help               Show help message

Environment Variables:
  BROANT_BRIDGE_TOKEN      Bridge authentication token
  BROANT_BRIDGE_PORT       Bridge port override
  NANOBROWSER_BRIDGE_TOKEN Backward compatibility fallback token
```

---

## License & Attribution

- **License**: [Apache-2.0](../../LICENSE)
- Originally forked from [Nanobrowser](https://github.com/nanobrowser/nanobrowser) under the Apache License 2.0. See [NOTICE](../../NOTICE) for details.
