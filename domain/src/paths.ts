// POSIX-only path helpers. Vault node identity is always the path relative
// to the vault root, forward-slash separated, never the basename (several
// basenames repeat in the real vault: carreira.md, dindin.md, domo.md,
// micare.md all exist twice).

export function dirname(p: string): string {
  const idx = p.lastIndexOf('/');
  return idx === -1 ? '' : p.slice(0, idx);
}

export function basename(p: string, stripExt?: string): string {
  const idx = p.lastIndexOf('/');
  let b = idx === -1 ? p : p.slice(idx + 1);
  if (stripExt && b.endsWith(stripExt)) b = b.slice(0, -stripExt.length);
  return b;
}

/** Join + normalize (`..`, `.`, duplicate slashes), POSIX-style. */
export function joinNormalize(...parts: string[]): string {
  const combined = parts.filter(Boolean).join('/');
  const isAbsolute = combined.startsWith('/');
  const segments = combined.split('/');
  const out: string[] = [];
  for (const seg of segments) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (out.length && out[out.length - 1] !== '..') out.pop();
      else out.push('..');
    } else {
      out.push(seg);
    }
  }
  return (isAbsolute ? '/' : '') + out.join('/');
}

/** Resolves a link's path part against the linking document's own path. */
export function resolveRelative(fromPath: string, hrefPathPart: string): string {
  if (hrefPathPart.startsWith('/')) {
    // absolute-from-vault-root form, used nowhere in the real vault today
    // but handled defensively.
    return joinNormalize(hrefPathPart);
  }
  return joinNormalize(dirname(fromPath), hrefPathPart);
}

export function isOutsideVault(resolved: string): boolean {
  return resolved === '..' || resolved.startsWith('../');
}
