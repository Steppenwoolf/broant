import type { BridgeClient } from './client';
import type { BridgeInboundMessage, CallToolRequest, CloseToolSessionRequest } from './types';
import { BridgeToolSessionManager } from './tool-sessions';
import type { RunManager, PanelConnection } from '@src/extension/run-manager';
import type { PanelEvent } from '@src/ui/protocol';

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
    if (actAction === 'hover') {
      tool = 'hover';
    } else {
      tool = 'click';
    }
  } else if (tool === 'fill') {
    if (args.fields) {
      tool = 'fill_form';
    } else {
      tool = 'set';
    }
  } else if (tool === 'text') {
    tool = 'read';
  }

  // Normalize target format
  if ((tool === 'click' || tool === 'hover') && args.ref && !args.target) {
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
  }

  getToolSessions(): BridgeToolSessionManager {
    return this.toolSessions;
  }

  async dispatch(msg: BridgeInboundMessage) {
    if (msg.type === 'get_status') {
      const tabs = await (typeof chrome !== 'undefined' && chrome.tabs ? chrome.tabs.query({}) : Promise.resolve([]));
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

    let currentSessionId = msg.session_id ?? '';
    let currentTabId = -1;

    try {
      const managed = await this.toolSessions.acquire(msg.session_id, () =>
        this.resolveTargetTab(msg.target),
      );
      currentSessionId = managed.sessionId;
      currentTabId = managed.tabId;

      const { tool: resolvedTool, args: resolvedArgs } = resolveToolAndArgs(msg.tool, msg.args);
      if (resolvedTool === 'snapshot' && msg.pruning) {
        resolvedArgs.pruning = msg.pruning;
      }

      const result = await Promise.race([
        this.toolSessions.runExclusive(managed, s =>
          s.call(resolvedTool, resolvedArgs, { signal: abortController.signal }),
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
              retryable: result.error?.retryable,
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
    }
  }

  private async handleExecuteTask(msg: Extract<BridgeInboundMessage, { type: 'execute_task' }>) {
    const { task_id, prompt, target } = msg;
    const startTime = Date.now();
    let stepsCount = 0;

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
          if (entry.kind === 'tool') {
            this.client.send({
              type: 'task_progress',
              task_id,
              step: stepsCount,
              tool: entry.tool,
              summary: `Executed tool: ${entry.tool}`,
            });
          }
        } else if (event.type === 'run_status') {
          if (event.status === 'idle' && stepsCount > 0) {
            isFinished = true;
            this.activeTasks.delete(task_id);
            this.runManager.connections.delete(connection);
            this.client.send({
              type: 'task_result',
              task_id,
              status: 'completed',
              output: finalOutput || 'Task completed successfully',
              steps_count: stepsCount,
              duration_ms: Date.now() - startTime,
            });
          } else if (event.status === 'stopped') {
            isFinished = true;
            this.activeTasks.delete(task_id);
            this.runManager.connections.delete(connection);
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
    this.activeTasks.set(task_id, {
      tabId,
      cancel: () => {
        isFinished = true;
        this.runManager.connections.delete(connection);
      },
    });

    try {
      await this.runManager.handle(connection, {
        type: 'send',
        tabId,
        conversationId: null,
        text: prompt,
        attachments: [],
        context: [],
        mode: 'auto',
        model: null,
        reasoning: 'none',
        startUrl: target?.url,
      });
    } catch (err) {
      if (!isFinished) {
        isFinished = true;
        this.runManager.connections.delete(connection);
        this.activeTasks.delete(task_id);
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
