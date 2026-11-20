// Sticky Tool Sessions for Direct Tool RPC via Agent Bridge.
// Keeps Controller sessions alive across sequential calls (observe -> act -> fill),
// preserving element refs and CDP attachment without reconnect overhead.

import type { Controller, Session } from '@src/browser-control';

export interface ManagedToolSession {
  sessionId: string;
  tabId: number;
  session: Session;
  lastUsedAt: number;
  busy: boolean;
}

const DEFAULT_IDLE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export class BridgeToolSessionManager {
  private sessions = new Map<string, ManagedToolSession>();
  private tabToSession = new Map<number, string>();
  private gcTimer?: ReturnType<typeof setInterval>;
  private controller: Controller | null = null;

  constructor(
    private readonly idleTtlMs = DEFAULT_IDLE_TTL_MS,
    private readonly controllerProvider?: () => Promise<Controller>,
  ) {
    if (typeof chrome !== 'undefined' && chrome.tabs?.onRemoved) {
      chrome.tabs.onRemoved.addListener(tabId => {
        const sid = this.tabToSession.get(tabId);
        if (sid) void this.close(sid);
      });
    }
    this.gcTimer = setInterval(() => void this.evictExpired(), 60_000);
  }

  private async getController(): Promise<Controller> {
    if (!this.controller) {
      if (this.controllerProvider) {
        this.controller = await this.controllerProvider();
      } else {
        const { controllerReady } = await import('@src/extension/layer');
        this.controller = await controllerReady;
      }
    }
    return this.controller;
  }

  async acquire(
    sessionId: string | undefined,
    resolveTabId: () => Promise<number>,
  ): Promise<ManagedToolSession> {
    if (sessionId && this.sessions.has(sessionId)) {
      const existing = this.sessions.get(sessionId)!;
      existing.lastUsedAt = Date.now();
      return existing;
    }

    const tabId = await resolveTabId();
    const existingSid = this.tabToSession.get(tabId);
    if (existingSid && this.sessions.has(existingSid)) {
      const existing = this.sessions.get(existingSid)!;
      existing.lastUsedAt = Date.now();
      return existing;
    }

    const controller = await this.getController();
    const session = controller.createSession({
      capabilities: ['core', 'tabs', 'files'],
      confirm: 'never',
    });
    session.shareTab(tabId);

    const managed: ManagedToolSession = {
      sessionId: session.id,
      tabId,
      session,
      lastUsedAt: Date.now(),
      busy: false,
    };

    this.sessions.set(session.id, managed);
    this.tabToSession.set(tabId, session.id);
    return managed;
  }

  async runExclusive<T>(
    managed: ManagedToolSession,
    fn: (session: Session) => Promise<T>,
  ): Promise<T> {
    if (managed.busy) {
      const err = new Error('Tab session is busy with another tool call');
      Object.assign(err, { code: 'TAB_BUSY', retryable: true });
      throw err;
    }

    managed.busy = true;
    managed.lastUsedAt = Date.now();
    try {
      return await fn(managed.session);
    } finally {
      managed.busy = false;
      managed.lastUsedAt = Date.now();
    }
  }

  async close(sessionId: string): Promise<boolean> {
    const entry = this.sessions.get(sessionId);
    if (!entry) return false;
    this.sessions.delete(sessionId);
    this.tabToSession.delete(entry.tabId);

    try {
      const controller = await this.getController();
      await controller.closeSession(entry.session);
    } catch {
      // Ignore cleanup error if already closed
    }
    return true;
  }

  private async evictExpired(): Promise<void> {
    const now = Date.now();
    for (const [sid, entry] of this.sessions.entries()) {
      if (!entry.busy && now - entry.lastUsedAt > this.idleTtlMs) {
        await this.close(sid);
      }
    }
  }

  dispose() {
    if (this.gcTimer) {
      clearInterval(this.gcTimer);
      this.gcTimer = undefined;
    }
    for (const sid of Array.from(this.sessions.keys())) {
      void this.close(sid);
    }
  }
}
