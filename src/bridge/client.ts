import { DEFAULT_BRIDGE_CONFIG } from './types';
import type { BridgeConfig, BridgeInboundMessage, BridgeOutboundMessage } from './types';
import { KeepAliveManager } from './keepalive';

export type MessageHandler = (msg: BridgeInboundMessage) => Promise<void> | void;

export class BridgeClient {
  private ws: WebSocket | null = null;
  private config: BridgeConfig = DEFAULT_BRIDGE_CONFIG;
  private keepAlive: KeepAliveManager;
  private messageHandlers: Set<MessageHandler> = new Set();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isConnecting = false;

  constructor() {
    this.keepAlive = new KeepAliveManager(
      () => this.sendPing(),
      () => this.checkConnection()
    );
  }

  async init(config?: Partial<BridgeConfig>) {
    this.config = { ...this.config, ...config };
    if (this.config.enabled) {
      this.connect();
    }
  }

  onMessage(handler: MessageHandler) {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  checkConnection() {
    if (this.config.enabled && !this.isConnected() && !this.isConnecting) {
      this.connect();
    }
  }

  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  connect() {
    if (this.isConnecting || this.isConnected()) return;
    this.isConnecting = true;

    try {
      this.ws = new WebSocket(this.config.serverUrl);

      this.ws.onopen = () => {
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        console.info('[bridge] Connected to server at', this.config.serverUrl);
        this.keepAlive.startHeartbeat();
        this.sendHello();
      };

      this.ws.onmessage = async (event) => {
        try {
          const raw = typeof event.data === 'string' ? event.data : await (event.data as Blob).text();
          const parsed = JSON.parse(raw) as BridgeInboundMessage;
          this.handleIncoming(parsed);
        } catch (err) {
          console.warn('[bridge] Failed to parse message:', err);
        }
      };

      this.ws.onclose = () => {
        this.isConnecting = false;
        this.keepAlive.stopHeartbeat();
        this.ws = null;
        this.scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        this.isConnecting = false;
        console.warn('[bridge] WebSocket error:', err);
      };
    } catch (e) {
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (!this.config.enabled || this.reconnectTimer) return;
    const backoff = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30_000);
    const jitter = Math.floor(Math.random() * 500);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, backoff + jitter);
  }

  private sendHello() {
    const version = (typeof chrome !== 'undefined' && chrome.runtime?.getManifest?.()?.version) || '0.3.0';
    this.send({
      type: 'hello',
      protocol_version: 1,
      client: 'nanobrowser-bridge',
      extension_version: version,
      auth_token: this.config.authToken,
      capabilities: ['execute_task', 'status', 'mv3_keepalive'],
    });
  }

  private sendPing() {
    if (this.isConnected()) {
      this.send({ type: 'ping', ts: Date.now() });
    }
  }

  send(msg: BridgeOutboundMessage) {
    if (this.isConnected()) {
      this.ws?.send(JSON.stringify(msg));
    }
  }

  private handleIncoming(msg: BridgeInboundMessage) {
    if (msg.type === 'pong') return;
    for (const handler of this.messageHandlers) {
      try {
        void handler(msg);
      } catch (err) {
        console.error('[bridge] Error in message handler:', err);
      }
    }
  }
}
