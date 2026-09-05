import type { BacklinkEntry } from '../api/types';
import { navigate } from '../lib/hashRoute';

export function BacklinksPanel({ backlinks }: { backlinks: BacklinkEntry[] }) {
  return (
    <div style={{ marginTop: 26 }}>
      <div className="sidebar-section-label" style={{ padding: '0 0 8px' }}>
        Backlinks {backlinks.length > 0 && `(${backlinks.length})`}
      </div>
      {backlinks.length === 0 && <p style={{ color: 'var(--subtle)', fontSize: 12.5 }}>nenhum nó aponta pra este ainda.</p>}
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
