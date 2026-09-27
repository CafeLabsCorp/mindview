// Scroll to an element that may still be MOVING: content above it (lists
// that fill in from async fetches) can grow after the first scroll and push
// it down. Keeps it aligned while its container changes size, and once
// things have been still for `settleMs`, settles and calls `onSettled`.
// Stops following — without onSettled — if the user scrolls on their own.
// Returns a cancel function.

export interface FollowOptions {
  settleMs?: number;
  /** hard stop, in case the container never stops changing */
  maxMs?: number;
  onSettled?: (el: HTMLElement) => void;
}

export function followScrollTo(el: HTMLElement, { settleMs = 300, maxMs = 2000, onSettled }: FollowOptions = {}): () => void {
  let done = false;
  let settle: ReturnType<typeof setTimeout> | undefined;
  const align = (behavior: ScrollBehavior) => el.scrollIntoView({ behavior, block: 'start' });
  const userEvents = ['wheel', 'touchstart', 'keydown'] as const;

  const finish = (settled: boolean) => {
    if (done) return;
    done = true;
    observer.disconnect();
    clearTimeout(settle);
    clearTimeout(cap);
    userEvents.forEach((ev) => window.removeEventListener(ev, onUser));
    if (!settled) return;
    align('smooth');
    onSettled?.(el);
  };
  const onUser = () => finish(false);

  const observer = new ResizeObserver(() => {
    // a notification already queued when the user took over must not
    // yank the page back
    if (done) return;
    align('auto');
    clearTimeout(settle);
    settle = setTimeout(() => finish(true), settleMs);
  });
  const cap = setTimeout(() => finish(true), maxMs);

  align('auto');
  observer.observe(el.parentElement ?? document.body);
  userEvents.forEach((ev) => window.addEventListener(ev, onUser, { passive: true }));
  return () => finish(false);
}
