import chokidar, { type FSWatcher } from 'chokidar';

export interface VaultWatcherOptions {
  root: string;
  onChange: () => void;
}

const SKIP_GLOBS = [
  '**/.git/**',
  '**/node_modules/**',
  '**/.obsidian/**',
  '**/.trash/**',
  '**/.claude/worktrees/**',
  '**/venv/**',
  '**/__pycache__/**',
];

/**
 * Watches the vault for file changes (markdown and assets) and calls `onChange` once per quiet
 * period. Debounce is on the *tail* (waits for a lull), not a throttle —
 * absorbs a `git pull` touching 8 files as a single reindex.
 */
export function watchVault({ root, onChange }: VaultWatcherOptions): FSWatcher {
  // Every file, not just .md: PDFs/scripts are in the tree and the graph
  // too. The glob's default (dot: false) skips hidden paths — the same rule
  // walkAssets() uses, so the watcher and the index agree on what exists.
  const watcher = chokidar.watch(`${root}/**/*`, {
    ignored: SKIP_GLOBS,
    // NEVER watch .git — a checkout/rebase/gc fires thousands of events.
    ignoreInitial: true,
    followSymlinks: false,
    awaitWriteFinish: {
      stabilityThreshold: 150,
      pollInterval: 30,
    },
    usePolling: process.env.MINDVIEW_POLL === '1',
    interval: 1000,
  });

  let timer: NodeJS.Timeout | null = null;
  const trigger = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      onChange();
    }, 300);
  };

  watcher.on('add', trigger).on('change', trigger).on('unlink', trigger).on('error', (err) => {
    // A single file failing (ENOENT mid-git-op etc.) must never take the
    // whole index down — the reindex itself already tolerates missing
    // files by skipping them; here we just avoid crashing the watcher.
    console.error('[watcher] error (ignored, index keeps last good state):', err);
  });

  return watcher;
}
