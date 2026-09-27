import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

// Hardcoded, not derived from .gitignore: worktree exclusion lives in
// .git/info/exclude (local, unversioned) — a fresh clone would index 3
// stray copies of the vault if we tried to derive this from gitignore.
// venv/__pycache__: once every file type is indexed (not just .md), a
// Python project inside the vault would pour thousands of files into the
// tree and graph — and into the watcher's inotify budget.
const SKIP_DIRS = new Set(['.git', 'node_modules', '.obsidian', '.trash', 'venv', '__pycache__']);

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

/** Every non-markdown file under `root` — PDFs, scripts, images… Same
 * skip list and no-symlink rule as walkMarkdown, plus: anything hidden (a
 * dot-file, or anything under a dot-folder) is left out. Hidden is hidden by
 * convention, and it keeps tool config (.gitignore, .claude/settings.json,
 * .vscode/…) out of the tree and the graph. */
/** Past this many non-markdown files the walk stops (with a warning): a
 * vault that big is almost certainly a code checkout, not notes, and the
 * graph would be unusable anyway. */
export const MAX_ASSETS = 5000;

export function walkAssets(root: string): WalkedFile[] {
  const out: WalkedFile[] = [];

  function recurse(dir: string) {
    if (out.length >= MAX_ASSETS) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;
      const full = join(dir, entry.name);
      if (shouldSkip(full)) continue;
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        recurse(full);
      } else if (entry.isFile() && !entry.name.endsWith('.md')) {
        if (out.length >= MAX_ASSETS) return;
        out.push({ relPath: relative(root, full).split(sep).join('/'), absPath: full });
      }
    }
  }

  recurse(root);
  if (out.length >= MAX_ASSETS) {
    console.warn(`[walk] stopped at ${MAX_ASSETS} non-markdown files under ${root} — the rest are not listed`);
  }
  return out;
}

export function statOf(absPath: string): { mtimeMs: number; size: number } {
  const s = statSync(absPath);
  return { mtimeMs: s.mtimeMs, size: s.size };
}
