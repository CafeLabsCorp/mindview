import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';

// Mirrors ReindexContext's "one counter, everyone depends on it" shape,
// but for app-state mutations (pin/unpin, opening a node — anything that
// changes what GET /state returns) instead of vault-file changes. Reader
// and Sidebar each hold their own independent useApi('/state') call (no
// react-query/shared cache in this app — see useApi.ts's own note), so
// without this, pinning a node from the reader updated the reader's own
// copy but left the sidebar's "Fixados" list stale until something else
// happened to refetch it (a reload, or an unrelated navigation).
const AppStateVersionContext = createContext(0);
const AppStateBumpContext = createContext<() => void>(() => {});

export function AppStateEventsProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  return (
    <AppStateBumpContext.Provider value={bump}>
      <AppStateVersionContext.Provider value={version}>{children}</AppStateVersionContext.Provider>
    </AppStateBumpContext.Provider>
  );
}

export function useAppStateVersion(): number {
  return useContext(AppStateVersionContext);
}

/** Call after anything that changes pinned/recent nodes server-side, so
 * every open `useApi('/state')` call (in any screen) refetches together. */
export function useBumpAppState(): () => void {
  return useContext(AppStateBumpContext);
}
