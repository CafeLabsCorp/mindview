// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { easeInOutQuart, followScrollTo, smoothScrollTo } from './followScrollTo';

beforeEach(() => {
  vi.useFakeTimers();
  // jsdom's animation frames run on the real clock; tie them to the fake
  // one so the eased scroll advances with advanceTimersByTime.
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 16));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// jsdom has no layout, so the scroll container is faked: a parent that
// scrolls, and the target `offset` px down it (mutable — content above can
// "grow").
function target(start = 500) {
  const layout = { offset: start };
  const parent = document.createElement('div');
  parent.style.overflowY = 'auto';
  Object.defineProperty(parent, 'scrollHeight', { value: 3000 });
  Object.defineProperty(parent, 'clientHeight', { value: 600 });
  parent.getBoundingClientRect = () => ({ top: 0 }) as DOMRect;
  const el = document.createElement('section');
  el.getBoundingClientRect = () => ({ top: layout.offset - parent.scrollTop }) as DOMRect;
  parent.appendChild(el);
  document.body.appendChild(parent);
  return { el, parent, layout };
}

describe('smoothScrollTo', () => {
  it('starts moving on the first frames — no waiting', () => {
    const { el, parent } = target();
    void smoothScrollTo(el);
    vi.advanceTimersByTime(100);
    expect(parent.scrollTop).toBeGreaterThan(0);
  });

  it('eases in and out: slow start, fast middle, slow finish', async () => {
    const { el, parent } = target();
    const samples: number[] = [];
    const done = smoothScrollTo(el);
    for (let i = 0; i < 18; i++) {
      vi.advanceTimersByTime(60);
      samples.push(parent.scrollTop);
    }
    expect(await done).toBe(true);
    expect(samples.at(-1)).toBe(500);
    const deltas = samples.map((v, i) => v - (samples[i - 1] ?? 0)).filter((d) => d > 0);
    const middle = Math.max(...deltas);
    expect(middle).toBeGreaterThan(deltas[0] * 4);
    expect(middle).toBeGreaterThan(deltas.at(-1)! * 4);
  });

  it('follows the section if the content above grows mid-flight — ends on the NEW position', () => {
    const { el, parent, layout } = target(500);
    void smoothScrollTo(el);
    vi.advanceTimersByTime(300);
    layout.offset = 900; // the tag list arrived
    vi.advanceTimersByTime(1000);
    expect(parent.scrollTop).toBe(900);
  });

  it('a user scroll cancels it where it is', async () => {
    const { el, parent } = target();
    const done = smoothScrollTo(el);
    vi.advanceTimersByTime(200);
    window.dispatchEvent(new Event('wheel'));
    const at = parent.scrollTop;
    vi.advanceTimersByTime(2000);
    expect(parent.scrollTop).toBe(at);
    expect(await done).toBe(false);
  });

  it('the curve is quartic at both ends', () => {
    expect(easeInOutQuart(0)).toBe(0);
    expect(easeInOutQuart(0.5)).toBe(0.5);
    expect(easeInOutQuart(1)).toBe(1);
    expect(easeInOutQuart(0.1)).toBeLessThan(0.001);
  });
});

describe('followScrollTo', () => {
  it('flashes once it arrives', async () => {
    const { el } = target();
    const onSettled = vi.fn();
    followScrollTo(el, { onSettled });
    await vi.advanceTimersByTimeAsync(1000);
    expect(onSettled).toHaveBeenCalledOnce();
  });

  it('eases again if something pushed the section down after it arrived — without flashing twice', async () => {
    const { el, parent, layout } = target(500);
    const onSettled = vi.fn();
    followScrollTo(el, { onSettled });
    await vi.advanceTimersByTimeAsync(1000);
    layout.offset = 800;
    await vi.advanceTimersByTimeAsync(2000);
    expect(parent.scrollTop).toBe(800);
    expect(onSettled).toHaveBeenCalledOnce();
  });

  it('no flash when the user scrolls away first', async () => {
    const { el } = target();
    const onSettled = vi.fn();
    followScrollTo(el, { onSettled });
    await vi.advanceTimersByTimeAsync(100);
    window.dispatchEvent(new Event('wheel'));
    await vi.advanceTimersByTimeAsync(2000);
    expect(onSettled).not.toHaveBeenCalled();
  });
});
