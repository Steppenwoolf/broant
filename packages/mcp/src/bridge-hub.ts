import crypto from 'node:crypto';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import WebSocket, { WebSocketServer } from 'ws';
import type {
  BridgeConfig,
  BridgeStatusResult,
  BridgeTaskResult,
  BridgeToolResult,
  ExtensionInboundMessage,
  RelayEnvelope,
} from './protocol.js';
import { logStderr, safeTokenEqual } from './protocol.js';

interface PendingCall {
  expectTerminal: RelayEnvelope['expect_terminal'];
  resolve: (msg: ExtensionInboundMessage) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface PendingRelay {
  ws: WebSocket;
  expectTerminal: RelayEnvelope['expect_terminal'];
  timer: ReturnType<typeof setTimeout>;
}

export class ExtensionDisconnectedError extends Error {
  readonly code = 'EXTENSION_DISCONNECTED';
  constructor(port: number) {
    super(`Nanobrowser Chrome extension is not connected to ws://127.0.0.1:${port}`);
    this.name = 'ExtensionDisconnectedError';
  }
}

export class BridgeHub extends EventEmitter {
  private mode: 'idle' | 'leader' | 'relay' = 'idle';
  private httpServer: http.Server | null = null;
  private wss: WebSocketServer | null = null;

  // Leader state
  private extensionWs: WebSocket | null = null;
  private extensionAuthed = false;
  private relayClients = new Set<WebSocket>();
  private pendingRelay = new Map<string, PendingRelay>();

  // Relay state
  private relayUpstreamWs: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  // Local MCP state
  private pendingLocal = new Map<string, PendingCall>();
  private ownedSessions = new Set<string>();
  private lastSessionId: string | null = null;
  private shuttingDown = false;

  constructor(private readonly config: BridgeConfig) {
    super();
  }

  get currentMode(): string {
    return this.mode;
  }

  get defaultSessionId(): string | null {
    return this.lastSessionId;
  }

  rememberSession(sessionId?: string): void {
    if (!sessionId) return;
    this.ownedSessions.add(sessionId);
    this.lastSessionId = sessionId;
  }

  forgetSession(sessionId: string): void {
    this.ownedSessions.delete(sessionId);
    if (this.lastSessionId === sessionId) {
      const remaining = Array.from(this.ownedSessions);
      this.lastSessionId = remaining.length > 0 ? remaining[remaining.length - 1] : null;
    }
  }

  async start(): Promise<void> {
    if (this.shuttingDown) return;
    try {
      await this.startAsLeader();
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException)?.code;
      if (code === 'EADDRINUSE') {
        logStderr('INFO', `Port ${this.config.port} is already active — switching to Relay mode`);
        await this.startAsRelay();
        return;
      }
      throw err;
    }
  }

