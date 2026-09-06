import { chmodSync, existsSync, readFileSync, renameSync, writeFileSync, closeSync, openSync, fsyncSync, copyFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

/**
 * temp-in-same-dir -> fsync -> rename. Never truncates in place. Keeps a
 * `.bak` of the last good version before overwriting. Required for every
 * write into Casa A (~/.local/share/mindview) — see backend spec.
 */
/** Owner-only. Casa B holds session.json, whose token now authorises
 * opening a shell — a 0644 file in a shared /home is not where that
 * belongs. Casa A gets the same treatment: settings.yaml decides which
 * binary the terminal spawns. */
export const OWNER_ONLY_FILE = 0o600;
export const OWNER_ONLY_DIR = 0o700;

/** `mkdirSync`'s `mode` only applies when the directory is created, so an
 * install that predates this hardening would keep its old 0755. Fixing it
 * on every ensure() is best-effort and cheap. */
export function ensureOwnerOnlyDir(path: string): void {
  mkdirSync(path, { recursive: true, mode: OWNER_ONLY_DIR });
  try {
    chmodSync(path, OWNER_ONLY_DIR);
  } catch {
    /* not ours to chmod (odd ownership) — the file modes still hold */
  }
}

export function atomicWriteFile(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true, mode: OWNER_ONLY_DIR });
  if (existsSync(path)) {
    try {
      copyFileSync(path, path + '.bak');
    } catch {
      /* best-effort backup; do not block the write on it */
    }
  }
  const tmp = `${path}.tmp-${process.pid}-${Date.now()}`;
  const fd = openSync(tmp, 'w', OWNER_ONLY_FILE); // renameSync preserves the mode
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
