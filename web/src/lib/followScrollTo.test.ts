// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { followScrollTo, smoothScrollTo } from './followScrollTo';

let resize: () => void = () => {};
let disconnected = false;
beforeEach(() => {
  vi.useFakeTimers();
  // jsdom's animation frames run on the real clock; tie them to the fake
  // one so the eased scroll advances with advanceTimersByTime.
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16));
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

// jsdom has no layout, so the scroll container is faked: a parent that
// scrolls, and the target 500px down it.
function target() {
  const parent = document.createElement('div');
  parent.style.overflowY = 'auto';
  Object.defineProperty(parent, 'scrollHeight', { value: 2000 });
  Object.defineProperty(parent, 'clientHeight', { value: 600 });
  parent.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
  const el = document.createElement('section');
  el.getBoundingClientRect = () => ({ top: 500 - parent.scrollTop }) as DOMRect;
  parent.appendChild(el);
  document.body.appendChild(parent);
  return { el, parent };
}

describe('followScrollTo', () => {
  it('waits for the content above to stop growing, then scrolls once, smoothly', () => {
    const { el, parent } = target();
    const onSettled = vi.fn();
    followScrollTo(el, { onSettled });
    resize(); // tag list arrived
    vi.advanceTimersByTime(150);
    resize(); // file-type list arrived
    vi.advanceTimersByTime(150);
    expect(parent.scrollTop).toBe(0); // no jumping around meanwhile
    expect(onSettled).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200);
    expect(onSettled).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(1000); // let the eased scroll run
    expect(parent.scrollTop).toBe(500);
    expect(disconnected).toBe(true);
  });

  it('stops following — no flash — when the user scrolls', () => {
    const { el, parent } = target();
    const onSettled = vi.fn();
    followScrollTo(el, { onSettled });
    window.dispatchEvent(new Event('wheel'));
    resize();
    vi.advanceTimersByTime(5000);
    expect(onSettled).not.toHaveBeenCalled();
    expect(parent.scrollTop).toBe(0);
  });

  it('gives up after maxMs even if the content keeps changing', () => {
    const { el } = target();
    const onSettled = vi.fn();
    followScrollTo(el, { onSettled, maxMs: 1000 });
    for (let t = 0; t < 1000; t += 100) {
      resize();
      vi.advanceTimersByTime(100);
    }
    expect(onSettled).toHaveBeenCalledOnce();
  });
});

describe('smoothScrollTo', () => {
  it('eases in and out: slow start, fast middle, slow finish', () => {
    const { el, parent } = target();
    const samples: number[] = [];
    smoothScrollTo(el);
    for (let i = 0; i < 12; i++) {
      vi.advanceTimersByTime(60);
      samples.push(parent.scrollTop);
    }
    expect(samples.at(-1)).toBe(500);
    const deltas = samples.map((v, i) => v - (samples[i - 1] ?? 0)).slice(0, 11);
    const first = deltas[0];
    const middle = Math.max(...deltas);
    const last = deltas.filter((d) => d > 0).at(-1)!;
    expect(middle).toBeGreaterThan(first * 2);
    expect(middle).toBeGreaterThan(last * 2);
  });

  it('a user scroll cancels it where it is', () => {
    const { el, parent } = target();
    smoothScrollTo(el);
    vi.advanceTimersByTime(120);
    window.dispatchEvent(new Event('wheel'));
    const at = parent.scrollTop;
    vi.advanceTimersByTime(1000);
    expect(parent.scrollTop).toBe(at);
    expect(at).toBeLessThan(500);
  });
});
