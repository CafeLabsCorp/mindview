// @vitest-environment jsdom
// Exercises the tab/minimise/close logic, which is where the behaviour
// lives. TerminalView is mocked out: xterm.js draws to a real canvas and
// opens a real socket, neither of which jsdom has — and neither is what
// these rules are about. The rendering half is verified in a real browser.
import { useState, type ReactElement } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TerminalPanel } from './TerminalPanel';
import { TerminalBar } from './TerminalBar';
import { FALLBACK_SETTINGS } from '../context/SettingsContext';

const mounted: number[] = [];

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
  mounted.length = 0;
  navigate.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function views(): HTMLElement[] {
  return Array.from(container.querySelectorAll('[data-testid="view"]'));
}
function tabs(): HTMLElement[] {
  return Array.from(container.querySelectorAll('.terminal-tab'));
}
function click(el: Element | null | undefined): void {
  act(() => {
    (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

/** Stands in for App: owns `visible` and hides the panel when the panel
 * says nothing is left, which is the real contract between the two. */
function Harness({
  startVisible,
  onMinimize,
  onAllClosed,
}: {
  startVisible: boolean;
  onMinimize: () => void;
  onAllClosed: () => void;
}): ReactElement {
  const [visible, setVisible] = useState(startVisible);
  return (
    <TerminalPanel
      visible={visible}
      height={280}
      onHeightChange={vi.fn()}
      onMinimize={() => {
        setVisible(false);
        onMinimize();
      }}
      onAllClosed={() => {
        setVisible(false);
        onAllClosed();
      }}
    />
  );
}

function renderPanel(startVisible = true) {
  const onMinimize = vi.fn();
  const onAllClosed = vi.fn();
  act(() => {
    root.render(<Harness startVisible={startVisible} onMinimize={onMinimize} onAllClosed={onAllClosed} />);
  });
  return { onMinimize, onAllClosed };
}

describe('TerminalPanel — sessions', () => {
  it('does not spin up a shell behind a hidden panel', () => {
    // Starting `claude` behind a panel nobody can see would be both
    // wasteful and surprising.
    renderPanel(false);
    expect(views()).toHaveLength(0);
  });

  it('starts one session the first time it is shown', () => {
    renderPanel(true);
    expect(views()).toHaveLength(1);
  });

  it('opens additional sessions and makes the new one active', () => {
    renderPanel();
    click(container.querySelector('.terminal-tab-new'));
    expect(views()).toHaveLength(2);
    expect(views().map((v) => v.dataset.active)).toEqual(['false', 'true']);
    expect(tabs()).toHaveLength(2);
  });

  it('keeps every session mounted while switching tabs — only visibility changes', () => {
    renderPanel();
    click(container.querySelector('.terminal-tab-new'));
    click(tabs()[0].querySelector('.terminal-tab-label'));
    expect(views()).toHaveLength(2); // nothing was torn down
    expect(views().map((v) => v.dataset.active)).toEqual(['true', 'false']);
  });

  it('closing a tab unmounts that session — this is what kills its shell', () => {
    renderPanel();
    click(container.querySelector('.terminal-tab-new'));
    click(tabs()[1].querySelector('.terminal-tab-close'));
    expect(views()).toHaveLength(1);
    expect(views()[0].dataset.active).toBe('true');
  });

  it('closing the last tab empties the panel instead of instantly respawning one', () => {
    const { onAllClosed } = renderPanel();
    click(tabs()[0].querySelector('.terminal-tab-close'));
    expect(onAllClosed).toHaveBeenCalled();
    // The parent hides the panel on that callback, which is what stops the
    // "open a session when visible and empty" rule from firing again.
    expect(views()).toHaveLength(0);
  });

  it('minimising keeps the session alive — that is the whole difference from closing', () => {
    const { onMinimize } = renderPanel();
    click(container.querySelector('.terminal-panel-actions button[aria-label="Minimizar o terminal"]'));
    expect(onMinimize).toHaveBeenCalled();
    // Still mounted, just not shown: the socket — and therefore the
    // shell — survives being minimised.
    expect(views()).toHaveLength(1);
    expect(views()[0].dataset.active).toBe('false');
  });
});

describe('TerminalBar — discoverability', () => {
  it('points at the setting when the terminal is switched off', () => {
    act(() => root.render(<TerminalBar enabled={false} open={false} onToggle={vi.fn()} />));
    const btn = container.querySelector('.terminal-bar-btn');
    expect(btn?.textContent).toContain('Ajustes');
    click(btn);
    expect(navigate).toHaveBeenCalledWith('ajustes');
  });

  it('toggles the panel when the terminal is on', () => {
    const onToggle = vi.fn();
    act(() => root.render(<TerminalBar enabled open={false} onToggle={onToggle} />));
    click(container.querySelector('.terminal-bar-btn'));
    expect(onToggle).toHaveBeenCalled();
  });
});
