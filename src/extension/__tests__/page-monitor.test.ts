import { beforeEach, describe, expect, it, vi } from 'vitest';

const storageData: Record<string, unknown> = {};
vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: storageData[key] })),
      set: vi.fn(async (obj: Record<string, unknown>) => Object.assign(storageData, obj)),
    },
    session: {
      get: vi.fn(async () => ({})),
      set: vi.fn(async () => ({})),
    },
  },
});

vi.mock('@src/llm', async importOriginal => {
  const actual = await importOriginal<typeof import('@src/llm')>();
  return {
    ...actual,
    streamTurn: vi.fn(async () => ({
      text: '{"matched": true, "summary": "Price dropped to 89"}',
      toolCalls: [],
      finish: 'stop',
    })),
  };
});

import { streamTurn } from '@src/llm';
import type { ResolvedModel } from '@src/agent/run';
import { listMonitors, upsertMonitor } from '@src/store/monitors';
import { PageMonitorService, htmlToCleanLines } from '../page-monitor';

describe('PageMonitorService', () => {
  beforeEach(() => {
    for (const k of Object.keys(storageData)) delete storageData[k];
    vi.clearAllMocks();
  });

  it('skips LLM call when diff is empty and triggers notification + MCP alert on change', async () => {
    const added = await upsertMonitor({
      url: 'https://example.com/product',
      title: 'Product',
      conditionPrompt: 'Did price drop below 100?',
      forwardToMcp: true,
    });
    expect(added.ok).toBe(true);
    if (!added.ok) return;

    let currentHtml = '<html><body><h1>Product</h1><p>Price: 120 EUR</p></body></html>';
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => currentHtml })));

    const onNotify = vi.fn();
    const onMcpAlert = vi.fn();
    const service = new PageMonitorService({
      resolveDefaultModel: async () =>
        ({
          chat: { kind: 'lmstudio' },
          profile: { contextWindow: 32768, maxOutput: 1024, vision: false },
        }) as unknown as ResolvedModel,
      onNotify,
      onMcpAlert,
    });

    // 1. Baseline capture -> 0 LLM calls
    const r1 = await service.checkMonitor(added.monitor);
    expect(r1).toEqual({ changed: false, notified: false });
    expect(streamTurn).not.toHaveBeenCalled();

    // 2. Unchanged page -> 0 LLM calls
    const [m2] = await listMonitors();
    const r2 = await service.checkMonitor(m2);
    expect(r2).toEqual({ changed: false, notified: false });
    expect(streamTurn).not.toHaveBeenCalled();

    // 3. Price changed -> diff triggers LLM evaluation + notify + MCP alert
    currentHtml = '<html><body><h1>Product</h1><p>Price: 89 EUR</p></body></html>';
    const [m3] = await listMonitors();
    const r3 = await service.checkMonitor(m3);
    expect(r3).toEqual({ changed: true, notified: true });
    expect(streamTurn).toHaveBeenCalledTimes(1);
    expect(onNotify).toHaveBeenCalledTimes(1);
    expect(onMcpAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'monitor_alert',
        url: 'https://example.com/product',
        summary: 'Price dropped to 89',
      }),
    );
  });

  it('strips scripts and styles cleanly in htmlToCleanLines', () => {
    const out = htmlToCleanLines('<html><head><style>.a{color:red}</style></head><body><script>alert(1)</script><p>Hello   World</p></body></html>');
    expect(out).toBe('Hello World');
  });
});
