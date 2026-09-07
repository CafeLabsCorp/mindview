import { useCallback } from 'react';
import { TerminalView } from './TerminalView';
import { useSettings } from '../context/SettingsContext';
import { clampHeight, MAX_PANEL_HEIGHT, MIN_PANEL_HEIGHT } from '../lib/terminalPanelState';
import type { TerminalSessions } from '../lib/terminalSessions';

interface Props {
  /** Collapsed, not unmounted: the panel keeps rendering (hidden) so every
   * tab's socket — and therefore its shell — stays alive. Unmounting would
   * be indistinguishable from ending the sessions. */
  visible: boolean;
  height: number;
  sessions: TerminalSessions;
  onHeightChange: (px: number) => void;
  onCollapse: () => void;
}

export function TerminalPanel({ visible, height, sessions, onHeightChange, onCollapse }: Props) {
  const { settings } = useSettings();
  const { tabs, activeId, active } = sessions;

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
              <button
                role="tab"
                aria-selected={tab.id === activeId}
                className="terminal-tab-label mono"
                onClick={() => sessions.activate(tab.id)}
              >
                <span className={`terminal-tab-dot is-${tab.status}`} aria-hidden="true" />
                terminal {i + 1}
              </button>
              <button
                className="terminal-tab-close"
                onClick={() => sessions.close(tab.id)}
                aria-label={`Encerrar terminal ${i + 1}`}
                title="Encerrar esta sessão"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <span className={`terminal-panel-status is-${active?.status ?? 'connecting'}`}>{active?.detail ?? ''}</span>
        {/* One group of three, rather than a lone button stranded on the
            right — the arrangement Felipe picked in round 3. */}
        <div className="terminal-panel-actions">
          {active && (active.status === 'exited' || active.status === 'error') && (
            <button className="btn btn-ghost btn-sm" onClick={() => sessions.restart(active.id)}>
              reabrir
            </button>
          )}
          <button className="terminal-action" onClick={() => sessions.open()} aria-label="Nova sessão de terminal" title="Nova sessão">
            +
          </button>
          <button className="terminal-action" onClick={onCollapse} aria-label="Recolher o terminal" title="Recolher — as sessões continuam rodando">
            ›
          </button>
          <button
            className="terminal-action"
            onClick={() => sessions.closeAll()}
            aria-label="Encerrar todas as sessões"
            title="Encerrar todas as sessões"
          >
            ✕
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
            onStatus={(status, detail) => sessions.setStatus(tab.id, status, detail)}
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
