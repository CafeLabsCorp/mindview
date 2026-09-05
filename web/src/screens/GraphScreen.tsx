import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useApi } from '../hooks/useApi';
import type { VaultGraph } from '../api/types';
import { TerminalChrome } from '../components/TerminalChrome';
import { useSettings } from '../context/SettingsContext';
import { navigate } from '../lib/hashRoute';
import { layoutGraph } from '../lib/graphLayout';
import { colorForNode } from '../lib/tagPalette';
import { loadGraphPrefs, saveGraphPrefs, type GraphPrefs } from '../lib/graphPrefs';

const VIRTUAL_W = 1400;
const VIRTUAL_H = 900;

interface View {
  x: number;
  y: number;
  k: number;
}

export function GraphScreen() {
  const { data, loading, error } = useApi<VaultGraph>('/graph');
  const { settings } = useSettings();

  const [prefs, setPrefs] = useState<GraphPrefs>(loadGraphPrefs);
  const setPref = <K extends keyof GraphPrefs>(key: K, value: GraphPrefs[K]) => {
    setPrefs((p) => {
      const next = { ...p, [key]: value };
      saveGraphPrefs(next);
      return next;
    });
  };

  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(() => {
    if (!data) return null;
    const paths = data.nodes.map((n) => n.path);
    const pairs = data.edges.map((e) => [e.from, e.to] as [string, string]);
    return layoutGraph(paths, pairs, { width: VIRTUAL_W, height: VIRTUAL_H });
  }, [data]);

  const fitView = useMemo<View | null>(() => {
    if (!layout || size.w === 0) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of layout.values()) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    const pad = 60;
    const bw = maxX - minX + pad * 2;
    const bh = maxY - minY + pad * 2;
    const k = Math.min(size.w / bw, size.h / bh, 1.6);
    return {
      k,
      x: size.w / 2 - ((minX + maxX) / 2) * k,
      y: size.h / 2 - ((minY + maxY) / 2) * k,
    };
  }, [layout, size.w, size.h]);

  const [view, setView] = useState<View | null>(null);
  // Reset to the fitted view whenever the graph identity changes.
  useEffect(() => setView(null), [data]);
  const activeView = view ?? fitView ?? { x: 0, y: 0, k: 1 };

  const neighbors = useMemo(() => {
    const m = new Map<string, Set<string>>();
    if (!data) return m;
    const link = (a: string, b: string) => {
      let set = m.get(a);
      if (!set) m.set(a, (set = new Set()));
      set.add(b);
    };
    for (const e of data.edges) {
      link(e.from, e.to);
      link(e.to, e.from);
    }
    return m;
  }, [data]);

  const [hovered, setHovered] = useState<string | null>(null);
  const dragRef = useRef<{ sx: number; sy: number; vx: number; vy: number; moved: boolean } | null>(null);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const rect = wrapRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const k = Math.max(0.15, Math.min(6, activeView.k * factor));
    setView({
      k,
      x: mx - ((mx - activeView.x) / activeView.k) * k,
      y: my - ((my - activeView.y) / activeView.k) * k,
    });
  };

  const onMouseDown = (e: React.MouseEvent) => {
    dragRef.current = { sx: e.clientX, sy: e.clientY, vx: activeView.x, vy: activeView.y, moved: false };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (Math.abs(dx) + Math.abs(dy) > 3) d.moved = true;
    setView({ k: activeView.k, x: d.vx + dx, y: d.vy + dy });
  };
  const endDrag = () => {
    dragRef.current = null;
  };

  const nodeRadius = (backlinkCount: number) =>
    prefs.sizeByBacklinks ? 4.5 + Math.sqrt(backlinkCount) * 2.4 : 6;

  const fallbackColor = 'var(--subtle)';
  const hoveredNode = hovered ? data?.nodes.find((n) => n.path === hovered) ?? null : null;

  return (
    <div className="graph-screen-outer">
      <TerminalChrome path="~/mind/grafo" />
      <div
        className="graph-canvas"
        ref={wrapRef}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={endDrag}
        onMouseLeave={endDrag}
      >
        {loading && <div className="graph-status">Carregando grafo…</div>}
        {error && <div className="error-banner">{error}</div>}
        {data && layout && (
          <svg className="graph-svg" width="100%" height="100%">
            <g transform={`translate(${activeView.x} ${activeView.y}) scale(${activeView.k})`}>
              {data.edges.map((e, i) => {
                const a = layout.get(e.from);
                const b = layout.get(e.to);
                if (!a || !b) return null;
                const dim = hovered !== null && hovered !== e.from && hovered !== e.to;
                return (
                  <line
                    key={i}
                    x1={a.x}
                    y1={a.y}
                    x2={b.x}
                    y2={b.y}
                    className={`graph-edge${dim ? ' is-dim' : ''}`}
                  />
                );
              })}
              {data.nodes.map((n) => {
                const p = layout.get(n.path);
                if (!p) return null;
                const isHovered = hovered === n.path;
                const isNeighbor = hovered !== null && !!neighbors.get(hovered)?.has(n.path);
                const dim = hovered !== null && !isHovered && !isNeighbor;
                const color = prefs.colorEnabled
                  ? colorForNode(n.tags, prefs.colorBy, settings.tagColors, fallbackColor)
                  : 'var(--muted)';
                const r = nodeRadius(n.backlinkCount);
                return (
                  <g
                    key={n.path}
                    className={`graph-node${dim ? ' is-dim' : ''}${isHovered ? ' is-hovered' : ''}`}
                    transform={`translate(${p.x} ${p.y})`}
                    onMouseEnter={() => setHovered(n.path)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => {
                      if (!dragRef.current?.moved) navigate('read', n.path);
                    }}
                  >
                    <circle r={r} fill={color} className="graph-node-dot" />
                    {(prefs.showLabels || isHovered || isNeighbor) && (
                      <text x={r + 3} y={3.5} className="graph-node-label">
                        {n.title}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
        )}

        <div className="graph-controls">
          <label>
            <input
              type="checkbox"
              checked={prefs.colorEnabled}
              onChange={(e) => setPref('colorEnabled', e.target.checked)}
            />
            cor por tag
          </label>
          <div className="graph-controls-sub" data-off={!prefs.colorEnabled}>
            <button
              className={`chip${prefs.colorBy === 'last' ? ' is-on' : ''}`}
              onClick={() => setPref('colorBy', 'last')}
            >
              mais específica
            </button>
            <button
              className={`chip${prefs.colorBy === 'first' ? ' is-on' : ''}`}
              onClick={() => setPref('colorBy', 'first')}
            >
              primeira
            </button>
          </div>
          <label>
            <input
              type="checkbox"
              checked={prefs.sizeByBacklinks}
              onChange={(e) => setPref('sizeByBacklinks', e.target.checked)}
            />
            tamanho por backlinks
          </label>
          <label>
            <input
              type="checkbox"
              checked={prefs.showLabels}
              onChange={(e) => setPref('showLabels', e.target.checked)}
            />
            mostrar rótulos
          </label>
          <button className="chip" onClick={() => setView(null)}>
            recentralizar
          </button>
          {data && (
            <span className="graph-count">
              {data.nodes.length} nós · {data.edges.length} arestas
            </span>
          )}
        </div>

        {hoveredNode && (
          <div className="graph-hover-card">
            <div className="graph-hover-title">{hoveredNode.title}</div>
            <div className="graph-hover-path">{hoveredNode.path}</div>
            <div className="graph-hover-meta">
              {hoveredNode.backlinkCount} backlink{hoveredNode.backlinkCount === 1 ? '' : 's'}
              {hoveredNode.tags.length > 0 && ` · #${hoveredNode.tags.join(' #')}`}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
