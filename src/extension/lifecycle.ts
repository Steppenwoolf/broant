// src/extension/lifecycle.ts
import { bridgeActivityStore } from '@src/store/bridge-activity';

export type BroAntMode = 'off' | 'panel' | 'rail';

export interface LifecycleState {
  mode: BroAntMode;
  anchorTabId: number | null;
  panelWindowId: number | null;
}

export interface LifecycleDeps {
  suspendBridge: () => Promise<void> | void;
  resumeBridgeIfAllowed: () => Promise<void> | void;
  stopAllLocalRuns: () => Promise<void> | void;
  stopAllBridgeActivity: () => Promise<void> | void;
  onStateChange: (state: LifecycleState) => void;
}

const SESSION_KEY = 'broant_lifecycle_state';

export class BroAntLifecycleController {
  private state: LifecycleState = {
    mode: 'off',
    anchorTabId: null,
    panelWindowId: null,
  };
  private panelPorts = new Set<chrome.runtime.Port>();
  private pendingMinimize = false;
  private deps!: LifecycleDeps;

  init(deps: LifecycleDeps): void {
    this.deps = deps;

    // Disable auto-opening panel so clicking toolbar icon works as toggle (ON / OFF)
    if (chrome.sidePanel?.setPanelBehavior) {
      void chrome.sidePanel.setPanelBehavior({
        openPanelOnActionClick: false,
      }).catch(() => undefined);
    }

    // Restore state after Service Worker wake-up (default: 'off')
    if (chrome.storage?.session) {
      void chrome.storage.session.get(SESSION_KEY).then(res => {
        const saved = res?.[SESSION_KEY] as LifecycleState | undefined;
        if (saved && saved.mode !== 'off') {
          this.state = saved;
          this.updateToolbarBadge();
          this.deps.onStateChange(this.state);
        } else {
          // Cold start when BroAnt is off: keep bridge suspended
          void this.deps.suspendBridge();
          this.updateToolbarBadge();
        }
      });
    }

    // Click on BroAnt icon in Opera / Chrome toolbar
    chrome.action.onClicked.addListener(tab => {
      if (this.state.mode === 'off') {
        this.launchOnTabSync(tab);
      } else {
        void this.powerOff('toolbar_toggle');
      }
    });

    // If anchor tab was closed, power off
    chrome.tabs.onRemoved.addListener(tabId => {
      if (this.state.mode === 'rail' && this.state.anchorTabId === tabId) {
        void this.powerOff('anchor_tab_closed');
      }
    });

    // Commands from Side Panel
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg?.type !== 'broant_lifecycle') return false;

      if (msg.command === 'minimize_to_rail') {
        void this.minimizeToRail(msg.tabId ?? sender.tab?.id ?? this.state.anchorTabId).then(() => {
          sendResponse({ ok: true });
        });
        return true; // async response before Side Panel calls window.close()
      }

      if (msg.command === 'power_off') {
        void this.powerOff('panel_close_button').then(() => {
          sendResponse({ ok: true });
        });
        return true;
      }

      return false;
    });
  }

  getState(): LifecycleState {
    return { ...this.state };
  }

  isPoweredOn(): boolean {
    return this.state.mode !== 'off';
  }

  /** Registers live Side Panel port (call in panel-port.ts / onConnect) */
  registerPanelPort(port: chrome.runtime.Port): void {
    this.panelPorts.add(port);
    port.onDisconnect.addListener(() => {
      this.panelPorts.delete(port);
      if (this.panelPorts.size > 0) return;

      // If panel closed via minimize button, stay in rail mode
      if (this.pendingMinimize) {
        this.pendingMinimize = false;
        return;
      }

      // Otherwise (system or internal × clicked) -> full power off
      if (this.state.mode === 'panel') {
        void this.powerOff('panel_disconnected');
      }
    });
  }

  /** Synchronous launch on action click (preserves user gesture for sidePanel.open) */
  private launchOnTabSync(tab: chrome.tabs.Tab): void {
    const windowId = tab.windowId;
    const tabId = typeof tab.id === 'number' && tab.id >= 0 ? tab.id : null;

    if (windowId !== undefined && chrome.sidePanel?.open) {
      void chrome.sidePanel.open({ windowId }).catch(err => {
        console.warn('[broant] sidePanel.open failed:', err);
      });
    }

    this.pendingMinimize = false;
    this.setState({
      mode: 'panel',
      anchorTabId: tabId,
      panelWindowId: windowId ?? null,
    });
    void this.deps.resumeBridgeIfAllowed();
  }

  /** Expand full panel on click on mini-rail emblem (synchronous user gesture) */
  expandFromRailSync(tab?: chrome.tabs.Tab): void {
    const windowId = tab?.windowId ?? this.state.panelWindowId ?? undefined;
    if (windowId !== undefined && chrome.sidePanel?.open) {
      void chrome.sidePanel.open({ windowId }).catch(() => undefined);
    }
    this.pendingMinimize = false;
    this.setState({
      mode: 'panel',
      anchorTabId: tab?.id ?? this.state.anchorTabId,
      panelWindowId: windowId ?? null,
    });
  }

  /** Explicitly minimize to Mini-Rail ONLY on one tab */
  async minimizeToRail(preferredTabId?: number | null): Promise<void> {
    let targetTabId = preferredTabId ?? this.state.anchorTabId;
    if (!targetTabId) {
      const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
      targetTabId = activeTab?.id ?? null;
    }
    this.pendingMinimize = true;
    this.setState({
      mode: 'rail',
      anchorTabId: targetTabId,
      panelWindowId: this.state.panelWindowId,
    });
  }

  /** Complete power off: close UI, stop all agents, disconnect MCP bridge */
  async powerOff(_reason: string): Promise<void> {
    this.pendingMinimize = false;

    // 1. Tell open Side Panel windows to close
    for (const port of this.panelPorts) {
      try {
        port.postMessage({ type: 'broant_force_close' });
      } catch {
        // ignore
      }
    }

    // 2. Set mode to OFF and hide Mini-Rail from all tabs
    this.setState({
      mode: 'off',
      anchorTabId: null,
      panelWindowId: null,
    });

    // 3. Stop all local and MCP runs, remove frames, disconnect WebSocket and keepalive
    await Promise.allSettled([
      Promise.resolve(this.deps.stopAllLocalRuns()),
      Promise.resolve(this.deps.stopAllBridgeActivity()),
      Promise.resolve(this.deps.suspendBridge()),
    ]);
    bridgeActivityStore.reset();
  }

  private setState(next: LifecycleState): void {
    this.state = next;
    if (chrome.storage?.session) {
      void chrome.storage.session.set({ [SESSION_KEY]: next }).catch(() => undefined);
    }
    this.updateToolbarBadge();
    this.deps.onStateChange(next);
  }

  private updateToolbarBadge(): void {
    if (!chrome.action?.setBadgeText) return;
    if (this.state.mode === 'off') {
      void chrome.action.setBadgeText({ text: '' });
      return;
    }
    void chrome.action.setBadgeText({
      text: this.state.mode === 'rail' ? 'RAIL' : 'ON',
    });
    void chrome.action.setBadgeBackgroundColor({
      color: this.state.mode === 'rail' ? '#D97706' : '#C85A32',
    });
  }
}

export const broantLifecycle = new BroAntLifecycleController();
