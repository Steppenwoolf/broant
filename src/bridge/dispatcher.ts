import type { BridgeClient } from './client';
import type { BridgeInboundMessage, CallToolRequest, CloseToolSessionRequest } from './types';
import { BridgeToolSessionManager } from './tool-sessions';
import type { RunManager, PanelConnection } from '@src/extension/run-manager';
import type { PanelEvent } from '@src/ui/protocol';

const ALLOWED_BRIDGE_TOOLS = new Set([
  'observe',
  'snapshot',
  'act',
  'click',
  'hover',
  'press',
  'fill',
  'set',
  'fill_form',
  'type',
  'select',
  'scroll',
  'navigate',
  'text',
  'read',
  'wait',
  'tabs',
  'upload',
  'dialog',
  'ask',
  'screenshot',
]);

function isUrlAllowed(rawUrl: string, allowedDomains: string[]): boolean {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return false;
  }
  if (!allowedDomains.length || allowedDomains.includes('*')) {
    return true;
  }
  const host = parsed.hostname.toLowerCase();
  return allowedDomains.some(pattern => {
    const p = pattern.trim().toLowerCase();
    if (!p) return false;
    if (p.startsWith('*.')) {
      const base = p.slice(2);
      return host === base || host.endsWith(`.${base}`);
    }
    return host === p || host.endsWith(`.${p}`);
  });
}

function resolveToolAndArgs(
  toolName: string,
  rawArgs: Record<string, unknown> = {},
): { tool: string; args: Record<string, unknown> } {
  let tool = toolName;
  const args = { ...rawArgs };

  if (tool === 'observe') {
    tool = 'snapshot';
  } else if (tool === 'act') {
    const actAction = (args.action as string | undefined)?.toLowerCase();
    delete args.action;
    if (actAction === 'hover') {
      tool = 'hover';
    } else if (actAction === 'double_click') {
      tool = 'click';
      args.count = 2;
    } else if (actAction === 'press_enter') {
      tool = 'press';
      args.keys = 'Enter';
    } else {
      tool = 'click';
    }
  } else if (tool === 'fill') {
    if (Array.isArray(args.fields)) {
      tool = 'fill_form';
      args.fields = args.fields.map(item => {
        if (!item || typeof item !== 'object') return item;
        const f = { ...(item as Record<string, unknown>) };
        if (typeof f.ref === 'string' && !f.target) {
          f.target = { ref: f.ref };
          delete f.ref;
        }
        return f;
      });
      if (typeof args.submit === 'boolean') {
        delete args.submit;
      }
    } else {
      tool = 'set';
    }
  } else if (tool === 'text') {
    tool = 'read';
  }

  // Normalize target format
  if ((tool === 'click' || tool === 'hover' || tool === 'press') && args.ref && !args.target) {
    args.target = { ref: args.ref };
    delete args.ref;
  }
  if (tool === 'set') {
    if (args.ref && !args.target) {
      args.target = { ref: args.ref };
      delete args.ref;
    }
    if (args.text !== undefined && args.value === undefined) {
      args.value = args.text;
      delete args.text;
    }
  }

  if (tool === 'read' && args.max_chars !== undefined && args.maxChars === undefined) {
    args.maxChars = args.max_chars;
    delete args.max_chars;
  }
  if (tool === 'screenshot' && args.full_page !== undefined && args.fullPage === undefined) {
    args.fullPage = args.full_page;
    delete args.full_page;
  }

  return { tool, args };
}

export class BridgeDispatcher {
  private activeTasks: Map<string, { tabId: number; cancel: () => void }> = new Map();
  private toolSessions = new BridgeToolSessionManager();

  constructor(private client: BridgeClient, private runManager: RunManager) {
    this.client.onMessage(msg => void this.dispatch(msg));
    if (typeof this.client.onDisconnect === 'function') {
      this.client.onDisconnect(() => {
        void this.toolSessions.close();
      });
    }
  }

  getToolSessions(): BridgeToolSessionManager {
    return this.toolSessions;
  }

  async killAllActivity(): Promise<void> {
    for (const task of this.activeTasks.values()) {
      try {
        task.cancel();
      } catch {
        // ignore
      }
    }
    this.activeTasks.clear();
    await this.toolSessions.closeAll();
  }

