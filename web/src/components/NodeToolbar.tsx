import { useT } from '../i18n/useT';

interface NodeToolbarProps {
  obsidian: string | null;
  vscode: string | null;
  isPinned: boolean;
  onTogglePin: () => void;
  showTocToggle?: boolean;
  tocCollapsed?: boolean;
  onToggleToc?: () => void;
}

/** obsidian:// / vscode:// are OS-registered custom URI schemes (see
 * server/src/io/externalOpen.ts) — a plain <a href> hand-off is enough,
 * the browser/OS resolves them natively, no server-side process spawn. */
export function NodeToolbar({
  obsidian,
  vscode,
  isPinned,
  onTogglePin,
  showTocToggle,
  tocCollapsed,
  onToggleToc,
}: NodeToolbarProps) {
  const t = useT();
  return (
    <div className="node-toolbar">
      {obsidian && (
        <a className="btn" href={obsidian}>
          {t('reader.openInObsidian')}
        </a>
      )}
      {vscode && (
        <a className="btn" href={vscode}>
          {t('reader.openInVSCode')}
        </a>
      )}
      <button className={`btn${isPinned ? ' btn-primary' : ''}`} onClick={onTogglePin}>
        {isPinned ? t('reader.pinned') : t('reader.pin')}
      </button>
      {showTocToggle && (
        <button
          className={`btn${tocCollapsed ? '' : ' btn-primary'}`}
          onClick={onToggleToc}
          title={tocCollapsed ? t('reader.showToc') : t('reader.hideToc')}
        >
          {t('reader.tocButton')}
        </button>
      )}
    </div>
  );
}
