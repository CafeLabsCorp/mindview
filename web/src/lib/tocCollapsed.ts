// Quick collapse of the Reader's TOC rail. Distinct from the global
// "Índice (TOC) por nó" switch in Settings — that one turns the feature off
// entirely; this is a per-browser convenience for when the window is narrow
// and the 260px rail crowds the text. Same call as navOpen / treeOpen: a UI
// preference, not vault data, so localStorage rather than server state.
const KEY = 'mindview.tocCollapsed.v1';

export function loadTocCollapsed(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false; // private browsing / storage disabled — default to expanded
  }
}

export function saveTocCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(KEY, collapsed ? '1' : '0');
  } catch {
    /* best-effort; ignore quota/private-mode errors */
  }
}
