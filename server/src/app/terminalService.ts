// One PTY per WebSocket connection. A PTY (pseudo-terminal) is what makes
// an interactive program believe a human is typing at a real screen: it
// carries window size, delivers keystrokes as they happen instead of a
// line at a time, passes ANSI colour/cursor codes both ways, and turns
// Ctrl+C into a signal. Without one, `claude` — the reason this feature
// exists — cannot draw its UI at all.
//
// Lifetime: the session dies with its socket. A page reload therefore
// starts a fresh shell; the panel survives *screen* changes only because
// the SPA never reloads while you navigate.
import { existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { spawn, type IPty } from 'node-pty';
import { commandModeArgs, defaultShell } from './shells.js';
import type { Settings } from './houseA.js';

export interface TerminalSessionOptions {
  settings: Settings;
  /** Current vault root — the default working directory, so the terminal
   * always opens *in the Mind* rather than wherever the server started. */
  vaultPath: string;
  cols: number;
  rows: number;
}

export interface TerminalHandlers {
  onData: (chunk: string) => void;
  onExit: (info: { exitCode: number; signal?: number }) => void;
}

/** Resolves the directory the shell starts in: the explicit setting when
 * it names a real directory, else the vault, else home. Never throws — a
 * stale path in settings.yaml must not stop the terminal from opening. */
export function resolveCwd(configured: string, vaultPath: string): string {
  for (const candidate of [configured.trim(), vaultPath]) {
    if (candidate && existsSync(candidate) && statSync(candidate).isDirectory()) return candidate;
  }
  return homedir();
}

export function resolveShell(settings: Settings): { command: string; args: string[] } {
  const configured = settings.terminalShell.trim();
  // A corrupt or hand-edited settings.yaml can hand us anything here;
  // readSettings() merges without validating, so filter to real strings.
  const args = Array.isArray(settings.terminalShellArgs) ? settings.terminalShellArgs.filter((a): a is string => typeof a === 'string') : [];
  if (configured) return { command: configured, args };
  const fallback = defaultShell();
  return { command: fallback.command, args: configured ? args : fallback.args };
}

/**
 * How the session is actually launched. In the default 'command' mode the
 * shell execs straight into the startup command, so quitting it ends the
 * session — there is no prompt underneath. In 'shell' mode you get a real
 * interactive terminal and the command is merely typed in afterwards
 * (returned as `typeAfterStart`).
 *
 * An empty startup command collapses both modes to the same thing: a plain
 * interactive shell. There is nothing to exec into.
 */
export function resolveLaunch(settings: Settings): { command: string; args: string[]; typeAfterStart: string } {
  const { command, args } = resolveShell(settings);
  const startup = settings.terminalStartupCommand.trim();
  if (!startup) return { command, args, typeAfterStart: '' };
  if (settings.terminalMode === 'shell') return { command, args, typeAfterStart: startup };
  return { command, args: commandModeArgs(command, args, startup), typeAfterStart: '' };
}

export class TerminalSession {
  private pty: IPty;
  private startupSent = false;
  private startupTimer: NodeJS.Timeout | null = null;
  readonly shellCommand: string;
  readonly mode: Settings['terminalMode'];
  readonly cwd: string;

  constructor(opts: TerminalSessionOptions, handlers: TerminalHandlers) {
    const { command, args, typeAfterStart } = resolveLaunch(opts.settings);
    this.shellCommand = command;
    this.mode = opts.settings.terminalMode;
    this.cwd = resolveCwd(opts.settings.terminalCwd, opts.vaultPath);

    this.pty = spawn(command, args, {
      name: 'xterm-256color',
      cols: opts.cols,
      rows: opts.rows,
      cwd: this.cwd,
      env: { ...process.env, TERM: 'xterm-256color' } as Record<string, string>,
    });

    const startup = typeAfterStart;
    this.pty.onData((chunk) => {
      // Typed once the shell shows signs of life, so it lands after the
      // prompt instead of racing the login banner. The timer below covers
      // a shell that prints nothing at all before its first read.
      if (startup && !this.startupSent) {
        this.startupSent = true;
        setTimeout(() => this.pty.write(startup + '\r'), 60);
      }
      handlers.onData(chunk);
    });
    if (startup) {
      this.startupTimer = setTimeout(() => {
        if (this.startupSent) return;
        this.startupSent = true;
        this.pty.write(startup + '\r');
      }, 1500);
    }

    this.pty.onExit(({ exitCode, signal }) => {
      if (this.startupTimer) clearTimeout(this.startupTimer);
      handlers.onExit({ exitCode, signal });
    });
  }

  write(data: string): void {
    this.pty.write(data);
  }

  resize(cols: number, rows: number): void {
    // A resize to 0 happens while the panel is collapsed/animating; passing
    // it through makes ncurses-style UIs redraw into nothing.
    if (cols > 0 && rows > 0) this.pty.resize(cols, rows);
  }

  kill(): void {
    if (this.startupTimer) clearTimeout(this.startupTimer);
    try {
      this.pty.kill();
    } catch {
      // Already gone (shell exited on its own) — nothing to clean up.
    }
  }
}
