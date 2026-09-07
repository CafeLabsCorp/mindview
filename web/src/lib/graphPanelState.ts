// Which drawers of the graph panel are open — the panel itself, and each
// section inside it. Per-browser UI state, same call as sidebarState /
// tocCollapsed: not vault data, not part of the Backup.
//
// Deliberately NOT inside GraphPrefs, even though it is the same screen:
// "Restaurar padrão" is about what the graph draws, and it should not also
// throw the panel's drawers back open.
const KEY = 'mindview.graphPanel.v1';

interface PanelState {
  collapsed: boolean;
  /** section id → open. Absent means "never touched": use its default. */
  sections: Record<string, boolean>;
}

function read(): Partial<PanelState> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Partial<PanelState>) : {};
  } catch {
    return {}; // private browsing / storage disabled — everything defaults
  }
}

function write(patch: Partial<PanelState>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...read(), ...patch }));
  } catch {
    /* best-effort; ignore quota / private-mode errors */
  }
}

export function loadPanelCollapsed(): boolean {
  return read().collapsed === true;
}

export function savePanelCollapsed(collapsed: boolean): void {
  write({ collapsed });
}

export function loadSectionOpen(id: string, fallback: boolean): boolean {
  const stored = read().sections?.[id];
  return typeof stored === 'boolean' ? stored : fallback;
}

export function saveSectionOpen(id: string, open: boolean): void {
  write({ sections: { ...read().sections, [id]: open } });
}
