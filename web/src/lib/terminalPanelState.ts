// Open/closed state and height of the bottom terminal panel. Per-browser UI
// convenience, same call as navOpen / treeOpen / tocCollapsed: not vault
// data, not part of the Backup — localStorage, not the server.
const KEY = 'mindview.terminalPanel.v1';

export const MIN_PANEL_HEIGHT = 120;
export const MAX_PANEL_HEIGHT = 900;
export const DEFAULT_PANEL_HEIGHT = 280;

export interface TerminalPanelState {
  open: boolean;
  height: number;
}

const DEFAULT_STATE: TerminalPanelState = { open: false, height: DEFAULT_PANEL_HEIGHT };

export function clampHeight(px: number): number {
  if (!Number.isFinite(px)) return DEFAULT_PANEL_HEIGHT;
  return Math.min(MAX_PANEL_HEIGHT, Math.max(MIN_PANEL_HEIGHT, Math.round(px)));
}

export function loadTerminalPanelState(): TerminalPanelState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_STATE;
    const parsed = JSON.parse(raw) as Partial<TerminalPanelState>;
    return { open: parsed.open === true, height: clampHeight(Number(parsed.height)) };
  } catch {
    return DEFAULT_STATE; // private browsing / corrupt value
  }
}

export function saveTerminalPanelState(state: TerminalPanelState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* best-effort; ignore quota/private-mode errors */
  }
}
