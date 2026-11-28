# BroAnt Architecture

## High-Level Topology

```text
External AI Client (Antigravity / Claude Code / Cursor)
        │  stdio (JSON-RPC)
        ▼
packages/mcp (broant-mcp)
  ├── server.ts      (10 MCP tools + browser://tabs resource + nonce wrapping)
  └── bridge-hub.ts  (Leader/Relay WebSocket Hub on 127.0.0.1:8765)
        │  ws://127.0.0.1:8765 (token + optional extension ID origin check)
        ▼
Extension Background Service Worker (src/extension/)
  ├── src/bridge/client.ts & dispatcher.ts  (ALLOWED_BRIDGE_TOOLS, urlPolicy)
  ├── src/bridge/tool-sessions.ts           (session lifecycle & upload gating)
  ├── src/extension/run-manager.ts          (chat runs, recipes, context refs)
  ├── src/extension/page-monitor.ts         (chrome.alarms + diffLines idle gate)
  ├── src/extension/rail-hub.ts             (debounced state broadcast to tabs)
  └── src/browser-control/                  (deterministic CDP + Puppeteer frames)
        │
        ├──► Side Panel & Options (src/side-panel/, src/options/) via src/ui/protocol.ts
        └──► Mini-Rail HUD (entrypoints/broant-rail.content.ts) in closed Shadow DOM
```

## Key Subsystems

1. **Agent Bridge & MCP (`packages/mcp/` + `src/bridge/`):**
   - Auto-electing Leader/Relay hub avoids `EADDRINUSE` across multiple IDE clients.
   - `protocol.ts` auto-generates `~/.broant/bridge.token` (`0600`) when missing.
   - `tool-sessions.ts` enforces `siteRulesStorage` URL policies and gates `files` / `browser_upload` behind `bridgeAllowFileUploads`.

2. **Agent Loop & Local LLM Support (`src/agent/`):**
   - `loop.ts` manages turns, compaction, and context elision (`0.85 × threshold` for `lmstudio`/`ollama`).
   - `tools.ts` trims rarely used tools (`LOCAL_COMPACT_OFF`) in compact mode.
   - `guards.ts` tracks no-effect calls and read loops keyed by `${url}@${rev}` so repeated reads on unchanged pages stop while updated pages (`++rev`) proceed.
   - `recipes.ts` executes 0-tool deterministic pipelines (`extract → llm → act/notify`), seeded with `summarize-fast`, `extract-table`, and `draft-reply`.

3. **Background Page Monitor (`src/extension/page-monitor.ts` + `src/store/monitors.ts`):**
   - Runs on `chrome.alarms`, fetches/reads target pages, computes `diffLines()`, and skips LLM summarization when content is unchanged.

4. **Mini-Rail HUD & Diagnostic Logs (`entrypoints/broant-rail.content.ts`, `src/store/logs.ts`):**
   - Closed Shadow DOM floating rail with Quick Actions popover, `+ Watch this page`, DOM pruning toggle, and MCP/Agent status LEDs.
   - `nb.logs` persists a 200-entry ring buffer in `chrome.storage.local` viewable/exportable in Settings → Data.
