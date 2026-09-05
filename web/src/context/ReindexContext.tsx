import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { openEventStream } from '../api/client';

// A single number that bumps every time the server's watcher fires a
// reindex (domain/buildIndex.ts is a full, non-incremental rebuild, so
// there's never anything more granular to diff against — see backend
// spec). Every data-fetching hook depends on this value so a disk change
// made outside the app (e.g. Claude Code editing the vault) refetches
// everywhere automatically, matching the "watcher só pra re-renderizar"
// restriction.
const ReindexVersionContext = createContext(0);

export function ReindexProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const source = openEventStream();
    source.addEventListener('reindex', () => setVersion((v) => v + 1));
    source.onerror = () => {
      // EventSource auto-reconnects on its own; nothing to do here beyond
      // not crashing the app if the server restarts mid-session.
    };
    return () => source.close();
  }, []);

  return <ReindexVersionContext.Provider value={version}>{children}</ReindexVersionContext.Provider>;
}

export function useReindexVersion(): number {
  return useContext(ReindexVersionContext);
}
