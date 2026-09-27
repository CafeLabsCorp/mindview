// Session bookkeeping lives here, at the top of the app, because several
// surfaces need it: the Terminal page (tabs), the pop-out balloons, the
// sidebar, and Ctrl+`. Only the *metadata* is here — the xterm instances
// and sockets stay inside TerminalView (mounted once by TerminalHost), so
// this module carries no weight into the main bundle.
import { useCallback, useState } from 'react';

export type TerminalStatus = 'connecting' | 'ready' | 'exited' | 'error';

export interface TerminalTab {
  id: number;
  /** Bumped to throw this shell away and start a fresh one, without losing
   * the tab or its place in the strip. */
  restartKey: number;
  status: TerminalStatus;
  detail: string;
  /** Floating in its own always-on-top window instead of on the page. */
  poppedOut: boolean;
}

export interface TerminalSessions {
  tabs: TerminalTab[];
  activeId: number;
  active: TerminalTab | null;
  open: () => number;
  close: (id: number) => void;
  closeAll: () => void;
  activate: (id: number) => void;
  restart: (id: number) => void;
  setStatus: (id: number, status: TerminalStatus, detail: string) => void;
  setPoppedOut: (id: number, poppedOut: boolean) => void;
}

let nextTabId = 1;

export function useTerminalSessions(): TerminalSessions {
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeId, setActiveId] = useState(0);

  const open = useCallback(() => {
    const id = nextTabId++;
    setTabs((prev) => [...prev, { id, restartKey: 0, status: 'connecting', detail: '', poppedOut: false }]);
    setActiveId(id);
    return id;
  }, []);

  const close = useCallback(
    (id: number) => {
      // Computed from current state rather than inside a setState updater:
      // updaters must be pure, and StrictMode runs them twice.
      const next = tabs.filter((t) => t.id !== id);
      setTabs(next);
      if (next.length > 0 && activeId === id) setActiveId(next[next.length - 1].id);
    },
    [tabs, activeId],
  );

  const closeAll = useCallback(() => setTabs([]), []);
  const activate = useCallback((id: number) => setActiveId(id), []);

  const restart = useCallback((id: number) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, restartKey: t.restartKey + 1, status: 'connecting', detail: '' } : t)));
  }, []);

  const setStatus = useCallback((id: number, status: TerminalStatus, detail: string) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, status, detail } : t)));
  }, []);

  const setPoppedOut = useCallback((id: number, poppedOut: boolean) => {
    setTabs((prev) => prev.map((t) => (t.id === id ? { ...t, poppedOut } : t)));
  }, []);

  return {
    tabs,
    activeId,
    active: tabs.find((t) => t.id === activeId) ?? null,
    open,
    close,
    closeAll,
    activate,
    restart,
    setStatus,
    setPoppedOut,
  };
}
