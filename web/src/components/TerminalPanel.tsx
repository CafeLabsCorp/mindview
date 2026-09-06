import { useCallback, useEffect, useState } from 'react';
import { TerminalView, type TerminalStatus } from './TerminalView';
import { useSettings } from '../context/SettingsContext';
import { clampHeight, MAX_PANEL_HEIGHT, MIN_PANEL_HEIGHT } from '../lib/terminalPanelState';

interface Tab {
  id: number;
  /** Bumping this restarts the shell in place, keeping the tab. */
  restartKey: number;
  status: TerminalStatus;
  detail: string;
}

interface Props {
  /** Minimised, not unmounted: the panel keeps rendering (hidden) so every
   * tab's socket — and therefore its shell — stays alive. Unmounting would
   * be indistinguishable from "encerrar". */
  visible: boolean;
  height: number;
  onHeightChange: (px: number) => void;
  onMinimize: () => void;
  /** Called when the last tab is closed — nothing left to show. */
  onAllClosed: () => void;
}

let nextTabId = 1;

export function TerminalPanel({ visible, height, onHeightChange, onMinimize, onAllClosed }: Props) {
  const { settings } = useSettings();
  // Starts empty and fills in when the panel is first shown: a tab mounts
  // a shell the moment it exists, and starting `claude` behind a hidden
  // panel would be both wasteful and surprising.
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeId, setActiveId] = useState<number>(0);
  const active = tabs.find((t) => t.id === activeId) ?? null;

  const setTabState = useCallback((id: number, status: TerminalStatus, detail: string) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, status, detail } : t)));
  }, []);

  const openTab = useCallback(() => {
    const tab: Tab = { id: nextTabId++, restartKey: 0, status: 'connecting', detail: '' };
    setTabs((prev) => [...prev, tab]);
    setActiveId(tab.id);
  }, []);

  const closeTab = useCallback(
    (id: number) => {
      // Unmounting the view is what kills the shell: its cleanup closes the
      // socket, and the server kills the PTY on 'close'. This is the whole
      // difference between "encerrar" and "minimizar".
      //
      // Computed from the current tabs rather than inside a setState
      // updater: updaters must be pure, and StrictMode runs them twice.
      const next = tabs.filter((t) => t.id !== id);
      setTabs(next);
      if (next.length === 0) onAllClosed();
      else if (activeId === id) setActiveId(next[next.length - 1].id);
    },
    [tabs, activeId, onAllClosed],
  );

  // Opening the panel with nothing in it starts one session — including
  // the very first time, and again after everything was closed.
  useEffect(() => {
    if (visible && tabs.length === 0) openTab();
  }, [visible, tabs.length, openTab]);

  const restartTab = useCallback((id: number) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, restartKey: t.restartKey + 1, status: 'connecting', detail: '' } : t)));
  }, []);

  const startDrag = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const startY = e.clientY;
      const startHeight = height;
      const onMove = (ev: PointerEvent) => onHeightChange(clampHeight(startHeight + (startY - ev.clientY)));
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [height, onHeightChange],
  );

  return (
    <section className="terminal-panel" style={{ height }} aria-label="Terminal" hidden={!visible}>
      <div
        className="terminal-resize-handle"
        onPointerDown={startDrag}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Redimensionar o terminal"
        aria-valuenow={height}
        aria-valuemin={MIN_PANEL_HEIGHT}
        aria-valuemax={MAX_PANEL_HEIGHT}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') onHeightChange(clampHeight(height + 24));
          else if (e.key === 'ArrowDown') onHeightChange(clampHeight(height - 24));
        }}
      />
      <header className="terminal-panel-head">
        <div className="terminal-tabs" role="tablist" aria-label="Sessões de terminal">
          {tabs.map((tab, i) => (
            <div key={tab.id} className={`terminal-tab${tab.id === activeId ? ' is-active' : ''}`}>
              <button role="tab" aria-selected={tab.id === activeId} className="terminal-tab-label mono" onClick={() => setActiveId(tab.id)}>
                <span className={`terminal-tab-dot is-${tab.status}`} aria-hidden="true" />
                terminal {i + 1}
              </button>
              <button className="terminal-tab-close" onClick={() => closeTab(tab.id)} aria-label={`Encerrar terminal ${i + 1}`} title="Encerrar esta sessão">
                ✕
              </button>
            </div>
          ))}
          {/* Plain ASCII '+': the fullwidth '＋' has no glyph in JetBrains
              Mono and rendered as tofu. */}
          <button className="terminal-tab-new" onClick={openTab} aria-label="Nova sessão de terminal" title="Nova sessão">
            +
          </button>
        </div>
        <span className={`terminal-panel-status is-${active?.status ?? 'connecting'}`}>{active?.detail ?? ''}</span>
        <div className="terminal-panel-actions">
          {active && (active.status === 'exited' || active.status === 'error') && (
            <button className="btn btn-ghost btn-sm" onClick={() => restartTab(active.id)}>
              reabrir
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={onMinimize} aria-label="Minimizar o terminal" title="Minimizar — as sessões continuam rodando">
            —
          </button>
        </div>
      </header>
      <div className="terminal-panel-body">
        {tabs.map((tab) => (
          <TerminalView
            key={tab.id}
            active={visible && tab.id === activeId}
            fontSize={settings.terminalFontSize}
            restartKey={tab.restartKey}
            onStatus={(status, detail) => setTabState(tab.id, status, detail)}
          />
        ))}
      </div>
    </section>
  );
}

// Default export so App can React.lazy() this module: xterm.js is ~250 KB
// and the terminal is off by default, so most sessions must never pay for
// it. See App.tsx.
export default TerminalPanel;
