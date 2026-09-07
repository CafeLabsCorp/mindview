import { navigate } from '../lib/hashRoute';
import type { TerminalSessions } from '../lib/terminalSessions';

interface Props {
  enabled: boolean;
  sessions: TerminalSessions;
  /** Expands the panel, optionally focusing one existing session. */
  onExpand: (tabId?: number) => void;
}

/**
 * The collapsed form of the terminal panel — not a second control that
 * duplicates it. Round 2 shipped a bar *and* a panel header that both
 * toggled the same thing, which read as confusing; round 3 made the bar
 * what you see when the panel is down, listing what is running so you can
 * tell at a glance without expanding.
 *
 * It also stays visible with the feature switched off, pointing at the
 * setting: a silent opt-in is undiscoverable, and showing a link grants no
 * capability — the socket still refuses every connection.
 */
export function TerminalBar({ enabled, sessions, onExpand }: Props) {
  if (!enabled) {
    return (
      <footer className="terminal-bar">
        <button className="terminal-bar-btn is-off" onClick={() => navigate('ajustes')}>
          terminal desligado — habilitar nos Ajustes
        </button>
      </footer>
    );
  }

  return (
    <footer className="terminal-bar">
      <button className="terminal-bar-btn" onClick={() => onExpand()} aria-label="Expandir o terminal" title="Expandir o terminal">
        <span className="terminal-bar-caret" aria-hidden="true">
          ‹
        </span>
        terminal
      </button>
      {sessions.tabs.map((tab, i) => (
        <button key={tab.id} className="terminal-bar-tab mono" onClick={() => onExpand(tab.id)} title={tab.detail || `terminal ${i + 1}`}>
          <span className={`terminal-tab-dot is-${tab.status}`} aria-hidden="true" />
          terminal {i + 1}
        </button>
      ))}
      <span className="terminal-bar-hint mono">Ctrl+`</span>
    </footer>
  );
}
