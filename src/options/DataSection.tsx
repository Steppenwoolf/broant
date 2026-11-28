// Settings → Data: the Privacy choices, how much is stored, where to delete one conversation, the conversations the old Nanobrowser left
// (export or delete), and Delete everything, which the worker carries out so that running tasks stop first.
import { useEffect, useState } from 'react';
import { Button, Notice } from '@src/ui/components';
import { SettingsCard } from './SettingsCard';
import { PrivacyCard } from './PrivacyCard';
import { t } from '@src/ui/i18n';
import { DATA_REQUEST } from '@src/ui/protocol';
import { useStorage } from '@src/ui/hooks';
import { deleteOldChats, oldChatsFilename, oldChatsMarkdown, oldChatsStorage, readOldChats } from '@src/store/legacy';
import type { OldChat } from '@src/store/legacy';
import { clearLogs, listLogs } from '@src/store/logs';
import type { LogEntry } from '@src/store/logs';

const NO_CHATS: OldChat[] = [];

/** Saves the old conversations as one Markdown file, through an anchor's download. */
async function exportOldChats(): Promise<void> {
  const now = Date.now();
  const url = URL.createObjectURL(new Blob([oldChatsMarkdown(await readOldChats(), now)], { type: 'text/markdown' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: oldChatsFilename(now) });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** The old version's conversations, shown while there are any. */
function PreviousCard({ onDeleted }: { onDeleted: () => void }) {
  const chats = useStorage(oldChatsStorage, NO_CHATS);
  const [confirming, setConfirming] = useState(false);
  if (!chats.length) return null;
  return (
    <SettingsCard
      title={t('data.previous')}
      description={t(chats.length === 1 ? 'data.previousHintOne' : 'data.previousHint', { count: chats.length })}
      className="flex flex-col gap-2">
      {confirming ? (
        <div className="flex gap-2">
          <Button
            variant="danger"
            onClick={() =>
              void deleteOldChats().then(() => {
                setConfirming(false);
                onDeleted();
              })
            }>
            {t('data.previousConfirm')}
          </Button>
          <Button variant="ghost" onClick={() => setConfirming(false)}>
            {t('common.cancel')}
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button onClick={() => void exportOldChats()}>{t('history.export')}</Button>
          <Button variant="danger" onClick={() => setConfirming(true)}>
            {t('history.delete')}
          </Button>
        </div>
      )}
    </SettingsCard>
  );
}

function size(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function DataSection() {
  const [used, setUsed] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [copiedLogs, setCopiedLogs] = useState(false);
  const refreshLogs = () => void listLogs().then(setLogs).catch(() => undefined);
  const measure = () =>
    void navigator.storage
      ?.estimate()
      .then(e => setUsed(e.usage ?? null))
      .catch(() => setUsed(null));
  useEffect(() => {
    measure();
    refreshLogs();
  }, []);
  return (
    <div className="flex flex-col gap-6">
      <h2 className="sr-only">{t('settings.nav.data')}</h2>
      <SettingsCard
        title={t('data.usage')}
        description={used === null ? '…' : t('data.usageLine', { used: size(used) })}
      />
      <SettingsCard title={t('data.conversations')} description={t('data.conversationsHint')} />
      <PreviousCard onDeleted={measure} />
      <PrivacyCard />
      <SettingsCard
        title="Diagnostic Logs (max 200)"
        description={`Persistent ring buffer of recent errors and events (${logs.length}/200 stored).`}
        className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            onClick={() => {
              const text = logs
                .map(l => `[${l.ts}] [${l.level.toUpperCase()}] [${l.source}] ${l.message}${l.detail ? `\n${l.detail}` : ''}`)
                .join('\n');
              void navigator.clipboard.writeText(text || 'No logs recorded.').then(() => {
                setCopiedLogs(true);
                setTimeout(() => setCopiedLogs(false), 2000);
              });
            }}>
            {copiedLogs ? 'Copied!' : 'Copy Logs'}
          </Button>
          <Button variant="ghost" onClick={refreshLogs}>
            Refresh
          </Button>
          <Button variant="ghost" onClick={() => void clearLogs().then(refreshLogs)}>
            Clear
          </Button>
        </div>
        {logs.length ? (
          <pre className="max-h-48 overflow-auto rounded-lg border border-nb-border bg-nb-surface p-2 font-mono text-[11px] leading-relaxed text-nb-fg">
            {logs
              .slice(-20)
              .reverse()
              .map(l => `${l.ts.slice(11, 19)} [${l.level}] ${l.source}: ${l.message}`)
              .join('\n')}
          </pre>
        ) : (
          <p className="text-xs text-nb-muted">No diagnostic logs yet.</p>
        )}
      </SettingsCard>
      <SettingsCard title={t('data.everything')} description={t('data.everythingHint')} className="flex flex-col gap-2">
        {deleted ? <Notice tone="ok">{t('data.deleted')}</Notice> : null}
        {confirming ? (
          <div className="flex gap-2">
            <Button
              variant="danger"
              onClick={() =>
                void chrome.runtime.sendMessage({ type: DATA_REQUEST, op: 'delete-all' }).then(() => {
                  setConfirming(false);
                  setDeleted(true);
                  measure();
                })
              }>
              {t('data.everythingConfirm')}
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        ) : (
          <Button className="self-start" variant="danger" onClick={() => setConfirming(true)}>
            {t('data.everything')}
          </Button>
        )}
      </SettingsCard>
    </div>
  );
}
