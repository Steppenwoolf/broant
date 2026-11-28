// Persistent store for HARPA-style Page Monitors (`nb.pageMonitors` in chrome.storage.local).
import { newId } from './conversations';
import { isStartUrl } from './shortcuts';

export interface PageMonitor {
  id: string;
  url: string;
  title: string;
  enabled: boolean;
  intervalMinutes: number;
  mode: 'fetch' | 'tab';
  conditionPrompt?: string;
  forwardToMcp?: boolean;
  lastCheckedAt?: string;
  lastChangedAt?: string;
  lastSnapshot?: string;
  lastSummary?: string;
  lastStatus?: 'ok' | 'changed' | 'error';
  lastError?: string;
}

const STORAGE_KEY = 'nb.pageMonitors';
export const MAX_MONITORS = 20;
export const MIN_INTERVAL_MINUTES = 5;
export const MAX_SNAPSHOT_CHARS = 40_000;

export async function listMonitors(): Promise<PageMonitor[]> {
  if (!globalThis.chrome?.storage?.local) return [];
  const raw = await chrome.storage.local.get(STORAGE_KEY);
  const list = raw[STORAGE_KEY];
  return Array.isArray(list) ? (list as PageMonitor[]) : [];
}

async function saveMonitors(list: PageMonitor[]): Promise<void> {
  if (!globalThis.chrome?.storage?.local) return;
  await chrome.storage.local.set({ [STORAGE_KEY]: list });
}

export async function upsertMonitor(input: {
  id?: string;
  url: string;
  title?: string;
  enabled?: boolean;
  intervalMinutes?: number;
  mode?: 'fetch' | 'tab';
  conditionPrompt?: string;
  forwardToMcp?: boolean;
}): Promise<{ ok: true; monitor: PageMonitor } | { ok: false; error: string }> {
  const url = input.url.trim();
  if (!isStartUrl(url)) {
    return { ok: false, error: 'Only http:// and https:// URLs can be monitored.' };
  }

  const list = await listMonitors();
  const existingIdx = input.id
    ? list.findIndex(m => m.id === input.id)
    : list.findIndex(m => m.url === url);

  if (existingIdx < 0 && list.length >= MAX_MONITORS) {
    return { ok: false, error: `Maximum ${MAX_MONITORS} page monitors reached.` };
  }

  const intervalMinutes = Math.max(MIN_INTERVAL_MINUTES, Math.round(input.intervalMinutes ?? 15));
  const prev = existingIdx >= 0 ? list[existingIdx] : undefined;
  const monitor: PageMonitor = {
    ...(prev ?? {}),
    id: prev?.id ?? input.id ?? newId(),
    url,
    title: input.title?.trim() || prev?.title || url,
    enabled: input.enabled ?? prev?.enabled ?? true,
    intervalMinutes,
    mode: input.mode ?? prev?.mode ?? 'fetch',
    conditionPrompt: input.conditionPrompt?.trim() || prev?.conditionPrompt,
    forwardToMcp: input.forwardToMcp ?? prev?.forwardToMcp ?? false,
  };

  if (existingIdx >= 0) {
    list[existingIdx] = monitor;
  } else {
    list.push(monitor);
  }
  await saveMonitors(list);
  return { ok: true, monitor };
}

export async function updateMonitorState(
  id: string,
  patch: Partial<Omit<PageMonitor, 'id' | 'url'>>,
): Promise<void> {
  const list = await listMonitors();
  const idx = list.findIndex(m => m.id === id);
  if (idx < 0) return;
  list[idx] = { ...list[idx], ...patch };
  await saveMonitors(list);
}

export async function deleteMonitor(id: string): Promise<void> {
  const list = await listMonitors();
  await saveMonitors(list.filter(m => m.id !== id));
}
