// entrypoints/broant-rail.content.ts
import { defineContentScript } from 'wxt/utils/define-content-script';
import type { BridgeActivityState } from '@src/store/bridge-activity';

interface RailStateSnapshot {
  visible: boolean;
  theme: 'dark' | 'light';
  bridgeEnabled: boolean;
  bridgeConnected: boolean;
  pruningMode: 'compact' | 'standard';
  vramLoaded: boolean;
  vramLabel: string;
  activity: BridgeActivityState;
}

const DEFAULT_STATE: RailStateSnapshot = {
  visible: true,
  theme: 'dark',
  bridgeEnabled: false,
  bridgeConnected: false,
  pruningMode: 'compact',
  vramLoaded: false,
  vramLabel: 'LM Studio: idle',
  activity: {
    phase: 'idle',
    activeSessions: 0,
    activeTasks: 0,
    updatedAt: 0,
  },
};

const EMBLEM_SVG = `<svg viewBox="0 0 64 64" width="26" height="26" fill="none" aria-hidden="true">
  <polygon points="10,14 23,21 32,7 41,21 54,14 54,48 41,48 32,58 23,48 10,48" stroke="var(--ba-accent)" stroke-width="2.4" stroke-linejoin="miter"/>
  <ellipse cx="32" cy="34" rx="18" ry="8" transform="rotate(-32 32 34)" stroke="var(--ba-honey)" stroke-width="1.6" opacity="0.9"/>
  <ellipse cx="32" cy="34" rx="18" ry="8" transform="rotate(32 32 34)" stroke="var(--ba-orbit-alt)" stroke-width="1.6"/>
  <circle cx="32" cy="24" r="4" fill="var(--ba-honey)"/>
  <ellipse cx="32" cy="32" rx="3.2" ry="4.5" fill="var(--ba-accent)"/>
  <ellipse cx="32" cy="42" rx="4.2" ry="6" fill="var(--ba-honey)"/>
  <path d="M29 21 L25 16 M35 21 L39 16 M28 30 L22 28 M36 30 L42 28 M28 36 L22 40 M36 36 L42 40" stroke="var(--ba-accent)" stroke-width="1.8" stroke-linecap="round"/>
</svg>`;

const CHIP_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
  <rect x="6" y="6" width="12" height="12" rx="2"/>
  <rect x="9" y="9" width="6" height="6" rx="0.5"/>
  <path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>
</svg>`;

const BOLT_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
  <path d="M13 2L4.5 13.5h6L9.5 22 19.5 10.5h-6L13 2z"/>
</svg>`;

const GEAR_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="12" cy="12" r="3"/>
  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.08a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.08a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
