// Whether the whole left column is on screen. Per-browser UI convenience,
// same call as treeOpenState / terminalPanelState: not vault data, not part
// of the Backup.
//
// Replaces the old `mindview.navOpen.v1`, which only collapsed the nav list
// inside the sidebar — a half-measure, and two nested collapse controls in
// a 260px column read as clutter.
const KEY = 'mindview.sidebarOpen.v1';

export function loadSidebarOpen(): boolean {
  try {
    const raw = localStorage.getItem(KEY);
    return raw === null ? true : raw === '1';
  } catch {
    return true; // private browsing / storage disabled — default to shown
  }
}

export function saveSidebarOpen(open: boolean): void {
  try {
    localStorage.setItem(KEY, open ? '1' : '0');
  } catch {
    /* best-effort; ignore quota/private-mode errors */
  }
}
