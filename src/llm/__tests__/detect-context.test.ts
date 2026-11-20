import { describe, expect, it } from 'vitest';
import { detectActiveLoadedModel, detectContext } from '../connection';
import { resolveProfile } from '../profiles';

function server(routes: Record<string, unknown>): typeof fetch {
  return (async (url: string | URL) => {
    const path = new URL(String(url)).pathname;
    if (!(path in routes)) return new Response('not found', { status: 404 });
    return new Response(JSON.stringify(routes[path]), { status: 200 });
  }) as typeof fetch;
}

describe('context detection', () => {
  it('reads a loaded Ollama model from /api/ps', async () => {
    const fetchFn = server({ '/api/ps': { models: [{ name: 'qwen3:8b', context_length: 8192 }] } });
    expect(await detectContext({ kind: 'ollama', modelName: 'qwen3:8b' }, fetchFn)).toEqual({
      window: 8192,
      loaded: true,
    });
  });

  it('falls back to num_ctx, then the model maximum, from /api/show', async () => {
    expect(
      await detectContext(
        { kind: 'ollama', modelName: 'm' },
        server({
          '/api/ps': { models: [] },
          '/api/show': { parameters: 'stop "<|im_end|>"\nnum_ctx 16384', model_info: {} },
        }),
      ),
    ).toEqual({ window: 16384, loaded: false });
    expect(
      await detectContext(
        { kind: 'ollama', modelName: 'm', baseUrl: 'http://box:11434/v1' },
        server({ '/api/ps': { models: [] }, '/api/show': { model_info: { 'qwen3.context_length': 40960 } } }),
      ),
    ).toEqual({ window: 40960, loaded: false });
  });

  it('reads LM Studio’s loaded_context_length', async () => {
    const fetchFn = server({
      '/api/v0/models': { data: [{ id: 'gemma-3', loaded_context_length: 4096, max_context_length: 131072 }] },
    });
    expect(await detectContext({ kind: 'lmstudio', modelName: 'gemma-3' }, fetchFn)).toEqual({
      window: 4096,
      loaded: true,
    });
  });

  it('says nothing for an unreachable server or another kind', async () => {
    const down = (async () => {
      throw new TypeError('Failed to fetch');
    }) as typeof fetch;
    expect(await detectContext({ kind: 'ollama', modelName: 'm' }, down)).toBeUndefined();
    expect(await detectContext({ kind: 'openai-compatible', modelName: 'm' }, down)).toBeUndefined();
  });

  it('says the server has not loaded the model when it answers without it', async () => {
    expect(await detectContext({ kind: 'ollama', modelName: 'm' }, server({ '/api/ps': { models: [] } }))).toEqual({
      loaded: false,
    });
    expect(
      await detectContext({ kind: 'lmstudio', modelName: 'm' }, server({ '/api/v0/models': { data: [{ id: 'm' }] } })),
    ).toEqual({ loaded: false });
  });

  it('detects active loaded model from LM Studio /api/v0/models', async () => {
    const fetchFn = server({
      '/api/v0/models': {
        data: [
          { id: 'not-me', state: 'not-loaded' },
          { id: 'qwen3.8-9b-distill', state: 'loaded', loaded_context_length: 36096, max_context_length: 262144 },
        ],
      },
    });
    expect(await detectActiveLoadedModel({ kind: 'lmstudio' }, fetchFn)).toEqual({
      modelName: 'qwen3.8-9b-distill',
      loadedContextLength: 36096,
      maxContextLength: 262144,
    });
  });

  it('detects active loaded model from Ollama /api/ps', async () => {
    const fetchFn = server({
      '/api/ps': {
        models: [{ name: 'qwen3:8b', context_length: 32768 }],
      },
    });
    expect(await detectActiveLoadedModel({ kind: 'ollama' }, fetchFn)).toEqual({
      modelName: 'qwen3:8b',
      loadedContextLength: 32768,
    });
  });

  it('returns null when no model is loaded on LM Studio or Ollama', async () => {
    expect(
      await detectActiveLoadedModel(
        { kind: 'lmstudio' },
        server({ '/api/v0/models': { data: [{ id: 'm', state: 'not-loaded' }] } }),
      ),
    ).toBeNull();
    expect(
      await detectActiveLoadedModel({ kind: 'ollama' }, server({ '/api/ps': { models: [] } })),
    ).toBeNull();
  });

  it('caps the window the user set by what the server loaded or would load', () => {
    const base = { kind: 'ollama' as const, modelName: 'qwen3:8b', overrides: { contextWindow: 32768 } };
    for (const detectedLoaded of [true, false]) {
      expect(resolveProfile({ ...base, detectedContext: 8192, detectedLoaded }).contextWindow).toBe(8192);
      expect(resolveProfile({ ...base, detectedContext: 131072, detectedLoaded }).contextWindow).toBe(32768);
    }
  });

  it('takes a loaded window as the window, above and below the row and the default; another number only lowers', () => {
    // qwen3:8b has a row of 32,768; `mystery` gets the local default, 16,384.
    for (const [modelName, known] of [
      ['qwen3:8b', 32_768],
      ['mystery', 16_384],
    ] as const) {
      const base = { kind: 'ollama' as const, modelName };
      expect(resolveProfile({ ...base, detectedContext: 65_536, detectedLoaded: true }).contextWindow).toBe(65_536);
      expect(resolveProfile({ ...base, detectedContext: 8192, detectedLoaded: true }).contextWindow).toBe(8192);
      expect(resolveProfile({ ...base, detectedContext: 65_536, detectedLoaded: false }).contextWindow).toBe(known);
      expect(resolveProfile({ ...base, detectedContext: 8192 }).contextWindow).toBe(8192);
    }
  });
});
