import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { api } from '../api/client';
import type { Notebook } from '../api/types';
import { TerminalChrome } from '../components/TerminalChrome';
import { NotebookCard } from '../components/NotebookCard';
import { NewNotebookModal } from '../components/NewNotebookModal';
import { navigate } from '../lib/hashRoute';
import { useTree } from '../context/TreeContext';
import { NODE_DRAG_MIME } from '../components/Tree';

export function Shelf({ notebookKey }: { notebookKey: string | null }) {
  const { data: notebooks, loading, error, refetch } = useApi<Notebook[]>('/notebooks');
  const [showNew, setShowNew] = useState(false);

  if (notebookKey) {
    return <NotebookView notebookKey={notebookKey} onBack={() => navigate('estante')} />;
  }

  return (
    <>
      <TerminalChrome path="~/mind/estante" />
      <div className="shelf-grid">
        {loading && <p style={{ color: 'var(--subtle)' }}>Carregando…</p>}
        {error && <div className="error-banner">{error}</div>}
        {notebooks?.map((nb) => (
          <NotebookCard key={nb.key} notebook={nb} onNodeDropped={refetch} />
        ))}
        <button className="new-notebook-card" onClick={() => setShowNew(true)} title="Novo caderno">
          +
        </button>
      </div>
      <NewNotebookModal open={showNew} onClose={() => setShowNew(false)} onCreated={refetch} />
    </>
  );
}

function NotebookView({ notebookKey, onBack }: { notebookKey: string; onBack: () => void }) {
  const { data: nb, error, refetch } = useApi<Notebook>(`/notebooks/${encodeURIComponent(notebookKey)}`);
  const { pathSet } = useTree();
  const [dropping, setDropping] = useState(false);

  if (error) {
    return (
      <div className="notebook-view">
        <TerminalChrome path="~/mind/estante" />
        <div className="error-banner">{error}</div>
      </div>
    );
  }
  if (!nb) return null;

  const removeNode = (path: string) => {
    api.del(`/notebooks/${encodeURIComponent(notebookKey)}/nodes?path=${encodeURIComponent(path)}`).then(refetch);
  };

  // The shelf-grid card (NotebookCard.tsx) already accepts a drop before
  // you open a notebook. This screen — the notebook actually open — used
  // to have no drop target at all, so dragging a node in here (the
  // obvious place to try it) silently did nothing. Mirrors the same
  // dragover/drop pair as NotebookCard.
  const addNode = (path: string) => {
    api.post(`/notebooks/${encodeURIComponent(notebookKey)}/nodes`, { path }).then(refetch);
  };

  return (
    <div className="notebook-view">
      <TerminalChrome
        path={`~/mind/estante/${nb.titulo}`}
        actions={
          <button className="btn btn-ghost" onClick={onBack}>
            ← estante
          </button>
        }
      />
      <div
        className={`node-card-grid${dropping ? ' drop-target' : ''}`}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes(NODE_DRAG_MIME)) {
            e.preventDefault();
            setDropping(true);
          }
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDropping(false);
          const path = e.dataTransfer.getData(NODE_DRAG_MIME);
          if (path) addNode(path);
        }}
      >
        {nb.nodes.map((ref) => {
          const missing = !pathSet.has(ref.path);
          return (
            <div key={ref.path} className={`node-card${missing ? ' is-missing' : ''}`} onClick={() => !missing && navigate('read', ref.path)}>
              <button
                className="node-card-remove"
                title="Remover do caderno"
                onClick={(e) => {
                  e.stopPropagation();
                  if (window.confirm(`Remover "${ref.titleAtIndex}" deste caderno? O nó em si não é afetado.`)) removeNode(ref.path);
                }}
              >
                ✕
              </button>
              <strong>{ref.titleAtIndex}</strong>
              <span className="path">{ref.path}</span>
            </div>
          );
        })}
        {nb.nodes.length === 0 && (
          <p style={{ color: 'var(--subtle)', fontFamily: 'var(--font-mono)', fontSize: 12.5, gridColumn: '1 / -1' }}>
            arraste nós da árvore (à esquerda) pra qualquer lugar aqui pra adicionar ao caderno.
          </p>
        )}
      </div>
    </div>
  );
}
