// Persistent ring-buffer diagnostic logger (`nb.logs` in chrome.storage.local, max 200 entries).
// Uses a serialized write queue so concurrent errors never overwrite each other.
export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  ts: string;
  level: LogLevel;
  source: string;
  message: string;
  detail?: string;
}

const STORAGE_KEY = 'nb.logs';
export const MAX_LOG_ENTRIES = 200;

let writeChain: Promise<unknown> = Promise.resolve();

function serial<T>(work: () => Promise<T>): Promise<T> {
  const next = writeChain.then(work, work);
  writeChain = next.catch(() => undefined);
  return next;
}

export async function listLogs(): Promise<LogEntry[]> {
  if (!globalThis.chrome?.storage?.local) return [];
  const raw = await chrome.storage.local.get(STORAGE_KEY).catch(() => ({}));
  const list = (raw as Record<string, unknown>)[STORAGE_KEY];
  return Array.isArray(list) ? (list as LogEntry[]) : [];
}

export function logEvent(level: LogLevel, source: string, message: string, detail?: unknown): void {
  const detailStr =
    detail === undefined
      ? undefined
      : (detail instanceof Error ? detail.stack || detail.message : typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(
          0,
          1_500,
        );
  const entry: LogEntry = {
    ts: new Date().toISOString(),
    level,
    source,
    message: message.slice(0, 500),
    ...(detailStr ? { detail: detailStr } : {}),
  };

  if (!globalThis.chrome?.storage?.local) return;
  void serial(async () => {
    const existing = await listLogs();
    existing.push(entry);
    const trimmed = existing.length > MAX_LOG_ENTRIES ? existing.slice(-MAX_LOG_ENTRIES) : existing;
    await chrome.storage.local.set({ [STORAGE_KEY]: trimmed });
  });
}

export async function clearLogs(): Promise<void> {
  if (!globalThis.chrome?.storage?.local) return;
  await serial(async () => {
    await chrome.storage.local.remove(STORAGE_KEY);
  });
}
