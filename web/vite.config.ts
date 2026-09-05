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
    proxy: {
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
