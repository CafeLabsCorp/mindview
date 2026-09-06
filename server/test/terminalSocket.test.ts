// End-to-end for the PTY bridge: a real server subprocess, a real
// WebSocket upgrade, a real shell. The gate checks matter most — an
// upgrade never passes through the HTTP request handler, so none of the
// guards tested in server.test.ts apply to it automatically.
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import WebSocket from 'ws';

const PORT = 4932; // distinct from server.test.ts's 4931 so both can run
let vaultDir: string;
let dataDir: string;
let stateDir: string;
let child: ChildProcessWithoutNullStreams;
let token: string;

function wsUrl(params: Record<string, string> = {}): string {
  const qs = new URLSearchParams({ token, cols: '80', rows: '24', ...params });
  return `ws://127.0.0.1:${PORT}/api/terminal/pty?${qs}`;
}

async function waitFor(predicate: () => Promise<boolean>, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate().catch(() => false)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('waitFor timed out');
}

/** Resolves with the HTTP status when the upgrade is refused, or 101 when
 * it succeeds (in which case the socket is closed right away). */
function upgradeStatus(url: string, headers: Record<string, string> = {}): Promise<number> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, { headers });
    const timer = setTimeout(() => reject(new Error('upgrade timed out')), 10_000);
    ws.on('unexpected-response', (_req, res) => {
      clearTimeout(timer);
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    ws.on('open', () => {
      clearTimeout(timer);
      ws.close();
      resolve(101);
    });
    ws.on('error', (err) => {
      clearTimeout(timer);
      // 'unexpected-response' fires first for an HTTP refusal; a raw
      // socket error here means something else went wrong.
      if (!/Unexpected server response/.test(String(err))) reject(err);
    });
  });
}

beforeAll(async () => {
  vaultDir = mkdtempSync(join(tmpdir(), 'mv-tvault-'));
  dataDir = mkdtempSync(join(tmpdir(), 'mv-thousea-'));
  stateDir = mkdtempSync(join(tmpdir(), 'mv-thouseb-'));

  writeFileSync(join(vaultDir, 'node.md'), '# n\n');
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(join(dataDir, 'config.yaml'), `vault_path: ${vaultDir}\n`);
  // Terminal on, and NO startup command: the real default is `claude`,
  // which this machine may or may not have and which would never exit.
  writeFileSync(
    join(dataDir, 'settings.yaml'),
    ['terminalEnabled: true', 'terminalStartupCommand: ""', 'terminalShell: /bin/sh', 'terminalShellArgs: []'].join('\n') + '\n',
  );

  child = spawn(join(__dirname, '..', '..', 'node_modules', '.bin', 'tsx'), ['src/index.ts'], {
    cwd: join(__dirname, '..'),
    env: { ...process.env, MINDVIEW_PORT: String(PORT), MINDVIEW_DATA_DIR: dataDir, MINDVIEW_STATE_DIR: stateDir },
    detached: true,
  });
  child.stderr.on('data', (d) => process.stderr.write(`[server stderr] ${d}`));

  const sessionPath = join(stateDir, 'session.json');
  await waitFor(async () => existsSync(sessionPath), 15_000);
  token = JSON.parse(readFileSync(sessionPath, 'utf-8')).token;
  await waitFor(async () => (await fetch(`http://127.0.0.1:${PORT}/api/health?token=${token}`)).ok, 15_000);
}, 30_000);

afterAll(() => {
  if (child?.pid) {
    try {
      process.kill(-child.pid, 'SIGTERM');
    } catch {
      child.kill('SIGTERM');
    }
  }
  for (const dir of [vaultDir, dataDir, stateDir]) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best-effort */
    }
  }
});

describe('terminal upgrade gate', () => {
  it('refuses an upgrade with a bad token', async () => {
    await expect(upgradeStatus(`ws://127.0.0.1:${PORT}/api/terminal/pty?token=wrong`)).resolves.toBe(403);
  });

  it('refuses an upgrade from a remote Origin (cross-site WebSocket hijacking)', async () => {
    await expect(upgradeStatus(wsUrl(), { Origin: 'https://evil.example' })).resolves.toBe(403);
  });

  it('refuses an upgrade from another loopback port — the dev-mode exploit chain', async () => {
    // A page served from any other local port used to be allowed straight
    // through. Combined with Vite's default CORS (which handed out the
    // token), that was a complete path from "some local dev server" to
    // "a shell". See ARQUITETURA §12.
    await expect(upgradeStatus(wsUrl(), { Origin: 'http://localhost:8080' })).resolves.toBe(403);
  });

  it('refuses an upgrade on any other path', async () => {
    await expect(upgradeStatus(`ws://127.0.0.1:${PORT}/api/events?token=${token}`)).resolves.toBe(404);
  });

  it('accepts a well-formed upgrade from a loopback Origin', async () => {
    await expect(upgradeStatus(wsUrl(), { Origin: `http://localhost:5173` })).resolves.toBe(101);
  });
});