  async dispatch(msg: BridgeInboundMessage) {
    if (msg.type === 'get_status') {
      let tabs: chrome.tabs.Tab[] = [];
      if (typeof chrome !== 'undefined' && chrome.tabs) {
        if (msg.active_only) {
          const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
          if (activeTab) {
            tabs = [activeTab];
          } else {
            const [fallbackActive] = await chrome.tabs.query({ active: true });
            tabs = fallbackActive ? [fallbackActive] : [];
          }
        } else {
          tabs = await chrome.tabs.query({});
          if (msg.domain) {
            const domainLower = msg.domain.toLowerCase();
            tabs = tabs.filter(t => {
              if (!t.url) return false;
              try {
                return new URL(t.url).hostname.toLowerCase().includes(domainLower);
              } catch {
                return t.url.toLowerCase().includes(domainLower);
              }
            });
          }
          if (msg.query) {
            const q = msg.query.toLowerCase();
            tabs = tabs.filter(
              t => (t.title && t.title.toLowerCase().includes(q)) || (t.url && t.url.toLowerCase().includes(q)),
            );
          }
          tabs.sort(
            (a, b) =>
              ((b as { lastAccessed?: number }).lastAccessed ?? 0) -
              ((a as { lastAccessed?: number }).lastAccessed ?? 0),
          );
          if (msg.limit && msg.limit > 0) {
            tabs = tabs.slice(0, msg.limit);
          }
        }
      }
      this.client.send({
        type: 'status_result',
        request_id: msg.request_id,
        active_tasks: Array.from(this.activeTasks.keys()),
        open_tabs: tabs.map(t => ({
          id: t.id ?? -1,
          url: t.url ?? '',
          title: t.title ?? '',
          active: t.active ?? false,
        })),
      });
      return;
    }

    if (msg.type === 'cancel_task') {
      const task = this.activeTasks.get(msg.task_id);
      if (task) {
        task.cancel();
        this.activeTasks.delete(msg.task_id);
      }
      return;
    }

    if (msg.type === 'call_tool' || (msg as { action?: string }).action === 'call_tool') {
      await this.handleCallTool(msg as CallToolRequest);
      return;
    }

    if (msg.type === 'close_session') {
      await this.handleCloseSession(msg as CloseToolSessionRequest);
      return;
    }

    if (msg.type === 'execute_task' || (msg as { action?: string }).action === 'execute_task') {
      await this.handleExecuteTask(msg as Extract<BridgeInboundMessage, { type: 'execute_task' }>);
    }
  }

  private async resolveTargetTab(target?: {
    mode?: 'active_tab' | 'new_tab' | 'tab_id';
    tab_id?: number;
    url?: string;
  }): Promise<number> {
    if (target?.tab_id) return target.tab_id;
    if (target?.mode === 'new_tab' || target?.url) {
      const newTab = await chrome.tabs.create({ url: 'about:blank' });
      if (newTab.id) return newTab.id;
    }
    const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (activeTab?.id) return activeTab.id;
    const [anyTab] = await chrome.tabs.query({});
    if (anyTab?.id) return anyTab.id;
    const created = await chrome.tabs.create({ url: 'about:blank' });
    if (created.id) return created.id;
    throw new Error('No target tab available in browser');
  }

  private async handleCloseSession(msg: CloseToolSessionRequest) {
    const closed = await this.toolSessions.close(msg.session_id);
    this.client.send({
      type: 'tool_result',
      request_id: msg.request_id,
      session_id: msg.session_id,
      tab_id: -1,
      ok: true,
      data: { closed },
      duration_ms: 0,
    });
  }

