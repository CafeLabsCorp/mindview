// Composition root — the piece nobody had written yet. Wires the pure
// domain (@mindview/domain) and the IO layer (io/*.ts, app/houseA.ts) into
// an actual HTTP server. Everything architectural here (bind address, auth
// model, confine() discipline) was already decided by the backend cycle —
// see mind/tarefas/empresa/mindview.md — this file is the final fiation,
// not a new design.
//
// Security model, enforced on every single request in `dispatch()` below:
//   1. Host header must name this machine's loopback address on our own
//      port (`isHostAllowed`) — defeats DNS rebinding. Applied to *every*
//      request, including static asset / SPA-shell serving: if we only
//      checked it on /api/*, a rebound page could still same-origin-fetch
//      `/` and read the token we embed in it (see below).
//   2. `/api/*` (including the SSE stream) additionally requires the
//      per-process token as `?token=`.
// No CORS headers are ever sent (see http/respond.ts). Cross-origin access
// during `npm run dev` goes through Vite's own proxy (a same-process Node
// hop, not a browser-granted CORS exception) — see web/vite.config.ts.
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, dirname, resolve as resolvePath } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildBoard,
  buildGraph,
  buildTree,
  computeStaleIndexes,
  listBrokenLinks,
  listOrphans,
  listOutsideVaultLinks,
  search,
} from '@mindview/domain';
import type { Settings } from './app/houseA.js';
import {
  addNodeToNotebook,
  createNotebook,
  deleteNotebook,
  getNotebook,
  listNotebooks,
  readConfig,
  readSettings,
  removeNodeFromNotebook,
  updateNotebookCover,
  writeConfig,
  writeSettings,
} from './app/houseA.js';
import { exportBackup, importBackup, InvalidBackupError, validateBackup } from './app/backup.js';
import { logUsage, noteRecentNode, noteRecentVaultPath, readState, togglePinnedNode, writeSession } from './app/stateB.js';
import { VaultService } from './app/vaultService.js';
import { confine, OutsideRootError } from './io/confine.js';
import { obsidianUri, vscodeUri } from './io/externalOpen.js';
import { generateToken, isHostAllowed, rejectUnauthorized, tokenFromRequest, tokenMatches } from './io/security.js';
import { HttpError, readJsonBody, sendJson } from './http/respond.js';
import { Router } from './http/router.js';
import { attachTerminalBridge, killAllTerminalSessions } from './http/terminalSocket.js';
import { detectShells } from './app/shells.js';
import { resolveCwd, resolveLaunch } from './app/terminalService.js';

const PORT = Number(process.env.MINDVIEW_PORT ?? 4317);
const TOKEN = generateToken();
const __dirname = dirname(fileURLToPath(import.meta.url));
const DIST_DIR = join(__dirname, '..', '..', 'web', 'dist'); // server/src -> server -> mindview -> web/dist

const config = readConfig();
const vaultService = new VaultService(config.vault_path);
console.log(`[mindview] indexed ${vaultService.index.nodes.size} nodes from ${vaultService.vaultPath} in ${vaultService.index.buildMs.toFixed(1)}ms`);

writeSession({ token: TOKEN, port: PORT, startedAt: Date.now() });

// ------------------------------------------------------------------ routes

const router = new Router();

router.get('api/health', ({ res }) => {
  sendJson(res, 200, {
    ok: true,
    vaultPath: vaultService.vaultPath,
    nodeCount: vaultService.index.nodes.size,
    builtAt: vaultService.index.builtAt,
    buildMs: vaultService.index.buildMs,
  });
});

router.get('api/tree', ({ res }) => {
  sendJson(res, 200, buildTree(vaultService.index));
});

