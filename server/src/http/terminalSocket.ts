// The PTY<->browser bridge. Everything the rest of the server enforces per
// request (Host check, per-run token) has to be re-enforced here by hand:
// an HTTP `upgrade` never reaches the normal request handler, so none of
// the guards in index.ts's `dispatch` apply to it.
//
// Wire protocol, deliberately asymmetric:
//   server -> client   BINARY frames are raw terminal output (high volume,
//                      no reason to JSON-escape every chunk)
//                      TEXT frames are JSON control messages
//   client -> server   TEXT JSON only ({t:'input'|'resize'}) — keystrokes
//                      are tiny, so clarity wins over bytes
import type { IncomingMessage, Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type WebSocket } from 'ws';
import { TerminalSession } from '../app/terminalService.js';
import type { Settings } from '../app/houseA.js';
import { isHostAllowed, tokenMatches } from '../io/security.js';

// Distinct from the plain GET /api/terminal/shells route: keeping the
// socket on its own sub-path lets Vite's dev proxy give *only* this one
// ws:true, without accidentally routing the JSON endpoint through a
// WebSocket proxy.
export const TERMINAL_PATH = '/api/terminal/pty';

/** Vite's dev server port. Named explicitly (and pinned with
 * `strictPort: true` in web/vite.config.ts) rather than accepting "any
 * loopback port": in dev the page really is served from a different
 * origin than the API, but allowing *every* local port meant any other
 * process listening on this machine could talk to the terminal socket.
 * Override with MINDVIEW_DEV_ORIGIN, or set it to something impossible to
 * drop the dev allowance entirely in a packaged build. */
const DEV_ORIGIN = process.env.MINDVIEW_DEV_ORIGIN ?? 'http://localhost:5173';

/**
 * Cross-Site WebSocket Hijacking defence. The same-origin policy does NOT
 * apply to WebSockets: any page on the internet can open one to
 * 127.0.0.1 and, without this check, would be talking to a shell. The
 * token already gates that, but Origin is the cheap second lock — and it
 * is the *only* lock that still holds in dev, where Vite's proxy rewrites
 * Host (`changeOrigin`) so the anti-rebinding check passes by construction.
 *
 * A missing Origin is allowed: browsers always send one on a WebSocket
 * handshake, so this only ever admits non-browser clients (curl, the test
 * suite), which still have to present the token.
 */
export function isOriginAllowed(origin: string | undefined, port: number): boolean {
  if (!origin) return true;
  const allowed = new Set([
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
    DEV_ORIGIN,
    DEV_ORIGIN.replace('//localhost', '//127.0.0.1'),
  ]);
  return allowed.has(origin);
}

export interface TerminalBridgeDeps {
  token: string;
  port: number;
  readSettings: () => Settings;
  vaultPath: () => string;
}

interface ClientMessage {
  t?: string;
  d?: unknown;
  cols?: unknown;
  rows?: unknown;
}

function sendControl(ws: WebSocket, payload: Record<string, unknown>): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
}

/** Refuses the upgrade with a bare HTTP response — `ws` is never handed
 * the socket, so no protocol negotiation happens for a rejected client. */
function refuse(socket: Duplex, status: number, reason: string): void {
  socket.write(`HTTP/1.1 ${status} ${reason}\r\nConnection: close\r\n\r\n`);
  socket.destroy();
}

export function attachTerminalBridge(server: Server, deps: TerminalBridgeDeps): WebSocketServer {
  // Default maxPayload is 100 MiB; client->server traffic here is
  // keystrokes and resize messages, so 1 MiB is already generous.
  const wss = new WebSocketServer({ noServer: true, maxPayload: 1 << 20 });

  // Anything thrown inside an 'upgrade' listener is an uncaughtException —
  // there is no per-request try/catch around this path the way there is
  // around HTTP handlers, so a settings.yaml that became unreadable would
  // take the whole process down.
  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    try {
      handleUpgrade(wss, req, socket, head, deps);
    } catch (err) {
      console.error('[terminal] upgrade failed:', err);
      refuse(socket, 500, 'Internal Error');
    }
  });

  return wss;
}

