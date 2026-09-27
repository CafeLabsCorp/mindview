// Bundles the Electron main process (and its preload) into single CJS files. Electron's
// `main` runs in CommonJS; keeping it one self-contained file means the
// packaged app's app.asar only needs this plus the server bundle.
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { build } from 'esbuild';

const root = dirname(fileURLToPath(import.meta.url));

const common = {
  absWorkingDir: root,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['electron'],
  logLevel: 'info',
};

await build({ ...common, entryPoints: ['src/main.ts'], outfile: 'dist/main.cjs' });
// The preload runs sandboxed, where require() only reaches `electron` — so
// it must be one file with nothing else to import.
await build({ ...common, entryPoints: ['src/preload.ts'], outfile: 'dist/preload.cjs' });
