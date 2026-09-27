// Scroll to an element that may still be MOVING: content above it (lists
// that fill in from async fetches) can grow after the page opens and push
// it down. So this waits until its container has stopped changing size for
// `settleMs`, then scrolls there ONCE, eased, and calls `onSettled`.
// (It used to re-align instantly on every change, which reached the right
// place but "teleported" there — v0.2.3 retest, T.1.) Gives up — without
// scrolling — if the user scrolls on their own first. Returns a cancel
// function.

export interface FollowOptions {
  settleMs?: number;
  /** hard stop, in case the container never stops changing */
  maxMs?: number;
  onSettled?: (el: HTMLElement) => void;
}

export function followScrollTo(el: HTMLElement, { settleMs = 200, maxMs = 1500, onSettled }: FollowOptions = {}): () => void {
  let done = false;
  let settle: ReturnType<typeof setTimeout> | undefined;
  const align = () => smoothScrollTo(el);
  const userEvents = ['wheel', 'touchstart', 'keydown'] as const;

  const finish = (settled: boolean) => {
    if (done) return;
    done = true;
    observer.disconnect();
    clearTimeout(settle);
    clearTimeout(cap);
    userEvents.forEach((ev) => window.removeEventListener(ev, onUser));
    if (!settled) return;
    align();
    onSettled?.(el);
  };
  const onUser = () => finish(false);

  const observer = new ResizeObserver(() => {
    // a notification already queued when the user took over must not
    // yank the page back
    if (done) return;
    clearTimeout(settle);
    settle = setTimeout(() => finish(true), settleMs);
  });
  const cap = setTimeout(() => finish(true), maxMs);

  observer.observe(el.parentElement ?? document.body);
  userEvents.forEach((ev) => window.addEventListener(ev, onUser, { passive: true }));
  return () => finish(false);
}

/** How long the eased scroll takes. */
const SCROLL_MS = 650;

/** Slow start, fast middle, slow finish. */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function scrollParent(el: HTMLElement): HTMLElement {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p);
    if ((overflowY === 'auto' || overflowY === 'scroll') && p.scrollHeight > p.clientHeight) return p;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

/** Scrolls `el` to the top of its scroll container with an ease-in-out
 * curve. The browser's own `behavior: 'smooth'` has a fixed curve that
 * stops abruptly (v0.2.4 retest) and can't be tuned, so this animates
 * scrollTop itself. Reduced motion → a plain jump. A wheel/touch/key from
 * the user cancels it. */
export function smoothScrollTo(el: HTMLElement): void {
  const box = scrollParent(el);
  const from = box.scrollTop;
  const to = Math.min(
    box.scrollHeight - box.clientHeight,
    from + el.getBoundingClientRect().top - (box === document.scrollingElement ? 0 : box.getBoundingClientRect().top),
  );
  if (Math.abs(to - from) < 1) return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    box.scrollTop = to;
    return;
  }
  let cancelled = false;
  const cancel = () => {
    cancelled = true;
  };
  const events = ['wheel', 'touchstart', 'keydown'] as const;
  events.forEach((ev) => window.addEventListener(ev, cancel, { passive: true, once: true }));
  // Timed on the frames' own clock (the first frame is t=0), not
  // performance.now(), which may not share its origin.
  let start: number | null = null;
  const step = (now: number) => {
    if (cancelled) return;
    if (start === null) start = now;
    const t = Math.min(1, (now - start) / SCROLL_MS);
    box.scrollTop = from + (to - from) * easeInOutCubic(t);
    if (t < 1) requestAnimationFrame(step);
    else events.forEach((ev) => window.removeEventListener(ev, cancel));
  };
  requestAnimationFrame(step);
}
