import { useState } from 'react';
import { api } from '../api/client';
import type { Notebook } from '../api/types';
import { useT } from '../i18n/useT';

const GLYPHS = ['◆', '●', '■', '▲', '◈', '☰', '⌘', '✦', '⬢', '◐', '☾', 'λ', '∞', '§', '†', '⚙'];
const COLORS = ['#5b9eea', '#f0655c', '#e0913a', '#a78bfa', '#e685b5', '#45b8c4', '#8a7226', '#3fb950'];

interface NewNotebookModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (nb: Notebook) => void;
}

export function NewNotebookModal({ open, onClose, onCreated }: NewNotebookModalProps) {
  const [titulo, setTitulo] = useState('');
  const [simbolo, setSimbolo] = useState(GLYPHS[0]);
  const [cor, setCor] = useState(COLORS[0]);
  const [saving, setSaving] = useState(false);
  const t = useT();

  if (!open) return null;

  const submit = async () => {
    if (!titulo.trim()) return;
    setSaving(true);
    try {
      const nb = await api.post<Notebook>('/notebooks', { titulo: titulo.trim(), simbolo, cor });
      onCreated(nb);
      setTitulo('');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-panel" onClick={(e) => e.stopPropagation()} style={{ padding: 20 }}>
        <h3 style={{ marginBottom: 14, fontFamily: 'var(--font-mono)', fontSize: 13, textTransform: 'uppercase', color: 'var(--subtle)' }}>
          {t('shelf.newNotebook')}
        </h3>
        <input
          className="text-input"
          style={{ width: '100%', marginBottom: 14 }}
          placeholder={t('shelf.titlePlaceholder')}
          value={titulo}
          autoFocus
          onChange={(e) => setTitulo(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
        />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
          {GLYPHS.map((g) => (
            <button
              key={g}
              onClick={() => setSimbolo(g)}
              className="btn"
              style={{ width: 34, padding: 0, background: g === simbolo ? 'var(--surface-2)' : undefined, borderColor: g === simbolo ? 'var(--accent)' : undefined }}
            >
              {g}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setCor(c)}
              style={{
                width: 26,
                height: 26,
                borderRadius: '50%',
                background: c,
                border: c === cor ? '2px solid var(--fg)' : '1px solid var(--border)',
              }}
            />
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button className="btn btn-ghost" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button className="btn btn-primary" disabled={!titulo.trim() || saving} onClick={submit}>
            {t('common.create')}
          </button>
        </div>
      </div>
    </div>
  );
}
