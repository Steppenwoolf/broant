// Sticky Tool Sessions for Direct Tool RPC via Agent Bridge.
// Keeps Controller sessions alive across sequential calls (observe -> act -> fill),
// preserving element refs and CDP attachment without reconnect overhead.

import type { Capability, Controller, Session, UrlPolicy } from '@src/browser-control';
import { bridgeActivityStore } from '@src/store/bridge-activity';
import { settingsStorage, siteRulesStorage } from '@src/store/settings';

export interface ManagedToolSession {
  sessionId: string;
  tabId: number;
  session: Session;
  lastUsedAt: number;
  busy: boolean;
}

const DEFAULT_IDLE_TTL_MS = 60 * 1000; // 1 minute (auto-release sticky lock after inactivity)

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
    this.gcTimer = setInterval(() => void this.evictExpired(), 10_000);
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

  private async resolveCapabilities(): Promise<Capability[]> {
    const caps: Capability[] = [];
    try {
      const settings = await settingsStorage.get();
      if (settings.bridgeAllowFileUploads) {
        caps.push('files');
      }
    } catch {
      // Ignore storage errors in isolated unit test environments
    }
    return caps;
  }

  private async resolveUrlPolicy(): Promise<UrlPolicy> {
    try {
      const rules = await siteRulesStorage.get();
      const blocked = Object.entries(rules)
        .filter(([, entry]) => entry.rule === 'block')
        .map(([site]) => site);
      return { allow: [], deny: [], blocked };
    } catch {
      return { allow: [], deny: [], blocked: [] };
    }
  }

  async acquire(
    sessionId: string | undefined,
    resolveTabId: () => Promise<number>,
  ): Promise<ManagedToolSession> {
    const [capabilities, urlPolicy] = await Promise.all([this.resolveCapabilities(), this.resolveUrlPolicy()]);

    if (sessionId && this.sessions.has(sessionId)) {
      const existing = this.sessions.get(sessionId)!;
      existing.session.setCapabilities(capabilities);
      existing.lastUsedAt = Date.now();
      return existing;
    }

    const tabId = await resolveTabId();
    const existingSid = this.tabToSession.get(tabId);
    if (existingSid && this.sessions.has(existingSid)) {
      const existing = this.sessions.get(existingSid)!;
      existing.session.setCapabilities(capabilities);
      existing.lastUsedAt = Date.now();
      return existing;
    }

    const controller = await this.getController();
    const allowFileUploads = capabilities.includes('files');
    const session = controller.createSession({
      capabilities,
      urlPolicy,
      confirm: 'sensitive',
      decideWrite: async question => {
        if (question.category === 'submit') {
          return { decision: 'run', by: 'auto', canRemember: false };
        }
        if (question.category === 'upload' && allowFileUploads) {
          return { decision: 'run', by: 'auto', canRemember: false };
        }
        return { decision: 'ask', canRemember: false };
      },
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

    bridgeActivityStore.update({
      phase: 'held',
      activeSessions: this.sessions.size,
      activeTabId: tabId,
    });

    if (typeof chrome !== 'undefined' && typeof chrome.scripting?.executeScript === 'function') {
      void import('@src/extension/border').then(({ injectBorder }) => {
        void injectBorder(tabId, 'on').catch(() => undefined);
      }).catch(() => undefined);
    }

    return managed;
  }

  async runExclusive<T>(
    managed: ManagedToolSession,
    fn: (session: Session) => Promise<T>,
    toolName?: string,
  ): Promise<T> {
    if (managed.busy) {
      const err = new Error('Tab session is busy with another tool call');
      Object.assign(err, { code: 'TAB_BUSY', retryable: true });
      throw err;
    }

    managed.busy = true;
    managed.lastUsedAt = Date.now();
    bridgeActivityStore.update({
      phase: 'executing',
      currentTool: toolName,
      activeTabId: managed.tabId,
      activeSessions: this.sessions.size,
    });
    try {
      return await fn(managed.session);
    } finally {
      managed.busy = false;
      managed.lastUsedAt = Date.now();
      bridgeActivityStore.update({
        phase: this.sessions.size > 0 ? 'held' : 'idle',
        currentTool: undefined,
        activeTabId: managed.tabId,
        activeSessions: this.sessions.size,
      });
    }
  }

  async closeAll(): Promise<boolean> {
    const res = await this.close();
    bridgeActivityStore.reset();
    return res;
  }

  async close(sessionId?: string): Promise<boolean> {
    if (!sessionId) {
      const all = Array.from(this.sessions.keys());
      if (!all.length) return false;
      let closedAny = false;
      for (const sid of all) {
        if (await this.close(sid)) closedAny = true;
      }
      return closedAny;
    }
    const entry = this.sessions.get(sessionId);
    if (!entry) return false;
    this.sessions.delete(sessionId);
    this.tabToSession.delete(entry.tabId);
    bridgeActivityStore.update({
      activeSessions: this.sessions.size,
      phase: this.sessions.size > 0 ? 'held' : 'idle',
    });

    if (typeof chrome !== 'undefined' && typeof chrome.scripting?.executeScript === 'function') {
      void import('@src/extension/border').then(({ injectBorder }) => {
        void injectBorder(entry.tabId, 'off').catch(() => undefined);
      }).catch(() => undefined);
    }

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
