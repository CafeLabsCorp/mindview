import { useState } from 'react';
import type { Notebook } from '../api/types';
import { navigate } from '../lib/hashRoute';
import { api } from '../api/client';
import { NODE_DRAG_MIME } from './Tree';

interface NotebookCardProps {
  notebook: Notebook;
  onNodeDropped: () => void;
}

/** Identity is color + monospaced glyph + a 5px spine — zero
 * texture/relief (that's what sank the first design round: it read as
 * skeuomorphic "Ateliê" wood/fabric, closer to Dindin than to Mind). */
export function NotebookCard({ notebook, onNodeDropped }: NotebookCardProps) {
  const [dropping, setDropping] = useState(false);

  return (
    <button
      className={`notebook-card${dropping ? ' drop-target' : ''}`}
      style={{ background: notebook.cor, borderColor: 'color-mix(in srgb, ' + notebook.cor + ' 60%, black)' }}
      onClick={() => navigate('estante', notebook.key)}
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
        if (!path) return;
        api.post(`/notebooks/${encodeURIComponent(notebook.key)}/nodes`, { path }).then(onNodeDropped);
      }}
    >
      <span className="glyph">{notebook.simbolo}</span>
      <span className="titulo">{notebook.titulo}</span>
      <span className="count">{notebook.nodes.length} nó{notebook.nodes.length === 1 ? '' : 's'}</span>
    </button>
  );
}
