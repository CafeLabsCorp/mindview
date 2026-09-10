import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import type { AppState } from '../api/types';
import { navigate, type Screen } from '../lib/hashRoute';
import { Tree, type TreeForceState } from './Tree';
import { BrandLogo } from './BrandLogo';
import { useSettings } from '../context/SettingsContext';
import { useTree } from '../context/TreeContext';
import { useT } from '../i18n/useT';
import type { MessageKey } from '../i18n';

// 'read' isn't a tab here: it has no fixed destination of its own — clicking
// a node in the tree (or the quick-switcher, or a recent/pinned item) opens
// it directly. A separate "Leitor" button that did the same thing with no
// node picked was dead air. Grafo goes first per the Felipe's own ordering
// preference, even though it's still a placeholder screen.
const TABS: { screen: Screen; label: MessageKey; icon: string }[] = [
  { screen: 'grafo', label: 'nav.graph', icon: '◈' },
  { screen: 'estante', label: 'nav.shelf', icon: '▥' },
  { screen: 'console', label: 'nav.console', icon: '▦' },
];

interface SidebarProps {
  /** Slid out rather than unmounted, so tree scroll position and open
   * folders survive a round trip. See .sidebar.is-hidden in global.css:
   * the [hidden] attribute this replaced could not animate. */
  hidden: boolean;
  activeScreen: Screen;
  activePath: string | null;
  onOpenSearch: () => void;
  onHide: () => void;
}

export function Sidebar({ hidden, activeScreen, activePath, onOpenSearch, onHide }: SidebarProps) {
  const { tree } = useTree();
  // Refetches on its own whenever Reader.tsx bumps the shared app-state
  // version (opening a node, pinning/unpinning) — see AppStateEvents.tsx —
  // so "Fixados"/"Recentes" never need a manual reload to catch up.
  const { data: state } = useApi<AppState>('/state');
  const { settings } = useSettings();
  const t = useT();
  const [treeForce, setTreeForce] = useState<TreeForceState>({ open: true, n: 0 });

  return (
    <aside className={`sidebar${hidden ? ' is-hidden' : ''}`}>
      <div className="sidebar-brand">
        <BrandLogo className="brand-logo" />
        {/* Hides the whole column, not just the nav list below it. The
            old nav-only collapse was a half-measure and is gone. */}
        <button className="icon-btn" title={t('nav.hideSidebar')} aria-label={t('nav.hideSidebar')} onClick={onHide}>
          ⟨⟨
        </button>
      </div>

      <div className="nav-collapse is-open">
        <nav className="tab-nav nav-collapse-inner">
          {TABS.map((tab) => (
            <button
              key={tab.screen}
              className={`tab-btn${activeScreen === tab.screen ? ' is-active' : ''}`}
              onClick={() => navigate(tab.screen)}
            >
              <span className="icon">{tab.icon}</span>
              {t(tab.label)}
            </button>
          ))}
          <button className={`tab-btn${activeScreen === 'ajustes' ? ' is-active' : ''}`} onClick={() => navigate('ajustes')}>
            <span className="icon">⚙</span>
            {t('nav.settings')}
          </button>
        </nav>
      </div>

      <button className="search-btn" onClick={onOpenSearch}>
        <span>{t('nav.search')}</span>
        <kbd>Ctrl+K</kbd>
      </button>

      {settings.recentPinnedEnabled && state && (state.pinnedNodes.length > 0 || state.recentNodes.length > 0) && (
        <>
          {state.pinnedNodes.length > 0 && (
            <>
              <div className="sidebar-section-label">{t('nav.pinned')}</div>
              <div className="quick-list">
                {state.pinnedNodes.slice(0, 6).map((p) => (
                  <button key={p} className="quick-list-item" title={p} onClick={() => navigate('read', p)}>
                    {p.split('/').pop()}
                  </button>
                ))}
              </div>
            </>
          )}
          {state.recentNodes.length > 0 && (
            <>
              <div className="sidebar-section-label">{t('nav.recent')}</div>
              <div className="quick-list">
                {state.recentNodes.slice(0, 5).map((p) => (
                  <button key={p} className="quick-list-item" title={p} onClick={() => navigate('read', p)}>
                    {p.split('/').pop()}
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <div className="sidebar-section-label-row">
        <div className="sidebar-section-label">{t('nav.vault')}</div>
        <button
          className="icon-btn"
          title={treeForce.open ? t('nav.collapseAll') : t('nav.expandAll')}
          onClick={() => setTreeForce((s) => ({ open: !s.open, n: s.n + 1 }))}
        >
          {treeForce.open ? '><' : '<>'}
        </button>
      </div>
      <div className="tree-scroll">{tree && <Tree nodes={tree} activePath={activePath} forceState={treeForce} />}</div>
    </aside>
  );
}
