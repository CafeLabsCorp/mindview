// Height of the bottom terminal panel. Per-browser UI convenience, same
// call as sidebarState / tocCollapsed: not vault data, not part of the
// Backup — localStorage, not the server.
//
// Open/closed is deliberately NOT persisted, and that is a fix, not an
// omission. It used to be, and the panel would come back from a reload
// claiming to be open while `terminalMounted` (App.tsx) had reset to
// false — the panel does not exist yet, and the bar hides itself whenever
// the panel is "open". The result was a boot with neither on screen: the
// terminal had vanished, and Ctrl+` appeared to do the wrong thing,
// because the first press was toggling the invisible open state back off
// and only the second one actually expanded.
//
// Restoring "open" honestly would mean restoring the *sessions*, and a
// reload kills every PTY socket — there is nothing on the server to
// reattach to. So the app boots collapsed, showing the bar, which is the
// one state that is always true after a reload: the terminal is there,
// nothing is running in it.
const KEY = 'mindview.terminalPanel.v1';

export const MIN_PANEL_HEIGHT = 120;
export const MAX_PANEL_HEIGHT = 900;
export const DEFAULT_PANEL_HEIGHT = 280;

export function clampHeight(px: number): number {
  if (!Number.isFinite(px)) return DEFAULT_PANEL_HEIGHT;
  return Math.min(MAX_PANEL_HEIGHT, Math.max(MIN_PANEL_HEIGHT, Math.round(px)));
}

export function loadTerminalHeight(): number {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_PANEL_HEIGHT;
    // Reads v1 blobs that still carry `open`; the field is simply dropped.
    return clampHeight(Number((JSON.parse(raw) as { height?: unknown }).height));
  } catch {
    return DEFAULT_PANEL_HEIGHT; // private browsing / corrupt value
  }
}

export function saveTerminalHeight(height: number): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ height }));
  } catch {
    /* best-effort; ignore quota/private-mode errors */
  }
}
