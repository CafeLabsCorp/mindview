import type { BoardRow, IndexedNode, LinkInfo, SearchHit, VaultIndex } from './types.js';
import { dirname } from './paths.js';

/**
 * ~30-line in-memory scorer over `raw`/headings/title/path already sitting
 * in the index. Covers both global search (Ctrl+K) and the quick-switcher
 * (Ctrl+O) — deliberately not a dependency (fuse/minisearch/flexsearch):
 * 68 files / 356KB doesn't need one, see backend spec.
 */
export function search(index: VaultIndex, rawQuery: string, limit = 20): SearchHit[] {
  const q = rawQuery.trim().toLowerCase();
  if (!q) return [];
  const hits: SearchHit[] = [];
  for (const node of index.nodes.values()) {
    const title = node.title.toLowerCase();
    const path = node.path.toLowerCase();
    if (title.includes(q)) {
      hits.push({ path: node.path, title: node.title, score: title === q ? 120 : title.startsWith(q) ? 105 : 90, matchedIn: 'title' });
      continue;
    }
    const headingHit = node.headings.find((h) => h.text.toLowerCase().includes(q));
    if (headingHit) {
      hits.push({ path: node.path, title: node.title, score: 70, matchedIn: 'heading' });
      continue;
    }
    if (node.raw.toLowerCase().includes(q)) {
      hits.push({ path: node.path, title: node.title, score: 40, matchedIn: 'body' });
      continue;
    }
    if (path.includes(q)) {
      hits.push({ path: node.path, title: node.title, score: 20, matchedIn: 'path' });
    }
  }
  hits.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  return hits.slice(0, limit);
}

export function buildBoard(index: VaultIndex, staleIndexes: Set<string>): BoardRow[] {
  const rows: BoardRow[] = [];
  for (const node of index.nodes.values()) {
    if (node.kind !== 'mind-node') continue;
    let open = 0;
    let done = 0;
    let paused = 0;
    for (const t of node.tasks) {
      if (t.state === 'open') open++;
      else if (t.state === 'done') done++;
      else paused++;
    }
    if (open + done + paused === 0 && !node.isIndex) continue;
    rows.push({
      path: node.path,
      open,
      done,
      paused,
      atualizado: node.atualizado,
      stale: staleIndexes.has(node.path),
    });
  }
  rows.sort((a, b) => b.open - a.open || a.path.localeCompare(b.path));
  return rows;
}

/**
 * A folder-index node (`tarefas/tarefas.md`) is stale when a descendant
 * mind-node under that folder has a more recent `atualizado` than the
 * index itself (or the index has no date at all while descendants do).
 */
export function computeStaleIndexes(index: VaultIndex): Set<string> {
  const stale = new Set<string>();
  for (const node of index.nodes.values()) {
    if (!node.isIndex || node.kind !== 'mind-node') continue;
    const dir = dirname(node.path);
    let maxChild: string | null = null;
    for (const other of index.nodes.values()) {
      if (other.path === node.path) continue;
      if (other.kind !== 'mind-node') continue;
      if (dirname(other.path) !== dir && !other.path.startsWith(dir + '/')) continue;
      if (other.atualizado && (!maxChild || other.atualizado > maxChild)) maxChild = other.atualizado;
    }
    if (maxChild && (!node.atualizado || maxChild > node.atualizado)) stale.add(node.path);
  }
  return stale;
}

export interface BrokenLink {
  fromPath: string;
  raw: string;
  resolvedPath: string;
}

export function listBrokenLinks(index: VaultIndex): BrokenLink[] {
  const out: BrokenLink[] = [];
  for (const node of index.nodes.values()) {
    for (const link of node.links) {
      if (link.external || link.outsideVault || !link.resolvedPath) continue;
      if (!index.nodes.has(link.resolvedPath)) {
        out.push({ fromPath: node.path, raw: link.raw, resolvedPath: link.resolvedPath });
      }
    }
  }
  return out;
}

export function listOutsideVaultLinks(index: VaultIndex): { fromPath: string; raw: string }[] {
  const out: { fromPath: string; raw: string }[] = [];
  for (const node of index.nodes.values()) {
    for (const link of node.links) {
      if (link.outsideVault) out.push({ fromPath: node.path, raw: link.raw });
    }
  }
  return out;
}

/** mind-nodes with zero inbound references. Engine docs/claude-assets are
 * expected to have none and are excluded — see backend spec ("the vault
 * has zero real orphans", the 4 apparent ones are all engine kind). */
export function listOrphans(index: VaultIndex): string[] {
  const out: string[] = [];
  for (const node of index.nodes.values()) {
    if (node.kind !== 'mind-node') continue;
    const inbound = index.backlinks.get(node.path);
    if (!inbound || inbound.length === 0) out.push(node.path);
  }
  return out;
}

export interface TreeNode {
  name: string;
  path: string;
  type: 'folder' | 'file';
  kind?: IndexedNode['kind'];
  isIndex?: boolean;
  children?: TreeNode[];
}

export function buildTree(index: VaultIndex): TreeNode[] {
  const root: TreeNode[] = [];
  const dirMap = new Map<string, TreeNode>();

  function ensureDir(path: string): TreeNode[] {
    if (!path) return root;
    if (dirMap.has(path)) return dirMap.get(path)!.children!;
    const parent = ensureDir(dirname(path));
    const node: TreeNode = { name: path.split('/').pop()! + '/', path, type: 'folder', children: [] };
    parent.push(node);
    dirMap.set(path, node);
    return node.children!;
  }

  const paths = [...index.nodes.keys()].sort();
  for (const path of paths) {
    const node = index.nodes.get(path)!;
    const siblings = ensureDir(dirname(path));
    siblings.push({ name: path.split('/').pop()!, path, type: 'file', kind: node.kind, isIndex: node.isIndex });
  }
  sortTree(root);
  return root;
}

function sortTree(nodes: TreeNode[]) {
  nodes.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'folder' ? -1 : 1));
  for (const n of nodes) if (n.children) sortTree(n.children);
}

export function isLinkOutsideVault(link: LinkInfo): boolean {
  return link.outsideVault;
}
