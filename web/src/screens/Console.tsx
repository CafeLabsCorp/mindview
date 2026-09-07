import { useApi } from '../hooks/useApi';
import type { BoardResponse } from '../api/types';
import { TerminalChrome } from '../components/TerminalChrome';
import { navigate } from '../lib/hashRoute';
import { useT } from '../i18n/useT';

export function Console() {
  const { data, loading, error } = useApi<BoardResponse>('/board');
  const t = useT();

  const totals = data
    ? data.rows.reduce(
        (acc, r) => ({ open: acc.open + r.open, done: acc.done + r.done, paused: acc.paused + r.paused }),
        { open: 0, done: 0, paused: 0 },
      )
    : null;

  return (
    <>
      <TerminalChrome path={t('chrome.console')} />
      <div className="console-grid">
        {loading && <p style={{ color: 'var(--subtle)' }}>{t('common.loading')}</p>}
        {error && <div className="error-banner">{error}</div>}
        {data && totals && (
          <>
            <div className="console-summary">
              <div className="stat-card">
                <div className="value">{totals.open}</div>
                <div className="label">{t('console.open')}</div>
              </div>
              <div className="stat-card">
                <div className="value">{totals.done}</div>
                <div className="label">{t('console.done')}</div>
              </div>
              <div className="stat-card">
                <div className="value">{totals.paused}</div>
                <div className="label">{t('console.paused')}</div>
              </div>
              <div className={`stat-card${data.stale.length ? ' warn' : ''}`}>
                <div className="value">{data.stale.length}</div>
                <div className="label">{t('console.staleIndexes')}</div>
              </div>
              <div className={`stat-card${data.brokenLinks.length ? ' warn' : ''}`}>
                <div className="value">{data.brokenLinks.length}</div>
                <div className="label">{t('console.brokenLinks')}</div>
              </div>
              <div className={`stat-card${data.outsideVaultLinks.length ? ' warn' : ''}`}>
                <div className="value">{data.outsideVaultLinks.length}</div>
                <div className="label">{t('console.outsideVaultLinks')}</div>
              </div>
              <div className={`stat-card${data.orphans.length ? ' warn' : ''}`}>
                <div className="value">{data.orphans.length}</div>
                <div className="label">{t('console.orphans')}</div>
              </div>
            </div>

            <table className="board-table">
              <thead>
                <tr>
                  <th>{t('console.colNode')}</th>
                  <th>{t('console.colTasks')}</th>
                  <th>{t('console.colUpdated')}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.path} className={r.stale ? 'is-stale' : ''} onClick={() => navigate('read', r.path)} style={{ cursor: 'pointer' }}>
                    <td>{r.path}{r.stale && ' ⚠'}</td>
                    <td>
                      {r.open > 0 && <span className="board-badge open">{t('console.badgeOpen', { count: r.open })}</span>}
                      {r.paused > 0 && <span className="board-badge paused">{t('console.badgePaused', { count: r.paused })}</span>}
                      {r.done > 0 && <span className="board-badge done">{t('console.badgeDone', { count: r.done })}</span>}
                    </td>
                    <td className="mono">{r.atualizado ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {data.brokenLinks.length > 0 && (
              <>
                <div className="sidebar-section-label" style={{ padding: '0 0 6px' }}>
                  {t('console.brokenLinksHead')}
                </div>
                <ul className="issue-list">
                  {data.brokenLinks.map((l, i) => (
                    <li key={i}>
                      <span className="from">{l.fromPath}</span> → {l.resolvedPath}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {data.outsideVaultLinks.length > 0 && (
              <>
                <div className="sidebar-section-label" style={{ padding: '0 0 6px' }}>
                  {t('console.outsideVaultHead')}
                </div>
                <ul className="issue-list">
                  {data.outsideVaultLinks.map((l, i) => (
                    <li key={i}>
                      <span className="from">{l.fromPath}</span> → {l.raw}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {data.orphans.length > 0 && (
              <>
                <div className="sidebar-section-label" style={{ padding: '0 0 6px' }}>
                  {t('console.orphansHead')}
                </div>
                <ul className="issue-list">
                  {data.orphans.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </div>
    </>
  );
}
