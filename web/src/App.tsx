import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { QuickSwitcher } from './components/QuickSwitcher';
import { Reader } from './screens/Reader';
import { Shelf } from './screens/Shelf';
import { Console } from './screens/Console';
import { GraphScreen } from './screens/GraphScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { navigate, useHashRoute } from './lib/hashRoute';
import { TreeProvider, useTree } from './context/TreeContext';
import { NoVault } from './screens/NoVault';
import type { Route } from './lib/hashRoute';
import { useSettings } from './context/SettingsContext';
import { loadSidebarOpen, saveSidebarOpen } from './lib/sidebarState';
import { TerminalDockProvider, useTerminalDock } from './context/TerminalDock';
import { TerminalScreen } from './screens/TerminalScreen';
import { useT } from './i18n/useT';

// xterm.js is ~250 KB and the terminal ships disabled, so it is code-split
// out of the main bundle: a run that never starts a session never downloads
// it. Session *metadata* and placement live in context/TerminalDock.tsx,
// which stays in the main bundle.
const TerminalHost = lazy(() => import('./components/TerminalHost'));

export default function App() {
  return (
    <TerminalDockProvider>
      <AppShell />
    </TerminalDockProvider>
  );
}

function AppShell() {
  const route = useHashRoute();
  const { settings } = useSettings();
  const t = useT();
  const [searchOpen, setSearchOpen] = useState(false);
  const [sidebarOpen, setSidebarOpenState] = useState(loadSidebarOpen);
  const dock = useTerminalDock();
  const terminalEnabled = settings.terminalEnabled;

  const setSidebarOpen = useCallback((open: boolean) => {
    setSidebarOpenState(open);
    saveSidebarOpen(open);
  }, []);

  // Ctrl+` — to the Terminal page, or, when the session you'd land on is
  // floating in a balloon, to that balloon.
  const goToTerminal = useCallback(() => {
    const active = dock.sessions.active;
    if (active?.poppedOut) dock.focusPopout(active.id);
    else navigate('terminal');
  }, [dock]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Ctrl+K (search) and Ctrl+O (quick-switcher) are the same modal —
      // see QuickSwitcher.tsx's own note on why splitting them would just
      // duplicate the same 15-line lookup.
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'o')) {
        e.preventDefault();
        setSearchOpen(true);
      } else if ((e.ctrlKey || e.metaKey) && (e.key === '`' || e.code === 'Backquote')) {
        // Ctrl+` — the same shortcut VS Code uses for its terminal. Ignored
        // entirely when the terminal is off in Ajustes, so the key keeps
        // whatever meaning the browser gives it.
        if (!terminalEnabled) return;
        e.preventDefault();
        goToTerminal();
      } else if (e.key === 'Escape') {
        setSearchOpen(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [terminalEnabled, goToTerminal]);

  return (
    <TreeProvider>
      <div className="app-shell">
        <Sidebar
          hidden={!sidebarOpen}
          activeScreen={route.screen}
          activePath={route.screen === 'read' ? route.param : null}
          onOpenSearch={() => setSearchOpen(true)}
          onHide={() => setSidebarOpen(false)}
        />
        {/* Always mounted so it can widen as the sidebar slides away, instead
            of popping in and shoving the main column sideways. */}
        <button
          className={`sidebar-rail${sidebarOpen ? ' is-hidden' : ''}`}
          onClick={() => setSidebarOpen(true)}
          aria-label={t('nav.showSidebar')}
          title={t('nav.showSidebar')}
        >
          ⟩⟩
        </button>
        <div className="main-col">
          <div className="screen-area">
            <ScreenArea route={route} />
          </div>
          {/* Mounted from the first session on, whatever page is open —
              it owns every shell (see TerminalHost). */}
          {terminalEnabled && dock.started && (
            <Suspense fallback={null}>
              <TerminalHost />
            </Suspense>
          )}
        </div>
      </div>
      <QuickSwitcher open={searchOpen} onClose={() => setSearchOpen(false)} />
    </TreeProvider>
  );
}

// Inside TreeProvider so it can see whether the vault turned up anything.
// An empty tree (loaded, zero files) is the first-run "you have no vault"
// case — show guidance instead of a blank Reader, but let Settings through
// so the vault picker is still reachable.
function ScreenArea({ route }: { route: Route }) {
  const { tree } = useTree();
  const vaultEmpty = tree !== null && tree.length === 0;

  if (vaultEmpty && route.screen !== 'ajustes') return <NoVault />;

  switch (route.screen) {
    case 'read':
      return <Reader path={route.param} />;
    case 'estante':
      return <Shelf notebookKey={route.param} />;
    case 'console':
      return <Console />;
    case 'grafo':
      return <GraphScreen />;
    case 'ajustes':
      return <SettingsScreen />;
    case 'terminal':
      return <TerminalScreen />;
  }
}
