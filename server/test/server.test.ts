// End-to-end smoke test for the composition root (server/src/index.ts) —
// the piece this task filled in. Spawns the real server as a subprocess
// against a throwaway fixture vault + throwaway Casa A/B dirs (never the
// real vault, never real user state), then hits it over real HTTP exactly
// like the browser would: through the Host+token gate, not by importing
// internals directly.
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/** fetch()/undici refuse to let JS override the Host header — same as a
 * real browser, which is exactly why DNS-rebinding defense works at all.
 * To actually exercise `isHostAllowed()`'s rejection path we need a raw
 * socket that *can* send a mismatched Host, which node:http allows. */
function requestWithHost(path: string, host: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = httpRequest({ host: '127.0.0.1', port: PORT, path, headers: { host } }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on('error', reject);
    req.end();
  });
}

const PORT = 4931; // arbitrary, unlikely to collide with the real dev instance's 4317
let vaultDir: string;
let dataDir: string;
let stateDir: string;
let child: ChildProcessWithoutNullStreams;
let token: string;

// The exact bug class this project treats as a mandatory regression (see
// domain/test/fence.test.ts): a fenced yaml example must never be mistaken
// for real frontmatter by anything downstream, server included.
const FENCE_FIXTURE = [
  '# Doc de exemplo',
  '',
  'Este arquivo não tem frontmatter de verdade — o bloco abaixo é só um',
  'exemplo dentro de uma fence.',
  '',
  '```yaml',
  '---',
  'tags: [tag1, tag2]',
  'criado: AAAA-MM-DD',
  '---',
  '```',
  '',
].join('\n');

const MIND_NODE_FIXTURE = ['---', 'tags: [teste]', 'criado: 2026-01-01', 'atualizado: 2026-01-02', '---', '', '# Nó de teste', '', 'conteúdo.', ''].join('\n');

function apiUrl(path: string): string {
  return `http://127.0.0.1:${PORT}/api${path}${path.includes('?') ? '&' : '?'}token=${token}`;
}

async function waitFor(predicate: () => Promise<boolean>, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await predicate().catch(() => false)) return;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('waitFor timed out');
}

beforeAll(async () => {
  vaultDir = mkdtempSync(join(tmpdir(), 'mv-vault-'));
  dataDir = mkdtempSync(join(tmpdir(), 'mv-housea-'));
  stateDir = mkdtempSync(join(tmpdir(), 'mv-houseb-'));

  writeFileSync(join(vaultDir, 'fence-doc.md'), FENCE_FIXTURE);
  writeFileSync(join(vaultDir, 'node.md'), MIND_NODE_FIXTURE);
  // point config.yaml at the fixture vault *before* the server ever reads it
  mkdirSync(dataDir, { recursive: true });
  writeFileSync(join(dataDir, 'config.yaml'), `vault_path: ${vaultDir}\n`);

  // Spawn tsx's binary directly rather than through `npx` — npx interposes
  // its own process, and SIGTERM to that wrapper doesn't reliably reach
  // the actual node process underneath, which left a stray server holding
  // the port across test runs during development of this test.
  child = spawn(join(__dirname, '..', '..', 'node_modules', '.bin', 'tsx'), ['src/index.ts'], {
    cwd: join(__dirname, '..'),
    env: {
      ...process.env,
      MINDVIEW_PORT: String(PORT),
      MINDVIEW_DATA_DIR: dataDir,
      MINDVIEW_STATE_DIR: stateDir,
    },
    detached: true, // own process group, so afterAll can kill it and any child it spawns
  });
  child.stderr.on('data', (d) => process.stderr.write(`[server stderr] ${d}`));

  const sessionPath = join(stateDir, 'session.json');
  await waitFor(async () => existsSync(sessionPath), 15_000);
  token = JSON.parse(readFileSync(sessionPath, 'utf-8')).token;
  await waitFor(async () => (await fetch(apiUrl('/health'))).ok, 15_000);
}, 30_000);

