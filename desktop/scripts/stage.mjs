// Assembles everything the packaged app serves from resources/, into
// desktop/staging/. electron-builder then copies staging/ verbatim (see
// extraResources in electron-builder.yml). Keeping this explicit — rather
// than pointing electron-builder at scattered monorepo folders — means the
// exact shipped tree is inspectable before a build.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const desktop = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(desktop, '..');
const staging = join(desktop, 'staging');

rmSync(staging, { recursive: true, force: true });
mkdirSync(join(staging, 'server', 'node_modules'), { recursive: true });

// 1. server: the esbuild bundle (ws/yaml/chokidar/@mindview/domain inlined).
execFileSync('node', [join(repo, 'server', 'esbuild.mjs')], { stdio: 'inherit' });
cpSync(join(repo, 'server', 'dist', 'index.mjs'), join(staging, 'server', 'index.mjs'));

// 2. node-pty: the one dep left external (native). Ship only what the
//    runtime loader (lib/utils.js) actually touches — the JS in lib/ and
//    the win32 prebuild. Skips deps/, src/, third_party/, .pdb debug
//    symbols (~28 MB), win32-arm64 and darwin-*.
const nodePtySrc = join(repo, 'node_modules', 'node-pty');
if (!existsSync(nodePtySrc)) throw new Error('node-pty not installed — run npm install at the repo root first');
const nodePtyDst = join(staging, 'server', 'node_modules', 'node-pty');
mkdirSync(nodePtyDst, { recursive: true });

const KEEP_PREBUILD = process.env.MINDVIEW_TARGET?.startsWith('win32-arm64') ? 'win32-arm64' : 'win32-x64';
const drop = (src) => src.endsWith('.pdb');
for (const f of ['package.json', 'LICENSE', 'lib']) {
  const src = join(nodePtySrc, f);
  if (existsSync(src)) cpSync(src, join(nodePtyDst, f), { recursive: true, filter: (s) => !drop(s) });
}
const prebuildSrc = join(nodePtySrc, 'prebuilds', KEEP_PREBUILD);
if (existsSync(prebuildSrc)) {
  cpSync(prebuildSrc, join(nodePtyDst, 'prebuilds', KEEP_PREBUILD), { recursive: true, filter: (s) => !drop(s) });
}

// The Linux binary for the WSL launch mode comes from the committed vendor
// copy, NOT node_modules — so the Windows CI build (which can't compile a
// Linux .node) still ships WSL-mode support. node-pty's loader checks
// build/Release/ before prebuilds/, so this is where it goes.
const linuxPtySrc = join(desktop, 'vendor', 'node-pty-linux-x64', 'pty.node');
if (existsSync(linuxPtySrc)) {
  mkdirSync(join(nodePtyDst, 'build', 'Release'), { recursive: true });
  cpSync(linuxPtySrc, join(nodePtyDst, 'build', 'Release', 'pty.node'));
}

// 3. web: the built SPA the server serves as its shell.
//    shell:true so `npm` resolves to npm.cmd on Windows CI.
execFileSync('npm', ['run', 'build', '-w', 'web'], { cwd: repo, stdio: 'inherit', shell: true });
cpSync(join(repo, 'web', 'dist'), join(staging, 'web'), { recursive: true });

// 4. Fail loudly rather than shipping a half-working app: both the Windows
//    prebuild and the vendored Linux binary must be present, and the Linux
//    one must actually be an ELF x86-64.
const need = [
  join(nodePtyDst, 'prebuilds', KEEP_PREBUILD, 'pty.node'),
  join(nodePtyDst, 'build', 'Release', 'pty.node'),
];
for (const f of need) {
  if (!existsSync(f)) {
    throw new Error(
      `stage: missing ${f}\n` +
        'The WSL launch mode needs the vendored Linux node-pty binary — see desktop/vendor/node-pty-linux-x64/README.md.',
    );
  }
}
const linuxPty = readFileSync(need[1]);
const isElf = linuxPty[0] === 0x7f && linuxPty[1] === 0x45 && linuxPty[2] === 0x4c && linuxPty[3] === 0x46; // \x7fELF
const isX86_64 = linuxPty[18] === 0x3e; // e_machine == EM_X86_64
if (!isElf || !isX86_64) {
  throw new Error(`stage: ${need[1]} is not a linux x86-64 binary — WSL mode would fail to load node-pty`);
}

console.log(`stage: wrote ${staging}`);
