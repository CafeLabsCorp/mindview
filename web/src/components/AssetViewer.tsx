import { lazy, Suspense, useEffect, useState } from 'react';
import { api } from '../api/client';
import type { AssetResponse } from '../api/types';
import { useApi } from '../hooks/useApi';
import { useLocale, useT } from '../i18n/useT';
import { BacklinksPanel } from './BacklinksPanel';

const CodeView = lazy(() => import('./CodeView'));

/** Bigger than this, a text file isn't pulled into the page to highlight. */
const MAX_TEXT_BYTES = 1024 * 1024;

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// A non-markdown vault file, shown by its type (the rule lives in
// domain/src/assets.ts): PDF in the browser's viewer, images inline, text
// with highlighting, anything else as a card with its details. Every file
// comes from /api/asset/raw, which never serves anything as a page on this
// origin (see server/src/app/assetServing.ts).
export function AssetViewer({ path }: { path: string }) {
  const t = useT();
  const { intl } = useLocale();
  const { data: asset, error } = useApi<AssetResponse>(`/asset?path=${encodeURIComponent(path)}`);
  const desktop = window.mindviewDesktop;
  const rawUrl = api.rawUrl(`/asset/raw?path=${encodeURIComponent(path)}`);

  if (error) return <div className="error-banner">{error}</div>;
  if (!asset) return <p style={{ color: 'var(--subtle)' }}>{t('common.loading')}</p>;

  const name = asset.path.split('/').pop()!;
  const canOpen = !!desktop?.canOpenExternally(asset.ext);

  return (
    <div className="asset-viewer">
      <div className="asset-head">
        <h1 style={{ fontFamily: 'var(--font-display)' }}>{name}</h1>
        <div className="asset-meta mono">
          {asset.ext ? `.${asset.ext}` : t('asset.noExt')} · {formatSize(asset.size)} ·{' '}
          {new Date(asset.mtimeMs).toLocaleDateString(intl, { day: '2-digit', month: 'short', year: 'numeric' })}
        </div>
        <div className="node-toolbar">
          {desktop && canOpen && (
            <button className="btn" onClick={() => desktop.openAsset(asset.path)}>
              {t('asset.openExternally')}
            </button>
          )}
          {desktop && (
            <button className="btn" onClick={() => desktop.showAssetInFolder(asset.path)}>
              {t('asset.showInFolder')}
            </button>
          )}
          {!desktop && (
            <a className="btn" href={rawUrl} download={name}>
              {t('asset.download')}
            </a>
          )}
        </div>
      </div>

      {asset.view === 'pdf' && <PdfAsset rawUrl={rawUrl} title={name} />}
      {asset.view === 'image' && <img className="asset-image" src={rawUrl} alt={name} />}
      {asset.view === 'text' && <TextAsset rawUrl={rawUrl} ext={asset.ext} size={asset.size} />}
      {asset.view === 'other' && (
        <p className="asset-note">{desktop ? (canOpen ? t('asset.otherDesktop') : t('asset.otherBlocked')) : t('asset.otherBrowser')}</p>
      )}

      <BacklinksPanel backlinks={asset.backlinks} />
    </div>
  );
}

/** The PDF viewer must never see the token: a PDF's own JavaScript can
 * read the document URL (this.URL) and send it out (app.launchURL,
 * submitForm) — and /api/asset/raw's URL carries the token. So the page
 * fetches the bytes and hands the viewer a blob: URL instead. The type is
 * FORCED to application/pdf, never taken from the response — a blob of
 * text/html on this origin would be a page with our privileges. */
function PdfAsset({ rawUrl, title }: { rawUrl: string; title: string }) {
  const t = useT();
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    let blobUrl: string | null = null;
    setSrc(null);
    setFailed(false);
    fetch(rawUrl)
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((buf) => {
        if (!alive) return;
        blobUrl = URL.createObjectURL(new Blob([buf], { type: 'application/pdf' }));
        setSrc(blobUrl);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [rawUrl]);

  if (failed) return <div className="error-banner">{t('asset.loadFailed')}</div>;
  if (!src) return <p style={{ color: 'var(--subtle)' }}>{t('common.loading')}</p>;
  return <iframe className="asset-pdf" src={src} title={title} />;
}

function TextAsset({ rawUrl, ext, size }: { rawUrl: string; ext: string; size: number }) {
  const t = useT();
  const [text, setText] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const tooBig = size > MAX_TEXT_BYTES;

  useEffect(() => {
    if (tooBig) return;
    let alive = true;
    setText(null);
    setFailed(false);
    fetch(rawUrl)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((body) => alive && setText(body))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [rawUrl, tooBig]);

  if (tooBig) return <p className="asset-note">{t('asset.tooBig', { size: formatSize(size) })}</p>;
  if (failed) return <div className="error-banner">{t('asset.loadFailed')}</div>;
  if (text === null) return <p style={{ color: 'var(--subtle)' }}>{t('common.loading')}</p>;
  return (
    <Suspense fallback={<pre className="code-view">{text}</pre>}>
      <CodeView text={text} ext={ext} />
    </Suspense>
  );
}
