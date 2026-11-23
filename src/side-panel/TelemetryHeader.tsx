// BroAnt Cockpit Telemetry Header: 44px fixed cockpit bar with two-tone BroAnt branding,
// 2px dynamic context progress bar, Dual-LED Cockpit Telemetry (MCP Gate + Agent Activity / Kill-Switch),
// quick theme toggle, and Collapse to Rail action.

import { useEffect, useState } from 'react';
import { CloseIcon, HistoryIcon, LogoMark, MoonIcon, NewChatIcon, SettingsIcon, SunIcon } from '@src/ui/icons';
import { websiteUrl } from '@src/ui/links';
import { t } from '@src/ui/i18n';
import { applyTheme } from '@src/ui/theme';
import { useStorage } from '@src/ui/hooks';
import { bridgeConnectedStorage } from '@src/store/settings';
import { bridgeActivityStore, type BridgeActivityState } from '@src/store/bridge-activity';

function CollapseRailIcon({ size = 15, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M15 3v18" />
      <path d="M8 9l3 3-3 3" />
    </svg>
  );
}

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
  onCollapse?: () => void;
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
  onCollapse,
}: TelemetryHeaderProps) {
  const [isDark, setIsDark] = useState<boolean>(() => {
    return document.documentElement.classList.contains('dark');
  });
  const bridgeConnected = useStorage(bridgeConnectedStorage, false);
  const [activity, setActivity] = useState<BridgeActivityState>(() => bridgeActivityStore.get());

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains('dark'));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const unsubActivity = bridgeActivityStore.subscribe(setActivity);
    return () => {
      unsubActivity();
    };
  }, []);

  const toggleTheme = () => {
    const nextTheme = isDark ? 'light' : 'dark';
    applyTheme(nextTheme);
    setIsDark(!isDark);
  };

  const handleKillAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
      void chrome.runtime.sendMessage({ type: 'broant_rail_action', action: 'kill_all' });
    }
  };

  const handleMinimize = async () => {
    try {
      await chrome.runtime.sendMessage({ type: 'broant_lifecycle', command: 'minimize_to_rail' });
    } catch {}
    if (onCollapse) {
      onCollapse();
    } else {
      window.close();
    }
  };

  const handlePowerOff = async () => {
    try {
      await chrome.runtime.sendMessage({ type: 'broant_lifecycle', command: 'power_off' });
    } catch {}
    window.close();
  };

  const percent = Math.min(100, Math.round((usedTokens / maxTokens) * 100));
  const progressColor =
    percent > 90 ? 'bg-ba-danger' : percent > 75 ? 'bg-ba-honey' : 'bg-ba-accent';

  const mcpState = !bridgeEnabled ? 'off' : bridgeConnected ? 'linked' : 'armed';

  return (
    <header className="relative flex h-11 shrink-0 items-center justify-between border-b border-ba-border/60 bg-ba-bg px-2">
      {/* Left: Brand mark and two-tone BroAnt typography — symmetric toggle to minimize back to rail */}
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={handleMinimize}
          title="Minimize to Rail"
          aria-label="Minimize to Rail"
          className="group flex items-center gap-1.5 p-0.5 rounded transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ba-accent">
          <LogoMark size={28} />
          <span className="flex items-baseline text-[14px] font-bold tracking-tight select-none">
            <span className="text-ba-fg-strong">Bro</span>
            <span className="text-ba-accent">Ant</span>
          </span>
        </button>
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

      {/* Right: Dual-LED Cockpit Telemetry, Theme Toggle, New Chat, History, Settings, Collapse */}
      <div className="flex items-center gap-1">
        {/* Dual-LED Cockpit Module */}
        <div className="flex items-center gap-1 rounded-full border border-ba-border/60 bg-ba-surface px-2 py-0.5 text-[11px] font-mono tracking-tight select-none">
          {/* LED 1: MCP Gate */}
          <button
            type="button"
            onClick={onToggleBridge}
            title={
              mcpState === 'linked'
                ? 'MCP Gate: Linked / Live (Click to disable)'
                : mcpState === 'armed'
                  ? 'MCP Gate: Armed / Waiting for client (Click to disable)'
                  : 'MCP Gate: Off (Click to enable)'
            }
            className="flex items-center gap-1 transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-1 focus-visible:outline-ba-accent">
            <span
              className={`size-2 rounded-full transition-all ${
                mcpState === 'linked'
                  ? 'bg-ba-signal-blue shadow-[0_0_6px_rgba(59,130,246,0.9)] animate-pulse'
                  : mcpState === 'armed'
                    ? 'bg-ba-honey shadow-[0_0_5px_rgba(217,119,6,0.8)]'
                    : 'bg-ba-muted/40'
              }`}
            />
            <span
              className={`text-[10px] font-semibold ${
                mcpState === 'linked'
                  ? 'text-ba-fg'
                  : mcpState === 'armed'
                    ? 'text-ba-honey'
                    : 'text-ba-muted'
              }`}>
              MCP
            </span>
          </button>

          <span className="text-ba-border/70 select-none">|</span>

          {/* LED 2: Agent Activity & Emergency Stop */}
          {activity.phase === 'idle' ? (
            <span
              title="Agent Activity: Idle"
              className="flex items-center gap-1 text-ba-muted cursor-default">
              <span className="size-2 rounded-full border border-ba-muted/40" />
              <span className="text-[10px]">idle</span>
            </span>
          ) : (
            <button
              type="button"
              onClick={handleKillAll}
              title={`Agent: ${activity.phase} (${activity.currentTool ?? 'active'}) • Click to STOP`}
              className="group flex items-center gap-1 rounded px-0.5 transition-colors hover:bg-ba-danger/20 hover:text-ba-danger focus-visible:outline focus-visible:outline-1 focus-visible:outline-ba-danger">
              <span
                className={`size-2 rounded-full ${
                  activity.phase === 'executing'
                    ? 'bg-ba-danger shadow-[0_0_6px_rgba(239,68,68,0.9)] animate-ping'
                    : 'bg-ba-accent animate-pulse'
                }`}
              />
              <span className="text-[10px] font-semibold text-ba-accent group-hover:hidden">
                {activity.phase}
              </span>
              <span className="hidden text-[10px] font-bold text-ba-danger group-hover:inline">
                STOP
              </span>
            </button>
          )}
        </div>

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

        {/* Minimize into Rail Button */}
        <button
          type="button"
          onClick={handleMinimize}
          title="Minimize to Rail"
          aria-label="Minimize to Rail"
          className="flex size-7 items-center justify-center rounded-lg text-ba-muted transition-colors hover:bg-ba-surface hover:text-ba-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-ba-accent">
          <CollapseRailIcon size={15} />
        </button>

        {/* Power Off BroAnt Button */}
        <button
          type="button"
          onClick={handlePowerOff}
          title="Power Off BroAnt (Stops MCP & Agents)"
          aria-label="Power Off BroAnt"
          className="flex size-7 items-center justify-center rounded-lg text-ba-muted transition-colors hover:bg-ba-danger/20 hover:text-ba-danger focus-visible:outline focus-visible:outline-2 focus-visible:outline-ba-danger">
          <CloseIcon size={15} />
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
