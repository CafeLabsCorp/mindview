// Per-viewer UI convenience, not vault data — same call as browser tab
// position/scroll, so it lives in localStorage rather than server state
// (Casa B's state.json is reserved for recent/pinned nodes, which the
// Backup feature exports; nobody would expect "which folders were open" in
// a backup). A single JSON blob keyed by folder path, loaded once per page
// load and kept in a module-level cache so every TreeRow shares one map
// instead of hitting localStorage on every render.
const KEY = 'mindview.treeOpen.v1';

let cache: Record<string, boolean> | null = null;

function load(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {}; // private browsing / storage disabled — fall back to defaults
  }
}

function getMap(): Record<string, boolean> {
  if (!cache) cache = load();
  return cache;
}

export function getPersistedOpen(path: string, fallback: boolean): boolean {
  const map = getMap();
  return path in map ? map[path] : fallback;
}

export function setPersistedOpen(path: string, open: boolean): void {
  const map = getMap();
  map[path] = open;
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* best-effort; ignore quota/private-mode errors */
  }
}
