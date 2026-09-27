// @vitest-environment jsdom
// Settings updates are optimistic, then reconciled with the server's answer.
// A colour picker fires many updates in a row; an answer that arrives late
// must never repaint a value the user has already moved past (v0.2.1 retest).
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FALLBACK_SETTINGS, SettingsProvider, useSettings } from './SettingsContext';

const pending: { body: Record<string, unknown>; resolve: (v: unknown) => void }[] = [];
vi.mock('../api/client', () => ({
  api: {
    get: () => Promise.resolve(FALLBACK_SETTINGS),
    put: (_path: string, body: Record<string, unknown>) => new Promise((resolve) => pending.push({ body, resolve })),
  },
}));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let ctx: ReturnType<typeof useSettings>;
function Probe() {
  ctx = useSettings();
  return null;
}

let container: HTMLDivElement;
let root: Root;
beforeEach(async () => {
  pending.length = 0;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <SettingsProvider>
        <Probe />
      </SettingsProvider>,
    );
  });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('settings updates', () => {
  it('a late answer to an older update does not overwrite the newer value', async () => {
    act(() => void ctx.update({ tagColors: { proj: '#111111' } }));
    act(() => void ctx.update({ tagColors: { proj: '#222222' } }));
    expect(ctx.settings.tagColors.proj).toBe('#222222');
    // the newer request answers first, the older one last
    await act(async () => pending[1].resolve({ ...FALLBACK_SETTINGS, tagColors: { proj: '#222222' } }));
    await act(async () => pending[0].resolve({ ...FALLBACK_SETTINGS, tagColors: { proj: '#111111' } }));
    expect(ctx.settings.tagColors.proj).toBe('#222222');
  });

  it('two quick updates to different fields both stick', async () => {
    act(() => {
      void ctx.update({ tagColors: { a: '#111111' } });
      void ctx.update({ extColors: { pdf: '#222222' } });
    });
    expect(ctx.settings.tagColors.a).toBe('#111111');
    expect(ctx.settings.extColors.pdf).toBe('#222222');
  });
});
