// The 3-dots-and-a-path bar is the app's visual signature (design cycle 2,
// confirmed by Felipe) — present on every screen, not just the reader.
// Unlike the reading-mode typography, this chrome is NEVER affected by the
// Ajustes typography customization: it's always JetBrains Mono, always
// these exact colors, so it stays recognizable regardless of what the user
// does to the prose font.
interface TerminalChromeProps {
  path: string;
  actions?: React.ReactNode;
}

export function TerminalChrome({ path, actions }: TerminalChromeProps) {
  return (
    <div className="term-chrome">
      <span className="term-dot" style={{ background: '#ff5f57' }} />
      <span className="term-dot" style={{ background: '#febc2e' }} />
      <span className="term-dot" style={{ background: '#28c840' }} />
      <span className="term-chrome-path">{path}</span>
      {actions && <div className="term-chrome-actions">{actions}</div>}
    </div>
  );
}
