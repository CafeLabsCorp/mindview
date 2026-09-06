// Which shells this machine can actually launch. Deliberately NOT hardcoded
// to bash: the vault owner runs MindView under WSL, but anyone cloning this
// repo may be on PowerShell, cmd, zsh or fish — the Ajustes screen offers
// whatever is really present here and lets them type a path for anything
// this list misses.
import { existsSync } from 'node:fs';
import { platform } from 'node:os';
import { basename } from 'node:path';

export interface ShellOption {
  label: string;
  command: string;
  args: string[];
}

/** Candidates per platform, most-preferred first. Only the ones that exist
 * on disk are ever offered — a dropdown listing a shell you don't have is
 * worse than a short list. */
const CANDIDATES: Record<'win32' | 'posix', ShellOption[]> = {
  win32: [
    { label: 'PowerShell 7 (pwsh)', command: 'pwsh.exe', args: [] },
    { label: 'Windows PowerShell', command: 'powershell.exe', args: ['-NoLogo'] },
    { label: 'Prompt de comando (cmd)', command: 'cmd.exe', args: [] },
    { label: 'WSL', command: 'wsl.exe', args: [] },
  ],
  posix: [
    { label: 'bash', command: '/bin/bash', args: ['-l'] },
    { label: 'zsh', command: '/bin/zsh', args: ['-l'] },
    { label: 'zsh', command: '/usr/bin/zsh', args: ['-l'] },
    { label: 'fish', command: '/usr/bin/fish', args: ['-l'] },
    { label: 'sh', command: '/bin/sh', args: [] },
  ],
};

/** On Windows the candidates are resolved through PATH by the OS, so
 * existsSync() can't vet them — we offer them all and let a bad pick fail
 * loudly at spawn time with a readable message. On POSIX they're absolute
 * paths, so we can filter to what is really installed. */
export function detectShells(): ShellOption[] {
  if (platform() === 'win32') return CANDIDATES.win32;
  const found = CANDIDATES.posix.filter((s) => existsSync(s.command));
  const envShell = process.env.SHELL;
  if (envShell && existsSync(envShell) && !found.some((s) => s.command === envShell)) {
    found.unshift({ label: `${envShell} (do sistema)`, command: envShell, args: ['-l'] });
  }
  return found;
}

/** Used when settings leave the shell blank. Never throws: falls back to
 * the one shell POSIX guarantees, or cmd.exe on Windows. */
export function defaultShell(): ShellOption {
  const detected = detectShells();
  if (platform() === 'win32') {
    return detected[0] ?? { label: 'cmd', command: process.env.COMSPEC ?? 'cmd.exe', args: [] };
  }
  const envShell = process.env.SHELL;
  const fromEnv = detected.find((s) => s.command === envShell);
  return fromEnv ?? detected[0] ?? { label: 'sh', command: '/bin/sh', args: [] };
}

/**
 * Arguments that make a shell run one command and then *be gone*, instead
 * of dropping the user at a prompt. This is what backs the default
 * "command" terminal mode: MindView is an app for the Mind, not a shell
 * host, so the panel runs Claude Code and closes when it exits.
 *
 * The POSIX form is `<shell> -l -c 'exec <cmd>'`: `-l` still loads the
 * user's profile (which is how `claude` gets found on PATH at all), and
 * `exec` makes the shell *replace itself* with the command, so no shell
 * survives underneath it to fall back to.
 */
export function commandModeArgs(shellCommand: string, baseArgs: string[], startup: string): string[] {
  const name = basename(shellCommand).toLowerCase().replace(/\.exe$/, '');
  if (name === 'cmd') return [...baseArgs, '/c', startup];
  if (name === 'powershell' || name === 'pwsh') return [...baseArgs, '-Command', startup];
  // wsl.exe is a launcher, not a shell: hand the command to a login bash
  // inside the distro, same exec discipline as the POSIX branch.
  if (name === 'wsl') return [...baseArgs, '-e', 'bash', '-lc', `exec ${startup}`];
  return [...baseArgs, '-c', `exec ${startup}`];
}