  private async handleCallTool(msg: CallToolRequest) {
    const startTime = Date.now();
    const timeoutMs = msg.timeout_ms ?? 30_000;
    const abortController = new AbortController();
    const timer = setTimeout(() => abortController.abort(), timeoutMs);

    const isEphemeral = Boolean(msg.args?.ephemeral);
    let currentSessionId = msg.session_id ?? '';
    let currentTabId = -1;

    try {
      if (!ALLOWED_BRIDGE_TOOLS.has(msg.tool)) {
        clearTimeout(timer);
        this.client.send({
          type: 'tool_result',
          request_id: msg.request_id,
          session_id: currentSessionId,
          tab_id: currentTabId,
          ok: false,
          error: {
            code: 'TOOL_NOT_ALLOWED',
            message: `Tool "${msg.tool}" is not allowed over Agent Bridge`,
          },
          duration_ms: Date.now() - startTime,
        });
        return;
      }

      const allowedDomains = this.client.getAllowedDomains?.() ?? ['*'];
      if (msg.target?.url && !isUrlAllowed(msg.target.url, allowedDomains)) {
        throw Object.assign(new Error(`URL "${msg.target.url}" is blocked by Agent Bridge domain policy`), {
          code: 'URL_NOT_ALLOWED',
        });
      }

      const { tool: resolvedTool, args: resolvedArgs } = resolveToolAndArgs(msg.tool, msg.args);
      if (resolvedTool === 'navigate' && typeof resolvedArgs.url === 'string' && !isUrlAllowed(resolvedArgs.url, allowedDomains)) {
        throw Object.assign(new Error(`Navigation to "${resolvedArgs.url}" is blocked by Agent Bridge domain policy`), {
          code: 'URL_NOT_ALLOWED',
        });
      }

      const managed = await this.toolSessions.acquire(msg.session_id, () =>
        this.resolveTargetTab(msg.target),
      );
      currentSessionId = managed.sessionId;
      currentTabId = managed.tabId;

      if (resolvedTool === 'snapshot' && msg.pruning) {
        resolvedArgs.pruning = msg.pruning;
      }
      delete resolvedArgs.ephemeral;

      const result = await Promise.race([
        this.toolSessions.runExclusive(
          managed,
          s => s.call(resolvedTool, resolvedArgs, { signal: abortController.signal }),
          resolvedTool,
        ),
        new Promise<never>((_, reject) => {
          abortController.signal.addEventListener('abort', () =>
            reject(new Error(`Tool call timed out after ${timeoutMs}ms`)),
          );
        }),
      ]);

      clearTimeout(timer);

      this.client.send({
        type: 'tool_result',
        request_id: msg.request_id,
        session_id: currentSessionId,
        tab_id: currentTabId,
        ok: result.ok,
        data: result.ok ? result : undefined,
        error: !result.ok
          ? {
              code: result.error?.code ?? 'TOOL_ERROR',
              message: result.error?.message ?? 'Tool execution failed',
              retryable: (result.error as { retryable?: boolean } | undefined)?.retryable,
            }
          : undefined,
        duration_ms: Date.now() - startTime,
      });
    } catch (err: unknown) {
      clearTimeout(timer);
      const isTimeout = abortController.signal.aborted;
      const errorObj = err as { code?: string; message?: string; retryable?: boolean };
      this.client.send({
        type: 'tool_result',
        request_id: msg.request_id,
        session_id: currentSessionId,
        tab_id: currentTabId,
        ok: false,
        error: {
          code: isTimeout ? 'TIMEOUT' : errorObj.code ?? 'TOOL_EXECUTION_ERROR',
          message: err instanceof Error ? err.message : String(err),
          retryable: isTimeout ? true : Boolean(errorObj.retryable),
        },
        duration_ms: Date.now() - startTime,
      });
    } finally {
      if (isEphemeral && currentSessionId) {
        void this.toolSessions.close(currentSessionId);
      }
    }
  }

