import { realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';

export class OutsideRootError extends Error {
  constructor(public readonly attempted: string) {
    super(`path escapes the confined root: ${attempted}`);
  }
}

/** `relative()` is the platform-correct containment test: on Windows it is
 * case-insensitive and answers with an absolute path for another drive or a
 * UNC share, so no string-prefix edge case (C:\ vs c:\, D:, \\host) leaks. */
function isInside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
}

/** realpath of the deepest ancestor that exists, with the missing tail put
 * back — so a not-yet-existing file under a symlink/junction that points
 * out of the vault is still caught. */
function realpathNearestExisting(p: string): string {
  const tail: string[] = [];
  let cur = p;
  for (;;) {
    try {
      return join(realpathSync(cur), ...tail.reverse());
    } catch {
      const parent = dirname(cur);
      if (parent === cur) return p; // nothing exists at all — keep the lexical path
      tail.push(basename(cur));
      cur = parent;
    }
  }
}

/**
 * Resolves `candidate` (absolute or root-relative) against `root`, follows
 * symlinks via realpath, and throws if the result lands outside `root`.
 * Required reading before touching any path derived from user/link input —
 * the vault has 7 links pointing outside its own root (path traversal, live).
 *
 * The lexical check runs BEFORE any filesystem call: on Windows, merely
 * stat-ing \\attacker\share opens an SMB session and leaks the user's NTLM
 * hash, so an out-of-root path must be refused without ever touching disk.
 */
export function confine(root: string, candidate: string): string {
  const rootReal = realpathSync(root);
  const lexical = resolve(root, candidate); // an absolute candidate ignores the base
  // Either spelling of the root counts lexically (the vault may itself sit
  // behind a symlink); the realpath check below is the one that decides.
  if (!isInside(root, lexical) && !isInside(rootReal, lexical)) throw new OutsideRootError(candidate);
  const real = realpathNearestExisting(lexical);
  if (!isInside(rootReal, real)) throw new OutsideRootError(candidate);
  return real;
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
