// Owns the live VaultIndex: (re)builds it from disk, keeps a watcher
// attached to whichever vault path is currently configured, and lets the
// rest of the server treat "the index" as a single mutable slot that gets
// swapped wholesale on every reindex (buildIndex is not incremental — see
// domain/src/buildIndex.ts — so there is never a partial-update case to
// worry about here).
import type { FSWatcher } from 'chokidar';
import type { VaultIndex } from '@mindview/domain';
import { buildIndex } from '@mindview/domain';
import { readAllMarkdown } from '../io/readAll.js';
import { watchVault } from '../io/watcher.js';

export class VaultService {
  private root: string;
  private watcher: FSWatcher | null = null;
  private _index: VaultIndex;
  private listeners = new Set<(index: VaultIndex) => void>();

  constructor(initialRoot: string) {
    this.root = initialRoot;
    this._index = buildIndex(readAllMarkdown(initialRoot));
    this.attachWatcher();
  }

  get index(): VaultIndex {
    return this._index;
  }

  get vaultPath(): string {
    return this.root;
  }

  /** Fires after every reindex (initial build excluded — callers already
   * have `.index` synchronously right after construction). */
  onReindex(fn: (index: VaultIndex) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  reindex(): void {
    this._index = buildIndex(readAllMarkdown(this.root));
    for (const fn of this.listeners) fn(this._index);
  }

  private attachWatcher(): void {
    this.watcher = watchVault({ root: this.root, onChange: () => this.reindex() });
  }

  /** Switches to a different vault root: full re-walk + reindex, watcher
   * re-attached to the new path. Read-only in both directions — this never
   * touches the old or new vault's contents, only which directory we read
   * from. */
  async setVaultPath(newRoot: string): Promise<void> {
    if (newRoot === this.root) return;
    const oldWatcher = this.watcher;
    this.root = newRoot;
    this._index = buildIndex(readAllMarkdown(newRoot));
    this.attachWatcher();
    for (const fn of this.listeners) fn(this._index);
    if (oldWatcher) await oldWatcher.close();
  }

  async close(): Promise<void> {
    if (this.watcher) await this.watcher.close();
  }
}
