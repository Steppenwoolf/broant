// Resolves a conversation's live model and effort to a callable model and its profile, from the stored providers and
// keys. The key leaves storage only to build the provider client.
import { createModel, detectActiveLoadedModel, detectContext, makePair, resolveProfile } from '@src/llm';
import {
  capabilityOf,
  findModel,
  getLive,
  keysStorage,
  learnFacts,
  learnt,
  LOCAL_KINDS,
  providersStorage,
  settingsStorage,
  usableModel,
  type ModelEntry,
  type ProviderConfig,
} from '@src/store/settings';
import type { LivePair } from '@src/store/types';
import type { ResolvedModel } from '@src/agent/run';

export class ModelUnavailable extends Error {}

/**
 * The model and effort a run uses: the conversation's live pair, or one made from the settings when there is none. A
 * model no longer configured falls back as the panel's picker does, keeping the pair's effort. Null when no model is
 * configured. The key is read first, so a pair written after the call does not reach it.
 */
export async function livePair(conversationId: string | null): Promise<LivePair | null> {
  const [stored, settings, providers] = await Promise.all([
    conversationId ? getLive(conversationId) : undefined,
    settingsStorage.get(),
    providersStorage.get(),
  ]);
  const model = usableModel(providers, stored?.model, settings.defaultModel);
  if (!model) return null;
  if (stored) return { model, reasoning: stored.reasoning };
  return makePair(model, settings.reasoning, capabilityOf(providers, model));
}

export async function resolveModel(pair: LivePair | null): Promise<ResolvedModel> {
  if (!pair) throw new ModelUnavailable('No model is chosen. Add one in Settings → Providers.');
  let ref = pair.model;
  const providers = await providersStorage.get();
  const settings = await settingsStorage.get();

  let targetProvider: ProviderConfig | null = null;
  let targetModel: ModelEntry | null = null;

  // If preferLoadedModel is enabled, check local providers (LM Studio / Ollama) for any model already in memory
  if (settings?.preferLoadedModel) {
    const localProviders = providers.filter(p => LOCAL_KINDS.has(p.kind));
    const chosenIsLocal = localProviders.find(p => p.id === ref.providerId);
    const candidateProviders = chosenIsLocal
      ? [chosenIsLocal, ...localProviders.filter(p => p.id !== ref.providerId)]
      : localProviders;

    for (const provider of candidateProviders) {
      const active = await Promise.race([
        detectActiveLoadedModel({ kind: provider.kind, baseUrl: provider.baseUrl }),
        new Promise<null>(resolve => setTimeout(() => resolve(null), 1_500)),
      ]);
      if (active && active.modelName) {
        targetProvider = provider;
        targetModel = provider.models.find(m => m.name === active.modelName) ?? {
          name: active.modelName,
          detectedContext: active.loadedContextLength ?? active.maxContextLength,
          detectedLoaded: true,
        };
        if (active.loadedContextLength) {
          targetModel = {
            ...targetModel,
            detectedContext: active.loadedContextLength,
            detectedLoaded: true,
          };
        }
        ref = { providerId: provider.id, model: targetModel.name };
        break;
      }
    }
  }

  // Fallback to chosen model if no loaded local model was found
  if (!targetProvider || !targetModel) {
    const found = findModel(providers, ref);
    if (!found) throw new ModelUnavailable(`The model ${ref.model} is no longer configured. Choose another one.`);
    targetProvider = found.provider;
    targetModel = found.model;
  }

  if (targetModel.noToolCalling) {
    throw new ModelUnavailable(`${ref.model} did not pass the tool-calling test and cannot run the agent.`);
  }
  const keys = await keysStorage.get();
  // Ollama and LM Studio are asked again at the start of each run: the window a server loads can change. A server that
  // answers and has not loaded the model clears the loaded mark, so an old loaded number never raises the window; a slow
  // or silent server keeps what was found before.
  let { detectedContext, detectedLoaded } = targetModel;
  if (targetProvider.kind === 'ollama' || targetProvider.kind === 'lmstudio') {
    const spec = { kind: targetProvider.kind, modelName: targetModel.name, baseUrl: targetProvider.baseUrl };
    const fresh = await Promise.race([
      detectContext(spec),
      new Promise<undefined>(resolve => setTimeout(() => resolve(undefined), 2_000)),
    ]);
    const window = fresh?.window ?? detectedContext;
    if (fresh && (window !== detectedContext || fresh.loaded !== !!detectedLoaded)) {
      detectedContext = window;
      detectedLoaded = fresh.loaded;
      const detected = { detectedContext: window, detectedLoaded: fresh.loaded };
      // Stored only while the provider still has the address that was asked: a change of address clears what was learnt
      // about the old server.
      await providersStorage.set(list =>
        list.map(p =>
          p.id === targetProvider!.id && (p.baseUrl ?? '') === (targetProvider!.baseUrl ?? '')
            ? { ...p, models: p.models.map(m => (m.name === targetModel!.name ? { ...m, ...detected } : m)) }
            : p,
        ),
      );
    }
  }
  const profile = resolveProfile({
    kind: targetProvider.kind,
    modelName: targetModel.name,
    baseUrl: targetProvider.baseUrl,
    overrides: targetModel.overrides,
    detectedContext,
    detectedLoaded,
    ...learnt(targetModel),
  });
  const chat = createModel({
    kind: targetProvider.kind,
    modelName: targetModel.name,
    apiKey: keys[targetProvider.id],
    baseUrl: targetProvider.baseUrl,
    maxOutputTokens: profile.maxOutput,
    // Ollama and LM Studio take one request at a time by default; more wait in the extension, not on the server.
    ...(LOCAL_KINDS.has(targetProvider.kind) ? { maxConcurrent: 1 } : {}),
  });
  const learn = (facts: Parameters<NonNullable<ResolvedModel['learn']>>[0]) =>
    void learnFacts(targetProvider!.id, targetProvider!.baseUrl, targetModel!.name, facts);
  return { ref, chat, profile, reasoning: pair.reasoning, learn };
}
