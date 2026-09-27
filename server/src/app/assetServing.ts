// How a vault asset is handed to the browser. The page lives on the same
// origin as the API — and a page that can read the token can open a shell
// (the embedded terminal). So a vault file must NEVER be served as something
// the browser would run as a page on this origin: an .html or .svg in the
// vault, opened directly, would be stored XSS with shell access.
//
// Rule: every response is `nosniff` and, except PDFs, carries
// `Content-Security-Policy: sandbox` — even if something navigates to it,
// it becomes an opaque origin with scripts off. Text of any kind (including
// .html/.js source) is served as text/plain and rendered by our own viewer.
// PDFs can't be sandboxed (Chromium refuses to run its PDF viewer in a
// sandboxed document), and don't need to be: the viewer runs PDFs in its own
// process, not as this origin's script.
import type { IndexedAsset } from '@mindview/domain';

const IMAGE_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  svg: 'image/svg+xml',
};

const SANDBOX = "sandbox; default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'";

/** RFC 6266 filename: ASCII fallback + UTF-8 form, quotes/controls stripped. */
function dispositionName(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const ascii = name.replace(/[^\x20-\x7e]|["\\]/g, '_');
  return `filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

export function assetHeaders(asset: IndexedAsset): Record<string, string> {
  const base: Record<string, string> = {
    'x-content-type-options': 'nosniff',
    'cache-control': 'no-store',
    'referrer-policy': 'no-referrer',
  };
  switch (asset.view) {
    case 'pdf':
      return { ...base, 'content-type': 'application/pdf', 'content-disposition': `inline; ${dispositionName(asset.path)}` };
    case 'image':
      return {
        ...base,
        'content-type': IMAGE_TYPES[asset.ext] ?? 'application/octet-stream',
        'content-security-policy': SANDBOX,
        'content-disposition': `inline; ${dispositionName(asset.path)}`,
      };
    case 'text':
      return {
        ...base,
        'content-type': 'text/plain; charset=utf-8',
        'content-security-policy': SANDBOX,
        'content-disposition': `inline; ${dispositionName(asset.path)}`,
      };
    default:
      return {
        ...base,
        'content-type': 'application/octet-stream',
        'content-security-policy': SANDBOX,
        'content-disposition': `attachment; ${dispositionName(asset.path)}`,
      };
  }
}