router.get('api/node', ({ res, query }) => {
  const path = query.get('path');
  if (!path) throw new HttpError(400, 'missing ?path=');
  const index = vaultService.index;
  const node = index.nodes.get(path);
  if (!node) {
    sendJson(res, 404, { error: 'node not found', path });
    return;
  }
  const backlinks = index.backlinks.get(path) ?? [];
  let obsidian: string | null = null;
  let vscode: string | null = null;
  try {
    const abs = confine(vaultService.vaultPath, path);
    obsidian = obsidianUri(abs);
    vscode = vscodeUri(abs);
  } catch (err) {
    console.error(`[server] could not build external-open URIs for ${path}:`, err);
  }
  noteRecentNode(path);
  logUsage({ type: 'open-node', path });
  sendJson(res, 200, { node, backlinks, obsidian, vscode });
});

router.get('api/search', ({ res, query }) => {
  const q = query.get('q') ?? '';
  const limit = Number(query.get('limit') ?? 20);
  sendJson(res, 200, search(vaultService.index, q, limit));
});

router.get('api/board', ({ res }) => {
  const index = vaultService.index;
  const stale = computeStaleIndexes(index);
  sendJson(res, 200, {
    rows: buildBoard(index, stale),
    stale: [...stale],
    brokenLinks: listBrokenLinks(index),
    outsideVaultLinks: listOutsideVaultLinks(index),
    orphans: listOrphans(index),
    builtAt: index.builtAt,
    buildMs: index.buildMs,
  });
});

router.get('api/graph', ({ res }) => {
  sendJson(res, 200, buildGraph(vaultService.index));
});

router.get('api/settings', ({ res }) => {
  sendJson(res, 200, readSettings());
});

router.put('api/settings', async ({ req, res }) => {
  const patch = await readJsonBody<Partial<Settings>>(req);
  const current = readSettings();
  const merged: Settings = { ...current, ...patch, tagColors: { ...current.tagColors, ...(patch.tagColors ?? {}) } };
  writeSettings(merged);
  // Read back rather than echoing the merge: readSettings() coerces the
  // terminal fields to their declared types (see sanitizeTerminal), so the
  // client is told what actually took effect, not what it asked for.
  sendJson(res, 200, readSettings());
});

router.get('api/config', ({ res }) => {
  sendJson(res, 200, { vaultPath: vaultService.vaultPath, recentVaultPaths: readState().recentVaultPaths });
});

router.put('api/config', async ({ req, res }) => {
  const body = await readJsonBody<{ vaultPath?: string }>(req);
  const candidate = body.vaultPath?.trim();
  if (!candidate || !candidate.startsWith('/')) {
    throw new HttpError(400, 'vaultPath must be a non-empty absolute path');
  }
  const resolved = resolvePath(candidate);
  if (!existsSync(resolved) || !statSync(resolved).isDirectory()) {
    throw new HttpError(400, `not a directory: ${resolved}`);
  }
  await vaultService.setVaultPath(resolved);
  writeConfig({ vault_path: resolved });
  noteRecentVaultPath(resolved);
  console.log(`[mindview] switched vault to ${resolved}, reindexed ${vaultService.index.nodes.size} nodes`);
  sendJson(res, 200, { vaultPath: resolved });
});

router.get('api/notebooks', ({ res }) => {
  sendJson(res, 200, listNotebooks());
});

router.post('api/notebooks', async ({ req, res }) => {
  const body = await readJsonBody<{ titulo?: string; simbolo?: string; cor?: string }>(req);
  const titulo = body.titulo?.trim();
  if (!titulo) throw new HttpError(400, 'titulo is required');
  const nb = createNotebook({ titulo, simbolo: body.simbolo ?? '◆', cor: body.cor ?? '#5b9eea' });
  sendJson(res, 201, nb);
});

router.get('api/notebooks/:key', ({ res, params }) => {
  const nb = getNotebook(params.key);
  if (!nb) {
    sendJson(res, 404, { error: 'notebook not found', key: params.key });
    return;
  }
  sendJson(res, 200, nb);
});

router.patch('api/notebooks/:key', async ({ req, res, params }) => {
  const patch = await readJsonBody<Partial<{ titulo: string; simbolo: string; cor: string }>>(req);
  const nb = updateNotebookCover(params.key, patch);
  if (!nb) {
    sendJson(res, 404, { error: 'notebook not found', key: params.key });
    return;
  }
  sendJson(res, 200, nb);
});

