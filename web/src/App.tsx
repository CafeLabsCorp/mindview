import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { QuickSwitcher } from './components/QuickSwitcher';
import { Reader } from './screens/Reader';
import { Shelf } from './screens/Shelf';
import { Console } from './screens/Console';
import { GraphScreen } from './screens/GraphScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { useHashRoute } from './lib/hashRoute';
import { TreeProvider } from './context/TreeContext';
import { useSettings } from './context/SettingsContext';
import { TerminalBar } from './components/TerminalBar';
import { loadTerminalPanelState, saveTerminalPanelState } from './lib/terminalPanelState';
import { loadSidebarOpen, saveSidebarOpen } from './lib/sidebarState';

// xterm.js is ~250 KB and the terminal ships disabled, so it is code-split
// out of the main bundle: a session that never opens the panel never
// downloads it.
const TerminalPanel = lazy(() => import('./components/TerminalPanel'));

export default function App() {
  const route = useHashRoute();
  const { settings } = useSettings();
  const [searchOpen, setSearchOpen] = useState(false);
  const [sidebarOpen, setSidebarOpenState] = useState(loadSidebarOpen);
  const [terminal, setTerminal] = useState(loadTerminalPanelState);

  const setSidebarOpen = useCallback((open: boolean) => {
    setSidebarOpenState(open);
    saveSidebarOpen(open);
  }, []);

  const terminalEnabled = settings.terminalEnabled;
  // Once opened, the panel stays mounted for the rest of the session even
  // while minimised — unmounting it would close every socket and kill the
  // shells, which is what "encerrar" is for.
  const [terminalMounted, setTerminalMounted] = useState(() => terminal.open);
  const setTerminalOpen = useCallback((open: boolean) => {
    setTerminal((prev) => {
      const next = { ...prev, open };
      saveTerminalPanelState(next);
      return next;
    });
  }, []);
  const toggleTerminal = useCallback(() => {
    setTerminalMounted(true);
    setTerminal((prev) => {
      const next = { ...prev, open: !prev.open };
      saveTerminalPanelState(next);
      return next;
    });
  }, []);
  const setTerminalHeight = useCallback((height: number) => {
    setTerminal((prev) => {
      const next = { ...prev, height };
      saveTerminalPanelState(next);
      return next;
    });
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Ctrl+K (search) and Ctrl+O (quick-switcher) are the same modal —
      // see QuickSwitcher.tsx's own note on why splitting them would just
      // duplicate the same 15-line lookup.
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'o')) {
        e.preventDefault();
        setSearchOpen(true);
      } else if ((e.ctrlKey || e.metaKey) && (e.key === '`' || e.code === 'Backquote')) {
        // Ctrl+` — the same shortcut VSCode uses for its terminal panel.
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
        {!sidebarOpen && (
          <button className="sidebar-rail" onClick={() => setSidebarOpen(true)} aria-label="Mostrar a barra lateral" title="Mostrar a barra lateral">
            ⟩⟩
          </button>
        )}
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
                visible={terminal.open}
                height={terminal.height}
                onHeightChange={setTerminalHeight}
                onMinimize={() => setTerminalOpen(false)}
                onAllClosed={() => setTerminalOpen(false)}
              />
            </Suspense>
          )}
          <TerminalBar enabled={terminalEnabled} open={terminal.open} onToggle={toggleTerminal} />
        </div>
      </div>
      <QuickSwitcher open={searchOpen} onClose={() => setSearchOpen(false)} />
    </TreeProvider>
  );
}
