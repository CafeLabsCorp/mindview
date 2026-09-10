import { app } from 'electron';
import { join } from 'node:path';

// Where the pieces the shell needs live, in dev vs. in a packaged build.
//
// Packaged layout (electron-builder, see electron-builder.yml):
//   resources/
//     app.asar              — this code
//     server/index.mjs      — the esbuild'd server + its real node_modules
//     web/                  — web/dist contents
//     node/node[.exe]       — a real Node runtime for the server child
//                             (kept out of app.asar; native, must be a file)
//
// Dev layout: siblings inside the monorepo.

const isWin = process.platform === 'win32';

export interface ShellPaths {
  /** The server entry (an ESM bundle in prod, or the same file from `npm run build -w server` in dev). */
  serverEntry: string;
  /** Directory of built web assets the server serves as its SPA shell. */
  webDir: string;
  /** A real Node executable to run the server child with. In dev this may be
   *  the Electron binary in ELECTRON_RUN_AS_NODE mode; in prod it is the
   *  bundled Node so node-pty is never coupled to Electron's ABI. */
  nodeBin: string;
  /** True when `nodeBin` is the Electron binary and needs ELECTRON_RUN_AS_NODE=1. */
  nodeBinIsElectron: boolean;
}

export function resolveShellPaths(): ShellPaths {
  if (app.isPackaged) {
    const res = process.resourcesPath;
    return {
      serverEntry: join(res, 'server', 'index.mjs'),
      webDir: join(res, 'web'),
      nodeBin: join(res, 'node', isWin ? 'node.exe' : 'node'),
      nodeBinIsElectron: false,
    };
  }
  const repo = join(app.getAppPath(), '..'); // desktop/ -> mindview/
  return {
    serverEntry: join(repo, 'server', 'dist', 'index.mjs'),
    webDir: join(repo, 'web', 'dist'),
    // Dev: run the server through Electron-as-Node. node-pty won't match this
    // ABI (that's fine for shell testing — the server still boots); a real
    // dev run of the terminal should use `npm run dev` at the repo root.
    nodeBin: process.execPath,
    nodeBinIsElectron: true,
  };
}

/** Per-user writable dir for MindView state (Casa A + Casa B share it). */
export function stateDir(): string {
  // app.getPath('userData') is %APPDATA%/MindView on Windows,
  // ~/.config/MindView on Linux — the OS-correct spot, replacing the
  // hardcoded ~/.local/share/mindview default baked into the server.
  return app.getPath('userData');
}