/** Hard cap on concurrent shells. Only reachable by someone who already
 * has the token, so this is damage control rather than a gate. */
const MAX_SESSIONS = 8;
const liveSessions = new Set<TerminalSession>();

/** Killed synchronously on shutdown: relying on each socket's async
 * 'close' event would race the process exiting. */
export function killAllTerminalSessions(): void {
  for (const s of liveSessions) s.kill();
  liveSessions.clear();
}

function handleUpgrade(
  wss: WebSocketServer,
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  deps: TerminalBridgeDeps,
): void {
  {
    const url = new URL(req.url ?? '/', 'http://internal');
    if (url.pathname !== TERMINAL_PATH) {
      refuse(socket, 404, 'Not Found');
      return;
    }
    if (!isHostAllowed(req.headers.host, deps.port)) {
      refuse(socket, 403, 'Forbidden');
      return;
    }
    if (!isOriginAllowed(req.headers.origin, deps.port)) {
      refuse(socket, 403, 'Forbidden');
      return;
    }
    if (!tokenMatches(url.searchParams.get('token'), deps.token)) {
      refuse(socket, 403, 'Forbidden');
      return;
    }
    if (!deps.readSettings().terminalEnabled) {
      // Not hidden in the UI — the socket genuinely does not exist while
      // the setting is off. Note this is a *usability* switch, not a
      // security boundary: anyone holding the token can flip it back on
      // through PUT /api/settings. The token is the boundary.
      refuse(socket, 403, 'Forbidden');
      return;
    }
    if (liveSessions.size >= MAX_SESSIONS) {
      refuse(socket, 503, 'Too Many Sessions');
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      openSession(ws, url, deps);
    });
  }
}

function openSession(ws: WebSocket, url: URL, deps: TerminalBridgeDeps): void {
  const cols = clampDimension(url.searchParams.get('cols'), 80);
  const rows = clampDimension(url.searchParams.get('rows'), 24);
  const settings = deps.readSettings();

  let session: TerminalSession;
  try {
    session = new TerminalSession(
      { settings, vaultPath: deps.vaultPath(), cols, rows },
      {
        onData: (chunk) => {
          if (ws.readyState === ws.OPEN) ws.send(Buffer.from(chunk, 'utf-8'), { binary: true });
        },
        onExit: ({ exitCode, signal }) => {
          sendControl(ws, { t: 'exit', exitCode, signal });
          ws.close();
        },
      },
    );
  } catch (err) {
    // Almost always a shell path that doesn't exist on this machine —
    // surface the real message so Ajustes can be fixed, rather than a
    // silently dead panel.
    sendControl(ws, { t: 'error', message: err instanceof Error ? err.message : String(err) });
    ws.close();
    return;
  }

  liveSessions.add(session);
  sendControl(ws, { t: 'ready', shell: session.shellCommand, cwd: session.cwd, mode: session.mode });

  ws.on('message', (raw, isBinary) => {
    if (isBinary) return; // client only ever speaks JSON text
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw.toString()) as ClientMessage;
    } catch {
      return;
    }
    if (msg.t === 'input' && typeof msg.d === 'string') {
      session.write(msg.d);
    } else if (msg.t === 'resize') {
      session.resize(clampDimension(msg.cols, cols), clampDimension(msg.rows, rows));
    }
  });

  const cleanup = () => {
    liveSessions.delete(session);
    session.kill();
  };
  ws.on('close', cleanup);
  ws.on('error', cleanup);
}

/** Terminal dimensions come from the client, so they are untrusted: a
 * negative or absurd value would either break the PTY or make it allocate
 * a huge buffer. */
function clampDimension(value: unknown, fallback: number): number {
  const n = typeof value === 'string' ? Number(value) : typeof value === 'number' ? value : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1000, Math.max(1, Math.floor(n)));
}
