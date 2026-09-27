import { useEffect, useRef, useState } from 'react';

/** How long the picker must sit still before the colour is saved. */
const COMMIT_DELAY_MS = 250;

/**
 * `<input type="color">` that doesn't save on every pixel of a drag. The
 * native picker fires `change` continuously; saving each one sent a burst of
 * PUT /settings whose answers came back out of order, and a stale answer
 * repainted an older colour mid-drag — the swatch "pulled" to another tone
 * (v0.2.1 retest, R.1). The swatch follows the drag locally; the value is
 * committed once the picker settles, or when it loses focus.
 */
export function ColorInput({ value, onCommit }: { value: string; onCommit: (color: string) => void }) {
  const [draft, setDraft] = useState(value);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<string | null>(null);

  // Follow outside changes (another control, a reset) — but not while a
  // drag is still waiting to be committed.
  useEffect(() => {
    if (pending.current === null) setDraft(value);
  }, [value]);

  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const color = pending.current;
    pending.current = null;
    if (color !== null && color !== value) onCommit(color);
  };

  useEffect(() => () => flush(), []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <input
      type="color"
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value);
        pending.current = e.target.value;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(flush, COMMIT_DELAY_MS);
      }}
      onBlur={flush}
    />
  );
}
