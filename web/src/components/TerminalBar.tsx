import { navigate } from '../lib/hashRoute';

interface Props {
  enabled: boolean;
  open: boolean;
  onToggle: () => void;
}

/**
 * The always-visible strip at the bottom of the window. It exists because
 * a silent opt-in is undiscoverable: the terminal shipped disabled, and
 * with no affordance anywhere there was no way to learn it existed short
 * of reading the settings screen top to bottom. When the feature is off
 * this bar says so and links to the switch — showing a link grants no
 * capability, the socket still refuses every connection.
 */
export function TerminalBar({ enabled, open, onToggle }: Props) {
  if (!enabled) {
    return (
      <footer className="terminal-bar">
        <button className="terminal-bar-btn is-off" onClick={() => navigate('ajustes')}>
          <span aria-hidden="true">▁</span> terminal desligado — habilitar nos Ajustes
        </button>
      </footer>
    );
  }
  return (
    <footer className="terminal-bar">
      <button className="terminal-bar-btn" onClick={onToggle} aria-expanded={open}>
        <span aria-hidden="true">▁</span> terminal
      </button>
      <span className="terminal-bar-hint mono">Ctrl+`</span>
    </footer>
  );
}
