// @vitest-environment jsdom
// Exercises the bar/panel contract, which is where the behaviour lives:
// which surface is on screen, which sessions exist, and what ends a shell.
// TerminalView is mocked out — xterm needs a real canvas and a real socket,
// neither of which is what these rules are about. The rendering half is
// verified in a real browser.
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TerminalPanel } from './TerminalPanel';
import { TerminalBar } from './TerminalBar';
import { useTerminalSessions } from '../lib/terminalSessions';
import { FALLBACK_SETTINGS } from '../context/SettingsContext';

vi.mock('./TerminalView', () => ({
  TerminalView: ({ active }: { active: boolean }) => <div data-testid="view" data-active={String(active)} />,
}));

vi.mock('../context/SettingsContext', async () => ({
  FALLBACK_SETTINGS: (await vi.importActual<typeof import('../context/SettingsContext')>('../context/SettingsContext')).FALLBACK_SETTINGS,
  useSettings: () => ({ settings: { ...FALLBACK_SETTINGS, terminalEnabled: true }, loaded: true, update: vi.fn(), reload: vi.fn() }),
}));

const navigate = vi.fn();
vi.mock('../lib/hashRoute', () => ({ navigate: (...args: unknown[]) => navigate(...args) }));

let container: HTMLDivElement;
let root: Root;

// React needs to be told this is an act() environment, otherwise every
// state update warns.
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => {
  navigate.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

/** Mirrors App's wiring: the bar and the panel are the collapsed and
 * expanded forms of one thing, so the rules only make sense together. */
function Harness({ enabled = true }: { enabled?: boolean }): ReactElement {
  const sessions = useTerminalSessions();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  const expand = useCallback(
    (tabId?: number) => {
      setMounted(true);
      if (tabId !== undefined) sessions.activate(tabId);
      else if (sessions.tabs.length === 0) sessions.open();
      setOpen(true);
    },
    [sessions],
  );

  useEffect(() => {
    if (open && mounted && sessions.tabs.length === 0) setOpen(false);
  }, [open, mounted, sessions.tabs.length]);

  return (
    <>
      {enabled && mounted && (
        <TerminalPanel visible={open} height={280} sessions={sessions} onHeightChange={vi.fn()} onCollapse={() => setOpen(false)} />
      )}
      {(!enabled || !open) && <TerminalBar enabled={enabled} sessions={sessions} onExpand={expand} />}
    </>
  );
}

function views(): HTMLElement[] {
  return Array.from(container.querySelectorAll('[data-testid="view"]'));
}
function click(el: Element | null | undefined): void {
  act(() => {
    (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}
function q(sel: string): Element | null {
  return container.querySelector(sel);
}
function all(sel: string): Element[] {
  return Array.from(container.querySelectorAll(sel));
}
function render(enabled = true) {
  act(() => root.render(<Harness enabled={enabled} />));
}
function panelHidden(): boolean {
  return (q('.terminal-panel') as HTMLElement | null)?.hidden ?? true;
}
function barShown(): boolean {
  return q('.terminal-bar') !== null;
}

describe('the bar is the collapsed panel', () => {
  it('starts collapsed, with no shell running behind it', () => {
    render();
    expect(barShown()).toBe(true);
    expect(views()).toHaveLength(0);
  });

  it('expanding starts one session and swaps the bar for the panel', () => {
    render();
    click(q('.terminal-bar-btn'));
    expect(views()).toHaveLength(1);
    expect(panelHidden()).toBe(false);
    // Never both at once — that duplication is what made round 2 confusing.
    expect(barShown()).toBe(false);
  });

  it('collapsing brings the bar back and keeps every shell alive', () => {
    render();
    click(q('.terminal-bar-btn'));
    click(q('.terminal-panel-actions button[aria-label="Recolher o terminal"]'));
    expect(panelHidden()).toBe(true);
    expect(barShown()).toBe(true);
    expect(views()).toHaveLength(1); // still mounted: the socket survives
    expect(views()[0].dataset.active).toBe('false');
  });

  it('lists the running sessions while collapsed, so you can see them without expanding', () => {
    render();
    click(q('.terminal-bar-btn'));
    click(q('.terminal-panel-actions button[aria-label="Nova sessão de terminal"]'));
    click(q('.terminal-panel-actions button[aria-label="Recolher o terminal"]'));
    expect(all('.terminal-bar-tab')).toHaveLength(2);
  });

  it('clicking a session in the bar expands straight to it', () => {
    render();
    click(q('.terminal-bar-btn'));
    click(q('.terminal-panel-actions button[aria-label="Nova sessão de terminal"]'));
    click(q('.terminal-panel-actions button[aria-label="Recolher o terminal"]'));
    click(all('.terminal-bar-tab')[0]);
    expect(panelHidden()).toBe(false);
    expect(views().map((v) => v.dataset.active)).toEqual(['true', 'false']);
  });
});

describe('sessions', () => {
  it('opens additional sessions and activates the new one', () => {
    render();
    click(q('.terminal-bar-btn'));
    click(q('.terminal-panel-actions button[aria-label="Nova sessão de terminal"]'));
    expect(views()).toHaveLength(2);
    expect(views().map((v) => v.dataset.active)).toEqual(['false', 'true']);
  });

  it('switching tabs tears nothing down — only visibility changes', () => {
    render();
    click(q('.terminal-bar-btn'));
    click(q('.terminal-panel-actions button[aria-label="Nova sessão de terminal"]'));
    click(all('.terminal-tab-label')[0]);
    expect(views()).toHaveLength(2);
    expect(views().map((v) => v.dataset.active)).toEqual(['true', 'false']);
  });

  it('closing a tab unmounts that session — this is what kills its shell', () => {
    render();
    click(q('.terminal-bar-btn'));
    click(q('.terminal-panel-actions button[aria-label="Nova sessão de terminal"]'));
    click(all('.terminal-tab-close')[1]);
    expect(views()).toHaveLength(1);
  });

  it('ending every session brings the panel down instead of leaving it empty', () => {
    // The exact complaint from round 3: closing everything used to leave a
    // dark, empty panel on screen.
    render();
    click(q('.terminal-bar-btn'));
    click(q('.terminal-panel-actions button[aria-label="Encerrar todas as sessões"]'));
    expect(views()).toHaveLength(0);
    expect(panelHidden()).toBe(true);
    expect(barShown()).toBe(true);
    expect(all('.terminal-bar-tab')).toHaveLength(0);
  });
});

describe('discoverability', () => {
  it('points at the setting when the terminal is switched off', () => {
    render(false);
    const btn = q('.terminal-bar-btn');
    expect(btn?.textContent).toContain('Ajustes');
    click(btn);
    expect(navigate).toHaveBeenCalledWith('ajustes');
  });
});
