import { useId, useState } from 'react';
import type { GraphGroup, GraphPrefs } from '../lib/graphPrefs';

const GROUP_SWATCHES = ['#e06c75', '#d19a66', '#61afef', '#c678dd', '#56b6c2', '#e5c07b'];

interface Props {
  prefs: GraphPrefs;
  setPref: <K extends keyof GraphPrefs>(key: K, value: GraphPrefs[K]) => void;
  onReset: () => void;
  nodeCount: number;
  edgeCount: number;
}

function Section({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="gc-section">
      <button className="gc-section-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className={`gc-caret${open ? ' is-open' : ''}`}>▸</span>
        {title}
      </button>
      <div className="gc-section-body" data-open={open || undefined}>
        <div className="gc-section-inner">{children}</div>
      </div>
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}) {
  const id = useId();
  return (
    <div className="gc-slider">
      <label htmlFor={id}>
        {label}
        <span className="gc-slider-val">{format ? format(value) : value.toFixed(1)}</span>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export function GraphControls({ prefs, setPref, onReset, nodeCount, edgeCount }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  const setGroup = (id: string, patch: Partial<GraphGroup>) =>
    setPref(
      'groups',
      prefs.groups.map((g) => (g.id === id ? { ...g, ...patch } : g)),
    );
  const addGroup = () =>
    setPref('groups', [
      ...prefs.groups,
      {
        id: `g${Date.now().toString(36)}`,
        query: '',
        color: GROUP_SWATCHES[prefs.groups.length % GROUP_SWATCHES.length],
      },
    ]);
  const removeGroup = (id: string) => setPref('groups', prefs.groups.filter((g) => g.id !== id));

  return (
    <div className={`graph-controls${collapsed ? ' is-collapsed' : ''}`}>
      {/* the whole bar toggles, not just the caret — same affordance as the
          section heads below */}
      <button className="gc-head" onClick={() => setCollapsed((c) => !c)} aria-expanded={!collapsed}>
        <span className="gc-title">grafo</span>
        <span className="gc-count">
          {nodeCount} nós · {edgeCount} arestas
        </span>
        <span className={`gc-caret${collapsed ? '' : ' is-open'}`}>▸</span>
      </button>

      <div className="gc-body" data-open={!collapsed || undefined}>
        <div className="gc-body-inner">
          <Section title="Aparência">
            <label className="gc-check">
              <input
                type="checkbox"
                checked={prefs.colorEnabled}
                onChange={(e) => setPref('colorEnabled', e.target.checked)}
              />
              cor por tag
            </label>
            <p className="gc-hint gc-sub">
              {prefs.colorEnabled
                ? 'cada nó pega a cor da primeira tag dele (mapa do Ajustes)'
                : 'nós no accent do Mind, tags em branco'}
            </p>
            <label className="gc-check">
              <input
                type="checkbox"
                checked={prefs.sizeByBacklinks}
                onChange={(e) => setPref('sizeByBacklinks', e.target.checked)}
              />
              tamanho por backlinks
            </label>
            <label className="gc-check">
              <input type="checkbox" checked={prefs.arrows} onChange={(e) => setPref('arrows', e.target.checked)} />
              setas nas arestas
            </label>
            <Slider
              label="tamanho dos nós"
              value={prefs.nodeSizeMul}
              min={0.5}
              max={2.2}
              step={0.1}
              onChange={(v) => setPref('nodeSizeMul', v)}
              format={(v) => `${v.toFixed(1)}×`}
            />
            <div className="gc-sub" data-off={!prefs.showTags || undefined}>
              <Slider
                label="tamanho das tags"
                value={prefs.tagNodeSize}
                min={2}
                max={12}
                step={0.5}
                onChange={(v) => setPref('tagNodeSize', v)}
                format={(v) => `${v.toFixed(1)}`}
              />
            </div>
            <Slider
              label="espessura das linhas"
              value={prefs.linkThickness}
              min={0.4}
              max={3}
              step={0.1}
              onChange={(v) => setPref('linkThickness', v)}
              format={(v) => `${v.toFixed(1)}×`}
            />
            <Slider
              label="limiar de rótulo"
              value={prefs.textFadeThreshold}
              min={0}
              max={1}
              step={0.05}
              onChange={(v) => setPref('textFadeThreshold', v)}
              format={(v) => (v === 0 ? 'sempre' : `${Math.round(v * 100)}%`)}
            />
            <Slider
              label="↻ tempo entre nós"
              value={prefs.revealStepMs}
              min={0}
              max={150}
              step={5}
              onChange={(v) => setPref('revealStepMs', v)}
              format={(v) => (v === 0 ? 'de uma vez' : `${v} ms`)}
            />
            <p className="gc-hint gc-sub">
              {prefs.revealStepMs === 0
                ? 'o grafo volta inteiro de uma vez'
                : `${nodeCount} nós ≈ ${((nodeCount * prefs.revealStepMs) / 1000).toFixed(1)}s pra reconstruir`}
            </p>
          </Section>

          <Section title="Filtros">
            <input
              className="gc-search"
              type="search"
              placeholder="buscar arquivos…  (tag:, path:)"
              value={prefs.search}
              onChange={(e) => setPref('search', e.target.value)}
            />
            <label className="gc-check">
              <input type="checkbox" checked={prefs.showTags} onChange={(e) => setPref('showTags', e.target.checked)} />
              tags como nós
            </label>
            <label className="gc-check">
              <input
                type="checkbox"
                checked={prefs.showOrphans}
                onChange={(e) => setPref('showOrphans', e.target.checked)}
              />
              órfãos
            </label>
          </Section>

          <Section title="Grupos" defaultOpen={false}>
            {prefs.groups.length === 0 && (
              <p className="gc-hint">
                Cor por termo de busca. Ex.: <code>tag:cafelabs</code>
              </p>
            )}
            {prefs.groups.map((g) => (
              <div className="gc-group" key={g.id}>
                <input
                  type="color"
                  value={g.color}
                  onChange={(e) => setGroup(g.id, { color: e.target.value })}
                  aria-label="cor do grupo"
                />
                <input
                  type="text"
                  value={g.query}
                  placeholder="termo…"
                  onChange={(e) => setGroup(g.id, { query: e.target.value })}
                />
                <button className="gc-group-x" onClick={() => removeGroup(g.id)} title="remover grupo">
                  ×
                </button>
              </div>
            ))}
            <button className="gc-add" onClick={addGroup}>
              + novo grupo
            </button>
          </Section>

          <div className="gc-footer">
            <button className="gc-reset" onClick={onReset}>
              Restaurar padrão
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
