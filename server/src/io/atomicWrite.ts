import { existsSync, readFileSync, renameSync, writeFileSync, closeSync, openSync, fsyncSync, copyFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * temp-in-same-dir -> fsync -> rename. Never truncates in place. Keeps a
 * `.bak` of the last good version before overwriting. Required for every
 * write into Casa A (~/.local/share/mindview) — see backend spec.
 */
export function atomicWriteFile(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  if (existsSync(path)) {
    try {
      copyFileSync(path, path + '.bak');
    } catch {
      /* best-effort backup; do not block the write on it */
    }
  }
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  const fd = openSync(tmp, 'w');
  try {
    writeFileSync(fd, contents, { encoding: 'utf-8' });
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
  renameSync(tmp, path);
}

export function readIfExists(path: string): string | null {
  return existsSync(path) ? readFileSync(path, 'utf-8') : null;
}
