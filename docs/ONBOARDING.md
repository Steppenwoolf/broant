# Local Agent Onboarding Playbook (BroAnt Bridge)

This playbook describes how to onboard a new local agent profile, IDE plugin, or CLI worker (Antigravity profile, Cursor, Claude Desktop, Python worker) to interact with the **BroAnt Agent Bridge** and participate in the **`broant-relay/v1`** multi-agent network.

---

## 5-Step Onboarding Process

### Step 1: Obtain the Bridge Auth Token
1. Open your browser with BroAnt installed (Opera GX / Google Chrome).
2. Open **BroAnt Settings → Bridge & MCP** (or click on LED 1 on the Mini-Rail dock to verify the bridge is active).
3. Copy the **Auth Token** or save it to:
   ```bash
   ~/.broant/bridge.token
   ```
   *(Ensure file permissions are restricted to the current user).*

---

### Step 2: Register broant-mcp in the Agent Configuration
Add `broant` to your agent's MCP configuration (`mcpServers` block):

```json
{
  "mcpServers": {
    "broant": {
      "command": "npx",
      "args": ["-y", "broant-mcp"],
      "env": {
        "BROANT_BRIDGE_PORT": "8765",
        "BROANT_BRIDGE_TOKEN": "<your-auth-token>"
      }
    }
  }
}
```
> **Leader/Relay Hub Notice:** If another process (like Antigravity or a background worker) is already bound to port `8765`, new instances running `broant-mcp` automatically detect `EADDRINUSE` and transparently connect as **Relays** to the existing Leader hub.

---

### Step 3: Mount Required Skills
Copy or link the two core skills into your agent's skills directory:
1. `broant-browser/SKILL.md`: Fast, safe browser interactions (`Active-Tab-First`, `ephemeral: true`, strict switch reset checks, 100k char safety limit, clean session teardown).
2. `architect-relay/SKILL.md`: Client protocol implementation for `broant-relay/v1` (batching, `hop <= 3` circuit breaker, sentinel polling, 3-tier safety execution).

---

### Step 4: Define Agent Role & Autonomy Boundary
In the agent's system prompt or project instructions (`AGENTS.md`), specify:
- Its specific functional role (e.g. *Programmer*, *Tester*, *Researcher*).
- Its restricted workspace directory.
- Permitted execution autonomy:
  - **Tier 1 (Read / Test):** Fully automated.
  - **Tier 2 (Edit / Build on feature branch):** Fully automated.
  - **Tier 3 (Commits to main, push, deletion, secrets):** Explicit user approval required.

---

### Step 5: Run 10-Second Smoke Verification
Execute these three quick checks to verify the pipeline:

1. **Transport Check:**
   - Execute tool: `browser_list_tabs({ active_only: true })`.
   - **Expected:** Returns active tab without `EXTENSION_DISCONNECTED` or network errors.
2. **Session Isolation Check:**
   - Execute tool: `browser_read({ tab_id, position: "top", ephemeral: true })`.
   - **Expected:** Content is returned; on the browser window, the inspection frame appears and vanishes immediately.
3. **Relay Protocol Check:**
   - Dispatch test packet:
     ```yaml
     protocol: broant-relay/v1
     direction: local_to_architect
     task_id: "smoke-test-1"
     hop: 1/3
     repo: "TestRepo"
     branch: "smoke-test"
     ```
   - Target an open Gemini / Claude / ChatGPT tab.
   - **Expected:** The Architect replies in valid JSON closed by `<!-- BROANT_DISPATCH_END -->`, properly recognizing the task.
