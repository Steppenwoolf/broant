import { BridgeClient } from './client';
import { BridgeDispatcher } from './dispatcher';
import type { RunManager } from '@src/extension/run-manager';
import { settingsStorage } from '@src/store/settings';

let bridgeClient: BridgeClient | null = null;
let bridgeDispatcher: BridgeDispatcher | null = null;

export function initAgentBridge(runManager: RunManager): BridgeClient {
  if (!bridgeClient) {
    bridgeClient = new BridgeClient();
    bridgeDispatcher = new BridgeDispatcher(bridgeClient, runManager);

    void settingsStorage.get().then(settings => {
      if (bridgeClient) {
        void bridgeClient.init({
          enabled: settings.bridgeEnabled,
          serverUrl: settings.bridgeServerUrl,
          authToken: settings.bridgeAuthToken,
        });
      }
    });

    settingsStorage.subscribe(() => {
      const settings = settingsStorage.getSnapshot();
      if (settings && bridgeClient) {
        bridgeClient.updateConfig({
          enabled: settings.bridgeEnabled,
          serverUrl: settings.bridgeServerUrl,
          authToken: settings.bridgeAuthToken,
        });
      }
    });

    console.info('[bridge] Agent Bridge initialized');
  }
  return bridgeClient;
}

export { bridgeClient, bridgeDispatcher };
