import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Same Casa B (disposable, machine-local state) the server writes to — see
// server/src/app/paths.ts. Read directly rather than duplicated as a
// hardcoded string so an env override on one side is honored on the other.
const HOUSE_B_ROOT = process.env.MINDVIEW_STATE_DIR ?? join(homedir(), '.local', 'share', 'mindview');
const SERVER_PORT = Number(process.env.MINDVIEW_PORT ?? 4317);

interface Session {
  token: string;
  port: number;
}

function readSession(): Session | null {
  try {
    return JSON.parse(readFileSync(join(HOUSE_B_ROOT, 'session.json'), 'utf-8')) as Session;
  } catch {
    return null; // server hasn't started yet, or Casa B was wiped — dev-mode only concern
  }
}

/**
 * Bridges the per-process token from the Node server (server/src/index.ts)
 * into the page the browser loads, without any manual copy/paste: every
 * time Vite serves index.html in dev, this stamps the *current* token read
 * straight off disk. Mirrors what the server does itself when serving the
 * built index.html in `npm run start` (see `injectToken` there) — same
 * mechanism, two different processes emitting the HTML.
 */
function injectTokenPlugin() {
  return {
    name: 'mindview-inject-token',
    transformIndexHtml(html: string) {
      const session = readSession();
      const token = session?.token ?? '';
      const port = session?.port ?? SERVER_PORT;
      if (!token) {
        console.warn(
          '[mindview] no session token found yet in ' +
            join(HOUSE_B_ROOT, 'session.json') +
            ' — is `npm run dev -w server` running? Reload this page once it is.',
        );
      }
      return html.replace(
        '</head>',
        `<script>window.__MV_TOKEN__=${JSON.stringify(token)};window.__MV_PORT__=${JSON.stringify(port)};</script></head>`,
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), injectTokenPlugin()],
  server: {
    // Vite's default `cors` allows *any* loopback origin, and the HTML this
    // dev server hands out carries the run token (injectTokenPlugin above).
    // Together that let a page served from any other port on this machine
    // fetch this one, read the token, and — since the terminal landed —
    // open a shell with it. The SPA only ever fetches same-origin (5173 ->
    // 5173, proxied below) and HMR is same-origin too, so switching CORS
    // off costs nothing and removes the exfiltration step.
    cors: false,
    host: '127.0.0.1',
    // The server's Origin allowlist names this exact port; silently
    // sliding to 5174 would break the terminal's handshake.
    strictPort: true,
    proxy: {
      // The embedded terminal is the one WebSocket in the app, so it gets
      // its own entry (listed first — Vite matches keys in order) with
      // ws:true, leaving the /api rule below free to keep ws:false for
      // everything else, including the plain GET /api/terminal/shells.
      '/api/terminal/pty': {
        target: `ws://127.0.0.1:${SERVER_PORT}`,
        changeOrigin: true,
        ws: true,
      },
      // Same-process Node->Node hop, not a browser CORS grant — the
      // server itself never sends Access-Control-Allow-* headers (see
      // server/src/http/respond.ts). This is what lets `npm run dev` run
      // two separate ports without ever needing CORS.
      '/api': {
        target: `http://127.0.0.1:${SERVER_PORT}`,
        changeOrigin: true,
        ws: false, // SSE (/api/events) is plain HTTP streaming, not a websocket
      },
    },
  },
});
