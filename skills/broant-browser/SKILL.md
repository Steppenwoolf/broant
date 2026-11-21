---
name: broant-browser
description: Fast, safe interaction with the user's real browser (Opera GX / Chrome) via BroAnt Agent Bridge & MCP. Use whenever the user asks to check, read, screenshot, or interact with an open browser tab, web chat (e.g. Gemini), or logged-in website.
---

# BroAnt Browser Control Protocol

## 1. Hard Invariants (NEVER violate)
1. **NEVER fall back to a headless/sandbox browser or stale `/share/` links** when the user refers to their open browser (Opera GX / Chrome). Authenticated sessions and live pages live only in BroAnt.
2. **NEVER write ad-hoc throwaway Python scripts** (`test_bridge_*.py`, `read_tab_*.py`) to speak raw JSON-RPC over stdio if native `broant` MCP tools are available. Call MCP tools directly. If calling via CLI fallback is strictly required, use ONLY the prebuilt helper script (`scripts/broant_ctl.py`) — never rewrite stdio/stderr plumbing from scratch.
3. **Fail fast on disconnected bridge:** If the first call returns `EXTENSION_DISCONNECTED` (or fails to connect to `ws://127.0.0.1:8765`), **STOP immediately** and ask the user in 1–2 lines to toggle **BroAnt Settings → Agent Bridge: ON** in their browser (Opera GX / Chrome). Do NOT run background workarounds or retry loops.
4. **Zero dangling sessions:** Always release the tab immediately after finishing.
   - Prefer `ephemeral: true` for one-shot reads (`browser_read`).
   - Otherwise, capture `session_id` from the tool response header (`session_id: <id> | tab_id: <id>`) and ALWAYS call `browser_close_session({ session_id })` in the final step.

## 2. Fast-Path Playbook (Target: 2–3 tool calls, < 3 seconds)

### Scenario A: Check or read current active tab (Active-Tab-First)
1. Call `browser_list_tabs({ active_only: true })`.
   - Returns the active tab in the user's focused window in ~10ms.
   - If this is the expected page, proceed immediately with step 2.
   - If the user asked for a different tab, search with `browser_list_tabs({ query: '...', domain: '...', limit: 20 })`.
2. Read the page:
   - For general content / articles: `browser_read({ tab_id, position: 'top', ephemeral: true })`.
   - For web chats (Gemini, ChatGPT) or live server logs: `browser_read({ tab_id, position: 'bottom', max_chars: 20000, ephemeral: true })`.
   - For inspecting what is currently on user's screen: `browser_read({ tab_id, position: 'viewport', ephemeral: true })`.
   - For locating specific text: `browser_read({ tab_id, find: 'search phrase', ephemeral: true })`.
3. Check the navigation header:
   `[chars X..Y of Z | remaining: N | mode: ...]`
   - If `remaining > 0` and full text is needed, paginate with `offset`.

### Scenario B: Interactive multi-step task on a page (Click / Fill / Navigate)
1. `browser_navigate` or `browser_observe({ tab_id, pruning: 'compact' })` → capture returned `session_id`.
2. Execute `browser_fill` / `browser_click` using exact `ref` values (`e12`, etc.) from the latest `observe` and the same `session_id`.
3. Read result with `browser_read` or verify visual state with `browser_screenshot`.
4. **Mandatory cleanup:**
   `browser_close_session({ session_id })`

## 3. Tool Reference & Constraints
- `browser_list_tabs`:
  - `active_only`: `boolean` (fast active tab lookup)
  - `query`: `string` (title / URL search)
  - `domain`: `string` (domain filter, e.g. `gemini.google.com`)
  - `limit`: `number` (default: 20, sorted by `lastAccessed` desc)
- `browser_read`:
  - `max_chars`: `500..100000` (default: `20000`)
  - `offset`: `number` (pagination offset)
  - `position`: `'top' | 'viewport' | 'bottom'` (default: `'top'`)
  - `find`: `string` (context window search)
  - `ephemeral`: `boolean` (releases tab immediately after reading)
- `browser_observe`:
  - `pruning`: `'compact'` (default, ~14k chars) | `'standard'`
- `browser_navigate`:
  - HTTP/HTTPS only; `target_mode: 'new_tab' | 'active_tab' | 'tab_id'`
- `browser_close_session`:
  - `session_id`: optional (if omitted, releases active sticky session or all sessions)
