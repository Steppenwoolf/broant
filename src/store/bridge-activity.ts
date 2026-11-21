// src/store/bridge-activity.ts
// Live bridge activity state store in chrome.storage.session (RAM-backed, zero disk wear).

export type BridgeActivityPhase = 'idle' | 'held' | 'executing';

export interface BridgeActivityState {
  phase: BridgeActivityPhase;
  activeSessions: number;
  activeTasks: number;
  currentTool?: string;
  activeTabId?: number;
  updatedAt: number;
}

export const INITIAL_BRIDGE_ACTIVITY: BridgeActivityState = {
  phase: 'idle',
  activeSessions: 0,
  activeTasks: 0,
  updatedAt: 0,
};

const STORAGE_KEY = 'broant_bridge_activity';
type ActivityListener = (state: BridgeActivityState) => void;

class BridgeActivityStore {
  private state: BridgeActivityState = { ...INITIAL_BRIDGE_ACTIVITY };
  private listeners = new Set<ActivityListener>();

  constructor() {
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      chrome.storage.session.get([STORAGE_KEY]).then(res => {
        if (res && res[STORAGE_KEY]) {
          this.state = { ...this.state, ...res[STORAGE_KEY] };
        }
      }).catch(() => undefined);
    }
  }

  get(): BridgeActivityState {
    return this.state;
  }

  subscribe(fn: ActivityListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  update(patch: Partial<BridgeActivityState>): BridgeActivityState {
    const next: BridgeActivityState = {
      ...this.state,
      ...patch,
      updatedAt: Date.now(),
    };
    if (next.activeSessions <= 0 && next.activeTasks <= 0) {
      next.phase = 'idle';
      next.currentTool = undefined;
      next.activeTabId = undefined;
    }
    this.state = next;
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      void chrome.storage.session.set({ [STORAGE_KEY]: next }).catch(() => undefined);
    }
    for (const fn of this.listeners) {
      try {
        fn(next);
      } catch {
        // ignore listener errors
      }
    }
    return next;
  }

  reset(): BridgeActivityState {
    return this.update({
      phase: 'idle',
      activeSessions: 0,
      activeTasks: 0,
      currentTool: undefined,
      activeTabId: undefined,
    });
  }
}

export const bridgeActivityStore = new BridgeActivityStore();
