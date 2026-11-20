# BroAnt 🐜

> **Hardworking AI Browser Worker & Native MCP Bridge**  
> *Local-First Headful AI Browser Runtime for Claude Code, Cursor, Antigravity, and Local LLMs.*

[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)
[![Tests: 955 Passed](https://img.shields.io/badge/Vitest-955%20passed-brightgreen.svg)]()
[![MCP: Native](https://img.shields.io/badge/MCP-Native%20Stdio%20%2B%20Hub-orange.svg)]()
[![Platform: Chrome MV3](https://img.shields.io/badge/Platform-Chrome%20MV3-yellow.svg)]()

---

## 🌟 What is BroAnt?

**BroAnt** (Browser + Worker Ant 🐜) turns your everyday Google Chrome into an industrious, autonomous browser runtime for external AI coding assistants and local LLMs.

Unlike headless tools (Playwright/Puppeteer) that launch empty profiles and trigger anti-bot challenges, BroAnt works directly inside your **real, authenticated browser sessions**. External AI agents can inspect pages, fill forms, click buttons, take screenshots, and run autonomous tasks through a standardized **Model Context Protocol (MCP)** server.

---

## ⚡ Core Capabilities

### 1. Native MCP Server (`broant-mcp`)
- **9 Core Browser Tools**:
  - `browser_navigate`: Navigate active or new tabs cleanly.
  - `browser_click`: Click, hover, or focus interactive elements using element refs (`ref: "e12"`).
  - `browser_fill`: Single or multi-field form completion (`fields: { e1: "user", e2: "pass" }`).
  - `browser_observe`: Accessibility-tree DOM snapshot with interactive refs.
  - `browser_read`: Extract text content or articles with pagination offsets.
  - `browser_screenshot`: Multimodal vision returning native MCP image content (`ref` crop, `full_page`, bounding box `labels`).
  - `browser_list_tabs`: Query open tabs and active debugging sessions.
  - `browser_close_session`: Detach CDP debugger cleanly.
  - `browser_run_agent_task`: Delegate complex, multi-step autonomous browsing tasks.
- **Resource `browser://tabs`**: Instant list of open tabs and debugging sessions without burning LLM tool turns.

### 2. Auto-Electing Hub (`127.0.0.1:8765`)
- Run multiple IDE instances simultaneously (Cursor + Claude Code + Antigravity) with zero `EADDRINUSE` conflicts.
- First process auto-elects as **Leader**; subsequent processes automatically connect as **Relays**.
- Automatic leader re-election with random jitter if the active Leader terminates.

### 3. Real Browser Sessions — Zero Bans & No Captchas
- Operates inside your existing Chrome window with all your active logins (Google, GitHub, trading portals, internal VPN intranets).
- Bypasses Cloudflare Turnstile and bot-checks naturally without fake fingerprints.

### 4. Smart DOM Pruning for Local LLMs (1.7B – 8B)
- Prunes noise attributes, repetitive lists, and SVG bloat to compress page representation under 14,000 characters.
- Enables accurate web automation even on smaller, privacy-focused models (LM Studio, Ollama, Qwen, Gemma).

### 5. Co-Pilot HUD & Visual Safety
- Automatically injects visual border indicators on tabs under active MCP control.
- Hardened permissions: dangerous local disk file operations (`files`) are stripped from remote tool RPC sessions.

---

## 🚀 Quick Start

### 1. Build & Load the Extension
```bash
# Clone the repository
git clone https://github.com/Steppenwoolf/nanobrowser.git broant
cd broant

# Install dependencies and build extension
pnpm install --no-engine-strict
pnpm run build
```
1. Open Chrome and go to `chrome://extensions/`.
2. Turn ON **Developer mode** (top right).
3. Click **Load unpacked** and select the `dist/` directory.

### 2. Enable Agent Bridge
1. Open BroAnt Settings → **Agent Bridge**.
2. Switch **Agent Bridge** ON (default port: `8765`).
3. Click **Copy Config** to copy your tailored MCP setup with your unique token.

### 3. Connect Your AI Assistant

Add BroAnt to your AI client configuration:

#### Claude Desktop / Claude Code (`claude_desktop_config.json`)
```json
{
  "mcpServers": {
    "broant": {
      "command": "npx",
      "args": ["-y", "broant-mcp"],
      "env": {
        "BROANT_BRIDGE_TOKEN": "your-auth-token-from-settings"
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
        "BROANT_BRIDGE_TOKEN": "your-auth-token-from-settings"
      }
    }
  }
}
```

---

## 🏗️ Monorepo Structure

```text
broant/
├── packages/
│   └── mcp/                  # Standalone MCP server package (broant-mcp)
│       ├── src/
│       │   ├── bridge-hub.ts # Auto-Electing Leader/Relay WebSocket Hub
│       │   ├── cli.ts        # CLI entrypoint & stdio transport
│       │   ├── protocol.ts   # Protocol definitions & auth timing guards
│       │   └── server.ts     # 9 MCP tools & browser://tabs resource
│       └── package.json
├── src/
│   ├── bridge/               # Extension-side Bridge client & dispatcher
│   ├── browser-control/      # CDP controller, DOM pruning & perception
│   ├── extension/            # Chrome MV3 background service worker
│   ├── options/              # Settings & Agent Bridge configuration UI
│   └── side-panel/           # Built-in chat & copilot side panel
├── NOTICE                    # Apache-2.0 fork attribution
└── wxt.config.ts             # Chrome extension build configuration
```

---

## 🧪 Testing & Verification

```bash
# Run unit & integration tests (955 vitest tests)
npx vitest run

# Typecheck and build standalone MCP server
cd packages/mcp
pnpm run typecheck
pnpm run build
```

---

## 📄 License & Attribution

- Licensed under the [Apache License, Version 2.0](LICENSE).
- Originally forked from [Nanobrowser](https://github.com/nanobrowser/nanobrowser).
- See [NOTICE](NOTICE) for full attribution details.
