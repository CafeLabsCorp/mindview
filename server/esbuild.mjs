// Bundles the server (which runs as TypeScript via `tsx` in dev) into a
// single ESM file for the packaged desktop app. Pure deps (ws, yaml, and
// the @mindview/domain workspace) are inlined; native / optional-native
// deps stay external and are shipped as real node_modules alongside the
// bundle — see desktop/electron-builder.yml.
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { build } from 'esbuild';

const root = dirname(fileURLToPath(import.meta.url));

const EXTERNAL = [
  'node-pty', // native addon — must load a real .node for the host runtime
  'fsevents', // optional macOS-only native dep of chokidar; never present on win/linux
];

await build({
  absWorkingDir: root,
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  external: EXTERNAL,
  // import.meta.url is used for __dirname; keep ESM semantics intact.
  banner: {
    js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
  },
  logLevel: 'info',
});
