// src/extension/rail-hub.ts
import { bridgeActivityStore } from '@src/store/bridge-activity';
import { DEFAULT_SETTINGS, bridgeConnectedStorage, settingsStorage } from '@src/store/settings';
import type { BridgeDispatcher } from '@src/bridge/dispatcher';

export function initRailHub(getDispatcher: () => BridgeDispatcher | null) {
  const ports = new Set<chrome.runtime.Port>();

  async function buildSnapshot() {
    const settings = await settingsStorage.get().catch(() => DEFAULT_SETTINGS);
    const connected = await bridgeConnectedStorage.get().catch(() => false);
    const theme = settings.theme === 'light' ? 'light' : 'dark';
    return {
      visible: settings.showMiniRail ?? true,
      theme,
      bridgeEnabled: Boolean(settings.bridgeEnabled),
      bridgeConnected: Boolean(connected),
      pruningMode: settings.domPruningMode ?? 'compact',
      vramLoaded: Boolean(settings.loadedModelName),
      vramLabel: settings.loadedModelName ? `VRAM: ${settings.loadedModelName}` : 'LM Studio: idle',
      activity: bridgeActivityStore.get(),
    };
  }

  async function broadcast() {
    if (ports.size === 0) return;
    const state = await buildSnapshot();
    for (const port of Array.from(ports)) {
      try {
        port.postMessage({ type: 'rail_state', state });
      } catch {
        ports.delete(port);
      }
    }
  }

  if (typeof chrome !== 'undefined' && chrome.runtime?.onConnect) {
    chrome.runtime.onConnect.addListener(port => {
      if (port.name !== 'broant-rail') return;
      ports.add(port);
      void buildSnapshot().then(state => {
        try {
          port.postMessage({ type: 'rail_state', state });
        } catch {
          ports.delete(port);
        }
      });
      port.onDisconnect.addListener(() => {
        ports.delete(port);
      });
    });
  }

  bridgeActivityStore.subscribe(() => {
    void broadcast();
  });

  if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
    chrome.storage.onChanged.addListener((_changes, area) => {
      if (area === 'local' || area === 'session') {
        void broadcast();
      }
    });
  }

  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (msg?.type !== 'broant_rail_action') return false;
      const action = msg.action as string;

      if (action === 'open_sidepanel' || action === 'open_routines') {
        const windowId = sender.tab?.windowId;
        if (windowId !== undefined && chrome.sidePanel?.open) {
          void chrome.sidePanel.open({ windowId }).catch(() => undefined);
        }
        sendResponse({ ok: true });
        return false;
      }

      if (action === 'open_options') {
        void chrome.runtime.openOptionsPage();
        sendResponse({ ok: true });
        return false;
      }

      if (action === 'toggle_mcp') {
        void settingsStorage.set(s => ({ ...s, bridgeEnabled: !s.bridgeEnabled }));
        sendResponse({ ok: true });
        return false;
      }

      if (action === 'toggle_pruning') {
        void settingsStorage.set(s => ({
          ...s,
          domPruningMode: s.domPruningMode === 'compact' ? 'standard' : 'compact',
        }));
        sendResponse({ ok: true });
        return false;
      }

      if (action === 'kill_all') {
        void getDispatcher()?.killAllActivity();
        sendResponse({ ok: true });
        return false;
      }

      return false;
    });
  }
}
