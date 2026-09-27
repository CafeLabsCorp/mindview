// @vitest-environment jsdom
// The contract that keeps shells alive: a session's view is mounted ONCE,
// for as long as its tab exists, and only moved — page, parking, balloon —
// never remounted (a remount closes the socket and the PTY dies with it).
// TerminalView is mocked with a mount counter; xterm itself needs a real
// canvas and a real socket, which is not what these rules are about.
import { useState, type ReactElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import TerminalHost from './TerminalHost';
import { TerminalScreen } from '../screens/TerminalScreen';
import { TerminalDockProvider, useTerminalDock } from '../context/TerminalDock';
import { FALLBACK_SETTINGS } from '../context/SettingsContext';
import { makeT } from '../i18n';

const t = makeT('en');

let mounts = 0;
vi.mock('./TerminalView', async () => {
  const { useEffect } = await vi.importActual<typeof import('react')>('react');
  return {
    TerminalView: ({ active, placement }: { active: boolean; placement: string }) => {
      useEffect(() => {
        mounts++;
      }, []);
      return <div data-testid="view" data-active={String(active)} data-placement={placement} />;
    },
  };
});

let terminalEnabled = true;
vi.mock('../context/SettingsContext', async () => ({
  FALLBACK_SETTINGS: (await vi.importActual<typeof import('../context/SettingsContext')>('../context/SettingsContext')).FALLBACK_SETTINGS,
  useSettings: () => ({ settings: { ...FALLBACK_SETTINGS, terminalEnabled }, loaded: true, update: vi.fn(), reload: vi.fn() }),
}));

const navigate = vi.fn();
vi.mock('../lib/hashRoute', () => ({ navigate: (...args: unknown[]) => navigate(...args) }));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** A same-context "window" like the one window.open('about:blank') gives
 * the real app: its own document, closable, firing pagehide on close. */
interface FakeWindow {
  document: Document;
  closed: boolean;
  focus: ReturnType<typeof vi.fn>;
  close: () => void;
  addEventListener: (type: string, fn: () => void) => void;
  removeEventListener: (type: string, fn: () => void) => void;
}
let opened: FakeWindow[] = [];
function fakeWindow(): FakeWindow {
  const doc = document.implementation.createHTMLDocument('balloon');
  const listeners = new Set<() => void>();
  const w: FakeWindow = {
    document: doc,
    closed: false,
    focus: vi.fn(),
    close: () => {
      if (w.closed) return;
      w.closed = true;
      for (const fn of [...listeners]) fn();
    },
    addEventListener: (type, fn) => type === 'pagehide' && listeners.add(fn),
    removeEventListener: (_type, fn) => listeners.delete(fn),
  };
  opened.push(w);
  return w;
}

let container: HTMLDivElement;
let root: Root;
let dock: ReturnType<typeof useTerminalDock>;

beforeEach(() => {
  mounts = 0;
  opened = [];
  terminalEnabled = true;
  navigate.mockClear();
  vi.spyOn(window, 'open').mockImplementation(() => fakeWindow() as unknown as Window);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

function Probe() {
  dock = useTerminalDock();
  return null;
}

/** App's wiring in miniature: the page when "on the terminal route", the
 * host from the first session on. */
let setOnPage: (v: boolean) => void = () => {};
function Harness(): ReactElement {
  const [onPage, set] = useState(true);
  setOnPage = set;
  return (
    <TerminalDockProvider>
      <Probe />
      {onPage && <TerminalScreen />}
      <HostWhenStarted />
    </TerminalDockProvider>
  );
}
function HostWhenStarted() {
  const { started } = useTerminalDock();
  return started ? <TerminalHost /> : null;
}

function render() {
  act(() => root.render(<Harness />));
}
function views(): HTMLElement[] {
  return Array.from(document.querySelectorAll('[data-testid="view"]'));
}
function click(el: Element | null | undefined) {
  act(() => {
    (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}
function byLabel(label: string): Element | null {
  return container.querySelector(`[aria-label="${label}"]`);
}
async function popOutFirst() {
  await act(async () => {
    await dock.popOut(dock.sessions.tabs[0].id);
  });
}

describe('the Terminal page', () => {
  it('opening the page starts exactly one session, shown in the page', () => {
    render();
    expect(views()).toHaveLength(1);
    expect(views()[0].dataset.placement).toBe('page');
    expect(views()[0].dataset.active).toBe('true');
    expect(container.querySelector('.terminal-screen-slot')?.contains(views()[0])).toBe(true);
  });

  it('leaving the page parks the session — still mounted, nothing restarted', () => {
    render();
    act(() => setOnPage(false));
    expect(views()).toHaveLength(1);
    expect(views()[0].dataset.placement).toBe('parked');
    act(() => setOnPage(true));
    expect(views()[0].dataset.placement).toBe('page');
    expect(mounts).toBe(1);
  });

  it('closing a tab is what ends a session', () => {
    render();
    click(byLabel(t('terminal.newSessionAria')));
    expect(views()).toHaveLength(2);
    click(byLabel(t('terminal.endSessionAria', { n: 1 })));
    expect(views()).toHaveLength(1);
  });

  it('points at the setting when the terminal is off, and starts nothing', () => {
    terminalEnabled = false;
    render();
    expect(views()).toHaveLength(0);
    click(container.querySelector('.terminal-screen-off .btn'));
    expect(navigate).toHaveBeenCalledWith('ajustes');
  });
});

describe('balloons', () => {
  it('popping out moves the live session into its own window, without remounting it', async () => {
    render();
    await popOutFirst();
    expect(opened).toHaveLength(1);
    const balloon = opened[0].document;
    expect(balloon.querySelector('[data-testid="view"]')).not.toBeNull();
    expect(balloon.querySelector('[data-testid="view"]')?.getAttribute('data-placement')).toBe('pop');
    expect(container.querySelector('.terminal-screen-popped')).not.toBeNull();
    expect(mounts).toBe(1);
  });

  it('the balloon carries the app styles and its own controls', async () => {
    render();
    await popOutFirst();
    const balloon = opened[0].document;
    expect(balloon.body.className).toBe('terminal-popout-body');
    expect(balloon.querySelector(`[aria-label="${t('terminal.dockBack')}"]`)).not.toBeNull();
  });

  it('closing the balloon puts the session back on the page, still the same session', async () => {
    render();
    await popOutFirst();
    act(() => opened[0].close());
    expect(opened[0].document.querySelector('[data-testid="view"]')).toBeNull();
    expect(container.querySelector('.terminal-screen-slot [data-testid="view"]')).not.toBeNull();
    expect(dock.sessions.tabs[0].poppedOut).toBe(false);
    expect(mounts).toBe(1);
  });

  it('a floating session survives leaving the Terminal page', async () => {
    render();
    await popOutFirst();
    act(() => setOnPage(false));
    expect(opened[0].document.querySelector('[data-testid="view"]')?.getAttribute('data-placement')).toBe('pop');
    expect(mounts).toBe(1);
  });

  it('ending a floating session closes its balloon', async () => {
    render();
    await popOutFirst();
    act(() => dock.sessions.close(dock.sessions.tabs[0].id));
    expect(opened[0].closed).toBe(true);
    expect(views()).toHaveLength(0);
  });

  it('popping out a session that already floats just focuses its balloon', async () => {
    render();
    await popOutFirst();
    await popOutFirst();
    expect(opened).toHaveLength(1);
    expect(opened[0].focus).toHaveBeenCalled();
  });
});