router.delete('api/notebooks/:key', ({ res, params }) => {
  deleteNotebook(params.key);
  sendJson(res, 200, { ok: true });
});

router.post('api/notebooks/:key/nodes', async ({ req, res, params }) => {
  const body = await readJsonBody<{ path?: string }>(req);
  if (!body.path) throw new HttpError(400, 'path is required');
  const title = vaultService.index.nodes.get(body.path)?.title ?? body.path;
  const nb = addNodeToNotebook(params.key, body.path, title);
  if (!nb) {
    sendJson(res, 404, { error: 'notebook not found', key: params.key });
    return;
  }
  sendJson(res, 200, nb);
});

router.delete('api/notebooks/:key/nodes', ({ res, params, query }) => {
  const path = query.get('path');
  if (!path) throw new HttpError(400, 'missing ?path=');
  const nb = removeNodeFromNotebook(params.key, path);
  if (!nb) {
    sendJson(res, 404, { error: 'notebook not found', key: params.key });
    return;
  }
  sendJson(res, 200, nb);
});

router.get('api/backup/export', ({ res }) => {
  const payload = exportBackup();
  const text = JSON.stringify(payload, null, 2);
  res.writeHead(200, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(text),
    'content-disposition': 'attachment; filename="mindview-backup.json"',
  });
  res.end(text);
});

router.post('api/backup/import', async ({ req, res }) => {
  const body = await readJsonBody<unknown>(req);
  const payload = validateBackup(body);
  importBackup(payload);
  sendJson(res, 200, { ok: true, notebookCount: payload.notebooks.length });
});

router.get('api/open', ({ res, query }) => {
  const path = query.get('path');
  const target = query.get('target');
  if (!path || (target !== 'obsidian' && target !== 'vscode')) {
    throw new HttpError(400, 'missing ?path= or ?target=obsidian|vscode');
  }
  const abs = confine(vaultService.vaultPath, path);
  const uri = target === 'obsidian' ? obsidianUri(abs) : vscodeUri(abs);
  sendJson(res, 200, { uri });
});

// The Ajustes screen offers only shells that really exist here (see
// app/shells.ts) plus whatever path the user types — never a hardcoded
// bash, since a clone of this repo may be running on Windows.
router.get('api/terminal/shells', ({ res }) => {
  const settings = readSettings();
  const launch = resolveLaunch(settings);
  sendJson(res, 200, {
    platform: process.platform,
    shells: detectShells(),
    effective: {
      shell: launch.command,
      // The exact argv the PTY will be spawned with — in the default
      // 'command' mode this is what shows there is no shell underneath.
      args: launch.args,
      cwd: resolveCwd(settings.terminalCwd, vaultService.vaultPath),
      startupCommand: settings.terminalStartupCommand,
      mode: settings.terminalMode,
    },
  });
});

router.get('api/state', ({ res }) => {
  sendJson(res, 200, readState());
});

router.post('api/state/pin', async ({ req, res }) => {
  const body = await readJsonBody<{ path?: string }>(req);
  if (!body.path) throw new HttpError(400, 'path is required');
  sendJson(res, 200, togglePinnedNode(body.path));
});

router.get('api/events', ({ req, res }) => {
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
  });
  res.write('retry: 2000\n\n');
  const send = (index: typeof vaultService.index) => {
    res.write(`event: reindex\ndata: ${JSON.stringify({ builtAt: index.builtAt, buildMs: index.buildMs, nodeCount: index.nodes.size })}\n\n`);
  };
  const unsubscribe = vaultService.onReindex(send);
  const heartbeat = setInterval(() => res.write(': ping\n\n'), 20000);
  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});

// -------------------------------------------------------------- static/SPA

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

function injectToken(html: string): string {
  const script = `<script>window.__MV_TOKEN__=${JSON.stringify(TOKEN)};window.__MV_PORT__=${PORT};</script>`;
  return html.includes('</head>') ? html.replace('</head>', `${script}</head>`) : script + html;
}

