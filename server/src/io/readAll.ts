import { readFileSync } from 'node:fs';
import type { AssetFile, RawFile } from '@mindview/domain';
import { statOf, walkAssets, walkMarkdown } from './walk.js';

/** Reads every `.md` file under `root`. This is the one place `fs` touches
 * the vault for indexing purposes — domain/ never does. A single file
 * failing to read is dropped with a console warning rather than aborting
 * the whole reindex (ENOENT-mid-git-op is normal). */
export function readAllMarkdown(root: string): RawFile[] {
  const files = walkMarkdown(root);
  const out: RawFile[] = [];
  for (const f of files) {
    try {
      const bytes = readFileSync(f.absPath, 'utf-8');
      const stat = statOf(f.absPath);
      out.push({ path: f.relPath, bytes, mtimeMs: stat.mtimeMs, size: stat.size });
    } catch (err) {
      console.error(`[readAll] failed to read ${f.relPath}, skipping this reindex round:`, err);
    }
  }
  return out;
}

/** Stats every non-markdown file under `root` — never reads their bytes.
 * Same tolerance as above: a file vanishing mid-walk is just skipped. */
export function statAllAssets(root: string): AssetFile[] {
  const out: AssetFile[] = [];
  for (const f of walkAssets(root)) {
    try {
      const { mtimeMs, size } = statOf(f.absPath);
      out.push({ path: f.relPath, mtimeMs, size });
    } catch {
      /* gone between readdir and stat */
    }
  }
  return out;
}
