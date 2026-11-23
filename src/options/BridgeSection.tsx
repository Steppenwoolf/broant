// Settings → Agent Bridge: toggle the external WebSocket orchestrator bridge,
// configure server URL, auth token, and see live connection status.
import { useState } from 'react';
import { DEFAULT_SETTINGS, bridgeConnectedStorage, settingsStorage } from '@src/store/settings';
import { isLoopbackUrl } from '@src/bridge/client';
import { Button, Input, Switch } from '@src/ui/components';
import { useStorage } from '@src/ui/hooks';
import { t } from '@src/ui/i18n';
import { SettingsCard, SettingsRow } from './SettingsCard';

export function BridgeSection() {
  const settings = useStorage(settingsStorage, DEFAULT_SETTINGS);
  const connected = useStorage(bridgeConnectedStorage, false);
  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedConfig, setCopiedConfig] = useState(false);
  const [showToken, setShowToken] = useState(false);

  const handleCopyToken = () => {
    void navigator.clipboard.writeText(settings.bridgeAuthToken).then(() => {
      setCopiedToken(true);
      setTimeout(() => setCopiedToken(false), 2000);
    });
  };

  const handleRegenerateToken = () => {
    const newToken = crypto.randomUUID();
    void settingsStorage.set(s => ({
      ...s,
      bridgeAuthToken: newToken,
    }));
  };

  const handleCopyMcpConfig = () => {
    const config = {
      mcpServers: {
        broant: {
          command: 'npx',
          args: ['-y', 'broant-mcp'],
          env: {
            BROANT_BRIDGE_TOKEN: settings.bridgeAuthToken,
          },
        },
      },
    };
    void navigator.clipboard.writeText(JSON.stringify(config, null, 2)).then(() => {
      setCopiedConfig(true);
      setTimeout(() => setCopiedConfig(false), 2000);
    });
  };

  const statusText = !settings.bridgeEnabled
    ? t('bridge.disconnected')
    : connected
      ? t('bridge.connected')
      : t('bridge.connecting');

  return (
    <div className="flex flex-col gap-6">
      <h2 className="sr-only">{t('bridge.title')}</h2>

      <SettingsCard
        title={t('bridge.title')}
        description={t('bridge.description')}
        className="flex flex-col gap-6">
        <SettingsRow
          label={t('bridge.enabled')}
          description={t('bridge.enabledHint')}>
          <Switch
            aria-label={t('bridge.enabled')}
            checked={settings.bridgeEnabled}
            onChange={on => void settingsStorage.set(s => ({ ...s, bridgeEnabled: on }))}
          />
        </SettingsRow>

        <SettingsRow
          label={t('bridge.status')}
          description={
            <span className="flex items-center gap-2">
              <span
                className={`inline-block size-2.5 rounded-full ${connected && settings.bridgeEnabled ? 'bg-emerald-500' : 'bg-nb-border'}`}
              />
              <span className="font-medium text-nb-fg">{statusText}</span>
              {settings.bridgeEnabled && connected ? (
                <span className="text-xs text-nb-muted">({settings.bridgeServerUrl})</span>
              ) : null}
            </span>
          }
        />

        <SettingsRow
          label={t('bridge.serverUrl')}
          description={
            <div className="flex flex-col gap-1">
              <span>{t('bridge.serverUrlHint')}</span>
              {!isLoopbackUrl(settings.bridgeServerUrl) && (
                <span className="text-xs font-medium text-rose-500">
                  Security Warning: Must be a local loopback address (ws://127.0.0.1:*, ws://localhost:*, ws://[::1]:*)
                </span>
              )}
            </div>
          }>
          <Input
            aria-label={t('bridge.serverUrl')}
            type="text"
            className={`w-72 font-mono text-xs ${!isLoopbackUrl(settings.bridgeServerUrl) ? 'border-rose-500 focus:ring-rose-500' : ''}`}
            value={settings.bridgeServerUrl}
            onChange={e =>
              void settingsStorage.set(s => ({
                ...s,
                bridgeServerUrl: e.target.value.trim(),
              }))
            }
          />
        </SettingsRow>

        <SettingsRow
          label={t('bridge.authToken')}
          description={t('bridge.authTokenHint')}>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              aria-label={t('bridge.authToken')}
              type={showToken ? 'text' : 'password'}
              className="w-56 font-mono text-xs"
              value={settings.bridgeAuthToken}
              onChange={e =>
                void settingsStorage.set(s => ({
                  ...s,
                  bridgeAuthToken: e.target.value.trim(),
                }))
              }
            />
            <Button
              variant="secondary"
              onClick={() => setShowToken(prev => !prev)}
              title={showToken ? t('bridge.hideToken') : t('bridge.showToken')}>
              {showToken ? t('bridge.hideToken') : t('bridge.showToken')}
            </Button>
            <Button
              variant="secondary"
              onClick={handleCopyToken}
              title="Copy token to clipboard">
              {copiedToken ? t('bridge.copied') : 'Copy'}
            </Button>
            <Button
              variant="secondary"
              onClick={handleRegenerateToken}
              title={t('bridge.regenerateToken')}>
              {t('bridge.regenerateToken')}
            </Button>
          </div>
        </SettingsRow>

        <SettingsRow
          label="MCP Integration"
          description="1-Click copy Model Context Protocol server configuration for Claude Code, Cursor, or Antigravity.">
          <Button
            variant="primary"
            onClick={handleCopyMcpConfig}
            title={t('bridge.copyConfig')}>
            {copiedConfig ? t('bridge.copied') : t('bridge.copyConfig')}
          </Button>
        </SettingsRow>
      </SettingsCard>
    </div>
  );
}