async function putSettings(patch: Record<string, unknown>): Promise<void> {
  await fetch(`http://127.0.0.1:${PORT}/api/settings?token=${token}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
}

describe('command mode — the default: run one command, leave no shell behind', () => {
  it('ends the session when the command exits, instead of dropping to a prompt', async () => {
    await putSettings({ terminalMode: 'command', terminalStartupCommand: 'echo MV_ONESHOT' });
    try {
      const ws = new WebSocket(wsUrl());
      const result = await new Promise<{ out: string; exitCode: number | undefined }>((resolve, reject) => {
        let out = '';
        const timer = setTimeout(() => reject(new Error(`no exit; got: ${JSON.stringify(out)}`)), 15_000);
        ws.on('message', (data, isBinary) => {
          if (isBinary) {
            out += data.toString();
            return;
          }
          const msg = JSON.parse(data.toString());
          if (msg.t === 'exit') {
            clearTimeout(timer);
            resolve({ out, exitCode: msg.exitCode });
          }
        });
        ws.on('error', reject);
      });
      expect(result.out).toContain('MV_ONESHOT');
      expect(result.exitCode).toBe(0);
      // No prompt was ever printed, because the shell exec'd away.
      expect(result.out).not.toContain('$ ');
    } finally {
      await putSettings({ terminalStartupCommand: '' });
    }
  }, 20_000);

  it('exits 127 when the command is not installed — what someone without Claude Code sees', async () => {
    await putSettings({ terminalMode: 'command', terminalStartupCommand: 'mv-definitely-not-installed' });
    try {
      const ws = new WebSocket(wsUrl());
      const exitCode = await new Promise<number>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('no exit message')), 15_000);
        ws.on('message', (data, isBinary) => {
          if (isBinary) return;
          const msg = JSON.parse(data.toString());
          if (msg.t === 'exit') {
            clearTimeout(timer);
            resolve(msg.exitCode);
          }
        });
        ws.on('error', reject);
      });
      expect(exitCode).toBe(127);
    } finally {
      await putSettings({ terminalStartupCommand: '' });
    }
  }, 20_000);
});

describe('terminal session', () => {
  it('runs a command in a real PTY and streams its output back', async () => {
    const ws = new WebSocket(wsUrl());
    const output = await new Promise<string>((resolve, reject) => {
      let buffer = '';
      let ready = false;
      const timer = setTimeout(() => reject(new Error(`timed out; got: ${JSON.stringify(buffer)}`)), 15_000);
      ws.on('message', (data, isBinary) => {
        if (!isBinary) {
          const msg = JSON.parse(data.toString());
          if (msg.t === 'ready' && !ready) {
            ready = true;
            ws.send(JSON.stringify({ t: 'input', d: 'echo MV_PTY_OK\r' }));
          }
          return;
        }
        buffer += data.toString();
        // The shell echoes the typed line back too (that is what a TTY
        // does), so wait for the second occurrence: the command's output.
        if (buffer.split('MV_PTY_OK').length > 2) {
          clearTimeout(timer);
          ws.close();
          resolve(buffer);
        }
      });
      ws.on('error', reject);
    });
    expect(output).toContain('MV_PTY_OK');
  }, 20_000);

  it('reports the shell and cwd it actually opened, so a bad setting is visible', async () => {
    const ws = new WebSocket(wsUrl());
    const ready = await new Promise<{ shell: string; cwd: string }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('no ready message')), 10_000);
      ws.on('message', (data, isBinary) => {
        if (isBinary) return;
        const msg = JSON.parse(data.toString());
        if (msg.t === 'ready') {
          clearTimeout(timer);
          resolve({ shell: msg.shell, cwd: msg.cwd });
        }
      });
      ws.on('error', reject);
    });
    ws.close();
    expect(ready.shell).toBe('/bin/sh');
    expect(ready.cwd).toBe(vaultDir); // terminalCwd blank => the active vault
  }, 15_000);

  it('refuses the upgrade once the terminal is switched off in settings', async () => {
    await fetch(`http://127.0.0.1:${PORT}/api/settings?token=${token}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ terminalEnabled: false }),
    });
    try {
      await expect(upgradeStatus(wsUrl())).resolves.toBe(403);
    } finally {
      await fetch(`http://127.0.0.1:${PORT}/api/settings?token=${token}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ terminalEnabled: true }),
      });
    }
  }, 15_000);
});
