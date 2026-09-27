// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { followScrollTo } from './followScrollTo';

let resize: () => void = () => {};
let disconnected = false;
beforeEach(() => {
  vi.useFakeTimers();
  disconnected = false;
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(cb: () => void) {
        resize = cb;
      }
      observe() {}
      disconnect() {
        disconnected = true;
      }
    },
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function target() {
  const parent = document.createElement('div');
  const el = document.createElement('section');
  parent.appendChild(el);
  document.body.appendChild(parent);
  el.scrollIntoView = vi.fn();
  return el;
}

describe('followScrollTo', () => {
  it('waits for the content above to stop growing, then scrolls once, smoothly', () => {
    const el = target();
    const onSettled = vi.fn();
    followScrollTo(el, { onSettled });
    resize(); // tag list arrived
    vi.advanceTimersByTime(150);
    resize(); // file-type list arrived
    vi.advanceTimersByTime(150);
    expect(el.scrollIntoView).not.toHaveBeenCalled(); // no jumping around meanwhile
    expect(onSettled).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(el.scrollIntoView).toHaveBeenCalledOnce();
    expect(el.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(onSettled).toHaveBeenCalledOnce();
    expect(disconnected).toBe(true);
  });

  it('stops following — no flash — when the user scrolls', () => {
    const el = target();
    const onSettled = vi.fn();
    followScrollTo(el, { onSettled });
    window.dispatchEvent(new Event('wheel'));
    resize();
    vi.advanceTimersByTime(5000);
    expect(onSettled).not.toHaveBeenCalled();
    expect(el.scrollIntoView).not.toHaveBeenCalled();
  });

  it('gives up after maxMs even if the content keeps changing', () => {
    const el = target();
    const onSettled = vi.fn();
    followScrollTo(el, { onSettled, maxMs: 1000 });
    for (let t = 0; t < 1000; t += 100) {
      resize();
      vi.advanceTimersByTime(100);
    }
    expect(onSettled).toHaveBeenCalledOnce();
  });
});
