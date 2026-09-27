// @vitest-environment jsdom
// TerminalView owns one xterm + one WebSocket, and the shell lives exactly
// as long as that socket. These pin what may NOT tear it down.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const created: { options: Record<string, unknown>; disposed: boolean }[] = [];
vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    options: Record<string, unknown>;
    cols = 80;
    rows = 24;
    disposed = false;
    constructor(opts: Record<string, unknown>) {
      this.options = { ...opts };
      created.push(this);
    }
    loadAddon() {}
    open() {}
    focus() {}
    write() {}
    onData() {
      return { dispose() {} };
    }
    onResize() {
      return { dispose() {} };
    }
    dispose() {
      this.disposed = true;
    }
  },
}));
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class { fit() {} } }));
vi.mock('@xterm/xterm/css/xterm.css', () => ({}));
vi.mock('../context/SettingsContext', () => ({ useSettings: () => ({ settings: { accent: '#3fb950', theme: 'dark' } }) }));

const sockets: { closed: boolean }[] = [];
class FakeSocket {
  static OPEN = 1;
  readyState = 0;
  closed = false;
  binaryType = '';
  onmessage: unknown = null;
  onerror: unknown = null;
  onclose: unknown = null;
  constructor() {
    sockets.push(this);
  }
  send() {}
  close() {
    this.closed = true;
  }
}

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  created.length = 0;
  sockets.length = 0;
  vi.stubGlobal('WebSocket', FakeSocket);
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

async function renderView(fontSize: number, restartKey = 0) {
  const { TerminalView } = await import('./TerminalView');
  act(() =>
    root.render(<TerminalView active placement="page" fontSize={fontSize} restartKey={restartKey} onStatus={() => {}} />),
  );
}

describe('TerminalView', () => {
  it('changing the font size resizes the live terminal — no new terminal, socket still open', async () => {
    await renderView(13);
    await renderView(15.5);
    expect(created).toHaveLength(1);
    expect(created[0].options.fontSize).toBe(15.5);
    expect(sockets).toHaveLength(1);
    expect(sockets[0].closed).toBe(false);
  });

  it('a restart (restartKey) is what replaces the shell', async () => {
    await renderView(13, 0);
    await renderView(13, 1);
    expect(created).toHaveLength(2);
    expect(created[0].disposed).toBe(true);
    expect(sockets[0].closed).toBe(true);
  });
});
