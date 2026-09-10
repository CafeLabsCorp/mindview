// Downloads a real Node.js runtime and drops the single binary into
// desktop/resources/node/. The packaged app runs the server child with
// THIS Node — never the Electron binary — so node-pty stays compiled
// against a normal Node ABI and no electron-rebuild is ever needed.
// (Decision "Opção A", see mind/tarefas/empresa/mindview.md.)
//
// Run before `electron-builder`. By default it fetches for the host
// platform; set MINDVIEW_TARGET=win32-x64 (etc.) to fetch for another.
import { spawnSync } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, rmSync, copyFileSync, chmodSync, readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

// node-pty is N-API, so bumping the Node patch never breaks the shipped
// prebuild — keep this current with the latest 20.x for security fixes.
const NODE_VERSION = process.env.MINDVIEW_NODE_VERSION ?? 'v20.19.4';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'node'); // -> resources/node in the packaged app

const target = process.env.MINDVIEW_TARGET ?? `${process.platform}-${process.arch}`;
const [platform, arch] = target.split('-');

const KIND = {
  win32: { slug: `win-${arch}`, ext: 'zip', bin: 'node.exe' },
  linux: { slug: `linux-${arch}`, ext: 'tar.gz', bin: 'bin/node' },
  darwin: { slug: `darwin-${arch}`, ext: 'tar.gz', bin: 'bin/node' },
}[platform];

if (!KIND) {
  console.error(`fetch-node: unsupported target platform "${platform}"`);
  process.exit(1);
}

const base = `node-${NODE_VERSION}-${KIND.slug}`;
const url = `https://nodejs.org/dist/${NODE_VERSION}/${base}.${KIND.ext}`;
const work = join(tmpdir(), `mv-node-${process.pid}`);

async function download(to) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(to));
}

function extract(archive, into) {
  mkdirSync(into, { recursive: true });
  if (KIND.ext === 'tar.gz') {
    const r = spawnSync('tar', ['-xf', archive, '-C', into], { stdio: 'inherit' });
    if (r.status !== 0) throw new Error(`tar failed to extract ${archive} (status ${r.status})`);
    return;
  }
  // .zip (Windows Node). `tar` handles zip only when it's bsdtar/libarchive
  // (Windows 10+, macOS) — GNU tar (Linux/WSL) cannot. Try bsdtar via `tar`,
  // then `unzip`, then give a clear instruction.
  for (const cmd of [
    ['tar', ['-xf', archive, '-C', into]],
    ['unzip', ['-q', archive, '-d', into]],
  ]) {
    const r = spawnSync(cmd[0], cmd[1], { stdio: 'inherit' });
    if (r.status === 0) return;
  }
  throw new Error(
    `Could not unzip ${archive}.\n` +
      'Building a Windows package from Linux/WSL needs a zip-capable extractor (bsdtar or unzip),\n' +
      'or — recommended — run the Windows build on Windows / CI (windows-latest), where system tar handles zip.',
  );
}

const markerBin = join(outDir, KIND.bin.split('/').pop());
if (existsSync(markerBin) && process.env.MINDVIEW_NODE_FORCE !== '1') {
  console.log(`fetch-node: ${markerBin} already present (set MINDVIEW_NODE_FORCE=1 to redo)`);
  process.exit(0);
}

console.log(`fetch-node: ${url}`);
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
const archivePath = join(work, `node.${KIND.ext}`);

await download(archivePath);
extract(archivePath, work);

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
const srcBin = join(work, base, ...KIND.bin.split('/'));
const dstBin = join(outDir, KIND.bin.split('/').pop());
copyFileSync(srcBin, dstBin);
if (platform !== 'win32') chmodSync(dstBin, 0o755);
rmSync(work, { recursive: true, force: true });

// Guard against the classic mistake: `npm run stage` on Linux with no
// MINDVIEW_TARGET drops a linux ELF named `node`, electron-builder then
// packages a Windows app around it. Verify the magic matches the target.
const magic = readFileSync(dstBin).subarray(0, 4);
const looksPE = magic[0] === 0x4d && magic[1] === 0x5a; // "MZ"
const looksELF = magic[0] === 0x7f && magic[1] === 0x45 && magic[2] === 0x4c && magic[3] === 0x46;
const looksMachO = magic.readUInt32BE(0) === 0xcffaedfe || magic.readUInt32BE(0) === 0xfeedfacf || magic.readUInt32LE(0) === 0xfeedfacf;
const ok =
  (platform === 'win32' && looksPE) || (platform === 'linux' && looksELF) || (platform === 'darwin' && looksMachO);
if (!ok) {
  rmSync(dstBin, { force: true });
  throw new Error(`fetch-node: extracted binary does not look like a ${platform} executable — refusing to keep it`);
}

console.log(`fetch-node: wrote ${dstBin} (${platform}-${arch}, node ${NODE_VERSION})`);