</svg>`;

const RAIL_CSS = `
:host {
  all: initial;
  position: fixed;
  top: 14px;
  right: 16px;
  z-index: 2147483646;
  font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  user-select: none;
}
.dock {
  --ba-bg: #14110F;
  --ba-surface: #1E1916;
  --ba-border: #332B26;
  --ba-fg: #F5EFE6;
  --ba-muted: #8C7D72;
  --ba-accent: #C85A32;
  --ba-accent-bright: #E07A5F;
  --ba-honey: #D97706;
  --ba-orbit-alt: #F5EFE6;
  --ba-blue: #3B82F6;
  --ba-danger: #EF4444;
  --ba-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  --ba-radius: 12px;

  width: 44px;
  padding: 7px 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  background: var(--ba-bg);
  color: var(--ba-fg);
  border: 1px solid var(--ba-border);
  border-radius: var(--ba-radius);
  box-shadow: var(--ba-shadow);
  transition: transform 0.18s ease, opacity 0.18s ease;
}
.dock[data-theme="light"] {
  --ba-bg: #F3ECE1;
  --ba-surface: #E7DCCB;
  --ba-border: #3F2220;
  --ba-fg: #2A1215;
  --ba-muted: #7C655D;
  --ba-accent: #B44324;
  --ba-accent-bright: #C85A32;
  --ba-honey: #D49B2A;
  --ba-orbit-alt: #4A151B;
  --ba-blue: #2B4C7E;
  --ba-danger: #B91C1C;
  --ba-shadow: 0 4px 14px rgba(74, 21, 27, 0.16);
  --ba-radius: 10px;
}
.dock.hidden {
  display: none;
}
.dock.tucked {
  position: fixed;
  top: 24px;
  right: 0;
  width: 10px;
  height: 52px;
  padding: 0;
  border-radius: 8px 0 0 8px;
  border-right: none;
  cursor: pointer;
  justify-content: center;
  gap: 4px;
}
.dock.tucked > :not(.tuck-dot) {
  display: none;
}
.tuck-dot {
  display: none;
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--ba-muted);
}
.dock.tucked .tuck-dot {
  display: block;
}
.btn {
  position: relative;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--ba-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  transition: background 0.15s ease, color 0.15s ease;
}
.btn:hover {
  background: var(--ba-surface);
  color: var(--ba-fg);
}
.divider {
  width: 24px;
  height: 1px;
  background: var(--ba-border);
  margin: 1px 0;
}
/* LED 1: MCP Gate */
.led {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  transition: background 0.2s ease, box-shadow 0.2s ease, transform 0.15s ease;
}
.led-mcp[data-state="off"] {
  background: var(--ba-muted);
  opacity: 0.45;
}
.led-mcp[data-state="armed"] {
  background: var(--ba-honey);
  box-shadow: 0 0 8px rgba(217, 119, 6, 0.7);
}
.led-mcp[data-state="linked"] {
  background: var(--ba-blue);
  box-shadow: 0 0 9px rgba(59, 130, 246, 0.85);
}
/* LED 2: Agent Activity + Kill-Switch */
.led-act[data-state="idle"] {
  background: transparent;
  border: 2px solid var(--ba-muted);
  opacity: 0.45;
  box-sizing: border-box;
}
.led-act[data-state="held"] {
  background: var(--ba-accent);
  box-shadow: 0 0 8px var(--ba-accent);
  animation: ba-breathe 2s ease-in-out infinite;
}
.led-act[data-state="executing"] {
  background: var(--ba-accent-bright);
  box-shadow: 0 0 12px var(--ba-honey);
  animation: ba-blink 0.35s steps(2, start) infinite;
}
.btn-act[data-active="true"]:hover .led-act {
  animation: none;
  background: var(--ba-danger);
  border-radius: 3px;
  box-shadow: 0 0 10px var(--ba-danger);
  transform: scale(1.05);
}
/* Compact DOM Pill */
.pill-c {
  font-size: 11px;
  font-weight: 700;
  font-family: ui-monospace, "JetBrains Mono", monospace;
  width: 22px;
  height: 22px;
  border-radius: 5px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--ba-surface);
  color: var(--ba-fg);
  border: 1px solid var(--ba-border);
}
.pill-c[data-mode="compact"] {
  border-color: var(--ba-accent);
  color: var(--ba-accent-bright);
}
/* VRAM chip */
.btn-vram[data-loaded="true"] {
  color: var(--ba-honey);
  filter: drop-shadow(0 0 5px rgba(217, 119, 6, 0.55));
}
/* Tooltip popping strictly to the LEFT */
.btn::after {
  content: attr(data-tip);
  position: absolute;
  right: calc(100% + 10px);
  top: 50%;
  transform: translateY(-50%) translateX(4px);
  padding: 5px 9px;
  border-radius: 6px;
  background: var(--ba-bg);
  color: var(--ba-fg);
  border: 1px solid var(--ba-border);
  box-shadow: var(--ba-shadow);
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.14s ease, transform 0.14s ease;
}
.btn:hover::after,
.btn-act[data-executing="true"]::after {
  opacity: 1;
  transform: translateY(-50%) translateX(0);
}
@keyframes ba-breathe {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.45; transform: scale(0.9); }
}
@keyframes ba-blink {
  0% { background: #E07A5F; box-shadow: 0 0 12px #F59E0B; }
  50% { background: #F59E0B; box-shadow: 0 0 4px #C85A32; }
}
`;

export default defineContentScript({
  matches: ['http://*/*', 'https://*/*'],
  runAt: 'document_idle',
  main() {
    if (window.top !== window) return; // do not mount in iframes
    if (document.getElementById('broant-mini-rail-host')) return;

    const host = document.createElement('div');
    host.id = 'broant-mini-rail-host';
    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = RAIL_CSS;

    const dock = document.createElement('div');
    dock.className = 'dock';
    dock.dataset.theme = 'dark';
    dock.innerHTML = `
      <span class="tuck-dot" id="ba-tuck-mcp"></span>
      <span class="tuck-dot" id="ba-tuck-act"></span>
      <button class="btn" id="ba-open" data-tip="BroAnt • Click: Panel | DblClick: Hide">
        ${EMBLEM_SVG}
      </button>
      <button class="btn" id="ba-mcp" data-tip="MCP Gate: OFF">
        <span class="led led-mcp" data-state="off"></span>
      </button>
      <button class="btn btn-act" id="ba-act" data-active="false" data-executing="false" data-tip="Agent: Idle">
        <span class="led led-act" data-state="idle"></span>
      </button>
      <div class="divider"></div>
      <button class="btn" id="ba-dom" data-tip="DOM Pruning: Compact (14k)">
        <span class="pill-c" data-mode="compact">C</span>
      </button>
      <button class="btn btn-vram" id="ba-vram" data-loaded="false" data-tip="LM Studio: idle">
        ${CHIP_SVG}
      </button>
      <button class="btn" id="ba-routines" data-tip="Routines & Quick Tasks">
        ${BOLT_SVG}
      </button>
      <button class="btn" id="ba-settings" data-tip="BroAnt Settings">
        ${GEAR_SVG}
      </button>
    `;

    shadow.append(style, dock);
    document.documentElement.appendChild(host);

    const btnOpen = shadow.getElementById('ba-open') as HTMLElement;
    const btnMcp = shadow.getElementById('ba-mcp') as HTMLElement;
    const ledMcp = btnMcp.querySelector('.led-mcp') as HTMLElement;
    const btnAct = shadow.getElementById('ba-act') as HTMLElement;
    const ledAct = btnAct.querySelector('.led-act') as HTMLElement;
    const btnDom = shadow.getElementById('ba-dom') as HTMLElement;
    const pillDom = btnDom.querySelector('.pill-c') as HTMLElement;
    const btnVram = shadow.getElementById('ba-vram') as HTMLElement;
    const btnRoutines = shadow.getElementById('ba-routines') as HTMLElement;
    const btnSettings = shadow.getElementById('ba-settings') as HTMLElement;
    const tuckMcp = shadow.getElementById('ba-tuck-mcp') as HTMLElement;
    const tuckAct = shadow.getElementById('ba-tuck-act') as HTMLElement;

    let currentState: RailStateSnapshot = { ...DEFAULT_STATE };

    function render(state: RailStateSnapshot) {
      currentState = state;
      dock.classList.toggle('hidden', !state.visible);
      dock.dataset.theme = state.theme;

      // LED 1: MCP Gate
      const mcpState = !state.bridgeEnabled
        ? 'off'
        : state.bridgeConnected
          ? 'linked'
          : 'armed';
      ledMcp.dataset.state = mcpState;
      btnMcp.dataset.tip =
        mcpState === 'linked'
          ? 'MCP Gate: Linked (Click to disable)'
          : mcpState === 'armed'
            ? 'MCP Gate: Armed / Waiting for client'
            : 'MCP Gate: OFF (Click to enable)';
      tuckMcp.style.background =
        mcpState === 'linked'
          ? 'var(--ba-blue)'
          : mcpState === 'armed'
            ? 'var(--ba-honey)'
            : 'var(--ba-muted)';

      // LED 2: Agent Activity
      const phase = state.activity.phase;
      const isActive = phase !== 'idle';
      ledAct.dataset.state = phase;
      btnAct.dataset.active = String(isActive);
      btnAct.dataset.executing = String(phase === 'executing');
      btnAct.dataset.tip =
        phase === 'executing'
          ? `MCP: ${state.activity.currentTool ?? 'running'} • Click to Stop`
          : phase === 'held'
            ? `Session held (${state.activity.activeSessions}) • Click to Detach`
            : 'Agent Activity: Idle';
      tuckAct.style.background = isActive ? 'var(--ba-accent-bright)' : 'transparent';

      // Compact DOM
      pillDom.dataset.mode = state.pruningMode;
      pillDom.textContent = state.pruningMode === 'compact' ? 'C' : 'F';
      btnDom.dataset.tip =
        state.pruningMode === 'compact' ? 'DOM Pruning: Compact (14k)' : 'DOM Pruning: Full';

      // VRAM Loaded
      btnVram.dataset.loaded = String(state.vramLoaded);
      btnVram.dataset.tip = state.vramLabel;
    }

    const sendAction = (action: string) => {
      chrome.runtime.sendMessage({ type: 'broant_rail_action', action }).catch(() => undefined);
    };

    dock.addEventListener('click', e => {
      if (dock.classList.contains('tucked')) {
        dock.classList.remove('tucked');
        e.stopPropagation();
      }
    });

    btnOpen.addEventListener('click', () => sendAction('open_sidepanel'));
    btnOpen.addEventListener('dblclick', e => {
      e.stopPropagation();
      dock.classList.add('tucked');
    });

    btnMcp.addEventListener('click', () => sendAction('toggle_mcp'));

    btnAct.addEventListener('click', () => {
      if (currentState.activity.phase !== 'idle') {
        sendAction('kill_all');
      }
    });

    btnDom.addEventListener('click', () => sendAction('toggle_pruning'));
    btnRoutines.addEventListener('click', () => sendAction('open_routines'));
    btnSettings.addEventListener('click', () => sendAction('open_options'));

    // Port connection for real-time state broadcast
    let port: chrome.runtime.Port | null = null;
    function connectPort() {
      try {
        port = chrome.runtime.connect({ name: 'broant-rail' });
        port.onMessage.addListener((msg: { type: string; state?: RailStateSnapshot }) => {
          if (msg.type === 'rail_state' && msg.state) {
            render(msg.state);
          }
        });
        port.onDisconnect.addListener(() => {
          port = null;
          setTimeout(connectPort, 3000);
        });
      } catch {
        // Extension context invalidated
      }
    }
    connectPort();
  },
});
