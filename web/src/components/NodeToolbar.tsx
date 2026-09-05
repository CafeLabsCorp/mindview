interface NodeToolbarProps {
  obsidian: string | null;
  vscode: string | null;
  isPinned: boolean;
  onTogglePin: () => void;
}

/** obsidian:// / vscode:// are OS-registered custom URI schemes (see
 * server/src/io/externalOpen.ts) — a plain <a href> hand-off is enough,
 * the browser/OS resolves them natively, no server-side process spawn. */
export function NodeToolbar({ obsidian, vscode, isPinned, onTogglePin }: NodeToolbarProps) {
  return (
    <div className="node-toolbar">
      {obsidian && (
        <a className="btn" href={obsidian}>
          Abrir no Obsidian
        </a>
      )}
      {vscode && (
        <a className="btn" href={vscode}>
          Abrir no VSCode
        </a>
      )}
      <button className={`btn${isPinned ? ' btn-primary' : ''}`} onClick={onTogglePin}>
        {isPinned ? '★ Fixado' : '☆ Fixar'}
      </button>
    </div>
  );
}
