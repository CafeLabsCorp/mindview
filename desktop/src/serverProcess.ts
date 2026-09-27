import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { get as httpGet } from 'node:http';
import { resolveShellPaths, stateDir } from './paths.js';
import type { LaunchMode } from './launchMode.js';

// Owns the one server child process: picks a free port, spawns it (native
// or via wsl.exe), waits until it answers, and tears it down on quit.
// Nothing about the server's own architecture changes here — this is just
// the "processo separado" wrapper the Electron-as-window decision calls for.

export interface RunningServer {
  port: number;
  url: string;
  stop: () => Promise<void>;
}

const isWindows = process.platform === 'win32';

/** Binds `port` (0 = any) on loopback and releases it; resolves with the
 * port actually bound, or null if it was taken. */
function tryPort(port: number): Promise<number | null> {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once('error', () => resolve(null));
    srv.listen(port, '127.0.0.1', () => {
      const addr = srv.address();
      const bound = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(bound || null));
    });
  });
}

// The port is part of the page's origin, and the origin is what localStorage
// is keyed by — graph prefs, panel drawers, tree state, everything per-view.
// A fresh random port on every launch meant a fresh, empty localStorage on
// every launch: settings "not saving", the graph panel always open. So the
// port is picked once and reused; only if it's taken do we move (and that
// one move costs the saved view state, once).
const PORT_FILE = () => join(stateDir(), 'port.json');

function readStoredPort(): number | null {
  try {
    const { port } = JSON.parse(readFileSync(PORT_FILE(), 'utf-8')) as { port?: unknown };
    return typeof port === 'number' && Number.isInteger(port) && port > 1024 && port < 65536 ? port : null;
  } catch {
    return null;
  }
}

function storePort(port: number): void {
  try {
    writeFileSync(PORT_FILE(), JSON.stringify({ port }), { mode: 0o600 });
  } catch {
    /* next launch just picks again */
  }
}

async function choosePort(avoid: number | null, onLog: (line: string) => void): Promise<number> {
  const stored = readStoredPort();
  if (stored && stored !== avoid && (await tryPort(stored))) return stored;
  const fresh = await tryPort(0);
  if (!fresh) throw new Error('no free loopback port');
  if (stored) onLog(`[shell] port ${stored} unavailable, moving to ${fresh} (saved view state resets once)`);
  storePort(fresh);
  return fresh;
}

function waitUntilReady(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = httpGet(
        { host: '127.0.0.1', port, path: '/', headers: { Host: `127.0.0.1:${port}` }, timeout: 1500 },
        (res) => {
          res.resume();
          // Any HTTP answer from the SPA shell means the server is up. `/`
          // is Host-checked only (no token), unlike /api/*.
          if (res.statusCode && res.statusCode < 500) resolve();
          else retry();
        },
      );
      req.on('error', retry);
      req.on('timeout', () => req.destroy(new Error('timeout')));
    };
    const retry = () => {
      if (Date.now() > deadline) reject(new Error(`server did not answer on :${port} within ${timeoutMs}ms`));
      else setTimeout(tick, 50); // was 250 — up to 200 ms of pure waiting
    };
    tick();
  });
}

export async function startServer(mode: LaunchMode, onLog: (line: string) => void): Promise<RunningServer> {
  const port = await choosePort(null, onLog);
  try {
    return await startServerOn(port, mode, onLog);
  } catch (err) {
    // The Windows-side probe can say "free" while something inside WSL
    // holds the port (localhost forwarding). One retry on a fresh port.
    if (!(err instanceof EarlyExitError)) throw err;
    onLog(`[shell] server on :${port} exited early (${err.message}); retrying on a fresh port`);
    return startServerOn(await choosePort(port, onLog), mode, onLog);
  }
}

class EarlyExitError extends Error {}

async function startServerOn(port: number, mode: LaunchMode, onLog: (line: string) => void): Promise<RunningServer> {
  const paths = resolveShellPaths();
  const data = stateDir();

  let child: ChildProcess;

  if (mode === 'wsl') {
    // Run inside the distro. Every dynamic value goes in as a positional
    // bash arg ("$1".."$4") so bash never re-parses it — a path with an
    // apostrophe or `$` would detonate a interpolated command string.
    // The Windows paths are converted by `wslpath` INSIDE this same bash:
    // it used to be three separate `wsl.exe wslpath` round trips from
    // Windows before the spawn (~120-150 ms each), all blocking the boot.
    const script =
      'web=$(wslpath -a "$2") && data=$(wslpath -a "$3") && entry=$(wslpath -a "$4") ' +
      '|| { echo "wslpath failed converting the shell paths" >&2; exit 97; }; ' +
      'exec env MINDVIEW_PORT="$1" MINDVIEW_WEB_DIR="$web" MINDVIEW_DATA_DIR="$data" ' +
      'MINDVIEW_STATE_DIR="$data" MINDVIEW_SHELL_MANAGED=1 node "$entry"';
    child = spawn('wsl.exe', ['-e', 'bash', '-lc', script, 'mindview', String(port), paths.webDir, data, paths.serverEntry], {
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
  } else {
    const spawnEnv: NodeJS.ProcessEnv = {
      ...process.env,
      MINDVIEW_PORT: String(port),
      MINDVIEW_WEB_DIR: paths.webDir,
      MINDVIEW_DATA_DIR: data,
      MINDVIEW_STATE_DIR: data,
      MINDVIEW_SHELL_MANAGED: '1',
    };
    if (paths.nodeBinIsElectron) spawnEnv.ELECTRON_RUN_AS_NODE = '1';
    child = spawn(paths.nodeBin, [paths.serverEntry], { env: spawnEnv, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  }

  child.stdout?.on('data', (d: Buffer) => onLog(`[server] ${d.toString().trimEnd()}`));
  child.stderr?.on('data', (d: Buffer) => onLog(`[server:err] ${d.toString().trimEnd()}`));

  const exited = new Promise<never>((_, reject) => {
    child.once('exit', (code, signal) => reject(new EarlyExitError(`server exited early (code ${code}, signal ${signal})`)));
    child.once('error', (err) => reject(new Error(`could not spawn server: ${err.message}`)));
  });

  // WSL cold start = distro boot + `bash -l` + node; give it real headroom.
  await Promise.race([waitUntilReady(port, mode === 'wsl' ? 60000 : 20000), exited]);

  const stop = () =>
    new Promise<void>((resolve) => {
      if (child.exitCode !== null || child.signalCode !== null) return resolve();
      child.once('exit', () => resolve());

      // Primary teardown: close the server's stdin. It watches for that
      // (MINDVIEW_SHELL_MANAGED) and runs its graceful shutdown — kill PTYs,
      // close SSE — which signals can't trigger reliably here (hard kill on
      // Windows, wrong target in WSL).
      try {
        child.stdin?.end();
      } catch {
        /* already gone */
      }

      // Fallbacks if it doesn't exit on its own.
      setTimeout(() => {
        if (child.exitCode !== null || child.signalCode !== null) return;
        if (isWindows && child.pid) {
          // TerminateProcess doesn't kill the tree; taskkill /T does.
          spawnSync('taskkill', ['/F', '/T', '/PID', String(child.pid)], { windowsHide: true });
        } else {
          child.kill('SIGTERM');
        }
      }, 3000).unref();

      setTimeout(() => {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
        resolve();
      }, 6000).unref();
    });

  return { port, url: `http://127.0.0.1:${port}/`, stop };
}
