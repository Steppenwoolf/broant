// src/store/bridge-activity.ts
export type BridgeActivityPhase = 'idle' | 'held' | 'executing';
export type ActivitySource = 'mcp' | 'local' | 'both' | 'none';

export interface BridgeActivityState {
  phase: BridgeActivityPhase;
  source: ActivitySource;
  activeSessions: number;
  activeTasks: number;
  activeLocalRuns: number;
  mcpExecuting: boolean;
  currentTool?: string;
  activeTabId?: number;
  updatedAt: number;
}

export const INITIAL_BRIDGE_ACTIVITY: BridgeActivityState = {
  phase: 'idle',
  source: 'none',
  activeSessions: 0,
  activeTasks: 0,
  activeLocalRuns: 0,
  mcpExecuting: false,
  updatedAt: 0,
};

const STORAGE_KEY = 'broant_bridge_activity';
type ActivityListener = (state: BridgeActivityState) => void;

class BridgeActivityStore {
  private state: BridgeActivityState = { ...INITIAL_BRIDGE_ACTIVITY };
  private listeners = new Set<ActivityListener>();

  constructor() {
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      void chrome.storage.session.get([STORAGE_KEY]).then(res => {
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
    const merged: BridgeActivityState = {
      ...this.state,
      ...patch,
      updatedAt: Date.now(),
    };

    const hasLocal = merged.activeLocalRuns > 0;
    const hasMcp = merged.activeSessions > 0 || merged.activeTasks > 0 || merged.mcpExecuting;

    merged.source = hasLocal && hasMcp ? 'both' : hasLocal ? 'local' : hasMcp ? 'mcp' : 'none';

    if (hasLocal || merged.mcpExecuting || merged.activeTasks > 0) {
      merged.phase = 'executing';
    } else if (merged.activeSessions > 0) {
      merged.phase = 'held';
    } else {
      merged.phase = 'idle';
      merged.currentTool = undefined;
      merged.activeTabId = undefined;
    }

    this.state = merged;
    if (typeof chrome !== 'undefined' && chrome.storage?.session) {
      void chrome.storage.session.set({ [STORAGE_KEY]: merged }).catch(() => undefined);
    }

    for (const fn of this.listeners) {
      try {
        fn(merged);
      } catch {
        // ignore
      }
    }
    return merged;
  }

  reset(): BridgeActivityState {
    return this.update({
      phase: 'idle',
      source: 'none',
      activeSessions: 0,
      activeTasks: 0,
      activeLocalRuns: 0,
      mcpExecuting: false,
      currentTool: undefined,
      activeTabId: undefined,
    });
  }
}

export const bridgeActivityStore = new BridgeActivityStore();
