// Settings → Agent Bridge: toggle the external WebSocket orchestrator bridge,
// configure server URL, auth token, and see live connection status.
import { useState } from 'react';
import { DEFAULT_SETTINGS, bridgeConnectedStorage, settingsStorage } from '@src/store/settings';
import { Button, Input, Switch } from '@src/ui/components';
import { useStorage } from '@src/ui/hooks';
import { t } from '@src/ui/i18n';
import { SettingsCard, SettingsRow } from './SettingsCard';

export function BridgeSection() {
  const settings = useStorage(settingsStorage, DEFAULT_SETTINGS);
  const connected = useStorage(bridgeConnectedStorage, false);
  const [copied, setCopied] = useState(false);

  const handleCopyToken = () => {
    void navigator.clipboard.writeText(settings.bridgeAuthToken).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const statusTone = !settings.bridgeEnabled
    ? 'bg-nb-border text-nb-muted'
    : connected
      ? 'bg-emerald-500 text-white'
      : 'bg-amber-500 text-white';

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
          description={t('bridge.serverUrlHint')}>
          <Input
            aria-label={t('bridge.serverUrl')}
            type="text"
            className="w-72 font-mono text-xs"
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
          <div className="flex items-center gap-2">
            <Input
              aria-label={t('bridge.authToken')}
              type="text"
              className="w-64 font-mono text-xs"
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
              onClick={handleCopyToken}
              title="Copy token to clipboard">
              {copied ? 'Copied' : 'Copy'}
            </Button>
          </div>
        </SettingsRow>
      </SettingsCard>
    </div>
  );
}
