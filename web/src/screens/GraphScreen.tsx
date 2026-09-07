import { useCallback, useEffect, useLayoutEffect, useMemo, useReducer, useRef, useState } from 'react';
import { useApi } from '../hooks/useApi';
import type { VaultGraph } from '../api/types';
import { TerminalChrome } from '../components/TerminalChrome';
import { useSettings } from '../context/SettingsContext';
import { navigate } from '../lib/hashRoute';
import { buildGraphModel } from '../lib/graphModel';
import { DEFAULT_GRAPH_PREFS, loadGraphPrefs, saveGraphPrefs, type GraphPrefs } from '../lib/graphPrefs';
import { GraphSim, edgeAppear, nodeAppear, nodeScale, type SimNode } from '../lib/graphSim';
import { GraphControls } from './GraphControls';
import { useT } from '../i18n/useT';

interface View {
  x: number;
  y: number;
  k: number;
}

const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpView = (a: View, b: View, t: number): View => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
  k: lerp(a.k, b.k, t),
});

function fitView(
  b: { minX: number; minY: number; maxX: number; maxY: number },
  size: { w: number; h: number },
  pad = 80,
): View {
  const bw = b.maxX - b.minX + pad * 2;
  const bh = b.maxY - b.minY + pad * 2;
  const k = Math.max(0.15, Math.min(size.w / bw, size.h / bh, 2));
  return {
    k,
    x: size.w / 2 - ((b.minX + b.maxX) / 2) * k,
    y: size.h / 2 - ((b.minY + b.maxY) / 2) * k,
  };
}

