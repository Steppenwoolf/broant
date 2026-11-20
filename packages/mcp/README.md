# nanobrowser-mcp

Native Model Context Protocol (MCP) server for [Nanobrowser](https://github.com/Steppenwoolf/nanobrowser).

Connects AI coding assistants (Claude Code, Cursor, Antigravity, Roo Code, etc.) directly to your active browser tabs through the Nanobrowser Chrome Extension via high-performance WebSocket RPC.

## Features

- **No Manual Python Bridge**: Zero background bridge scripts to maintain.
- **Auto-Electing Hub**: First instance becomes the WebSocket Hub (`ws://127.0.0.1:8765`); subsequent instances automatically switch to relay mode.
- **Strict Stdio Hygiene**: Pure JSON-RPC on `stdout`, diagnostics strictly on `stderr`.
- **Direct Tool RPC**: Sub-second execution of browser actions (`navigate`, `click`, `fill`, `observe`, `read`, `list_tabs`, `close_session`).
- **Autonomous Task Execution**: `browser_run_agent_task` to run full browser agent tasks.
- **Security Guardrails**: Cross-Site WebSocket Hijacking (CSWSH) protection, origin verification, and prompt injection isolation wrapping (`<untrusted_browser_content>`).

## Quick Start

### 1. Enable Bridge in Nanobrowser Extension
1. Open Nanobrowser Options -> **Agent Bridge**.
2. Check **Enable Agent Bridge** (default port `8765`).

### 2. Configure Your AI Assistant

#### Claude Desktop / Claude Code (`claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "nanobrowser": {
      "command": "npx",
      "args": ["-y", "nanobrowser-mcp"]
    }
  }
}
```

#### Cursor (`.cursor/mcp.json`)
```json
{
  "mcpServers": {
    "nanobrowser": {
      "command": "npx",
      "args": ["-y", "nanobrowser-mcp"]
    }
  }
}
```

#### Antigravity MCP Configuration (`mcp_config.json`)
```json
{
  "mcpServers": {
    "nanobrowser": {
      "command": "node",
      "args": ["R:/AI_Research/nanobrowser/packages/mcp/dist/cli.js"]
    }
  }
}
```

## Options

- `-p, --port <number>`: Bridge WebSocket port (default: `8765`).
- `-t, --token <string>`: Shared auth token (default: reads `NANOBROWSER_BRIDGE_TOKEN` or `~/.nanobrowser/bridge.token`).
- `--host <string>`: Host interface to bind to (default: `127.0.0.1`).
- `--grace-ms <number>`: Reconnection grace period in ms (default: `3000`).

## License

Apache-2.0
