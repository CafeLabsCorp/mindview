// Scroll to an element that may still be MOVING: content above it (lists
// that fill in from async fetches) can grow after the page opens and push
// it down. So this waits until its container has stopped changing size for
// `settleMs`, then scrolls there ONCE, smoothly, and calls `onSettled`.
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
  const align = () => el.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
