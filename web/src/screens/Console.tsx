import { useApi } from '../hooks/useApi';
import type { BoardResponse } from '../api/types';
import { TerminalChrome } from '../components/TerminalChrome';
import { navigate } from '../lib/hashRoute';

export function Console() {
  const { data, loading, error } = useApi<BoardResponse>('/board');

  const totals = data
    ? data.rows.reduce(
        (acc, r) => ({ open: acc.open + r.open, done: acc.done + r.done, paused: acc.paused + r.paused }),
        { open: 0, done: 0, paused: 0 },
      )
    : null;

  return (
    <>
      <TerminalChrome path="~/mind/console" />
      <div className="console-grid">
        {loading && <p style={{ color: 'var(--subtle)' }}>Carregando…</p>}
        {error && <div className="error-banner">{error}</div>}
        {data && totals && (
          <>
            <div className="console-summary">
              <div className="stat-card">
                <div className="value">{totals.open}</div>
                <div className="label">abertas</div>
              </div>
              <div className="stat-card">
                <div className="value">{totals.done}</div>
                <div className="label">concluídas</div>
              </div>
              <div className="stat-card">
                <div className="value">{totals.paused}</div>
                <div className="label">pausadas [~]</div>
              </div>
              <div className={`stat-card${data.stale.length ? ' warn' : ''}`}>
                <div className="value">{data.stale.length}</div>
                <div className="label">índices desatualizados</div>
              </div>
              <div className={`stat-card${data.brokenLinks.length ? ' warn' : ''}`}>
                <div className="value">{data.brokenLinks.length}</div>
                <div className="label">links quebrados</div>
              </div>
              <div className={`stat-card${data.outsideVaultLinks.length ? ' warn' : ''}`}>
                <div className="value">{data.outsideVaultLinks.length}</div>
                <div className="label">links fora do vault</div>
              </div>
              <div className={`stat-card${data.orphans.length ? ' warn' : ''}`}>
                <div className="value">{data.orphans.length}</div>
                <div className="label">órfãos</div>
              </div>
            </div>

            <table className="board-table">
              <thead>
                <tr>
                  <th>nó</th>
                  <th>tarefas</th>
                  <th>atualizado</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.path} className={r.stale ? 'is-stale' : ''} onClick={() => navigate('read', r.path)} style={{ cursor: 'pointer' }}>
                    <td>{r.path}{r.stale && ' ⚠'}</td>
                    <td>
                      {r.open > 0 && <span className="board-badge open">{r.open} aberta{r.open > 1 ? 's' : ''}</span>}
                      {r.paused > 0 && <span className="board-badge paused">{r.paused} pausada{r.paused > 1 ? 's' : ''}</span>}
                      {r.done > 0 && <span className="board-badge done">{r.done} feita{r.done > 1 ? 's' : ''}</span>}
                    </td>
                    <td className="mono">{r.atualizado ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {data.brokenLinks.length > 0 && (
              <>
                <div className="sidebar-section-label" style={{ padding: '0 0 6px' }}>
                  Links quebrados
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
                  Links saindo do vault
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
                  Órfãos
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
