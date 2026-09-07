import type { BacklinkEntry } from '../api/types';
import { navigate } from '../lib/hashRoute';
import { useT } from '../i18n/useT';

export function BacklinksPanel({ backlinks }: { backlinks: BacklinkEntry[] }) {
  const t = useT();
  return (
    <div style={{ marginTop: 26 }}>
      <div className="sidebar-section-label" style={{ padding: '0 0 8px' }}>
        {t('reader.backlinks')} {backlinks.length > 0 && `(${backlinks.length})`}
      </div>
      {backlinks.length === 0 && <p style={{ color: 'var(--subtle)', fontSize: 12.5 }}>{t('reader.noBacklinks')}</p>}
      {backlinks.map((b, i) => (
        <div key={`${b.fromPath}-${i}`} className="backlink-item">
          <button
            className="from"
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left' }}
            onClick={() => navigate('read', b.fromPath)}
          >
            {b.fromPath}
          </button>
          <span className="excerpt">{b.excerpt}</span>
        </div>
      ))}
    </div>
  );
}
