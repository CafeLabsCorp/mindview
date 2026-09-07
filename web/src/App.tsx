import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { QuickSwitcher } from './components/QuickSwitcher';
import { Reader } from './screens/Reader';
import { Shelf } from './screens/Shelf';
import { Console } from './screens/Console';
import { GraphScreen } from './screens/GraphScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { TerminalBar } from './components/TerminalBar';
import { useHashRoute } from './lib/hashRoute';
import { TreeProvider } from './context/TreeContext';
import { useSettings } from './context/SettingsContext';
import { loadTerminalHeight, saveTerminalHeight } from './lib/terminalPanelState';
import { loadSidebarOpen, saveSidebarOpen } from './lib/sidebarState';
import { useTerminalSessions } from './lib/terminalSessions';
import { useT } from './i18n/useT';

// xterm.js is ~250 KB and the terminal ships disabled, so it is code-split
// out of the main bundle: a session that never opens the panel never
// downloads it. Session *metadata* lives in lib/terminalSessions.ts, which
// stays in the main bundle so the collapsed bar can list what is running.
const TerminalPanel = lazy(() => import('./components/TerminalPanel'));

export default function App() {
  const route = useHashRoute();
  const { settings } = useSettings();
  const t = useT();
  const [searchOpen, setSearchOpen] = useState(false);
  const [sidebarOpen, setSidebarOpenState] = useState(loadSidebarOpen);
  // Always starts collapsed, never restored from storage — see
  // lib/terminalPanelState.ts for why a persisted "open" left the app
  // booting with neither the panel nor the bar on screen.
  const [terminalOpen, setTerminalOpenState] = useState(false);
  const [terminalHeight, setTerminalHeightState] = useState(loadTerminalHeight);
  const sessions = useTerminalSessions();

  const terminalEnabled = settings.terminalEnabled;
  // Once expanded, the panel stays mounted for the rest of the session even
  // while collapsed — unmounting it would close every socket and kill the
  // shells, which is what "encerrar" is for.
  const [terminalMounted, setTerminalMounted] = useState(false);

  const setSidebarOpen = useCallback((open: boolean) => {
    setSidebarOpenState(open);
    saveSidebarOpen(open);
  }, []);

  const setTerminalOpen = useCallback((open: boolean) => setTerminalOpenState(open), []);

  const setTerminalHeight = useCallback((height: number) => {
    setTerminalHeightState(height);
    saveTerminalHeight(height);
  }, []);

  const expandTerminal = useCallback(
    (tabId?: number) => {
      setTerminalMounted(true);
      // Expanding with nothing running starts one session. Doing it here
      // rather than inside the panel keeps `claude` from being launched
      // behind a collapsed panel nobody can see.
      if (tabId !== undefined) sessions.activate(tabId);
      else if (sessions.tabs.length === 0) sessions.open();
      setTerminalOpen(true);
    },
    [sessions, setTerminalOpen],
  );

  const toggleTerminal = useCallback(() => {
    if (terminalOpen) setTerminalOpen(false);
    else expandTerminal();
  }, [terminalOpen, setTerminalOpen, expandTerminal]);

  // Ending every session leaves nothing to show, so the panel comes down
  // on its own rather than sitting there empty.
  useEffect(() => {
    if (terminalOpen && terminalMounted && sessions.tabs.length === 0) setTerminalOpen(false);
  }, [terminalOpen, terminalMounted, sessions.tabs.length, setTerminalOpen]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Ctrl+K (search) and Ctrl+O (quick-switcher) are the same modal —
      // see QuickSwitcher.tsx's own note on why splitting them would just
      // duplicate the same 15-line lookup.
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'o')) {
        e.preventDefault();
        setSearchOpen(true);
      } else if ((e.ctrlKey || e.metaKey) && (e.key === '`' || e.code === 'Backquote')) {
        // Ctrl+` — the same shortcut VS Code uses for its terminal panel.
        // Ignored entirely when the terminal is off in Ajustes, so the key
        // keeps whatever meaning the browser gives it.
        if (!terminalEnabled) return;
        e.preventDefault();
        toggleTerminal();
      } else if (e.key === 'Escape') {
        setSearchOpen(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [terminalEnabled, toggleTerminal]);

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
            {route.screen === 'read' && <Reader path={route.param} />}
            {route.screen === 'estante' && <Shelf notebookKey={route.param} />}
            {route.screen === 'console' && <Console />}
            {route.screen === 'grafo' && <GraphScreen />}
            {route.screen === 'ajustes' && <SettingsScreen />}
          </div>
          {terminalEnabled && terminalMounted && (
            <Suspense fallback={null}>
              <TerminalPanel
                visible={terminalOpen}
                height={terminalHeight}
                sessions={sessions}
                onHeightChange={setTerminalHeight}
                onCollapse={() => setTerminalOpen(false)}
              />
            </Suspense>
          )}
          {/* The bar *is* the collapsed panel, so the two are never on
              screen at once — that duplication is what made round 2's
              layout confusing. */}
          {(!terminalEnabled || !terminalOpen) && <TerminalBar enabled={terminalEnabled} sessions={sessions} onExpand={expandTerminal} />}
        </div>
      </div>
      <QuickSwitcher open={searchOpen} onClose={() => setSearchOpen(false)} />
    </TreeProvider>
  );
}
