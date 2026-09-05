import { realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';

export class OutsideRootError extends Error {
  constructor(public readonly attempted: string) {
    super(`path escapes the confined root: ${attempted}`);
  }
}

/**
 * Resolves `candidate` (absolute or root-relative) against `root`, follows
 * symlinks via realpath, and throws if the result lands outside `root`.
 * Required reading before touching any path derived from user/link input —
 * the vault has 7 links pointing outside its own root (path traversal, live).
 */
export function confine(root: string, candidate: string): string {
  const rootReal = realpathSync(root);
  const target = candidate.startsWith('/') ? candidate : resolve(root, candidate);
  let targetReal: string;
  try {
    targetReal = realpathSync(target);
  } catch {
    // file may not exist yet (e.g. about to be written) — confine on the
    // lexical path instead, still anchored to the real root.
    targetReal = resolve(rootReal, candidate.startsWith('/') ? candidate.slice(root.length + 1) : candidate);
  }
  const withSep = rootReal.endsWith(sep) ? rootReal : rootReal + sep;
  if (targetReal !== rootReal && !targetReal.startsWith(withSep)) {
    throw new OutsideRootError(candidate);
  }
  return targetReal;
}

/** True/false version for call sites that want to degrade gracefully (e.g. "link sai do vault" instead of a 500). */
export function isInsideRoot(root: string, candidate: string): boolean {
  try {
    confine(root, candidate);
    return true;
  } catch {
    return false;
  }
}
