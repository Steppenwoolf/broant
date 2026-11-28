import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockChrome = {
  tabs: {
    query: vi.fn(async () => []),
    create: vi.fn(async opts => ({ id: 999, ...opts })),
    onRemoved: { addListener: vi.fn(), removeListener: vi.fn() },
    onNavigationTarget: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  storage: {
    local: { get: vi.fn(async () => ({})), set: vi.fn(async () => ({})) },
    session: { get: vi.fn(async () => ({})), set: vi.fn(async () => ({})) },
  },
};
vi.stubGlobal('chrome', mockChrome);

import { BridgeDispatcher } from '../dispatcher';
import type { BridgeClient } from '../client';
import type { BridgeOutboundMessage } from '../types';
import type { RunManager } from '@src/extension/run-manager';

describe('BridgeDispatcher Direct Tool RPC', () => {
  let sent: BridgeOutboundMessage[];
  let client: BridgeClient;
  let runManager: RunManager;
  let dispatcher: BridgeDispatcher;

  beforeEach(() => {
    sent = [];
    client = {
      onMessage: vi.fn(),
      onDisconnect: vi.fn(),
      send: vi.fn((msg: BridgeOutboundMessage) => sent.push(msg)),
    } as unknown as BridgeClient;

    runManager = {
      connections: new Set(),
      handle: vi.fn(),
    } as unknown as RunManager;

    dispatcher = new BridgeDispatcher(client, runManager);
  });

  it('handles get_status correctly', async () => {
    vi.stubGlobal('chrome', {
      ...mockChrome,
      tabs: {
        ...mockChrome.tabs,
        query: vi.fn(async () => [
          { id: 101, url: 'https://example.com', title: 'Example', active: true },
        ]),
      },
    });

    await dispatcher.dispatch({
      type: 'get_status',
      auth_token: 'secret',
      request_id: 'req-status-1',
    });

    expect(sent.length).toBe(1);
    const resp = sent[0];
    expect(resp.type).toBe('status_result');
    if (resp.type === 'status_result') {
      expect(resp.request_id).toBe('req-status-1');
      expect(resp.open_tabs).toHaveLength(1);
      expect(resp.open_tabs[0].id).toBe(101);
    }
  });

  it('dispatches call_tool and returns tool_result on success', async () => {
    const mockSession = {
      id: 'sess-test-1',
      shareTab: vi.fn(),
      call: vi.fn(async (tool, args) => ({
        ok: true,
        data: { text: `Executed ${tool} with ${JSON.stringify(args)}` },
      })),
    };

    // Mock tool sessions manager inside dispatcher
    const toolSessions = dispatcher.getToolSessions();
    vi.spyOn(toolSessions, 'acquire').mockResolvedValue({
      sessionId: 'sess-test-1',
      tabId: 102,
      session: mockSession as never,
      lastUsedAt: Date.now(),
      busy: false,
    });

    await dispatcher.dispatch({
      type: 'call_tool',
      auth_token: 'secret',
      request_id: 'req-tool-1',
      tool: 'observe',
      pruning: 'compact',
    });

    expect(sent.length).toBe(1);
    const resp = sent[0];
    expect(resp.type).toBe('tool_result');
    if (resp.type === 'tool_result') {
      expect(resp.ok).toBe(true);
      expect(resp.request_id).toBe('req-tool-1');
      expect(resp.session_id).toBe('sess-test-1');
      expect(resp.tab_id).toBe(102);
      expect(resp.data).toEqual({
        ok: true,
        data: { text: 'Executed snapshot with {"pruning":"compact"}' },
      });
    }
  });

  it('normalizes act and fill aliases to click and set', async () => {
    const mockSession = {
      id: 'sess-test-2',
      shareTab: vi.fn(),
      call: vi.fn(async (tool, args) => ({
        ok: true,
        data: { tool, args },
      })),
    };

    const toolSessions = dispatcher.getToolSessions();
    vi.spyOn(toolSessions, 'acquire').mockResolvedValue({
      sessionId: 'sess-test-2',
      tabId: 103,
      session: mockSession as never,
      lastUsedAt: Date.now(),
      busy: false,
    });

    // act with ref -> click with target { ref }
    await dispatcher.dispatch({
      type: 'call_tool',
      auth_token: 'secret',
      request_id: 'req-act-1',
      tool: 'act',
      args: { ref: 'e12' },
    });

    expect(mockSession.call).toHaveBeenCalledWith(
      'click',
      { target: { ref: 'e12' } },
      expect.anything(),
    );

    // fill with ref and text -> set with target { ref } and value
    await dispatcher.dispatch({
      type: 'call_tool',
      auth_token: 'secret',
      request_id: 'req-fill-1',
      tool: 'fill',
      args: { ref: 'e14', text: 'query' },
    });

    expect(mockSession.call).toHaveBeenCalledWith(
      'set',
      { target: { ref: 'e14' }, value: 'query' },
      expect.anything(),
    );
  });

  it('handles close_session cleanly', async () => {
    const toolSessions = dispatcher.getToolSessions();
    vi.spyOn(toolSessions, 'close').mockResolvedValue(true);

    await dispatcher.dispatch({
      type: 'close_session',
      auth_token: 'secret',
      request_id: 'req-close-1',
      session_id: 'sess-to-close',
    });

    expect(sent.length).toBe(1);
    const resp = sent[0];
    expect(resp.type).toBe('tool_result');
    if (resp.type === 'tool_result') {
      expect(resp.ok).toBe(true);
      expect(resp.data).toEqual({ closed: true });
    }
  });

  it('returns structured error when tool execution throws', async () => {
    const mockSession = {
      id: 'sess-test-err',
      shareTab: vi.fn(),
      call: vi.fn(async () => {
        const err = new Error('Element not found');
        Object.assign(err, { code: 'ELEMENT_NOT_FOUND', retryable: true });
        throw err;
      }),
    };

    const toolSessions = dispatcher.getToolSessions();
    vi.spyOn(toolSessions, 'acquire').mockResolvedValue({
      sessionId: 'sess-test-err',
      tabId: 105,
      session: mockSession as never,
      lastUsedAt: Date.now(),
      busy: false,
    });

    await dispatcher.dispatch({
      type: 'call_tool',
      auth_token: 'secret',
      request_id: 'req-err-1',
      tool: 'click' as never,
      args: { ref: 'e99' },
    });

    expect(sent.length).toBe(1);
    const resp = sent[0];
    expect(resp.type).toBe('tool_result');
    if (resp.type === 'tool_result') {
      expect(resp.ok).toBe(false);
      expect(resp.error?.code).toBe('ELEMENT_NOT_FOUND');
      expect(resp.error?.retryable).toBe(true);
    }
  });

  it('handles get_status with active_only flag', async () => {
    vi.stubGlobal('chrome', {
      ...mockChrome,
      tabs: {
        ...mockChrome.tabs,
        query: vi.fn(async (queryInfo: { active?: boolean; lastFocusedWindow?: boolean }) => {
          if (queryInfo.active && queryInfo.lastFocusedWindow) {
            return [{ id: 42, url: 'https://gemini.google.com/app', title: 'Gemini Chat', active: true }];
          }
          return [];
        }),
      },
    });

    await dispatcher.dispatch({
      type: 'get_status',
      request_id: 'req-active-only',
      active_only: true,
    });

    expect(sent.length).toBe(1);
    const resp = sent[0];
    expect(resp.type).toBe('status_result');
    if (resp.type === 'status_result') {
      expect(resp.open_tabs.length).toBe(1);
      expect(resp.open_tabs[0].id).toBe(42);
      expect(resp.open_tabs[0].title).toBe('Gemini Chat');
    }
  });

  it('handles get_status with query and domain filtering', async () => {
    vi.stubGlobal('chrome', {
      ...mockChrome,
      tabs: {
        ...mockChrome.tabs,
        query: vi.fn(async () => [
          { id: 1, url: 'https://github.com/repo', title: 'GitHub Repo', active: false, lastAccessed: 100 },
          { id: 2, url: 'https://gemini.google.com/app', title: 'Gemini Chat', active: true, lastAccessed: 500 },
          { id: 3, url: 'https://gemini.google.com/other', title: 'Gemini Old', active: false, lastAccessed: 200 },
        ]),
      },
    });

    await dispatcher.dispatch({
      type: 'get_status',
      request_id: 'req-filter',
      domain: 'gemini.google.com',
      query: 'Chat',
      limit: 10,
    });

    expect(sent.length).toBe(1);
    const resp = sent[0];
    expect(resp.type).toBe('status_result');
    if (resp.type === 'status_result') {
      expect(resp.open_tabs.length).toBe(1);
      expect(resp.open_tabs[0].id).toBe(2);
    }
  });

  it('closes tool sessions on client disconnect', async () => {
    let disconnectCb: (() => void) | undefined;
    const testClient = {
      onMessage: vi.fn(),
      onDisconnect: vi.fn((cb: () => void) => {
        disconnectCb = cb;
      }),
      send: vi.fn(),
    } as unknown as BridgeClient;

    const testDispatcher = new BridgeDispatcher(testClient, runManager);
    const closeSpy = vi.spyOn(testDispatcher.getToolSessions(), 'close');

    expect(disconnectCb).toBeDefined();
    disconnectCb?.();
    expect(closeSpy).toHaveBeenCalled();
  });

  it('rejects disallowed tools with TOOL_NOT_ALLOWED', async () => {
    await dispatcher.dispatch({
      type: 'call_tool',
      auth_token: 'secret',
      request_id: 'req-disallowed',
      tool: 'eval' as never,
      args: { code: 'alert(1)' },
    });

    expect(sent).toHaveLength(1);
    const resp = sent[0];
    expect(resp.type).toBe('tool_result');
    if (resp.type === 'tool_result') {
      expect(resp.ok).toBe(false);
      expect(resp.error?.code).toBe('TOOL_NOT_ALLOWED');
    }
  });

  it('normalizes double_click, press_enter, and fill_form fields', async () => {
    const mockSession = {
      id: 'sess-test-norm',
      shareTab: vi.fn(),
      call: vi.fn(async (tool, args) => ({ ok: true, data: { tool, args } })),
    };
    vi.spyOn(dispatcher.getToolSessions(), 'acquire').mockResolvedValue({
      sessionId: 'sess-test-norm',
      tabId: 109,
      session: mockSession as never,
      lastUsedAt: Date.now(),
      busy: false,
    });

    await dispatcher.dispatch({
      type: 'call_tool',
      auth_token: 'secret',
      request_id: 'req-dbl',
      tool: 'act',
      args: { ref: 'e5', action: 'double_click' },
    });
    expect(mockSession.call).toHaveBeenCalledWith('click', { target: { ref: 'e5' }, count: 2 }, expect.anything());

    await dispatcher.dispatch({
      type: 'call_tool',
      auth_token: 'secret',
      request_id: 'req-enter',
      tool: 'act',
      args: { ref: 'e6', action: 'press_enter' },
    });
    expect(mockSession.call).toHaveBeenCalledWith('press', { target: { ref: 'e6' }, keys: 'Enter' }, expect.anything());

    await dispatcher.dispatch({
      type: 'call_tool',
      auth_token: 'secret',
      request_id: 'req-form',
      tool: 'fill',
      args: { fields: [{ ref: 'e7', value: 'hi' }], submit: true },
    });
    expect(mockSession.call).toHaveBeenCalledWith(
      'fill_form',
      { fields: [{ target: { ref: 'e7' }, value: 'hi' }] },
      expect.anything(),
    );
  });
});
