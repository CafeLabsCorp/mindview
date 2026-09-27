// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

// The collapsed flag lives in module memory on purpose (one app run), so
// each test gets a fresh module — the equivalent of opening the app again.
async function freshModule() {
  vi.resetModules();
  return import('./graphPanelState');
}

beforeEach(() => localStorage.clear());

describe('graph panel state', () => {
  it('starts collapsed when the app opens', async () => {
    const m = await freshModule();
    expect(m.loadPanelCollapsed()).toBe(true);
  });

  it('remembers an opened panel while the app stays open', async () => {
    const m = await freshModule();
    m.savePanelCollapsed(false);
    expect(m.loadPanelCollapsed()).toBe(false);
  });

  it('starts collapsed again on the next launch, even from an old blob that saved it open', async () => {
    localStorage.setItem('mindview.graphPanel.v1', JSON.stringify({ collapsed: false, sections: {} }));
    const m = await freshModule();
    m.savePanelCollapsed(false);
    const next = await freshModule();
    expect(next.loadPanelCollapsed()).toBe(true);
  });

  it('still persists the sections inside the panel across launches', async () => {
    const m = await freshModule();
    m.saveSectionOpen('display', false);
    const next = await freshModule();
    expect(next.loadSectionOpen('display', true)).toBe(false);
    expect(next.loadSectionOpen('never-touched', true)).toBe(true);
  });
});
