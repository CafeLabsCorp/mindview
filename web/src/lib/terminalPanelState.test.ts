// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_PANEL_HEIGHT, loadTerminalHeight, saveTerminalHeight } from './terminalPanelState';

const KEY = 'mindview.terminalPanel.v1';

beforeEach(() => localStorage.clear());

describe('terminal panel state', () => {
  it('restores a saved height', () => {
    saveTerminalHeight(420);
    expect(loadTerminalHeight()).toBe(420);
  });

  it('clamps a height from outside the allowed range', () => {
    saveTerminalHeight(5000);
    expect(loadTerminalHeight()).toBe(900);
  });

  it('never restores an open panel, not even from a v1 blob that saved one', () => {
    // The reload bug: `open: true` came back while App's terminalMounted had
    // reset to false, so the panel was not rendered and the bar hid itself —
    // the terminal was simply gone until Ctrl+` was pressed twice.
    localStorage.setItem(KEY, JSON.stringify({ open: true, height: 300 }));
    const restored = loadTerminalHeight();
    expect(restored).toBe(300);
    expect(Object.keys({ height: restored })).toEqual(['height']);
  });

  it('falls back to the default height when nothing is stored', () => {
    expect(loadTerminalHeight()).toBe(DEFAULT_PANEL_HEIGHT);
  });

  it('drops the stale open flag on the next save', () => {
    localStorage.setItem(KEY, JSON.stringify({ open: true, height: 300 }));
    saveTerminalHeight(300);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ height: 300 });
  });
});
