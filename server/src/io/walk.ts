import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// Hardcoded, not derived from .gitignore: worktree exclusion lives in
// .git/info/exclude (local, unversioned) — a fresh clone would index 3
// stray copies of the vault if we tried to derive this from gitignore.
const SKIP_DIRS = new Set(['.git', 'node_modules', '.obsidian', '.trash']);

function shouldSkip(fullPath: string): boolean {
  const parts = fullPath.split(sep);
  if (parts.some((p) => SKIP_DIRS.has(p))) return true;
  if (fullPath.includes(`${sep}.claude${sep}worktrees${sep}`) || fullPath.endsWith(`${sep}.claude${sep}worktrees`)) return true;
  return false;
}

export interface WalkedFile {
  relPath: string; // POSIX, relative to root
  absPath: string;
}

/** Recursive walk for `.md` files under `root`. Never follows symlinks (the
 * vault has `~/.claude/skills/mind` symlinked back into itself). */
export function walkMarkdown(root: string): WalkedFile[] {
  const out: WalkedFile[] = [];

  function recurse(dir: string) {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (shouldSkip(full)) continue;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        recurse(full);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        out.push({ relPath: relative(root, full).split(sep).join('/'), absPath: full });
      }
    }
  }

  recurse(root);
  return out;
}

export function statOf(absPath: string): { mtimeMs: number; size: number } {
  const s = statSync(absPath);
  return { mtimeMs: s.mtimeMs, size: s.size };
}
