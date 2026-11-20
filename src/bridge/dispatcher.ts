import type { BridgeClient } from './client';
import type { BridgeInboundMessage } from './types';
import type { RunManager, PanelConnection } from '@src/extension/run-manager';
import type { PanelEvent } from '@src/ui/protocol';

export class BridgeDispatcher {
  private activeTasks: Map<string, { tabId: number; cancel: () => void }> = new Map();

  constructor(private client: BridgeClient, private runManager: RunManager) {
    this.client.onMessage(msg => void this.dispatch(msg));
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

    if (msg.type === 'execute_task' || (msg as { action?: string }).action === 'execute_task') {
      await this.handleExecuteTask(msg as Extract<BridgeInboundMessage, { type: 'execute_task' }>);
    }
  }

  private async handleExecuteTask(msg: Extract<BridgeInboundMessage, { type: 'execute_task' }>) {
    const { task_id, prompt, target } = msg;
    const startTime = Date.now();
    let stepsCount = 0;

    // Resolve target tab
    let tabId: number | null = null;
    if (target?.tab_id) {
      tabId = target.tab_id;
    } else if (target?.mode === 'new_tab' || target?.url) {
      const newTab = await chrome.tabs.create({ url: target?.url || 'about:blank' });
      tabId = newTab.id ?? null;
    } else {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      tabId = activeTab?.id ?? null;
    }

    if (!tabId) {
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
