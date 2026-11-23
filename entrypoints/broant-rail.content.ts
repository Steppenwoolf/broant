// entrypoints/broant-rail.content.ts
import { defineContentScript } from 'wxt/utils/define-content-script';
import type { BridgeActivityState } from '@src/store/bridge-activity';

interface RailStateSnapshot {
  visible: boolean;
  opacity?: number;
  sidePanelOpen?: boolean;
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
  opacity: 0.85,
  sidePanelOpen: false,
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

const EMBLEM_SVG = `<svg viewBox="0 0 128 128" width="100%" height="100%" fill="none" aria-hidden="true">
  <image href="data:image/png;base64,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" width="128" height="128" preserveAspectRatio="xMidYMid meet" />
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
  opacity: var(--ba-dock-opacity, 0.85);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  transition: transform 0.18s ease, opacity 0.18s ease;
}
.dock:hover {
  opacity: 1 !important;
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
  display: none !important;
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
  transition: background 0.15s ease, color 0.15s ease, transform 0.15s ease;
}
.btn:hover {
  background: var(--ba-surface);
  color: var(--ba-fg);
}
#ba-open {
  width: 38px;
  height: 38px;
  padding: 0;
  border-radius: 8px;
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
}
#ba-open:hover {
  transform: scale(1.06);
}
#ba-open svg {
  width: 36px;
  height: 36px;
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
      <button class="btn" id="ba-open" data-tip="BroAnt • Click: Panel | DblClick: Tuck">
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
      const shouldHide = !state.visible || Boolean(state.sidePanelOpen);
      dock.classList.toggle('hidden', shouldHide);
      dock.dataset.theme = state.theme;
      dock.style.setProperty('--ba-dock-opacity', String(typeof state.opacity === 'number' ? state.opacity : 0.85));

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

    let clickTimer: number | null = null;
    btnOpen.addEventListener('click', e => {
      e.stopPropagation();
      if (clickTimer !== null) {
        window.clearTimeout(clickTimer);
        clickTimer = null;
        dock.classList.toggle('tucked');
      } else {
        clickTimer = window.setTimeout(() => {
          clickTimer = null;
          sendAction('open_sidepanel');
        }, 240);
      }
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
