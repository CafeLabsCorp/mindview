// Bundles the Electron main process into a single CJS file. Electron's
// `main` runs in CommonJS; keeping it one self-contained file means the
// packaged app's app.asar only needs this plus the server bundle.
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { build } from 'esbuild';

const root = dirname(fileURLToPath(import.meta.url));

await build({
  absWorkingDir: root,
  entryPoints: ['src/main.ts'],
  outfile: 'dist/main.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  external: ['electron'],
  logLevel: 'info',
});
