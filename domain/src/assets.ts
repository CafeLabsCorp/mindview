// Non-markdown files in the vault ("assets": PDFs, scripts, images, …).
// They are listed, linked and shown, never parsed — the index only keeps
// their path and stat. How each type is *shown* is decided here, once, so
// the server (which picks the Content-Type it serves) and the web viewer
// can't disagree.

export interface AssetFile {
  /** vault-root-relative path, POSIX separators */
  path: string;
  mtimeMs: number;
  size: number;
}

export interface IndexedAsset extends AssetFile {
  /** lower-case extension without the dot; '' when the name has none */
  ext: string;
  view: AssetView;
}

/** pdf → the browser's PDF viewer · image → <img> · text → our own
 * highlighted text view · other → metadata + open/show in folder. */
export type AssetView = 'pdf' | 'image' | 'text' | 'other';

const IMAGE = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'ico', 'svg']);

const TEXT = new Set([
  // shell / scripting
  'sh', 'bash', 'zsh', 'fish', 'ps1', 'bat', 'cmd',
  'js', 'mjs', 'cjs', 'ts', 'mts', 'cts', 'jsx', 'tsx', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'c', 'h', 'cpp', 'hpp', 'cs', 'php', 'lua', 'sql',
  // data / config
  'json', 'jsonc', 'yaml', 'yml', 'toml', 'ini', 'cfg', 'conf', 'env', 'xml', 'csv', 'tsv', 'base', 'canvas',
  // web (shown as SOURCE text, never rendered — see server /api/asset/raw)
  'html', 'htm', 'css', 'scss',
  // prose
  'txt', 'log', 'rst', 'tex', 'org',
]);

/** Extensionless names that are text by convention. */
const TEXT_NAMES = new Set(['version', 'license', 'readme', 'makefile', 'dockerfile', 'changelog', 'authors']);

export function assetExt(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

export function assetView(path: string): AssetView {
  const ext = assetExt(path);
  if (ext === 'pdf') return 'pdf';
  if (IMAGE.has(ext)) return 'image';
  if (TEXT.has(ext)) return 'text';
  if (!ext && TEXT_NAMES.has(path.slice(path.lastIndexOf('/') + 1).toLowerCase())) return 'text';
  return 'other';
}

export function indexAsset(f: AssetFile): IndexedAsset {
  return { ...f, ext: assetExt(f.path), view: assetView(f.path) };
}
