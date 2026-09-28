// Scroll to an element that may still be MOVING: content above it (lists
// that fill in from async fetches) can grow after the page opens and push
// it down.
//
// History, from Felipe's retests: re-aligning instantly on every change
// "teleported" (v0.2.3); waiting for the page to settle before one smooth
// scroll made it hesitate before starting (v0.2.5); the browser's own
// behavior:'smooth' stops abruptly and can't be tuned (v0.2.4). So: start
// at once, animate the scroll container ourselves with a strong ease-in-out,
// and re-read where the element is on EVERY frame — if the content above
// grows mid-flight, the destination moves and the scroll follows it, with
// no jump and no wait. Once there, `onSettled` (the border flash).

/** Duration of the eased scroll. */
const SCROLL_MS = 900;
/** After arriving, how long to keep an eye out for late growth. */
const WATCH_AFTER_MS = 600;

export interface FollowOptions {
  onSettled?: (el: HTMLElement) => void;
}

/** Slow start, fast middle, slow finish — quartic, softer at both ends
 * than cubic (v0.2.5 retest). */
export function easeInOutQuart(t: number): number {
  return t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2;
}

function scrollParent(el: HTMLElement): HTMLElement {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const { overflowY } = getComputedStyle(p);
    if ((overflowY === 'auto' || overflowY === 'scroll') && p.scrollHeight > p.clientHeight) return p;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

/** Where `box.scrollTop` must be for `el` to sit at the top of `box`, now. */
function targetFor(box: HTMLElement, el: HTMLElement): number {
  const boxTop = box === document.scrollingElement ? 0 : box.getBoundingClientRect().top;
  const want = box.scrollTop + el.getBoundingClientRect().top - boxTop;
  return Math.max(0, Math.min(box.scrollHeight - box.clientHeight, want));
}

/** Eased scroll to `el`, chasing it if it moves. Resolves true when it
 * arrived, false if the user took over (wheel/touch/key). */
export function smoothScrollTo(el: HTMLElement): Promise<boolean> {
  const box = scrollParent(el);
  const from = box.scrollTop;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
    box.scrollTop = targetFor(box, el);
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    let cancelled = false;
    const events = ['wheel', 'touchstart', 'keydown'] as const;
    const cancel = () => {
      cancelled = true;
      events.forEach((ev) => window.removeEventListener(ev, cancel));
      resolve(false);
    };
    events.forEach((ev) => window.addEventListener(ev, cancel, { passive: true }));
    // Timed on the frames' own clock (the first frame is t=0), not
    // performance.now(), which may not share its origin.
    let start: number | null = null;
    const step = (now: number) => {
      if (cancelled) return;
      if (start === null) start = now;
      const t = Math.min(1, (now - start) / SCROLL_MS);
      const to = targetFor(box, el); // re-read: the content may have grown
      box.scrollTop = from + (to - from) * easeInOutQuart(t);
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        events.forEach((ev) => window.removeEventListener(ev, cancel));
        resolve(true);
      }
    };
    requestAnimationFrame(step);
  });
}

/** Scrolls to `el` right away (see top), then keeps watching briefly for
 * content that grew after the scroll ended, easing again if it did.
 * Returns a cancel function. */
export function followScrollTo(el: HTMLElement, { onSettled }: FollowOptions = {}): () => void {
  let cancelled = false;
  let watch: ReturnType<typeof setTimeout> | undefined;

  const run = async () => {
    const arrived = await smoothScrollTo(el);
    if (!arrived || cancelled) return;
    onSettled?.(el);
    // A list that arrived after the scroll ended pushed the section down:
    // one more eased hop, no second flash.
    watch = setTimeout(() => {
      if (cancelled) return;
      const box = scrollParent(el);
      if (Math.abs(targetFor(box, el) - box.scrollTop) > 4) void smoothScrollTo(el);
    }, WATCH_AFTER_MS);
  };
  void run();

  return () => {
    cancelled = true;
    clearTimeout(watch);
  };
}