  private async handleExecuteTask(msg: Extract<BridgeInboundMessage, { type: 'execute_task' }>) {
    const { task_id, prompt, target, options } = msg;
    const startTime = Date.now();
    let stepsCount = 0;

    if (target?.url && !isUrlAllowed(target.url, this.client.getAllowedDomains?.() ?? ['*'])) {
      this.client.send({
        type: 'task_result',
        task_id,
        status: 'failed',
        error: `Target URL "${target.url}" is blocked by Agent Bridge domain policy`,
        steps_count: 0,
        duration_ms: Date.now() - startTime,
      });
      return;
    }

    let tabId: number | null = null;
    try {
      tabId = await this.resolveTargetTab(target);
    } catch {
      this.client.send({
        type: 'task_result',
        task_id,
        status: 'failed',
        error: 'No target tab available in browser',
        steps_count: 0,
        duration_ms: Date.now() - startTime,
      });
      return;
    }

    this.client.send({ type: 'task_accepted', task_id, tab_id: tabId });

    let finalOutput = '';
    let isFinished = false;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (timeoutTimer) {
        clearTimeout(timeoutTimer);
        timeoutTimer = null;
      }
      this.activeTasks.delete(task_id);
      this.runManager.connections.delete(connection);
    };

    const connection: PanelConnection = {
      tabId,
      conversationId: null,
      sink: (event: PanelEvent) => {
        if (isFinished) return;

        if (event.type === 'message_update') {
          finalOutput = event.text;
        } else if (event.type === 'turn_start') {
          stepsCount++;
          this.client.send({
            type: 'task_progress',
            task_id,
            step: stepsCount,
            summary: `Starting step ${stepsCount}`,
          });
        } else if (event.type === 'message_end') {
          const entry = event.entry;
          if (entry.kind === 'assistant' && entry.text) {
            finalOutput = entry.text;
          }
        } else if (event.type === 'tool_execution_end') {
          this.client.send({
            type: 'task_progress',
            task_id,
            step: stepsCount,
            tool: event.row.tool,
            summary: `Executed tool: ${event.row.tool}`,
          });
        } else if (event.type === 'run_status') {
          if (event.status === 'done') {
            isFinished = true;
            cleanup();
            this.client.send({
              type: 'task_result',
              task_id,
              status: 'completed',
              output: finalOutput || 'Task completed successfully',
              steps_count: stepsCount,
              duration_ms: Date.now() - startTime,
            });
          } else if (event.status === 'failed' || event.status === 'capped') {
            isFinished = true;
            cleanup();
            this.client.send({
              type: 'task_result',
              task_id,
              status: 'failed',
              output: finalOutput || undefined,
              error: `Task ended with status: ${event.status}`,
              steps_count: stepsCount,
              duration_ms: Date.now() - startTime,
            });
          } else if (event.status === 'stopped' || event.status === 'interrupted') {
            isFinished = true;
            cleanup();
            this.client.send({
              type: 'task_result',
              task_id,
              status: 'cancelled',
              output: finalOutput || 'Task stopped',
              steps_count: stepsCount,
              duration_ms: Date.now() - startTime,
            });
          }
        }
      },
    };

    this.runManager.connections.add(connection);
    const stopUnderlyingRun = () => {
      if (connection.conversationId) {
        void this.runManager.handle(connection, { type: 'stop', conversationId: connection.conversationId }).catch(() => undefined);
      }
    };
    this.activeTasks.set(task_id, {
      tabId,
      cancel: () => {
        if (isFinished) return;
        isFinished = true;
        cleanup();
        stopUnderlyingRun();
      },
    });

    const timeoutMs = options?.timeout_ms;
    if (timeoutMs && timeoutMs > 0) {
      timeoutTimer = setTimeout(() => {
        if (isFinished) return;
        isFinished = true;
        cleanup();
        stopUnderlyingRun();
        this.client.send({
          type: 'task_result',
          task_id,
          status: 'timeout',
          output: finalOutput || undefined,
          error: `Task timed out after ${timeoutMs}ms`,
          steps_count: stepsCount,
          duration_ms: Date.now() - startTime,
        });
      }, timeoutMs);
    }

    try {
      await this.runManager.handle(connection, {
        type: 'send',
        tabId,
        conversationId: null,
        text: prompt,
        attachments: [],
        context: [],
        mode: options?.approval_policy === 'auto_safe' ? 'auto' : 'ask',
        model: null,
        reasoning: 'none',
        startUrl: target?.url,
      });
    } catch (err) {
      if (!isFinished) {
        isFinished = true;
        cleanup();
        this.client.send({
          type: 'task_result',
          task_id,
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
          steps_count: stepsCount,
          duration_ms: Date.now() - startTime,
        });
      }
    }
  }
}