export function GraphScreen() {
  const { data, loading, error } = useApi<VaultGraph>('/graph');
  const { settings } = useSettings();
  const t = useT();

  const [prefs, setPrefs] = useState<GraphPrefs>(loadGraphPrefs);
  const setPref = useCallback(<K extends keyof GraphPrefs>(key: K, value: GraphPrefs[K]) => {
    setPrefs((p) => {
      const next = { ...p, [key]: value };
      saveGraphPrefs(next);
      return next;
    });
  }, []);

  const model = useMemo(
    () => (data ? buildGraphModel(data, prefs, settings.tagColors) : null),
    [data, prefs, settings.tagColors],
  );

  // --- sim + render loop -------------------------------------------------
  const simRef = useRef<GraphSim | null>(null);
  if (simRef.current === null) simRef.current = new GraphSim();
  const sim = simRef.current;

  const [, bumpFrame] = useReducer((n: number) => (n + 1) & 0xffff, 0);
  const rafRef = useRef<number | undefined>(undefined);
  const runningRef = useRef(false);
  const lastTsRef = useRef(0);

  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const sizeRef = useRef(size);
  sizeRef.current = size;

  const [view, setView] = useState<View>({ x: 0, y: 0, k: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const followRef = useRef(true); // auto-frame until the user pans/zooms/drags
  const viewTweenRef = useRef<{ from: View; to: View; t0: number; dur: number } | null>(null);

  const dragRef = useRef<
    | { mode: 'pan'; sx: number; sy: number; vx: number; vy: number; moved: boolean }
    | { mode: 'node'; id: string; sx: number; sy: number; moved: boolean }
    | null
  >(null);
  const [hovered, setHovered] = useState<string | null>(null);

  const loop = useCallback(
    (ts: number) => {
      const dt = lastTsRef.current ? Math.min(50, ts - lastTsRef.current) : 16;
      lastTsRef.current = ts;
      let busy = false;

      const moving = sim.tick(dt);
      busy = moving || busy;

      const tween = viewTweenRef.current;
      if (tween) {
        const e = easeInOutCubic(Math.min(1, (ts - tween.t0) / tween.dur));
        setView(lerpView(tween.from, tween.to, e));
        if (e >= 1) viewTweenRef.current = null;
        busy = true;
      } else if (followRef.current) {
        const b = sim.bounds();
        if (b && sizeRef.current.w > 0) {
          const target = fitView(b, sizeRef.current);
          const cur = viewRef.current;
          const next = lerpView(cur, target, 0.12);
          if (Math.abs(next.x - cur.x) + Math.abs(next.y - cur.y) + Math.abs(next.k - cur.k) * 400 > 0.4) {
            setView(next);
            busy = true;
          }
        }
      }

      bumpFrame();

      if (busy || dragRef.current) {
        rafRef.current = requestAnimationFrame(loop);
      } else {
        runningRef.current = false;
        lastTsRef.current = 0;
      }
    },
    [sim],
  );

  const wake = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;
    lastTsRef.current = 0;
    rafRef.current = requestAnimationFrame(loop);
  }, [loop]);

  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!model) return;
    sim.setModel(model);
    wake();
  }, [model, sim, wake]);

  useEffect(() => {
    sim.setSizeMul(prefs.nodeSizeMul);
    wake();
  }, [prefs.nodeSizeMul, sim, wake]);

  // re-frame on resize while still auto-following
  useEffect(() => {
    if (followRef.current) wake();
  }, [size.w, size.h, wake]);

  useEffect(() => {
    return () => {
      // Full reset so a remount (React StrictMode's mount→unmount→mount, or a
      // real one) restarts the RAF loop instead of finding `runningRef` stuck
      // `true` from the torn-down pass and never scheduling another frame.
      if (rafRef.current !== undefined) cancelAnimationFrame(rafRef.current);
      rafRef.current = undefined;
      runningRef.current = false;
      lastTsRef.current = 0;
      sim.dispose();
    };
  }, [sim]);

  // --- interaction -----------------------------------------------------
  const toWorld = (clientX: number, clientY: number) => {
    const rect = wrapRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    return { x: (clientX - rect.left - v.x) / v.k, y: (clientY - rect.top - v.y) / v.k };
  };

  /** Back to DEFAULT_GRAPH_PREFS, and re-frame — the same "Restaurar padrão"
   * affordance the Ajustes screen has per section. */
  const resetPrefs = () => {
    setPrefs(DEFAULT_GRAPH_PREFS);
    saveGraphPrefs(DEFAULT_GRAPH_PREFS);
    followRef.current = true;
    wake();
  };

  const recenter = () => {
    const b = sim.bounds();
    if (!b || size.w === 0) return;
    followRef.current = false;
    viewTweenRef.current = { from: viewRef.current, to: fitView(b, size), t0: performance.now(), dur: 420 };
    wake();
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    followRef.current = false;
    viewTweenRef.current = null;
    const rect = wrapRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const v = viewRef.current;
    const factor = e.deltaY < 0 ? 1.14 : 1 / 1.14;
    const k = Math.max(0.15, Math.min(6, v.k * factor));
    setView({ k, x: mx - ((mx - v.x) / v.k) * k, y: my - ((my - v.y) / v.k) * k });
  };

  const onPointerDown = (e: React.PointerEvent) => {
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    if (!dragRef.current) {
      const v = viewRef.current;
      dragRef.current = { mode: 'pan', sx: e.clientX, sy: e.clientY, vx: v.x, vy: v.y, moved: false };
    }
  };
  const onNodePointerDown = (e: React.PointerEvent, id: string) => {
    dragRef.current = { mode: 'node', id, sx: e.clientX, sy: e.clientY, moved: false };
    sim.grab(id);
    wake();
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.sx;
    const dy = e.clientY - d.sy;
    if (!d.moved && Math.abs(dx) + Math.abs(dy) > 4) d.moved = true;
    if (d.mode === 'pan') {
      followRef.current = false;
      setView({ ...viewRef.current, x: d.vx + dx, y: d.vy + dy });
    } else {
      followRef.current = false;
      const w = toWorld(e.clientX, e.clientY);
      sim.dragTo(d.id, w.x, w.y);
      wake();
    }
  };
  const onPointerUp = () => {
    const d = dragRef.current;
    dragRef.current = null;
    if (d?.mode === 'node') {
      const node = sim.nodes.get(d.id);
      if (!d.moved && node?.path) navigate('read', node.path);
      sim.release(d.id);
      wake();
    }
  };

  // --- label level-of-detail -----------------------------------------
  const neighbors = useMemo(() => {
    const m = new Map<string, Set<string>>();
    if (!model) return m;
    const link = (a: string, b: string) => {
      let set = m.get(a);
      if (!set) m.set(a, (set = new Set()));
      set.add(b);
    };
    for (const e of model.edges) {
      link(e.from, e.to);
      link(e.to, e.from);
    }
    return m;
  }, [model]);

  const kStart = lerp(0.25, 2.3, prefs.textFadeThreshold);
  const zoomLabelOpacity = Math.max(0, Math.min(1, (view.k - kStart) / 0.9));

  const nodeArr = [...sim.nodes.values()];
  const edgeArr = [...sim.edges.values()];
  const hoveredNode = hovered ? sim.nodes.get(hovered) ?? null : null;

  // ONLY the node under the cursor gets a forced label. Extending this to the
  // hovered node's neighbours (what the pre-rework screen did) is unusable
  // once tags are nodes: hovering a hub tag lights up the name of every file
  // carrying it. The neighbourhood still gets highlighted — but by NOT being
  // dimmed (see `dimmed` below), not by shouting its name.
  const labelOpacityFor = (n: SimNode) => (n.id === hovered ? 1 : zoomLabelOpacity);

  const dimmed = (id: string) => hovered !== null && id !== hovered && !neighbors.get(hovered)?.has(id);

  return (
    <div className="graph-screen-outer">
      <TerminalChrome path={t('chrome.graph')} />
      <div className="graph-canvas" ref={wrapRef}>
        {loading && <div className="graph-status">{t('graph.loading')}</div>}
        {error && <div className="error-banner">{error}</div>}

        <svg
          className="graph-svg"
          width="100%"
          height="100%"
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <defs>
            <marker
              id="graph-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M0 0 L10 5 L0 10 z" fill="var(--subtle)" />
            </marker>
          </defs>
          <g transform={`translate(${view.x} ${view.y}) scale(${view.k})`}>
            <g className="graph-edges">
              {edgeArr.map((e) => {
                const a = sim.nodes.get(e.from);
                const b = sim.nodes.get(e.to);
                if (!a || !b || !Number.isFinite(a.x) || !Number.isFinite(b.x)) return null;
                const op = edgeAppear(e) * (dimmed(e.from) && dimmed(e.to) ? 0.25 : 1);
                if (op <= 0.01) return null;
                const ra = sim.radiusOf(b);
                let x2 = b.x!;
                let y2 = b.y!;
                if (e.directed) {
                  const vx = b.x! - a.x!;
                  const vy = b.y! - a.y!;
                  const len = Math.hypot(vx, vy) || 1;
                  x2 = b.x! - (vx / len) * (ra + 2);
                  y2 = b.y! - (vy / len) * (ra + 2);
                }
                return (
                  <line
                    key={e.id}
                    x1={a.x!}
                    y1={a.y!}
                    x2={x2}
                    y2={y2}
                    className="graph-edge"
                    strokeWidth={prefs.linkThickness}
                    strokeOpacity={op}
                    markerEnd={e.directed ? 'url(#graph-arrow)' : undefined}
                  />
                );
              })}
            </g>

            <g className="graph-nodes">
              {nodeArr.map((n) => {
                if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) return null;
                const r = sim.radiusOf(n);
                const appear = nodeAppear(n);
                if (appear <= 0.01) return null;
                const isHovered = hovered === n.id;
                const isDim = dimmed(n.id);
                const labelOp = labelOpacityFor(n) * (isDim ? 0.25 : 1);
                return (
                  <g
                    key={n.id}
                    className={`graph-node is-${n.kind}${isHovered ? ' is-hovered' : ''}${isDim ? ' is-dim' : ''}`}
                    transform={`translate(${n.x} ${n.y}) scale(${nodeScale(n)})`}
                    opacity={appear}
                    onPointerDown={(e) => onNodePointerDown(e, n.id)}
                    onPointerEnter={() => !dragRef.current && setHovered(n.id)}
                    onPointerLeave={() => setHovered((h) => (h === n.id ? null : h))}
                  >
                    {/* tag nodes get a halo ring in their own colour — they
                        are filled like file nodes (a hollow bg-coloured dot
                        read as "invisible"), so the ring is what tells the
                        two kinds apart at a glance. */}
                    {n.kind === 'tag' && <circle className="graph-tag-ring" r={r + 3} stroke={n.color} />}
                    <circle className="graph-node-dot" r={r} fill={n.color} />
                    {(n.present || labelOp > 0.02) && (
                      <text
                        className="graph-node-label"
                        x={r + 4 / view.k}
                        y={3.6 / view.k}
                        fontSize={11 / view.k}
                        // inline style, NOT the `opacity` attribute — see the
                        // .graph-node.is-dim note in global.css
                        style={{ opacity: labelOp }}
                      >
                        {n.title}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          </g>
        </svg>

        <div className="graph-toolbar">
          <button
            onClick={() => {
              sim.restart(prefs.revealStepMs);
              followRef.current = true;
              wake();
            }}
            title={t('graph.restartSim')}
          >
            ↻
          </button>
          <button onClick={recenter} title={t('graph.recenter')}>
            ⊙
          </button>
        </div>

        {model && (
          <GraphControls
            prefs={prefs}
            setPref={setPref}
            onReset={resetPrefs}
            nodeCount={model.nodes.length}
            edgeCount={model.edges.length}
          />
        )}

        {hoveredNode && (
          <div className="graph-hover-card">
            <div className="graph-hover-title">{hoveredNode.title}</div>
            {hoveredNode.path && <div className="graph-hover-path">{hoveredNode.path}</div>}
            <div className="graph-hover-meta">
              {hoveredNode.kind === 'tag'
                ? t('graph.tagDegree', { count: hoveredNode.degree })
                : t('graph.degree', { count: hoveredNode.degree })}
              {hoveredNode.kind === 'file' && hoveredNode.tags.length > 0 && ` · #${hoveredNode.tags.join(' #')}`}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
