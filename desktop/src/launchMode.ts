import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { stateDir } from './paths.js';

// MindView's server can run two ways on Windows:
//   - native: a bundled Node runs it directly (the common case — vault on
//     the Windows filesystem, `claude` installed for Windows).
//   - wsl:    `wsl.exe -e node …` runs it inside WSL (Felipe's case — the
//     vault lives on ext4 so only WSL's file watcher gets real inotify, and
//     `claude` is only installed inside the distro).
//
// The first run never asks a bare "do you use WSL?" — it detects and shows
// the findings, then proposes. See mind/tarefas/empresa/mindview.md.

export type LaunchMode = 'native' | 'wsl';

export interface ModeDetection {
  platformIsWindows: boolean;
  wslAvailable: boolean;
  wslDistro: string | null;
  claudeNative: boolean;
  claudeInWsl: boolean;
  /** The mode we'd pick if the user just clicks "recommended". */
  recommended: LaunchMode;
}

interface StoredMode {
  mode: LaunchMode;
  wslDistro?: string | null;
  chosenAt: string;
}

const MODE_FILE = () => join(stateDir(), 'launch-mode.json');

function run(cmd: string, args: string[]): { ok: boolean; stdout: string } {
  try {
    const r = spawnSync(cmd, args, { encoding: 'utf-8', timeout: 8000, windowsHide: true });
    return { ok: r.status === 0, stdout: (r.stdout ?? '').trim() };
  } catch {
    return { ok: false, stdout: '' };
  }
}

export function detectMode(): ModeDetection {
  const platformIsWindows = process.platform === 'win32';

  if (!platformIsWindows) {
    return {
      platformIsWindows: false,
      wslAvailable: false,
      wslDistro: null,
      claudeNative: true,
      claudeInWsl: false,
      recommended: 'native',
    };
  }

  // `wsl.exe -l -q` lists installed distros, one per line, when WSL is set up.
  const list = run('wsl.exe', ['-l', '-q']);
  // Output is UTF-16LE on some Windows builds; strip NULs and CRs defensively.
  const distros = list.stdout
    .replace(/\x00/g, '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const wslAvailable = list.ok && distros.length > 0;
  const wslDistro = wslAvailable ? distros[0] : null;

  const claudeNative = run('where', ['claude']).ok;
  const claudeInWsl = wslAvailable && run('wsl.exe', ['-e', 'bash', '-lc', 'command -v claude']).ok;

  // Recommend WSL only when it's clearly the right call: WSL is set up and
  // `claude` exists there but not natively. Otherwise native.
  const recommended: LaunchMode = wslAvailable && claudeInWsl && !claudeNative ? 'wsl' : 'native';

  return { platformIsWindows: true, wslAvailable, wslDistro, claudeNative, claudeInWsl, recommended };
}

export function readStoredMode(): StoredMode | null {
  try {
    const raw = readFileSync(MODE_FILE(), 'utf-8');
    const parsed = JSON.parse(raw) as StoredMode;
    if (parsed.mode === 'native' || parsed.mode === 'wsl') return parsed;
    return null;
  } catch {
    return null;
  }
}

export function writeStoredMode(mode: LaunchMode, wslDistro: string | null): void {
  const payload: StoredMode = { mode, wslDistro, chosenAt: new Date().toISOString() };
  writeFileSync(MODE_FILE(), JSON.stringify(payload, null, 2), { mode: 0o600 });
}

export function hasChosenMode(): boolean {
  return existsSync(MODE_FILE());
}
