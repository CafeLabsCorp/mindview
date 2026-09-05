import { useEffect, useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { QuickSwitcher } from './components/QuickSwitcher';
import { Reader } from './screens/Reader';
import { Shelf } from './screens/Shelf';
import { Console } from './screens/Console';
import { GraphScreen } from './screens/GraphScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { useHashRoute } from './lib/hashRoute';
import { TreeProvider } from './context/TreeContext';

export default function App() {
  const route = useHashRoute();
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Ctrl+K (search) and Ctrl+O (quick-switcher) are the same modal —
      // see QuickSwitcher.tsx's own note on why splitting them would just
      // duplicate the same 15-line lookup.
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'o')) {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === 'Escape') {
        setSearchOpen(false);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <TreeProvider>
      <div className="app-shell">
        <Sidebar activeScreen={route.screen} activePath={route.screen === 'read' ? route.param : null} onOpenSearch={() => setSearchOpen(true)} />
        <div className="main-col">
          <div className="screen-area">
            {route.screen === 'read' && <Reader path={route.param} />}
            {route.screen === 'estante' && <Shelf notebookKey={route.param} />}
            {route.screen === 'console' && <Console />}
            {route.screen === 'grafo' && <GraphScreen />}
            {route.screen === 'ajustes' && <SettingsScreen />}
          </div>
        </div>
      </div>
      <QuickSwitcher open={searchOpen} onClose={() => setSearchOpen(false)} />
    </TreeProvider>
  );
}
