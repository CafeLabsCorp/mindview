import { type ChildProcess, spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
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

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address();
      const port = typeof addr === 'object' && addr ? addr.port : 0;
      srv.close(() => resolve(port));
    });
  });
}

/** Turn a Windows path into one WSL can open (`C:\a\b` -> `/mnt/c/a/b`). */
function toWslPath(winPath: string): string {
  const r = spawnSync('wsl.exe', ['-e', 'wslpath', '-a', winPath], { encoding: 'utf-8', windowsHide: true });
  if (r.status !== 0) {
    throw new Error(`wslpath failed for "${winPath}" (status ${r.status}): ${(r.stderr ?? '').trim()}`);
  }
  const out = (r.stdout ?? '').trim();
  if (!out) throw new Error(`wslpath returned nothing for "${winPath}"`);
  return out;
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
      else setTimeout(tick, 250);
    };
    tick();
  });
}

export async function startServer(mode: LaunchMode, onLog: (line: string) => void): Promise<RunningServer> {
  const paths = resolveShellPaths();
  const port = await freePort();
  const data = stateDir();

  let child: ChildProcess;

  if (mode === 'wsl') {
    // Run inside the distro. Every dynamic value goes in as a positional
    // bash arg ("$1".."$4") so bash never re-parses it — a path with an
    // apostrophe or `$` would detonate a interpolated command string.
    const script =
      'exec env MINDVIEW_PORT="$1" MINDVIEW_WEB_DIR="$2" MINDVIEW_DATA_DIR="$3" ' +
      'MINDVIEW_STATE_DIR="$3" MINDVIEW_SHELL_MANAGED=1 node "$4"';
    child = spawn(
      'wsl.exe',
      ['-e', 'bash', '-lc', script, 'mindview', String(port), toWslPath(paths.webDir), toWslPath(data), toWslPath(paths.serverEntry)],
      { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
    );
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
    child.once('exit', (code, signal) => reject(new Error(`server exited early (code ${code}, signal ${signal})`)));
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
