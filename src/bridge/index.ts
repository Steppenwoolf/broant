import { BridgeClient } from './client';
import { BridgeDispatcher } from './dispatcher';
import type { RunManager } from '@src/extension/run-manager';

let bridgeClient: BridgeClient | null = null;
let bridgeDispatcher: BridgeDispatcher | null = null;

export function initAgentBridge(runManager: RunManager): BridgeClient {
  if (!bridgeClient) {
    bridgeClient = new BridgeClient();
    bridgeDispatcher = new BridgeDispatcher(bridgeClient, runManager);
    void bridgeClient.init();
    console.info('[bridge] Agent Bridge initialized');
  }
  return bridgeClient;
}

export { bridgeClient, bridgeDispatcher };
