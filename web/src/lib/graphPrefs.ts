// Graph view state — per-browser UI prefs (same call as navOpen / treeOpen),
// so localStorage, not server settings. The tag→color MAP the graph reads
// still lives in Ajustes (settings.tagColors); everything here is a view
// choice: what to draw, how to filter it, how big.
//
// Bumped to v2 for the Obsidian-style rework (live d3-force sim, tag nodes,
// filter/group/display panels). v1 is not migrated — these are throwaway
// view toggles, explicitly out of the Backup.

export interface GraphGroup {
  id: string;
  /** plain substring, or `tag:name` / `path:frag` (see graphModel.matchQuery). */
  query: string;
  color: string;
}

export interface GraphPrefs {
  // colouring
  /** on → every node takes its first tag's colour (Ajustes map, else the
   *  hashed ANSI palette). off → the Mind identity: file nodes in the
   *  Ajustes accent, tag nodes in the foreground white. */
  colorEnabled: boolean;
  groups: GraphGroup[];
  // filters
  search: string;
  showTags: boolean;
  showOrphans: boolean;
  // display
  sizeByBacklinks: boolean;
  nodeSizeMul: number; // 0.5 .. 2.2
  /** Radius of every tag node, before `nodeSizeMul`. Flat on purpose — tag
   * nodes are all the same size regardless of how many files carry the tag
   * (only FILE nodes carry size meaning, via `sizeByBacklinks`). */
  tagNodeSize: number; // 2 .. 12
  linkThickness: number; // 0.4 .. 3
  arrows: boolean;
  /** 0 = labels always on · 1 = labels only when zoomed all the way in. */
  textFadeThreshold: number;
  /** ms between each node during the ↻ staged re-growth. 0 = no stagger, the
   * whole graph comes back at once. Used to be derived from the node count
   * (2400ms/n, clamped) — now it's just a number the user sets. */
  revealStepMs: number; // 0 .. 150
}

const KEY = 'mindview.graphPrefs.v2';

export const DEFAULT_GRAPH_PREFS: GraphPrefs = {
  colorEnabled: true,
  groups: [],
  search: '',
  showTags: true,
  showOrphans: true,
  sizeByBacklinks: true,
  nodeSizeMul: 1,
  tagNodeSize: 4,
  linkThickness: 1,
  arrows: false,
  textFadeThreshold: 0.45,
  revealStepMs: 20,
};

export function loadGraphPrefs(): GraphPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_GRAPH_PREFS;
    const parsed = JSON.parse(raw) as Partial<GraphPrefs>;
    return {
      ...DEFAULT_GRAPH_PREFS,
      ...parsed,
      groups: Array.isArray(parsed.groups)
        ? parsed.groups.filter((g): g is GraphGroup => !!g && typeof g.query === 'string')
        : [],
    };
  } catch {
    return DEFAULT_GRAPH_PREFS;
  }
}

export function saveGraphPrefs(prefs: GraphPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* best-effort; ignore quota / private-mode errors */
  }
}
