# BroAnt Communication & Architecture Protocol

This document defines the two-layer communication architecture of the **BroAnt Agent Bridge**:
1. **Transport Layer (L1):** `broant-mcp` ↔ `BroAnt Extension` (WebSocket + Chrome DevTools Protocol).
2. **Application Relay Layer (L2):** `broant-relay/v1` (Local Agent ↔ Remote Web Architect).

---

## 1. Transport Layer (L1): broant-mcp ↔ BroAnt Extension

The transport layer provides a secure, low-latency bridge between local MCP clients (Antigravity, Claude Desktop, Cursor, Python scripts) and the user's real browser session (Opera GX / Google Chrome).

| Parameter | Specification & Invariant |
| :--- | :--- |
| **Address** | Strictly loopback: `ws://127.0.0.1:8765` (overridable via `BROANT_BRIDGE_PORT`). |
| **Authentication** | Shared secret token (`BROANT_BRIDGE_TOKEN` or `~/.broant/bridge.token`). Verified with constant-time comparison (`crypto.timingSafeEqual`) and strict `chrome-extension://*` Origin validation. |
| **Multiplexing** | **Auto-Electing Leader/Relay Hub:** The first process binding port 8765 acts as Leader; subsequent processes catching `EADDRINUSE` transparently operate as Relays to the existing Hub. |
| **Keep-Alive (MV3)** | Heartbeat ping/pong every 20s + `chrome.alarms` watchdog every 30s to prevent Manifest V3 background service worker termination. |
| **Session Lifecycle** | Sticky CDP sessions with idle TTL (60s). Instant disconnection and release when `ephemeral: true` or upon client socket closure (`ws.onclose`). |
| **Injection Defense** | All web DOM content returned to AI models is wrapped in `<untrusted_browser_content source="...">...</untrusted_browser_content>`. |

### Defense-in-Depth Security Invariants
1. **Physical Session-Only Arming:**
   - The browser extension's physical toggle switch (`Agent Bridge: ON/OFF`) strictly resets to `OFF` whenever the browser starts (`chrome.runtime.onStartup.addListener(...)`).
   - Browser automation cannot be triggered passively or persistently across browser restarts without explicit user enablement in the current browser session.
2. **Daemon Air-Gap Protection:**
   - If port 8765 is closed, local agents must **never** silently spawn the background bridge daemon without user consent. The agent must prompt the user for permission.
3. **Loopback Only:**
   - The WebSocket server strictly binds to `127.0.0.1`. Remote network interfaces are never bound.

---

## 2. Application Relay Layer (L2): broant-relay/v1

The `broant-relay/v1` protocol enables structured, high-speed, two-way collaboration between the local execution layer (Antigravity / local LLMs) and high-parameter remote Web Architects (**Google Gemini, Anthropic Claude, OpenAI ChatGPT, DeepSeek**).

### High-Speed Atomic Dispatch
To eliminate UI latency in browser chats:
- The local agent dispatches text into the web chat input element with `submit: true` and `observe: 'none'`.
- This executes in `< 1s` without character-by-character typing or redundant observation roundtrips.

---

### Request Wire Format (`local_to_architect`)

Sent as a single payload consisting of a YAML header followed by three mandatory Markdown sections:

```yaml
protocol: broant-relay/v1
direction: local_to_architect
task_id: "<unique-task-id>"
hop: 1/3 # current hop / max hops (circuit breaker <= 3)
repo: "RepoName"
branch: "current-branch"
```

```markdown
## Goal
1-2 concise sentences defining what needs to be solved, reviewed, or designed.

## Execution Report
- Status: Git status (branch, modified files, last commit).
- Test / Build Suite: Passing count, failing assertions, clean error stack traces (no raw noise).
- Diff / Evidence: Minimal relevant code snippets and exact line numbers.

## Requested From Architect
Numbered list of specific architectural questions, patch reviews, or design decisions.
```

---

### Response Wire Format (`architect_to_local`)

The remote Architect returns a **single valid JSON code block** (`json`) immediately followed on a new line by the completion sentinel `<!-- BROANT_DISPATCH_END -->`. No conversational filler outside the JSON block is permitted.

```json
{
  "protocol": "broant-relay/v1",
  "task_id": "<matching-task-id>",
  "status": "continue | done | need_user",
  "summary": "Concise technical evaluation and verdict.",
  "assessment": {
    "working_tree": "healthy | needs_attention",
    "notes": "Key observations or architectural suggestions"
  },
  "actions": [
    {
      "tier": 1,
      "type": "read_files | apply_patch | run_cmd",
      "cmd": "optional shell command",
      "file": "optional target file path",
      "instructions": "optional exact patch instructions",
      "reason": "Why this action is needed"
    }
  ],
  "report_back": false
}
```
`<!-- BROANT_DISPATCH_END -->`

---

## 3. Security Execution Matrix (`actions[].tier`)

Every action returned by the Architect is categorized into one of three permission tiers:

| Tier | Category | Allowed Operations | Execution Policy |
| :---: | :--- | :--- | :--- |
| **Tier 1** | **Read / Test** | `git status`, `git diff`, reading repository files, running unit tests and linters. | **Automatic:** Local agent executes without pausing. |
| **Tier 2** | **Edit / Build** | Code modifications, refactoring, and local builds on a non-main branch or clean revertible working tree. | **Automatic:** Safe to execute automatically. |
| **Tier 3** | **Approval Required** | Commits directly to `master`/`main`, `git push`, deleting files, installing new dependencies, accessing `.env` or tokens, any action outside the active project workspace. | **Mandatory Pause:** Local agent must display the exact command and obtain explicit user approval. |

---

## 4. Multi-Provider Provider Matrix

The protocol is agnostic of the remote LLM provider. The local agent discovers the active chat tab via `browser_list_tabs({ active_only: true })`:

| Provider | Web URL Pattern | Context Window | Best Use Case |
| :--- | :--- | :--- | :--- |
| **Google Gemini** | `gemini.google.com` | 1M – 2M tokens | Large codebase dumps, full backtest logs, multimodal visual diffs. |
| **Anthropic Claude** | `claude.ai` | 200k tokens | Complex architectural refactoring, deep code reviews, precise typing. |
| **OpenAI ChatGPT** | `chatgpt.com` | 128k tokens | o1 / o3-mini reasoning, mathematical verification, logic puzzles. |
| **DeepSeek** | `chat.deepseek.com` | 64k – 128k tokens | DeepSeek-R1 open weights reasoning, algorithmic optimization. |
