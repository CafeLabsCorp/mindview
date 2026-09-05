import type { BacklinkEntry, IndexedNode, ParsedNode, VaultIndex } from './types.js';
import { parseNode } from './parse.js';

export interface RawFile {
  path: string;
  bytes: string;
  mtimeMs: number;
  size: number;
}

const EXCERPT_RADIUS = 60;

function excerptAround(raw: string, offset: number): string {
  const start = Math.max(0, offset - EXCERPT_RADIUS);
  const end = Math.min(raw.length, offset + EXCERPT_RADIUS);
  const slice = raw.slice(start, end).replace(/\s+/g, ' ').trim();
  return (start > 0 ? '…' : '') + slice + (end < raw.length ? '…' : '');
}

/**
 * Full reindex from raw file bytes. Deliberately not incremental (measured
 * 4.1ms median for 68 files / 356KB) — see backend spec: incremental
 * indexing would trade an unmeasurable win for a real class of stale-state
 * bugs.
 */
export function buildIndex(files: RawFile[]): VaultIndex {
  const start = performance.now();
  const nodes = new Map<string, IndexedNode>();
  const tagSet = new Set<string>();

  for (const f of files) {
    const parsed: ParsedNode = parseNode(f.path, f.bytes);
    nodes.set(f.path, { ...parsed, mtimeMs: f.mtimeMs, size: f.size });
    if (parsed.kind === 'mind-node') {
      for (const t of parsed.tags) tagSet.add(t);
    }
  }

  const backlinks = new Map<string, BacklinkEntry[]>();
  for (const node of nodes.values()) {
    for (const link of node.links) {
      if (!link.resolvedPath || link.outsideVault || link.external) continue;
      if (!nodes.has(link.resolvedPath)) continue; // hanging reference, not a backlink target
      const list = backlinks.get(link.resolvedPath) ?? [];
      list.push({ fromPath: node.path, excerpt: excerptAround(node.raw, link.position.offset) });
      backlinks.set(link.resolvedPath, list);
    }
  }

  return { nodes, backlinks, tagSet, builtAt: Date.now(), buildMs: performance.now() - start };
}
