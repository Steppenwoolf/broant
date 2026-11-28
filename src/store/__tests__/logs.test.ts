import { beforeEach, describe, expect, it, vi } from 'vitest';

const store: Record<string, unknown> = {};
vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: store[key] })),
      set: vi.fn(async (obj: Record<string, unknown>) => Object.assign(store, obj)),
      remove: vi.fn(async (key: string) => {
        delete store[key];
      }),
    },
  },
});

import { MAX_LOG_ENTRIES, clearLogs, listLogs, logEvent } from '../logs';

describe('ring-buffer diagnostic logger', () => {
  beforeEach(async () => {
    await clearLogs();
  });

  it('caps stored entries at MAX_LOG_ENTRIES (200) and overwrites oldest', async () => {
    for (let i = 0; i < MAX_LOG_ENTRIES + 15; i++) {
      logEvent('info', 'test', `msg-${i}`);
    }
    // Wait for serialized async writes to flush
    await new Promise(r => setTimeout(r, 30));
    const logs = await listLogs();
    expect(logs).toHaveLength(MAX_LOG_ENTRIES);
    expect(logs[0].message).toBe('msg-15');
    expect(logs[logs.length - 1].message).toBe(`msg-${MAX_LOG_ENTRIES + 14}`);
  });
});
