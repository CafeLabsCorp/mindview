import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import type { AppState } from '../api/types';
import { navigate, type Screen } from '../lib/hashRoute';
import { Tree, type TreeForceState } from './Tree';
import { useSettings } from '../context/SettingsContext';
import { useTree } from '../context/TreeContext';

// Persisted the same way as the tree's open/closed folders (treeOpenState.ts)
// and the last route (hashRoute.ts) — a per-browser UI convenience, not
// vault data, so localStorage rather than server state.
const NAV_OPEN_KEY = 'mindview.navOpen.v1';

function loadNavOpen(): boolean {
  try {
    const raw = localStorage.getItem(NAV_OPEN_KEY);
    return raw === null ? true : raw === '1';
  } catch {
    return true;
  }
}

function saveNavOpen(open: boolean): void {
  try {
    localStorage.setItem(NAV_OPEN_KEY, open ? '1' : '0');
  } catch {
    /* best-effort; ignore quota/private-mode errors */
  }
}

// 'read' isn't a tab here: it has no fixed destination of its own — clicking
// a node in the tree (or the quick-switcher, or a recent/pinned item) opens
// it directly. A separate "Leitor" button that did the same thing with no
// node picked was dead air. Grafo goes first per the Felipe's own ordering
// preference, even though it's still a placeholder screen.
const TABS: { screen: Screen; label: string; icon: string }[] = [
  { screen: 'grafo', label: 'Grafo', icon: '◈' },
  { screen: 'estante', label: 'Estante', icon: '▥' },
  { screen: 'console', label: 'Console', icon: '▦' },
];

interface SidebarProps {
  activeScreen: Screen;
  activePath: string | null;
  onOpenSearch: () => void;
}

export function Sidebar({ activeScreen, activePath, onOpenSearch }: SidebarProps) {
  const { tree } = useTree();
  // Refetches on its own whenever Reader.tsx bumps the shared app-state
  // version (opening a node, pinning/unpinning) — see AppStateEvents.tsx —
  // so "Fixados"/"Recentes" never need a manual reload to catch up.
  const { data: state } = useApi<AppState>('/state');
  const { settings } = useSettings();
  const [navOpen, setNavOpenState] = useState(loadNavOpen);
  const setNavOpen = (next: boolean | ((prev: boolean) => boolean)) => {
    setNavOpenState((prev) => {
      const resolved = typeof next === 'function' ? (next as (prev: boolean) => boolean)(prev) : next;
      saveNavOpen(resolved);
      return resolved;
    });
  };
  const [treeForce, setTreeForce] = useState<TreeForceState>({ open: true, n: 0 });

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="dot" />
        <span className="brand-label">MindView</span>
        <button
          className="icon-btn"
          title={navOpen ? 'Recolher menu' : 'Expandir menu'}
          onClick={() => setNavOpen((o) => !o)}
        >
          {navOpen ? '⟨⟨' : '⟩⟩'}
        </button>
      </div>

      <div className={`nav-collapse${navOpen ? ' is-open' : ''}`}>
        <nav className="tab-nav nav-collapse-inner">
          {TABS.map((t) => (
            <button
              key={t.screen}
              className={`tab-btn${activeScreen === t.screen ? ' is-active' : ''}`}
              onClick={() => navigate(t.screen)}
            >
              <span className="icon">{t.icon}</span>
              {t.label}
            </button>
          ))}
          <button className={`tab-btn${activeScreen === 'ajustes' ? ' is-active' : ''}`} onClick={() => navigate('ajustes')}>
            <span className="icon">⚙</span>
            Ajustes
          </button>
        </nav>
      </div>

      <button className="search-btn" onClick={onOpenSearch}>
        <span>Buscar…</span>
        <kbd>Ctrl+K</kbd>
      </button>

      {settings.recentPinnedEnabled && state && (state.pinnedNodes.length > 0 || state.recentNodes.length > 0) && (
        <>
          {state.pinnedNodes.length > 0 && (
            <>
              <div className="sidebar-section-label">Fixados</div>
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
              <div className="sidebar-section-label">Recentes</div>
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
        <div className="sidebar-section-label">Vault</div>
        <button
          className="icon-btn"
          title={treeForce.open ? 'Recolher tudo' : 'Expandir tudo'}
          onClick={() => setTreeForce((s) => ({ open: !s.open, n: s.n + 1 }))}
        >
          {treeForce.open ? '><' : '<>'}
        </button>
      </div>
      <div className="tree-scroll">{tree && <Tree nodes={tree} activePath={activePath} forceState={treeForce} />}</div>
    </aside>
  );
}
