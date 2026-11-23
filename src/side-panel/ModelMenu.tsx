// The composer's model picker: a menu built like the mode menu, with the models and, under them, the reasoning effort
// as one row of pills.
import { useEffect, useRef, useState } from 'react';
import type { ReasoningEffort, ReasoningSupport } from '@src/llm/catalogue';
import type { ModelRef } from '@src/store/types';
import { t } from '@src/ui/i18n';
import { CheckIcon, ChevronIcon } from '@src/ui/icons';

export interface ModelChoice {
  ref: ModelRef;
  /** The model's name and its provider's, as the menu lists it. */
  label: string;
  /** The model's name alone, for the button. */
  name: string;
  /** Whether the model reasons; absent when unknown. */
  capability?: ReasoningSupport;
}

const ALL: ReasoningEffort[] = ['none', 'low', 'medium', 'high'];

/**
 * The effort row for a model: no row for a model with no effort choice, Low to High for one that cannot stop reasoning,
 * all four otherwise. A value the row does not offer shows as Low, which is what is sent.
 */
export function effortRow(
  capability: ReasoningSupport | undefined,
  value: ReasoningEffort,
): { pills: ReasoningEffort[]; shown: ReasoningEffort } | null {
  if (capability === 'none') return null;
  const pills = capability === 'always' ? ALL.slice(1) : ALL;
  return { pills, shown: pills.includes(value) ? value : 'low' };
}

const sameRef = (a: ModelRef | null, b: ModelRef) => !!a && a.providerId === b.providerId && a.model === b.model;
/** A model's value for the checks: the provider id (a UUID, with no colon) and the model name. */
const valueOf = (ref: ModelRef) => `${ref.providerId}:${ref.model}`;

