import type { ColorBy } from './tagPalette';

// Graph view toggles — per-browser UI state (same call as navOpen /
// treeOpen), so localStorage, not server settings. The tag→color MAP the
// graph reads lives in Ajustes (settings.tagColors); only the view choices
// (which tag colors, size on/off, labels on/off) are here.
export interface GraphPrefs {
  colorBy: ColorBy;
  colorEnabled: boolean;
  sizeByBacklinks: boolean;
  showLabels: boolean;
}

const KEY = 'mindview.graphPrefs.v1';

const DEFAULTS: GraphPrefs = {
  colorBy: 'last',
  colorEnabled: true,
  sizeByBacklinks: true,
  showLabels: false,
};

export function loadGraphPrefs(): GraphPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function saveGraphPrefs(prefs: GraphPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* best-effort */
  }
}
