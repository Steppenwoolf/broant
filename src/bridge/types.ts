export type BridgeProtocolVersion = 1;

export interface BridgeConfig {
  enabled: boolean;
  serverUrl: string; // default: 'ws://127.0.0.1:8765'
  authToken: string;
  allowedDomains: string[];
}

export const DEFAULT_BRIDGE_CONFIG: BridgeConfig = {
  enabled: true,
  serverUrl: 'ws://127.0.0.1:8765',
  authToken: 'broant-secret-key',
  allowedDomains: ['*'],
};

export type ApprovalPolicy = 'deny' | 'forward_to_bridge' | 'auto_safe';

export type DirectToolName =
  | 'observe'
  | 'act'
  | 'fill'
  | 'navigate'
  | 'text'
  | 'wait'
  | 'tabs'
  | 'upload'
  | 'dialog'
  | 'ask'
  | 'screenshot';

export interface CallToolRequest {
  type: 'call_tool';
  action?: 'call_tool';
  auth_token: string;
  request_id: string;
  session_id?: string;
  target?: {
    mode?: 'active_tab' | 'new_tab' | 'tab_id';
    tab_id?: number;
    url?: string;
  };
  tool: DirectToolName;
  args?: Record<string, unknown>;
  pruning?: 'standard' | 'compact';
  timeout_ms?: number;
}

export interface CloseToolSessionRequest {
  type: 'close_session';
  auth_token: string;
  request_id: string;
  session_id: string;
}

export interface ToolResultResponse {
  type: 'tool_result';
  request_id: string;
  session_id: string;
  tab_id: number;
  ok: boolean;
  data?: unknown;
  error?: {
    code: string;
    message: string;
    retryable?: boolean;
  };
  duration_ms: number;
}

export type BridgeInboundMessage =
  | {
      type: 'auth_ack';
      ok: boolean;
      error?: string;
    }
  | {
      type: 'pong';
      ts: number;
    }
  | {
      type: 'execute_task';
      action?: 'execute_task';
      auth_token: string;
      task_id: string;
      prompt: string;
      model?: string;
      target?: {
        mode?: 'active_tab' | 'new_tab' | 'tab_id';
        tab_id?: number;
        url?: string;
      };
      options?: {
        max_steps?: number;
        timeout_ms?: number;
        approval_policy?: ApprovalPolicy;
      };
    }
  | {
      type: 'cancel_task';
      auth_token: string;
      task_id: string;
    }
  | {
      type: 'get_status';
      auth_token: string;
      request_id: string;
    }
  | CallToolRequest
  | CloseToolSessionRequest;

export type BridgeOutboundMessage =
  | {
      type: 'hello';
      protocol_version: BridgeProtocolVersion;
      client: 'nanobrowser-bridge';
      extension_version: string;
      auth_token: string;
      capabilities: string[];
    }
  | {
      type: 'ping';
      ts: number;
    }
  | {
      type: 'task_accepted';
      task_id: string;
      tab_id: number;
    }
  | {
      type: 'task_progress';
      task_id: string;
      step: number;
      tool?: string;
      summary: string;
      tokens_used?: number;
      context_window?: number;
    }
  | {
      type: 'task_result';
      task_id: string;
      status: 'completed' | 'failed' | 'cancelled' | 'timeout';
      output?: string;
      error?: string;
      steps_count: number;
      duration_ms: number;
    }
  | {
      type: 'status_result';
      request_id: string;
      active_tasks: string[];
      open_tabs: Array<{ id: number; url: string; title: string; active: boolean }>;
    }
  | ToolResultResponse;
