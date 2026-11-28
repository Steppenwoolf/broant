import { Component } from 'react';
import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import '@src/ui/index.css';
import { watchSystemTheme } from '@src/ui/theme';
import { logEvent } from '@src/store/logs';
import { App } from './App';

class PanelErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    logEvent('error', 'side-panel', error.message || 'Side panel render error', error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex min-h-screen flex-col items-start justify-center gap-3 p-4 text-sm text-nb-fg">
          <p className="font-semibold text-red-600 dark:text-red-400">Side Panel error: {this.state.error.message}</p>
          <button
            type="button"
            className="rounded-lg border border-nb-border bg-nb-surface px-3 py-1.5 text-xs font-medium hover:opacity-90"
            onClick={() => window.location.reload()}>
            Reload Panel
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const container = document.querySelector('#app-container');
if (!container) throw new Error('Cannot find #app-container');
watchSystemTheme();
createRoot(container).render(
  <PanelErrorBoundary>
    <App />
  </PanelErrorBoundary>,
);
