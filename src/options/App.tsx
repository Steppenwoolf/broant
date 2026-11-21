// BroAnt Control Center: 4-workspace Bento Dashboard
// 1. Bridge & MCP (Default)
// 2. Runtime & Models
// 3. Shield & Access
// 4. General & About

import { useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, settingsStorage } from '@src/store/settings';
import { useStorage } from '@src/ui/hooks';
import { setLanguage, t, useLanguage } from '@src/ui/i18n';
import { applyTheme } from '@src/ui/theme';
import { GeneralSection } from './GeneralSection';
import { ProvidersSection } from './ProvidersSection';
import { BridgeSection } from './BridgeSection';
import { PermissionsSection } from './PermissionsSection';
import { ShortcutsSection } from './ShortcutsSection';
import { MemorySection } from './MemorySection';
import { DataSection } from './DataSection';
import { AboutSection } from './AboutSection';
import { Logo } from '@src/ui/icons';
import { websiteUrl } from '@src/ui/links';

export type WorkspaceId = 'bridge' | 'runtime' | 'shield' | 'general';

interface WorkspaceTab {
  id: WorkspaceId;
  label: string;
  badge?: string;
  description: string;
}

const WORKSPACES: WorkspaceTab[] = [
  {
    id: 'bridge',
    label: '1. Bridge & MCP',
    badge: 'Core',
    description: 'Agent Bridge WebSocket, sticky sessions & MCP server config',
  },
  {
    id: 'runtime',
    label: '2. Runtime & Models',
    badge: 'LLM',
    description: 'LM Studio, Ollama, local models & API providers',
  },
  {
    id: 'shield',
    label: '3. Shield & Access',
    badge: 'Security',
    description: 'Domain allowlist/blocklist, file permissions & tool guardrails',
  },
  {
    id: 'general',
    label: '4. General & About',
    badge: 'Config',
    description: 'Themes, shortcuts, memory, data cleanup & BroAnt version',
  },
];

const HASH_MAP: Record<string, WorkspaceId> = {
  bridge: 'bridge',
  providers: 'runtime',
  runtime: 'runtime',
  models: 'runtime',
  permissions: 'shield',
  shield: 'shield',
  access: 'shield',
  general: 'general',
  shortcuts: 'general',
  memory: 'general',
  data: 'general',
  about: 'general',
};

function workspaceFromHash(): WorkspaceId {
  const hash = location.hash.slice(1).split('?')[0].toLowerCase();
  return HASH_MAP[hash] ?? 'bridge';
}

export function App() {
  useLanguage();
  const settings = useStorage(settingsStorage, DEFAULT_SETTINGS);
  const [workspace, setWorkspace] = useState<WorkspaceId>(workspaceFromHash);

  useEffect(() => {
    const onHash = () => setWorkspace(workspaceFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => void setLanguage(settings.uiLanguage), [settings.uiLanguage]);
  useEffect(() => applyTheme(settings.theme), [settings.theme]);

  const selectWorkspace = (id: WorkspaceId) => {
    setWorkspace(id);
    history.replaceState(null, '', `#${id}`);
  };

  return (
    <div className="nb-field min-h-screen bg-ba-bg text-ba-fg">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6 sm:px-8 sm:py-10">
        {/* Top Control Center Header */}
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-ba-border/60 pb-5">
          <div className="flex items-center gap-4">
            <Logo height={32} />
            <div className="flex flex-col">
              <span className="text-xs font-mono uppercase tracking-wider text-ba-muted">
                Control Center
              </span>
              <h1 className="text-lg font-bold tracking-tight text-ba-fg-strong sm:text-xl">
                BroAnt Cockpit
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <a
              href={websiteUrl('/docs', 'settings')}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-ba-border/60 bg-ba-surface px-3 py-1.5 text-xs font-medium text-ba-fg transition-colors hover:border-ba-border hover:bg-ba-surface-elevated focus-visible:outline focus-visible:outline-2 focus-visible:outline-ba-accent">
              Documentation & Help
            </a>
          </div>
        </header>

        {/* 4-Workspace Segmented Bento Navigation */}
        <nav
          aria-label="BroAnt Workspaces"
          className="mb-8 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {WORKSPACES.map(ws => {
            const active = ws.id === workspace;
            return (
              <button
                key={ws.id}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => selectWorkspace(ws.id)}
                className={`group flex flex-col items-start gap-1 rounded-xl border p-3.5 text-left transition-all ${
                  active
                    ? 'border-ba-accent bg-ba-surface shadow-md ring-1 ring-ba-accent/30'
                    : 'border-ba-border/60 bg-ba-surface/70 hover:border-ba-border hover:bg-ba-surface'
                }`}>
                <div className="flex w-full items-center justify-between">
                  <span
                    className={`text-sm font-bold tracking-tight ${
                      active ? 'text-ba-accent' : 'text-ba-fg-strong'
                    }`}>
                    {ws.label}
                  </span>
                  {ws.badge ? (
                    <span
                      className={`rounded px-1.5 py-0.2 text-[10px] font-mono font-semibold ${
                        active
                          ? 'bg-ba-accent text-white'
                          : 'bg-ba-surface-elevated text-ba-muted'
                      }`}>
                      {ws.badge}
                    </span>
                  ) : null}
                </div>
                <span className="text-[12px] leading-snug text-ba-muted line-clamp-1">
                  {ws.description}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Workspace Bento Content Canvas */}
        <main className="min-w-0 flex-1">
          {workspace === 'bridge' && (
            <div className="flex flex-col gap-6">
              <BridgeSection />
            </div>
          )}

          {workspace === 'runtime' && (
            <div className="flex flex-col gap-6">
              <ProvidersSection />
            </div>
          )}

          {workspace === 'shield' && (
            <div className="flex flex-col gap-6">
              <PermissionsSection />
            </div>
          )}

          {workspace === 'general' && (
            <div className="flex flex-col gap-8">
              <GeneralSection />
              <ShortcutsSection />
              <MemorySection />
              <DataSection />
              <AboutSection />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
