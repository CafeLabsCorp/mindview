import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api/client';
import { useReindexVersion } from '../context/ReindexContext';
import { useAppStateVersion } from '../context/AppStateEvents';

export interface ApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Small hand-rolled fetch hook — no react-query/swr, this app has a
 * handful of endpoints and two invalidation signals every call depends on:
 * the reindex version (a vault file changed on disk) and the app-state
 * version (a pin/recent mutation happened somewhere). Blanket-applying
 * both to every path is deliberately the same shape as the reindex-only
 * version before it — cheap over-fetching beats each screen quietly
 * holding its own stale copy of shared state.
 * `path` may be `null` to skip fetching (e.g. no node selected yet).
 */
export function useApi<T>(path: string | null): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [error, setError] = useState<string | null>(null);
  const version = useReindexVersion();
  const appStateVersion = useAppStateVersion();
  const [manualTick, setManualTick] = useState(0);

  const refetch = useCallback(() => setManualTick((t) => t + 1), []);

  useEffect(() => {
    if (path === null) {
      setData(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .get<T>(path)
      .then((result) => {
        if (!cancelled) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : String(err));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, version, appStateVersion, manualTick]);

  return { data, loading, error, refetch };
}