export function ModelMenu({
  models,
  model,
  reasoning,
  running,
  onModel,
  onReasoning,
  preferLoaded,
  onPreferLoaded,
  onRefreshLoadedModel,
  activeLoadedModelName,
}: {
  models: ModelChoice[];
  model: ModelRef | null;
  reasoning: ReasoningEffort;
  /** A run is active: a change applies when the next run starts. */
  running: boolean;
  onModel: (model: ModelRef) => void;
  onReasoning: (reasoning: ReasoningEffort) => void;
  preferLoaded?: boolean;
  onPreferLoaded?: (prefer: boolean) => void;
  onRefreshLoadedModel?: () => void;
  activeLoadedModelName?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const chosen = models.find(m => sameRef(model, m.ref));
  const row = chosen ? effortRow(chosen.capability, reasoning) : null;
  // The button names the effort for a model known to reason.
  const showEffort = !!row && (chosen?.capability === 'optional' || chosen?.capability === 'always');
  const label = chosen ? chosen.name : t(models.length ? 'composer.noModel' : 'composer.noModels');

  useEffect(() => {
    if (!open) return;
    if (preferLoaded) {
      onRefreshLoadedModel?.();
    }
    root.current?.querySelector<HTMLElement>('[role="menuitemradio"][aria-checked="true"]')?.focus();
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open, preferLoaded, onRefreshLoadedModel]);

  const close = () => {
    setOpen(false);
    button.current?.focus();
  };

  return (
    // Not positioned itself: the menu opens over the composer, from its left edge, so it fits a narrow panel. It closes
    // when focus leaves it, so Escape never reaches the panel's Stop while it stays open.
    <div
      ref={root}
      className="flex min-w-0 shrink"
      onBlur={e => {
        if (open && !root.current?.contains(e.relatedTarget as Node | null)) setOpen(false);
      }}>
      <button
        ref={button}
        type="button"
        disabled={!models.length}
        aria-label={`${t('composer.model')}: ${label}${showEffort && row ? ` · ${t(`reasoning.${row.shown}`)}` : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        data-label={t('composer.model')}
        data-value={model ? valueOf(model) : ''}
        className="flex min-w-0 max-w-[120px] items-center gap-1 whitespace-nowrap rounded-full border border-ba-border/60 bg-ba-surface px-1.5 py-0.5 text-xs font-medium text-ba-fg transition-colors hover:border-ba-border focus:outline-none focus-visible:ring-2 focus-visible:ring-ba-accent/40 disabled:opacity-40"
        onClick={() => setOpen(o => !o)}>
        <span className="truncate">{label}</span>
        {/* In a narrow panel the effort goes first, then the name is cut. */}
        {showEffort && row ? (
          <span className="shrink-0 whitespace-nowrap max-[340px]:hidden">· {t(`reasoning.${row.shown}`)}</span>
        ) : null}
        <ChevronIcon size={12} className={`shrink-0 transition-transform ${open ? '-rotate-90' : 'rotate-90'}`} />
      </button>
      {open ? (
        <div
          role="menu"
          aria-label={t('composer.model')}
          tabIndex={-1}
          onKeyDown={e => {
            if (e.key === 'Escape') {
              e.stopPropagation();
              close();
            } else if (
              e.key === 'Tab' &&
              !e.shiftKey &&
              (e.target as HTMLElement).getAttribute('role') === 'menuitemradio'
            ) {
              // From any model, Tab goes to the effort row's checked pill.
              const pill = e.currentTarget.querySelector<HTMLElement>('[role="radio"][tabindex="0"]');
              if (pill) {
                e.preventDefault();
                pill.focus();
              }
            } else if (
              (e.key === 'ArrowDown' || e.key === 'ArrowUp') &&
              !(e.target as HTMLElement).closest('[role="radiogroup"]')
            ) {
              e.preventDefault();
              const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
              const at = items.indexOf(document.activeElement as HTMLElement);
              items[(at + (e.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length]?.focus();
            }
          }}
          className="absolute bottom-11 left-2 z-10 flex w-72 max-w-[calc(100%-1rem)] flex-col rounded-xl border border-ba-border bg-ba-bg p-1 text-xs text-ba-fg shadow-pop">
          {onPreferLoaded !== undefined ? (
            <label
              className="flex items-center justify-between gap-2 border-b border-ba-border px-3 py-2 text-xs text-ba-fg cursor-pointer select-none hover:bg-ba-surface rounded-t-lg transition-colors"
              title={t('composer.preferLoadedTooltip')}>
              <span className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={preferLoaded}
                  onChange={e => {
                    const next = e.target.checked;
                    onPreferLoaded(next);
                    if (next) onRefreshLoadedModel?.();
                  }}
                  className="size-3.5 rounded border-ba-border text-ba-honey focus:ring-ba-honey/40 accent-ba-honey cursor-pointer"
                />
                <span className="font-medium">{t('composer.preferLoaded')}</span>
              </span>
              {activeLoadedModelName ? (
                <span className="text-[10px] font-mono text-ba-honey bg-ba-honey/15 px-1.5 py-0.5 rounded border border-ba-honey/30 truncate max-w-[120px]">
                  {activeLoadedModelName}
                </span>
              ) : null}
            </label>
          ) : null}
          <div className="flex max-h-60 flex-col overflow-y-auto">
            {models.map(m => (
              <button
                key={valueOf(m.ref)}
                type="button"
                role="menuitemradio"
                aria-checked={sameRef(model, m.ref)}
                // One Tab stop for the list, so Tab goes on to the effort row; the arrow keys move within it.
                tabIndex={sameRef(model, m.ref) || (!chosen && m === models[0]) ? 0 : -1}
                data-value={valueOf(m.ref)}
                className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-left transition-colors hover:bg-ba-surface focus-visible:bg-ba-surface focus-visible:outline-none"
                onClick={() => {
                  close();
                  if (!sameRef(model, m.ref)) onModel(m.ref);
                }}>
                <span className="min-w-0 flex-1 truncate text-ba-fg">{m.label}</span>
                {m.name === activeLoadedModelName ? (
                  <span className="shrink-0 text-[10px] font-medium text-ba-honey bg-ba-honey/15 px-1.5 py-0.5 rounded border border-ba-honey/30">
                    {t('composer.loaded')}
                  </span>
                ) : null}
                <CheckIcon size={14} className={sameRef(model, m.ref) ? 'text-ba-honey' : 'invisible'} />
              </button>
            ))}
          </div>
          {row ? <EffortRow row={row} value={reasoning} onReasoning={onReasoning} running={running} /> : null}
        </div>
      ) : null}
    </div>
  );
}

/** One row of pills, a radio group: the arrow keys move and choose within it. */
function EffortRow({
  row,
  value,
  running,
  onReasoning,
}: {
  row: { pills: ReasoningEffort[]; shown: ReasoningEffort };
  /** The stored effort, which may differ from the pill shown (None on a model that cannot stop shows Low). */
  value: ReasoningEffort;
  running: boolean;
  onReasoning: (reasoning: ReasoningEffort) => void;
}) {
  return (
    <div className="mt-1 flex flex-col gap-1.5 border-t border-ba-border px-3 pb-1.5 pt-2">
      <span id="ba-reasoning-label" className="text-ba-muted font-medium">
        {t('composer.reasoning')}
      </span>
      <div role="radiogroup" aria-labelledby="ba-reasoning-label" className="flex flex-wrap gap-1">
        {row.pills.map(p => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={p === row.shown}
            tabIndex={p === row.shown ? 0 : -1}
            data-value={p}
            onKeyDown={e => {
              const step =
                e.key === 'ArrowRight' || e.key === 'ArrowDown'
                  ? 1
                  : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
                    ? -1
                    : 0;
              if (!step) return;
              e.preventDefault();
              e.stopPropagation();
              const group = e.currentTarget.parentElement;
              const next = row.pills[(row.pills.indexOf(row.shown) + step + row.pills.length) % row.pills.length];
              onReasoning(next);
              setTimeout(() => group?.querySelector<HTMLElement>(`[data-value="${next}"]`)?.focus());
            }}
            className={`flex-1 whitespace-nowrap rounded-full border px-2 py-1 text-center transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ba-honey/40 ${p === row.shown ? 'border-ba-honey bg-ba-honey/15 font-medium text-ba-honey shadow-sm' : 'border-ba-border/70 bg-ba-surface/40 text-ba-muted hover:border-ba-border hover:text-ba-fg hover:bg-ba-surface'}`}
            onClick={() => {
              if (p !== value) onReasoning(p);
            }}>
            {t(`reasoning.${p}`)}
          </button>
        ))}
      </div>
      {running ? <span className="text-ba-muted">{t('composer.reasoningNextRun')}</span> : null}
    </div>
  );
}