  private async startAsLeader(): Promise<void> {
    const server = http.createServer((_req, res) => {
      res.writeHead(426, { 'Content-Type': 'text/plain' });
      res.end('Upgrade Required: WebSocket endpoint for Nanobrowser Agent Bridge');
    });

    const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 * 1024 });

    server.on('upgrade', (req, socket, head) => {
      const urlPath = (req.url ?? '/').split('?')[0];
      const origin = req.headers.origin;

      // Channel for secondary MCP processes (/mcp-client)
      if (urlPath === '/mcp-client') {
        const tokenHeader = String(req.headers['x-bridge-token'] ?? '');
        if (origin !== undefined || !safeTokenEqual(tokenHeader, this.config.authToken)) {
          logStderr('WARN', 'Rejected unauthorized /mcp-client upgrade', { hasOrigin: Boolean(origin) });
          socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
          socket.destroy();
          return;
        }
        wss.handleUpgrade(req, socket, head, ws => this.handleRelayClient(ws));
        return;
      }

      // Channel for Chrome extension (/ or /extension)
      if (urlPath === '/' || urlPath === '/extension') {
        // Strict CSWSH protection: only legitimate chrome-extension:// origins allowed
        if (!origin || !origin.startsWith('chrome-extension://')) {
          logStderr('WARN', 'Blocked non-extension WebSocket origin on /extension channel (strict CSWSH guard)', {
            origin: origin ?? 'none',
          });
          socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
          socket.destroy();
          return;
        }
        if (this.config.allowedExtensionIds?.length) {
          const extId = origin.slice('chrome-extension://'.length).split('/')[0];
          if (!this.config.allowedExtensionIds.includes(extId)) {
            logStderr('WARN', 'Blocked unapproved extension ID on /extension channel', { extId });
            socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
            socket.destroy();
            return;
          }
        }
        wss.handleUpgrade(req, socket, head, ws => this.handleExtensionSocket(ws, origin));
        return;
      }

      socket.write('HTTP/1.1 404 Not Found\r\n\r\n');
      socket.destroy();
    });

    await new Promise<void>((resolve, reject) => {
      const onError = (err: Error) => {
        server.removeListener('listening', onListening);
        reject(err);
      };
      const onListening = () => {
        server.removeListener('error', onError);
        resolve();
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(this.config.port, this.config.host);
    });

    this.httpServer = server;
    this.wss = wss;
    this.mode = 'leader';
    logStderr('INFO', `Leader Hub listening on ws://${this.config.host}:${this.config.port}`);
  }

  private rejectAllPendingLocal(err: Error): void {
    for (const [id, entry] of this.pendingLocal.entries()) {
      clearTimeout(entry.timer);
      this.pendingLocal.delete(id);
      entry.reject(err);
    }
  }

  private handleExtensionSocket(ws: WebSocket, origin?: string): void {
    let authed = false;
    const authTimer = setTimeout(() => {
      if (!authed) {
        logStderr('WARN', 'Closing unauthenticated extension socket after handshake timeout');
        ws.close(4001, 'Auth handshake timeout');
      }
    }, 3_000);
    authTimer.unref();

    logStderr('INFO', 'Chrome extension socket opened (awaiting hello auth)', { origin: origin ?? 'none' });

    ws.on('message', raw => {
      let msg: ExtensionInboundMessage;
      try {
        msg = JSON.parse(raw.toString('utf8')) as ExtensionInboundMessage;
      } catch {
        logStderr('WARN', 'Malformed JSON from extension');
        return;
      }

      if (msg.type === 'ping') {
        if (authed) {
          this.safeSend(ws, { type: 'pong', ts: msg.ts ?? Date.now() });
        }
        return;
      }

      if (msg.type === 'hello') {
        const token = msg.auth_token ?? '';
        if (!safeTokenEqual(token, this.config.authToken)) {
          clearTimeout(authTimer);
          logStderr('ERROR', 'Extension auth_token mismatch in hello handshake');
          this.safeSend(ws, { type: 'auth_ack', ok: false, error: 'Invalid auth token' });
          ws.close(4001, 'Invalid auth token');
          return;
        }

        clearTimeout(authTimer);
        authed = true;
        if (this.extensionWs && this.extensionWs !== ws && this.extensionWs.readyState === WebSocket.OPEN) {
          this.extensionWs.close(4000, 'Replaced by newer extension connection');
        }
        this.extensionWs = ws;
        this.extensionAuthed = true;
        this.safeSend(ws, { type: 'auth_ack', ok: true });
        logStderr('INFO', 'Chrome extension authenticated successfully');
        this.emit('extension_connected');
        return;
      }

      if (!authed || this.extensionWs !== ws) {
        logStderr('WARN', 'Ignored message from unauthenticated or superseded extension socket', {
          type: (msg as { type?: string }).type,
        });
        return;
      }

      this.routeExtensionMessage(msg);
    });

    ws.on('close', (code, reason) => {
      clearTimeout(authTimer);
      if (this.extensionWs === ws) {
        this.extensionWs = null;
        this.extensionAuthed = false;
        this.rejectAllPendingLocal(new ExtensionDisconnectedError(this.config.port));
      }
      logStderr('WARN', 'Chrome extension disconnected', { code, reason: reason.toString() });
    });

    ws.on('error', err => {
      logStderr('ERROR', 'Extension socket error', { message: err.message });
    });
  }

  private handleRelayClient(ws: WebSocket): void {
    this.relayClients.add(ws);
    logStderr('INFO', 'Secondary MCP client attached via Relay', { count: this.relayClients.size });

    ws.on('message', raw => {
      let env: RelayEnvelope;
      try {
        env = JSON.parse(raw.toString('utf8')) as RelayEnvelope;
      } catch {
        return;
      }
      if (!env.__relay) return;

      if (!this.isExtensionReady()) {
        this.safeSend(ws, {
          type: 'tool_result',
          request_id: env.correlation_id,
          ok: false,
          error: {
            code: 'EXTENSION_DISCONNECTED',
            message: new ExtensionDisconnectedError(this.config.port).message,
          },
        });
        return;
      }

      if (env.expect_terminal !== 'none') {
        const timer = setTimeout(() => {
          this.pendingRelay.delete(env.correlation_id);
        }, 300_000);
        timer.unref();
        this.pendingRelay.set(env.correlation_id, {
          ws,
          expectTerminal: env.expect_terminal,
          timer,
        });
      }

      this.safeSend(this.extensionWs!, env.payload);
    });

    ws.on('close', () => {
      this.relayClients.delete(ws);
      for (const [id, entry] of this.pendingRelay.entries()) {
        if (entry.ws === ws) {
          clearTimeout(entry.timer);
          this.pendingRelay.delete(id);
        }
      }
    });

    ws.on('error', err => {
      logStderr('ERROR', 'Relay client socket error', { message: err.message });
    });
  }

  private async startAsRelay(): Promise<void> {
    this.mode = 'relay';
    const url = `ws://${this.config.host}:${this.config.port}/mcp-client`;
    const ws = new WebSocket(url, {
      headers: { 'x-bridge-token': this.config.authToken },
    });

    await new Promise<void>((resolve, reject) => {
      const onOpen = () => {
        ws.removeListener('error', onError);
        resolve();
      };
      const onError = (err: Error) => {
        ws.removeListener('open', onOpen);
        reject(err);
      };
      ws.once('open', onOpen);
      ws.once('error', onError);
    });

    this.relayUpstreamWs = ws;
    logStderr('INFO', `Attached to Leader Hub at ${url}`);

    ws.on('error', err => {
      logStderr('ERROR', 'Relay upstream socket error', { message: err.message });
    });

    ws.on('message', raw => {
      let msg: ExtensionInboundMessage;
      try {
        msg = JSON.parse(raw.toString('utf8')) as ExtensionInboundMessage;
      } catch {
        return;
      }
      this.routeExtensionMessage(msg);
    });

    ws.on('close', () => {
      this.relayUpstreamWs = null;
      this.rejectAllPendingLocal(new ExtensionDisconnectedError(this.config.port));
      logStderr('WARN', 'Lost connection to Leader Hub');
      if (!this.shuttingDown) {
        const jitter = Math.floor(Math.random() * 300) + 150;
        this.reconnectTimer = setTimeout(() => {
          logStderr('INFO', 'Attempting re-election or reconnecting to Leader...');
          this.mode = 'idle';
          void this.start().catch(err => {
            logStderr('WARN', `Re-election failed: ${err instanceof Error ? err.message : String(err)}`);
          });
        }, jitter);
      }
    });
  }

  isExtensionReady(): boolean {
    if (this.mode === 'leader') {
      return Boolean(this.extensionWs && this.extensionWs.readyState === WebSocket.OPEN && this.extensionAuthed);
    }
    if (this.mode === 'relay') {
      return Boolean(this.relayUpstreamWs && this.relayUpstreamWs.readyState === WebSocket.OPEN);
    }
    return false;
  }

  async waitForExtension(timeoutMs: number): Promise<boolean> {
    if (this.isExtensionReady()) return true;
    if (timeoutMs <= 0) return false;

    return new Promise(resolve => {
      let timer: ReturnType<typeof setTimeout>;
      const onConnected = () => {
        clearTimeout(timer);
        this.removeListener('extension_connected', onConnected);
        resolve(true);
      };
      timer = setTimeout(() => {
        this.removeListener('extension_connected', onConnected);
        resolve(this.isExtensionReady());
      }, timeoutMs);
      timer.unref();
      this.once('extension_connected', onConnected);
    });
  }

  private routeExtensionMessage(msg: ExtensionInboundMessage): void {
    const correlationId =
      'request_id' in msg && msg.request_id
        ? msg.request_id
        : 'task_id' in msg && msg.task_id
          ? msg.task_id
          : null;

    if (!correlationId) return;

    // Check if this matches a local pending request
    const local = this.pendingLocal.get(correlationId);
    if (local) {
      if (msg.type === 'task_accepted' || msg.type === 'task_progress') {
        const summary = (msg as { summary?: string }).summary || msg.type;
        logStderr('INFO', `[task:${correlationId}] Progress: ${summary}`);
        return;
      }
      if (
        local.expectTerminal !== 'none' &&
        msg.type !== local.expectTerminal &&
        msg.type !== 'tool_result' &&
        msg.type !== 'task_result' &&
        msg.type !== 'status_result' &&
        msg.type !== 'session_closed'
      ) {
        return;
      }
      clearTimeout(local.timer);
      this.pendingLocal.delete(correlationId);
      local.resolve(msg);
      return;
    }

    // Check if this matches a relay request from another MCP client
    const relay = this.pendingRelay.get(correlationId);
    if (relay) {
      this.safeSend(relay.ws, msg);
      if (relay.expectTerminal === msg.type) {
        clearTimeout(relay.timer);
        this.pendingRelay.delete(correlationId);
      }
    }
  }

  async sendCommand<T>(
    payload: Record<string, unknown>,
    options: {
      correlationId: string;
      expectTerminal: RelayEnvelope['expect_terminal'];
      timeoutMs?: number;
    },
  ): Promise<T> {
    if (!this.isExtensionReady()) {
      const connected = await this.waitForExtension(this.config.connectGraceMs);
      if (!connected) {
        throw new ExtensionDisconnectedError(this.config.port);
      }
    }

    const { correlationId, expectTerminal } = options;

    if (expectTerminal === 'none') {
      payload.auth_token = this.config.authToken;
      if (this.mode === 'leader' && this.extensionWs && this.extensionWs.readyState === WebSocket.OPEN) {
        this.safeSend(this.extensionWs, payload);
      } else if (this.mode === 'relay' && this.relayUpstreamWs && this.relayUpstreamWs.readyState === WebSocket.OPEN) {
        const envelope: RelayEnvelope = {
          __relay: true,
          correlation_id: correlationId,
          expect_terminal: 'none',
          payload,
        };
        this.safeSend(this.relayUpstreamWs, envelope);
      }
      return Promise.resolve(undefined as T);
    }

    const timeout = options.timeoutMs ?? 30_000;

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingLocal.delete(correlationId);
        reject(new Error(`Timeout after ${timeout}ms awaiting ${expectTerminal} for ${correlationId}`));
      }, timeout);
      timer.unref();

      this.pendingLocal.set(correlationId, {
        expectTerminal,
        resolve: msg => resolve(msg as unknown as T),
        reject,
        timer,
      });

      payload.auth_token = this.config.authToken;

      if (this.mode === 'leader') {
        if (!this.extensionWs || this.extensionWs.readyState !== WebSocket.OPEN) {
          clearTimeout(timer);
          this.pendingLocal.delete(correlationId);
          reject(new ExtensionDisconnectedError(this.config.port));
          return;
        }
        this.safeSend(this.extensionWs, payload);
      } else if (this.mode === 'relay') {
        if (!this.relayUpstreamWs || this.relayUpstreamWs.readyState !== WebSocket.OPEN) {
          clearTimeout(timer);
          this.pendingLocal.delete(correlationId);
          reject(new ExtensionDisconnectedError(this.config.port));
          return;
        }
        const envelope: RelayEnvelope = {
          __relay: true,
          correlation_id: correlationId,
          expect_terminal: expectTerminal,
          payload,
        };
        this.safeSend(this.relayUpstreamWs, envelope);
      } else {
        clearTimeout(timer);
        this.pendingLocal.delete(correlationId);
        reject(new Error('BridgeHub not started'));
      }
    });
  }

  private safeSend(ws: WebSocket, data: unknown): void {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(typeof data === 'string' ? data : JSON.stringify(data));
      } catch (err) {
        logStderr('WARN', 'Failed to send payload over WebSocket', { error: String(err) });
      }
    }
  }

  async shutdown(): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Clean up owned sessions if extension is connected
    if (this.isExtensionReady() && this.ownedSessions.size > 0) {
      logStderr('INFO', `Releasing ${this.ownedSessions.size} owned session(s) on exit`);
      const closes = Array.from(this.ownedSessions).map(sid =>
        this.sendCommand(
          { type: 'close_session', session_id: sid },
          { correlationId: `shutdown-${sid}`, expectTerminal: 'none', timeoutMs: 1500 },
        ).catch(() => undefined),
      );
      await Promise.allSettled(closes);
    }

    for (const [, entry] of this.pendingLocal) {
      clearTimeout(entry.timer);
      entry.reject(new Error('BridgeHub shutting down'));
    }
    this.pendingLocal.clear();

    if (this.relayUpstreamWs) {
      this.relayUpstreamWs.close();
      this.relayUpstreamWs = null;
    }

    for (const ws of this.relayClients) {
      ws.close();
    }
    this.relayClients.clear();

    if (this.extensionWs) {
      this.extensionWs.close();
      this.extensionWs = null;
    }

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    if (this.httpServer) {
      await new Promise<void>(resolve => {
        this.httpServer!.close(() => resolve());
      });
      this.httpServer = null;
    }

    this.mode = 'idle';
  }
}