/** Only reached in the built (`npm run start`) mode — in `npm run dev`,
 * Vite serves the SPA on its own port and this Node process only ever sees
 * /api/* traffic proxied to it. See web/vite.config.ts for the dev-mode
 * equivalent of the token injection below (`transformIndexHtml`). */
function serveStatic(pathname: string, res: import('node:http').ServerResponse): void {
  const indexPath = join(DIST_DIR, 'index.html');
  if (!existsSync(indexPath)) {
    sendJson(res, 200, {
      message:
        'MindView backend is running but web/dist was not built. In dev, open the Vite dev server URL (see its own console output), not this port directly — this process only serves /api/* while Vite serves the UI.',
    });
    return;
  }
  const rel = pathname === '/' ? 'index.html' : pathname.slice(1);
  const candidate = join(DIST_DIR, rel);
  const isFile = candidate.startsWith(DIST_DIR) && existsSync(candidate) && statSync(candidate).isFile();
  const target = isFile ? candidate : indexPath; // SPA fallback for any non-asset route
  if (target === indexPath) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(injectToken(readFileSync(target, 'utf-8')));
    return;
  }
  res.writeHead(200, { 'content-type': CONTENT_TYPES[extname(target)] ?? 'application/octet-stream' });
  res.end(readFileSync(target));
}

// ------------------------------------------------------------------- server

const server = createServer(async (req, res) => {
  const host = req.headers.host;
  if (!isHostAllowed(host, PORT)) {
    rejectUnauthorized(res, 'unexpected Host header — anti DNS-rebinding check');
    return;
  }
  const url = new URL(req.url ?? '/', 'http://internal');
  const pathname = url.pathname;

  if (pathname.startsWith('/api/')) {
    const token = tokenFromRequest(req);
    if (!tokenMatches(token, TOKEN)) {
      rejectUnauthorized(res, 'missing or invalid token');
      return;
    }
    const matched = router.match(req.method ?? 'GET', pathname.slice(1));
    if (!matched) {
      sendJson(res, 404, { error: 'no such route', path: pathname });
      return;
    }
    try {
      await matched.handler({ req, res, params: matched.params, query: url.searchParams });
    } catch (err) {
      if (err instanceof HttpError) {
        sendJson(res, err.status, { error: err.message });
      } else if (err instanceof OutsideRootError || err instanceof InvalidBackupError) {
        sendJson(res, 400, { error: err.message });
      } else {
        console.error(`[server] unhandled error in ${req.method} ${pathname}:`, err);
        sendJson(res, 500, { error: 'internal error' });
      }
    }
    return;
  }

  serveStatic(pathname, res);
});

// WebSocket upgrades bypass the request handler above entirely, so the
// bridge re-checks Host/Origin/token itself — see http/terminalSocket.ts.
const terminalWss = attachTerminalBridge(server, {
  token: TOKEN,
  port: PORT,
  readSettings,
  vaultPath: () => vaultService.vaultPath,
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[mindview] server listening on http://127.0.0.1:${PORT} (loopback only)`);
  // Deliberately not printed: since the terminal landed, this token
  // authorises opening a shell, and a console scrollback (or a screenshot
  // of one) is a bad place for it. Everything that needs it — Vite, the
  // test suite — reads it from the file below, which is owner-only.
  console.log(`[mindview] per-run token written to ${process.env.MINDVIEW_STATE_DIR ?? '~/.local/share/mindview'}/session.json`);
  console.log(`[mindview] the web dev server (Vite) picks this token up automatically via ${process.env.MINDVIEW_STATE_DIR ?? '~/.local/share/mindview'}/session.json`);
  console.log(`[mindview] open the URL Vite prints (usually http://localhost:5173) — do not open port ${PORT} directly except for /api/health`);
});

async function shutdown(): Promise<void> {
  // Synchronous, before anything async: waiting for each socket's 'close'
  // event to fire would race the process exiting.
  killAllTerminalSessions();
  for (const client of terminalWss.clients) client.terminate();
  terminalWss.close();
  await vaultService.close();
  // /api/events is an SSE stream that never ends on its own, so
  // server.close() alone would hang forever with the UI open.
  server.closeAllConnections();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
