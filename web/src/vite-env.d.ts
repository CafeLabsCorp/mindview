/// <reference types="vite/client" />

// Injected server-side (see vite.config.ts's transformIndexHtml in dev, and
// server/src/index.ts's injectToken in the built/prod path) — this is how
// the per-process auth token reaches the browser without any manual
// copy/paste step. See src/api/client.ts.
interface Window {
  __MV_TOKEN__?: string;
  __MV_PORT__?: number;
  /** Present only inside the desktop app (desktop/src/preload.ts). Absent in
   * a plain browser — every caller must feature-check it. */
  mindviewDesktop?: {
    pickFolder: () => Promise<string | null>;
  };
}
