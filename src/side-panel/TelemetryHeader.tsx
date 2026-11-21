// BroAnt Cockpit Telemetry Header: 44px fixed cockpit bar with two-tone BroAnt branding,
// 2px dynamic context progress bar, MCP Bridge status LED pill, and quick theme toggle.

import { useEffect, useState } from 'react';
import { HistoryIcon, LogoMark, MoonIcon, NewChatIcon, SettingsIcon, SunIcon } from '@src/ui/icons';
import { websiteUrl } from '@src/ui/links';
import { t } from '@src/ui/i18n';
import { applyTheme, storedTheme } from '@src/ui/theme';

export interface TelemetryHeaderProps {
  conversationTitle?: string | null;
  active?: boolean;
  usedTokens?: number;
  maxTokens?: number;
  bridgeEnabled?: boolean;
  onToggleBridge?: () => void;
  onNewChat: () => void;
  onOpenHistory: () => void;
  onOpenSettings: () => void;
}

export function TelemetryHeader({
  conversationTitle,
  active,
  usedTokens = 0,
  maxTokens = 32768,
  bridgeEnabled = false,
  onToggleBridge,
  onNewChat,
  onOpenHistory,
  onOpenSettings,
}: TelemetryHeaderProps) {
  const [isDark, setIsDark] = useState<boolean>(() => {
    return document.documentElement.classList.contains('dark');
  });

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  const toggleTheme = () => {
    const nextTheme = isDark ? 'light' : 'dark';
    applyTheme(nextTheme);
    setIsDark(!isDark);
  };

  const percent = Math.min(100, Math.round((usedTokens / maxTokens) * 100));
  const progressColor =
    percent > 90 ? 'bg-ba-danger' : percent > 75 ? 'bg-ba-honey' : 'bg-ba-accent';

  return (
    <header className="relative flex h-11 shrink-0 items-center justify-between border-b border-ba-border/60 bg-ba-bg px-2.5">
      {/* Left: Brand mark and two-tone BroAnt typography */}
      <div className="flex items-center gap-2">
        <a
          href={websiteUrl('/', 'side-panel')}
          target="_blank"
          rel="noreferrer"
          title={t('panel.website')}
          aria-label={t('panel.website')}
          className="flex shrink-0 rounded transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ba-accent">
          <LogoMark size={20} />
        </a>
        <span className="flex items-baseline text-[14px] font-bold tracking-tight select-none">
          <span className="text-ba-fg-strong">Bro</span>
          <span className="text-ba-accent">Ant</span>
        </span>
        {usedTokens > 0 ? (
          <span
            title={`Context usage: ${usedTokens.toLocaleString()} / ${maxTokens.toLocaleString()} tokens (${percent}%)`}
            className="ml-1 rounded border border-ba-border/50 bg-ba-surface px-1.5 py-0.2 text-[10px] font-mono text-ba-muted select-none">
            {usedTokens > 1000 ? `${(usedTokens / 1000).toFixed(1)}k` : usedTokens}
          </span>
        ) : null}
      </div>

      {/* Screen reader title */}
      <h1 className="sr-only">{conversationTitle || t('panel.newChat')}</h1>

      {/* Right: MCP Status Pill, Theme Toggle, New Chat, History, Settings */}
      <div className="flex items-center gap-1">
        {/* MCP Bridge Status Pill */}
        <button
          type="button"
          onClick={onToggleBridge}
          title={
            bridgeEnabled
              ? 'Agent Bridge: Active (Click to toggle)'
              : 'Agent Bridge: Off (Click to toggle)'
          }
          className="flex items-center gap-1.5 rounded-full border border-ba-border/60 bg-ba-surface px-2 py-0.5 text-[11px] font-mono tracking-tight transition-colors hover:border-ba-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-ba-accent">
          <span
            className={`size-1.5 rounded-full ${
              bridgeEnabled
                ? 'bg-ba-signal-blue shadow-[0_0_6px_rgba(59,130,246,0.9)] animate-pulse'
                : 'bg-ba-muted/40'
            }`}
          />
          <span className={bridgeEnabled ? 'font-medium text-ba-fg' : 'text-ba-muted'}>
            MCP • {bridgeEnabled ? 'Live' : 'Off'}
          </span>
        </button>

        {/* Theme Toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          title={isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
          aria-label={isDark ? 'Switch to Light Theme' : 'Switch to Dark Theme'}
          className="flex size-7 items-center justify-center rounded-lg text-ba-muted transition-colors hover:bg-ba-surface hover:text-ba-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-ba-accent">
          {isDark ? <SunIcon size={15} /> : <MoonIcon size={15} />}
        </button>

        {/* New Chat */}
        <button
          type="button"
          onClick={onNewChat}
          title={t('panel.newChat')}
          aria-label={t('panel.newChat')}
          className="flex size-7 items-center justify-center rounded-lg text-ba-muted transition-colors hover:bg-ba-surface hover:text-ba-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-ba-accent">
          <NewChatIcon size={15} />
        </button>

        {/* History */}
        <button
          type="button"
          disabled={active}
          onClick={onOpenHistory}
          title={active ? t('history.busy') : t('history.title')}
          aria-label={t('history.title')}
          className="flex size-7 items-center justify-center rounded-lg text-ba-muted transition-colors hover:bg-ba-surface hover:text-ba-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-ba-accent disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ba-muted">
          <HistoryIcon size={15} />
        </button>

        {/* Settings */}
        <button
          type="button"
          onClick={onOpenSettings}
          title={t('panel.settings')}
          aria-label={t('panel.settings')}
          className="flex size-7 items-center justify-center rounded-lg text-ba-muted transition-colors hover:bg-ba-surface hover:text-ba-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-ba-accent">
          <SettingsIcon size={15} />
        </button>
      </div>

      {/* 2px Context Usage Progress Bar */}
      {usedTokens > 0 ? (
        <div className="absolute inset-x-0 bottom-0 h-[2px] bg-ba-border/30 overflow-hidden">
          <div
            className={`h-full transition-all duration-300 ${progressColor}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      ) : null}
    </header>
  );
}
