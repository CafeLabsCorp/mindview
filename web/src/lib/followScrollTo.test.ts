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
  it('re-aligns every time the content above grows, and only settles once it stops', () => {
    const el = target();
    const onSettled = vi.fn();
    followScrollTo(el, { onSettled });
    expect(el.scrollIntoView).toHaveBeenCalledTimes(1);
    resize(); // tag list arrived
    vi.advanceTimersByTime(200);
    resize(); // file-type list arrived
    vi.advanceTimersByTime(200);
    expect(onSettled).not.toHaveBeenCalled();
    expect(el.scrollIntoView).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(300);
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
    expect(el.scrollIntoView).toHaveBeenCalledTimes(1);
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