afterAll(() => {
  if (child?.pid) {
    try {
      process.kill(-child.pid, 'SIGTERM'); // whole process group, see the `detached` note above
    } catch {
      child.kill('SIGTERM');
    }
  }
  for (const dir of [vaultDir, dataDir, stateDir]) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      /* best-effort cleanup */
    }
  }
});

describe('composition root — auth gate', () => {
  it('rejects a request with no token', async () => {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/health?token=wrong`);
    expect(res.status).toBe(403);
  });

  it('rejects a request with a spoofed Host header (anti DNS-rebinding)', async () => {
    const status = await requestWithHost(`/api/health?token=${token}`, 'evil.example:9999');
    expect(status).toBe(403);
  });

  it('accepts a request with the right token and Host', async () => {
    const res = await fetch(apiUrl('/health'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.nodeCount).toBe(2);
  });
});

describe('composition root — the fence regression, exercised over real HTTP', () => {
  it('never invents tag1/tag2 from the fenced yaml example, end to end', async () => {
    const res = await fetch(apiUrl('/node?path=fence-doc.md'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.node.kind).toBe('engine-doc');
    expect(body.node.tags).toEqual([]);
    expect(body.node.criado).toBeNull();
  });

  it('reads real frontmatter correctly on a legitimate mind-node', async () => {
    const res = await fetch(apiUrl('/node?path=node.md'));
    const body = await res.json();
    expect(body.node.kind).toBe('mind-node');
    expect(body.node.tags).toEqual(['teste']);
    expect(body.node.criado).toBe('2026-01-01');
  });

  it('404s a node path that does not exist', async () => {
    const res = await fetch(apiUrl('/node?path=nope.md'));
    expect(res.status).toBe(404);
  });
});

describe('composition root — tree and settings round-trip', () => {
  it('builds a tree with both fixture files', async () => {
    const res = await fetch(apiUrl('/tree'));
    const tree = await res.json();
    const names = tree.map((n: { name: string }) => n.name).sort();
    expect(names).toEqual(['fence-doc.md', 'node.md']);
  });

  it('settings PUT persists and merges tagColors rather than replacing the whole map', async () => {
    const before = await (await fetch(apiUrl('/settings'))).json();
    const tagCount = Object.keys(before.tagColors).length;
    const res = await fetch(apiUrl('/settings'), {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ accent: '#ff00ff', tagColors: { teste: '#123456' } }),
    });
    const after = await res.json();
    expect(after.accent).toBe('#ff00ff');
    expect(after.tagColors.teste).toBe('#123456');
    expect(Object.keys(after.tagColors).length).toBe(tagCount + 1);
  });
});

describe('composition root — backup export/import (replaces the mindview-data repo)', () => {
  it('creates a notebook, exports it, then a fresh import round-trips it back', async () => {
    await fetch(apiUrl('/notebooks'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ titulo: 'Backup Test', simbolo: '★', cor: '#ff0000' }),
    });

    const exportRes = await fetch(apiUrl('/backup/export'));
    expect(exportRes.status).toBe(200);
    expect(exportRes.headers.get('content-disposition')).toContain('mindview-backup.json');
    const backup = await exportRes.json();
    expect(backup.notebooks.some((nb: { titulo: string }) => nb.titulo === 'Backup Test')).toBe(true);

    // simulate arriving on a machine with different notebooks already present
    await fetch(apiUrl('/notebooks'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ titulo: 'Should Be Wiped', simbolo: '◆', cor: '#00ff00' }),
    });

    const importRes = await fetch(apiUrl('/backup/import'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(backup),
    });
    expect(importRes.status).toBe(200);

    const after = await (await fetch(apiUrl('/notebooks'))).json();
    const titles = after.map((nb: { titulo: string }) => nb.titulo).sort();
    expect(titles).toEqual(['Backup Test']); // replace-all, not merge — "Should Be Wiped" is gone
  });

  it('rejects an import with an unsupported version instead of silently accepting it', async () => {
    const res = await fetch(apiUrl('/backup/import'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version: 999, settings: {}, notebooks: [] }),
    });
    expect(res.status).toBe(400);
  });
});
