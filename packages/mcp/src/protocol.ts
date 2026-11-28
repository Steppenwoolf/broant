import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type PruningMode = 'compact' | 'standard';

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

export interface BridgeConfig {
  host: string;
  port: number;
  authToken: string;
  connectGraceMs: number;
  allowedExtensionIds?: string[];
}

export interface BridgeToolResult {
  type: 'tool_result';
  request_id: string;
  session_id?: string;
  tab_id?: number;
  ok: boolean;
  data?: unknown;
  error?: {
    code?: string;
    message: string;
    retryable?: boolean;
  };
  duration_ms?: number;
}

export interface BridgeTaskResult {
  type: 'task_result';
  task_id: string;
  status: 'completed' | 'failed' | 'cancelled' | 'timeout';
  output?: string;
  error?: string;
  steps_count?: number;
  duration_ms?: number;
}

export interface BridgeStatusResult {
  type: 'status_result';
  request_id: string;
  active_tasks?: string[];
  open_tabs?: Array<{
    id: number;
    url: string;
    title: string;
    active: boolean;
  }>;
}

export type ExtensionInboundMessage =
  | {
      type: 'hello';
      auth_token?: string;
      extension_version?: string;
      capabilities?: string[];
    }
  | {
      type: 'ping';
      ts?: number;
    }
  | {
      type: 'pong';
      ts?: number;
    }
  | BridgeToolResult
  | BridgeTaskResult
  | BridgeStatusResult
  | {
      type: 'task_accepted' | 'task_progress';
      task_id: string;
      step?: number;
      summary?: string;
    }
  | {
      type: 'session_closed';
      request_id?: string;
      session_id: string;
      ok?: boolean;
    };

export interface RelayEnvelope {
  __relay: true;
  correlation_id: string;
  expect_terminal: 'tool_result' | 'task_result' | 'status_result' | 'session_closed' | 'none';
  payload: Record<string, unknown>;
}

/** Timing-safe token comparison against timing attacks */
export function safeTokenEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/** Resolve token: CLI --token > env BROANT_BRIDGE_TOKEN (or NANOBROWSER_BRIDGE_TOKEN) > ~/.broant/bridge.token > auto-generate */
export function resolveAuthToken(cliToken?: string): string {
  if (cliToken?.trim()) return cliToken.trim();
  const envToken = process.env.BROANT_BRIDGE_TOKEN?.trim() || process.env.NANOBROWSER_BRIDGE_TOKEN?.trim();
  if (envToken) return envToken;

  const candidateDirs = ['.broant', '.nanobrowser'];
  for (const dir of candidateDirs) {
    const tokenFile = path.join(os.homedir(), dir, 'bridge.token');
    try {
      if (fs.existsSync(tokenFile)) {
        const fromFile = fs.readFileSync(tokenFile, 'utf8').trim();
        if (fromFile) return fromFile;
      }
    } catch {
      // Ignore read error
    }
  }

  const generated = crypto.randomBytes(32).toString('hex');
  const targetDir = path.join(os.homedir(), '.broant');
  const targetFile = path.join(targetDir, 'bridge.token');
  try {
    fs.mkdirSync(targetDir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(targetFile, `${generated}\n`, { encoding: 'utf8', mode: 0o600 });
    logStderr('INFO', `Generated new Bridge auth token at ${targetFile}`);
  } catch (err) {
    logStderr('WARN', `Could not persist generated Bridge auth token to ${targetFile}: ${String(err)}`);
  }
  return generated;
}

/** Logging strictly to stderr (stdout is reserved for JSON-RPC MCP frames) */
export function logStderr(level: 'INFO' | 'WARN' | 'ERROR', msg: string, meta?: unknown): void {
  const suffix = meta !== undefined ? ` ${JSON.stringify(meta)}` : '';
  console.error(`[broant-mcp] [${level}] ${msg}${suffix}`);
}
