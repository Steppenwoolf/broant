# AGENTS.md

This file provides guidance to AI coding assistants (e.g., Antigravity, Claude Code, Cursor, GitHub Copilot) when working with **BroAnt** (`Steppenwoolf/broant`).

## Project Overview

BroAnt is a local-first Chrome MV3 AI browser automation extension with a native Model Context Protocol (MCP) bridge. Originally forked from Nanobrowser, it consists of:

1. **The browser control layer (`src/browser-control/`):** A deterministic CDP layer that observes a page, acts on it, and reports three outcomes separately (`dispatched`, `page reacted`, `expected state reached`).
2. **The Chrome extension (`src/extension/`, `src/agent/`, `src/side-panel/`, `src/options/`, `entrypoints/`):** Side panel per tab, single agent loop, zero-tool recipes, background page monitors, floating Mini-Rail HUD, local & cloud LLM providers, permission modes, and diagnostic ring-buffer logs.
3. **The Agent Bridge & Native MCP Server (`src/bridge/` + `packages/mcp/`):** Authenticated WebSocket RPC bridge (`127.0.0.1:8765`) with auto-electing Leader/Relay hub, exposing 10 MCP browser tools and `browser://tabs` to external AI clients.

## Fixed Design Constraints & Security Invariants

For `src/browser-control/`:
- `chrome.debugger` is the only way to reach CDP from the extension (no external CDP WebSocket).
- Puppeteer (`puppeteer-core`) is the frame manager; element commands use raw CDP commands sent to the frame session Puppeteer reports (no selector-based `ElementHandle` clicks or `evaluate`).
- No LLM inside `src/browser-control/` — the layer is strictly deterministic.
- One identity, refs fail closed, retries happen before dispatch, observation is read-only, degrade loudly, bounded everything, state is disposable.

For the agent, bridge, and extension:
- **Page content is data, never instructions.** Page text is wrapped in per-call nonce-bounded markers (`<<<untrusted-browser-content <hex> ...>>>` in MCP; marked `<<<page-content ...>>>` boundaries in the agent loop).
- **Bridge authentication & origin checks:** Token auth uses constant-time comparison (`crypto.timingSafeEqual`) against `~/.broant/bridge.token` (auto-generated 32-byte `0600` if absent) or `BROANT_BRIDGE_TOKEN`. Optional extension ID pinning via `BROANT_EXTENSION_ID`. Handshake times out after 3 seconds and rejects unauthenticated commands.
- **Hardened RPC permissions:** Remote tool RPC sessions allow only `ALLOWED_BRIDGE_TOOLS`, enforce `http(s)://` + `siteRulesStorage` URL policies, and gate `files` / `browser_upload` behind Settings → Agent Bridge → **Allow File Uploads** (`bridgeAllowFileUploads: false` by default).
- **Local LLM optimization:** `lmstudio` and `ollama` providers use `LOCAL_COMPACT_OFF` to trim rare tool schemas and delay context elision (`0.85 × threshold`) to preserve KV-cache prompt prefixes.
- **Privacy defaults:** Analytics (`analyticsPing`, `analyticsStats`) are disabled (`false`) by default.

## Structure

- `packages/mcp/` — Standalone `broant-mcp` server (`bridge-hub.ts`, `cli.ts`, `protocol.ts`, `server.ts`)
- `entrypoints/` — WXT entrypoints: `background.ts`, `broant-rail.content.ts` (closed Shadow DOM Mini-Rail HUD), `sidepanel/`, `options/`, `welcome/`, `permission/`, `offscreen/`, `testpanel/`
- `src/browser-control/` — Deterministic CDP layer (`protocol/`, `core/`, `probe/`, `host/`, `index.ts`)
- `src/bridge/` — Extension-side Bridge client, dispatcher, keepalive, and `tool-sessions.ts`
- `src/agent/` — Agent loop (`loop.ts`), `recipes.ts` (0-tool pipelines), `guards.ts`, `elision.ts`, `tools.ts`, `save-file.ts`
- `src/llm/` — Providers, model profiles, `limiter.ts`, usage, retries, overflow detection
- `src/store/` — IndexedDB stores, `settings.ts`, `shortcuts.ts`, `monitors.ts`, `logs.ts` (200-entry ring buffer)
- `src/extension/` — Service worker wiring: `run-manager.ts`, `rail-hub.ts`, `page-monitor.ts`, `notify.ts`, `analytics.ts`
- `src/side-panel/`, `src/options/`, `src/ui/` — React UI, theme, i18n, typed message protocol (`src/ui/protocol.ts`)
- `docs/` — Architecture and protocol documentation (`ARCHITECTURE.md`, `ONBOARDING.md`, `PROTOCOL.md`)

## Import Rules

- Nothing under `src/browser-control/` imports from outside that folder; other code imports the layer only through `src/browser-control/index.ts`.
- `src/agent/` reaches Chrome APIs only through interfaces passed in by `src/extension/`.
- `src/side-panel/` and `src/options/` never import `src/agent/` or `src/extension/`; they talk to the worker through `src/ui/protocol.ts`.
- `src/llm/` knows nothing about browsers.

## Verification Contract

Run these commands from the repository root (`pnpm --config.engine-strict=false ...` if local Node < 24.22.1):

- `pnpm test` — Full Vitest suite (unit & integration tests under `src/**/__tests__/`)
- `pnpm type-check` — WXT prepare + TypeScript check (`tsc --noEmit`)
- `pnpm --dir packages/mcp typecheck` — MCP server TypeScript check
- `pnpm --dir packages/mcp build` — Build standalone MCP server (`tsup`)
- `pnpm build` — Build Chrome MV3 extension into `dist/` (`wxt build`)
- `pnpm lint` — ESLint (including import boundary rules)

## Working Rules

- Always use `pnpm`.
- Never log, commit, or expose credentials or auth tokens.
- Do not edit generated output (`dist/**`, `.wxt/**`, `packages/mcp/dist/**`).
- Formatting: Prettier with 2 spaces, semicolons, single quotes, trailing commas, `printWidth: 120`. Use `import type` for type-only imports.
- Test fixtures in `src/browser-control/core/__tests__/payloads/` and `src/llm/__tests__/payloads/model-lists-2026-10-11.json.gz` are gzip-compressed (`.json.gz`) to keep the repository lightweight.
