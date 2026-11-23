// src/extension/rail-hub.ts
import { bridgeActivityStore } from '@src/store/bridge-activity';
import { DEFAULT_SETTINGS, bridgeConnectedStorage, settingsStorage } from '@src/store/settings';
import type { BridgeDispatcher } from '@src/bridge/dispatcher';
import { broantLifecycle } from './lifecycle';

export interface RailHubDeps {
  getDispatcher: () => BridgeDispatcher | null;
  stopAllLocalRuns: () => Promise<void> | void;
}

async function isNormalBrowserTab(sender?: chrome.runtime.MessageSender): Promise<boolean> {
  const tab = sender?.tab;
  if (!tab || typeof tab.id !== 'number' || tab.id < 0) return false;
  if (typeof tab.windowId !== 'number' || tab.windowId < 0) return false;

  try {
    const [realTab, win] = await Promise.all([
      chrome.tabs.get(tab.id),
      chrome.windows.get(tab.windowId),
    ]);
    if (!realTab || !win || win.type !== 'normal') return false;
    const windowTabs = await chrome.tabs.query({ windowId: win.id });
    return windowTabs.some(t => t.id === realTab.id);
  } catch {
    return false;
  }
}

export function initRailHub(deps: RailHubDeps): { broadcast: () => Promise<void> } {
  // Store tabId -> Set<Port> to show Mini-Rail EXCLUSIVELY on anchorTabId
  const ports = new Map<chrome.runtime.Port, number>();

  async function buildBaseSnapshot() {
    const settings = await settingsStorage.get().catch(() => DEFAULT_SETTINGS);
    const connected = await bridgeConnectedStorage.get().catch(() => false);
    const theme = settings.theme === 'light' ? 'light' : 'dark';
    return {
      theme,
      bridgeEnabled: Boolean(settings.bridgeEnabled),
      bridgeConnected: Boolean(connected),
      pruningMode: (settings as { domPruningMode?: 'compact' | 'standard' }).domPruningMode ?? 'compact',
      vramLoaded: Boolean((settings as { loadedModelName?: string }).loadedModelName),
      vramLabel: (settings as { loadedModelName?: string }).loadedModelName
        ? `VRAM: ${(settings as { loadedModelName?: string }).loadedModelName}`
        : 'LM Studio: idle',
      topPx: (settings as { miniRailTopPx?: number }).miniRailTopPx ?? 14,
      activity: bridgeActivityStore.get(),
    };
  }

  async function pushToPort(port: chrome.runtime.Port, tabId: number) {
    const lc = broantLifecycle.getState();
    const visible = lc.mode === 'rail' && lc.anchorTabId === tabId;
    const base = await buildBaseSnapshot();
    try {
      port.postMessage({ type: 'rail_state', state: { ...base, visible } });
    } catch {
      ports.delete(port);
    }
  }

  async function broadcast() {
    if (ports.size === 0) return;
    const lc = broantLifecycle.getState();
    const base = await buildBaseSnapshot();
    for (const [port, tabId] of ports.entries()) {
      const visible = lc.mode === 'rail' && lc.anchorTabId === tabId;
      try {
        port.postMessage({ type: 'rail_state', state: { ...base, visible } });
      } catch {
        ports.delete(port);
      }
    }
  }

  if (typeof chrome !== 'undefined' && chrome.runtime?.onConnect) {
    chrome.runtime.onConnect.addListener(port => {
      if (port.name !== 'broant-rail') return;
      void isNormalBrowserTab(port.sender).then(eligible => {
        if (!eligible || typeof port.sender?.tab?.id !== 'number') {
          try {
            port.postMessage({ type: 'rail_unmount' });
          } catch {
            // ignore
          }
          port.disconnect();
          return;
        }
        const tabId = port.sender.tab.id;
        ports.set(port, tabId);
        void pushToPort(port, tabId);
        port.onDisconnect.addListener(() => {
          ports.delete(port);
        });
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
        broantLifecycle.expandFromRailSync(sender.tab);
        sendResponse({ ok: true });
        return false;
      }

      if (action === 'power_off') {
        void broantLifecycle.powerOff('rail_close_button');
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
          domPruningMode:
            (s as { domPruningMode?: string }).domPruningMode === 'compact' ? 'standard' : 'compact',
        }));
        sendResponse({ ok: true });
        return false;
      }

      if (action === 'save_rail_top' && typeof msg.topPx === 'number') {
        const clamped = Math.max(8, Math.min(Math.round(msg.topPx), 900));
        void settingsStorage.set(s => ({ ...s, miniRailTopPx: clamped }));
        sendResponse({ ok: true });
        return false;
      }

      if (action === 'kill_all') {
        void Promise.allSettled([
          Promise.resolve(deps.stopAllLocalRuns()),
          Promise.resolve(deps.getDispatcher()?.killAllActivity()),
        ]).then(() => {
          bridgeActivityStore.reset();
        });
        sendResponse({ ok: true });
        return false;
      }

      return false;
    });
  }

  return { broadcast };
}
