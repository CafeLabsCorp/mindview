// Pure units of the terminal feature — no server, no PTY. The socket gate
// and the settings-resolution rules are the parts that must not drift, and
// they are testable without spawning a shell.
import { mkdtempSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { isOriginAllowed } from '../src/http/terminalSocket.js';
import { resolveCwd, resolveShell } from '../src/app/terminalService.js';
import { resolveLaunch } from '../src/app/terminalService.js';
import { commandModeArgs, defaultShell, detectShells } from '../src/app/shells.js';
import { DEFAULT_SETTINGS, type Settings } from '../src/app/houseA.js';

const tmpDirs: string[] = [];
function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'mv-term-'));
  tmpDirs.push(d);
  return d;
}
afterAll(() => {
  for (const d of tmpDirs) rmSync(d, { recursive: true, force: true });
});

function settingsWith(patch: Partial<Settings>): Settings {
  return { ...DEFAULT_SETTINGS, ...patch };
}

describe('isOriginAllowed — cross-site WebSocket hijacking gate', () => {
  const PORT = 4317;

  it("accepts the server's own origin under both loopback names", () => {
    expect(isOriginAllowed('http://127.0.0.1:4317', PORT)).toBe(true);
    expect(isOriginAllowed('http://localhost:4317', PORT)).toBe(true);
  });

  it('accepts the pinned Vite dev origin, because in dev the page really is cross-origin', () => {
    expect(isOriginAllowed('http://localhost:5173', PORT)).toBe(true);
    expect(isOriginAllowed('http://127.0.0.1:5173', PORT)).toBe(true);
  });

  it('rejects any OTHER loopback port — another local server must not reach the shell', () => {
    // This is the case that made the dev-mode chain exploitable: a page on
    // some unrelated local port used to be allowed straight through.
    expect(isOriginAllowed('http://localhost:8080', PORT)).toBe(false);
    expect(isOriginAllowed('http://127.0.0.1:3000', PORT)).toBe(false);
  });

  it('accepts a missing Origin — browsers always send one, so this only admits non-browser clients', () => {
    expect(isOriginAllowed(undefined, PORT)).toBe(true);
  });

  it('rejects a remote page trying to reach the local shell', () => {
    expect(isOriginAllowed('https://evil.example', PORT)).toBe(false);
    expect(isOriginAllowed('http://127.0.0.1.evil.example', PORT)).toBe(false);
  });

  it('rejects an unparseable Origin rather than falling through to allow', () => {
    expect(isOriginAllowed('not a url', PORT)).toBe(false);
    expect(isOriginAllowed('null', PORT)).toBe(false);
  });
});

describe('resolveCwd', () => {
  it('prefers the configured directory when it exists', () => {
    const dir = tempDir();
    expect(resolveCwd(dir, homedir())).toBe(dir);
  });

  it('falls back to the vault when the configured path is blank', () => {
    const vault = tempDir();
    expect(resolveCwd('', vault)).toBe(vault);
  });

  it('falls back to the vault when the configured path is stale, instead of failing to open', () => {
    const vault = tempDir();
    expect(resolveCwd('/definitely/not/here', vault)).toBe(vault);
  });

  it('falls back to home when neither exists', () => {
    expect(resolveCwd('/definitely/not/here', '/nor/here')).toBe(homedir());
  });
});

describe('resolveShell', () => {
  it('uses the configured shell and args verbatim', () => {
    const s = settingsWith({ terminalShell: '/bin/sh', terminalShellArgs: ['-x'] });
    expect(resolveShell(s)).toEqual({ command: '/bin/sh', args: ['-x'] });
  });

  it('falls back to a shell that exists on this machine when left blank', () => {
    const resolved = resolveShell(settingsWith({ terminalShell: '   ' }));
    expect(resolved.command).toBe(defaultShell().command);
    expect(resolved.command.length).toBeGreaterThan(0);
  });
});

describe('detectShells', () => {
  it('only offers shells that are really installed here', () => {
    const shells = detectShells();
    expect(shells.length).toBeGreaterThan(0);
    // Nothing hardcoded to bash — the list is whatever this machine has.
    for (const s of shells) expect(typeof s.command).toBe('string');
  });
});

describe('commandModeArgs — run one command, leave no shell behind', () => {
  it('execs on POSIX shells so nothing survives the command', () => {
    expect(commandModeArgs('/bin/bash', ['-l'], 'claude')).toEqual(['-l', '-c', 'exec claude']);
    expect(commandModeArgs('/bin/sh', [], 'claude')).toEqual(['-c', 'exec claude']);
  });

  it('uses each Windows shell\'s own one-shot flag', () => {
    expect(commandModeArgs('powershell.exe', ['-NoLogo'], 'claude')).toEqual(['-NoLogo', '-Command', 'claude']);
    expect(commandModeArgs('pwsh.exe', [], 'claude')).toEqual(['-Command', 'claude']);
    expect(commandModeArgs('cmd.exe', [], 'claude')).toEqual(['/c', 'claude']);
  });

  it('treats wsl.exe as a launcher, not a shell', () => {
    expect(commandModeArgs('wsl.exe', [], 'claude')).toEqual(['-e', 'bash', '-lc', 'exec claude']);
  });
});

describe('resolveLaunch', () => {
  it("command mode execs into the startup command and types nothing", () => {
    const l = resolveLaunch(settingsWith({ terminalShell: '/bin/bash', terminalShellArgs: ['-l'], terminalStartupCommand: 'claude', terminalMode: 'command' }));
    expect(l.args).toEqual(['-l', '-c', 'exec claude']);
    expect(l.typeAfterStart).toBe(''); // nothing is written to the PTY
  });

  it('shell mode keeps a real interactive shell and types the command in', () => {
    const l = resolveLaunch(settingsWith({ terminalShell: '/bin/bash', terminalShellArgs: ['-l'], terminalStartupCommand: 'claude', terminalMode: 'shell' }));
    expect(l.args).toEqual(['-l']);
    expect(l.typeAfterStart).toBe('claude');
  });

  it('collapses both modes to a plain shell when no command is set', () => {
    for (const mode of ['command', 'shell'] as const) {
      const l = resolveLaunch(settingsWith({ terminalShell: '/bin/bash', terminalShellArgs: ['-l'], terminalStartupCommand: '  ', terminalMode: mode }));
      expect(l.args).toEqual(['-l']);
      expect(l.typeAfterStart).toBe('');
    }
  });
});

describe('resolveShell — hostile settings.yaml', () => {
  it('drops non-string entries rather than handing them to spawn', () => {
    const s = settingsWith({ terminalShell: '/bin/sh', terminalShellArgs: [1 as unknown as string, '-x', null as unknown as string] });
    expect(resolveShell(s).args).toEqual(['-x']);
  });

  it('survives terminalShellArgs not being an array at all', () => {
    const s = settingsWith({ terminalShell: '/bin/sh', terminalShellArgs: 'oops' as unknown as string[] });
    expect(resolveShell(s).args).toEqual([]);
  });
});

describe('default settings', () => {
  it('ships the terminal disabled — enabling it is an explicit choice', () => {
    expect(DEFAULT_SETTINGS.terminalEnabled).toBe(false);
  });

  it('opens into Claude Code by default, in the vault', () => {
    expect(DEFAULT_SETTINGS.terminalStartupCommand).toBe('claude');
    expect(DEFAULT_SETTINGS.terminalCwd).toBe(''); // empty = active vault root
  });

  it('defaults to command mode — unrestricted shell access is opt-in', () => {
    expect(DEFAULT_SETTINGS.terminalMode).toBe('command');
  });
});
