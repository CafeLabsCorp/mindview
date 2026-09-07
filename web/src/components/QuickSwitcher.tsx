import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import type { SearchHit } from '../api/types';
import { navigate } from '../lib/hashRoute';
import { useT } from '../i18n/useT';

interface QuickSwitcherProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Backs both the global search (Ctrl+K) and the quick-switcher (Ctrl+O) —
 * one modal, one endpoint (domain/src/selectors.ts's search()). The
 * product brief lists them as two concepts but they're the same lookup
 * over the same 68-file index; splitting them into two UIs would just be
 * two copies of the same 15 lines.
 */
export function QuickSwitcher({ open, onClose }: QuickSwitcherProps) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const t = useT();

  useEffect(() => {
    if (open) {
      setQuery('');
      setHits([]);
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    if (!open || !query.trim()) {
      setHits([]);
      return;
    }
    const t = setTimeout(() => {
      api.get<SearchHit[]>(`/search?q=${encodeURIComponent(query)}&limit=20`).then(setHits).catch(console.error);
    }, 90);
    return () => clearTimeout(t);
  }, [query, open]);

  if (!open) return null;

  const choose = (hit: SearchHit) => {
    navigate('read', hit.path);
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          className="modal-input"
          placeholder={t('search.placeholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
            else if (e.key === 'ArrowDown') {
              e.preventDefault();
              setSelected((s) => Math.min(s + 1, hits.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setSelected((s) => Math.max(s - 1, 0));
            } else if (e.key === 'Enter' && hits[selected]) {
              choose(hits[selected]);
            }
          }}
        />
        <div className="modal-results">
          {hits.map((h, i) => (
            <div key={h.path} className={`modal-result${i === selected ? ' is-selected' : ''}`} onClick={() => choose(h)}>
              <span className="title">{h.title}</span>
              <span className="path">{h.path}</span>
            </div>
          ))}
          {query.trim() && hits.length === 0 && <div className="modal-result path">{t('common.noResults')}</div>}
        </div>
      </div>
    </div>
  );
}
