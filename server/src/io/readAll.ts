import { readFileSync } from 'node:fs';
import type { RawFile } from '@mindview/domain';
import { statOf, walkMarkdown } from './walk.js';

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
