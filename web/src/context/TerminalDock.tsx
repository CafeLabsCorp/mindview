// Where each terminal session is being shown right now: on the Terminal
// page, parked out of sight (another page is open), or floating in its own
// balloon window. Sessions outlive all three — TerminalHost keeps every
// TerminalView mounted for as long as its tab exists and only MOVES its DOM
// between these places, because unmounting a view closes its socket, and
// the shell dies with it.
//
// Lives in the main bundle (no xterm here): the page, the sidebar and
// Ctrl+` all need it before anyone has opened a terminal.
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTerminalSessions, type TerminalSessions } from '../lib/terminalSessions';
import { openPopoutWindow, syncRootAttributes, type PopoutPosition } from '../lib/popoutWindow';

export interface Popout {
  win: Window;
  /** Desktop only: whether the balloon floats above other apps. */
  onTop: boolean;
}

interface TerminalDockValue {
  sessions: TerminalSessions;
  /** True once any session has been started this run — from then on the
   * host stays mounted (and xterm stays loaded). */
  started: boolean;
  /** The Terminal page's slot, while the page is on screen. */
  pageSlot: HTMLElement | null;
  setPageSlot: (el: HTMLElement | null) => void;
  popouts: ReadonlyMap<number, Popout>;
  popOut: (id: number, at?: PopoutPosition) => Promise<void>;
  /** Back onto the page; the session keeps running. */
  dockBack: (id: number) => void;
  setOnTop: (id: number, onTop: boolean) => void;
  /** Starts a session if there is none; returns the one to show. */
  ensureSession: () => void;
}

const Ctx = createContext<TerminalDockValue | null>(null);

export function TerminalDockProvider({ children }: { children: ReactNode }) {
  const sessions = useTerminalSessions();
  const [started, setStarted] = useState(false);
  const [pageSlot, setPageSlot] = useState<HTMLElement | null>(null);
  const [popouts, setPopouts] = useState<ReadonlyMap<number, Popout>>(new Map());
  const popoutsRef = useRef(popouts);
  popoutsRef.current = popouts;
  const sessionsRef = useRef(sessions);
  sessionsRef.current = sessions;

  const forget = useCallback((id: number) => {
    setPopouts((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
    sessionsRef.current.setPoppedOut(id, false);
  }, []);

  const popOut = useCallback(
    async (id: number, at?: PopoutPosition) => {
      const existing = popoutsRef.current.get(id);
      if (existing) {
        existing.win.focus();
        return;
      }
      const win = await openPopoutWindow(id, at);
      if (!win) return;
      // Closing the balloon (its own ✕, Alt+F4, the OS) docks the session
      // back instead of killing it. TerminalHost moves the DOM out on
      // `pagehide`, before the window's document goes away.
      win.addEventListener('pagehide', () => forget(id), { once: true });
      setPopouts((prev) => new Map(prev).set(id, { win, onTop: true }));
      sessionsRef.current.setPoppedOut(id, true);
    },
    [forget],
  );

  const dockBack = useCallback((id: number) => {
    // Closing fires pagehide → forget(); the host moves the DOM out first.
    popoutsRef.current.get(id)?.win.close();
  }, []);

  const setOnTop = useCallback((id: number, onTop: boolean) => {
    window.mindviewDesktop?.setPopoutOnTop?.(id, onTop);
    setPopouts((prev) => {
      const p = prev.get(id);
      return p ? new Map(prev).set(id, { ...p, onTop }) : prev;
    });
  }, []);

  const ensureSession = useCallback(() => {
    setStarted(true);
    if (sessionsRef.current.tabs.length === 0) sessionsRef.current.open();
  }, []);

  // A session that ends while floating takes its balloon with it.
  useEffect(() => {
    const alive = new Set(sessions.tabs.map((t) => t.id));
    for (const [id, p] of popouts) if (!alive.has(id)) p.win.close();
  }, [sessions.tabs, popouts]);

  // Theme / accent / language changes on the main root follow the balloons.
  useEffect(() => {
    if (popouts.size === 0) return;
    const observer = new MutationObserver(() => {
      for (const p of popoutsRef.current.values()) syncRootAttributes(p.win.document);
    });
    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, [popouts.size]);

  // Reloading or closing the app kills every shell; don't leave balloons
  // behind showing dead sessions.
  useEffect(() => {
    const closeAll = () => {
      for (const p of popoutsRef.current.values()) p.win.close();
    };
    window.addEventListener('pagehide', closeAll);
    return () => window.removeEventListener('pagehide', closeAll);
  }, []);

  const value = useMemo<TerminalDockValue>(
    () => ({ sessions, started, pageSlot, setPageSlot, popouts, popOut, dockBack, setOnTop, ensureSession }),
    [sessions, started, pageSlot, popouts, popOut, dockBack, setOnTop, ensureSession],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTerminalDock(): TerminalDockValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useTerminalDock outside TerminalDockProvider');
  return v;
}
