import {
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Force,
  type Simulation,
  type SimulationNodeDatum,
} from 'd3-force';
import type { GraphModel } from './graphModel';

// A live force simulation (d3-force) that we tick by hand from the
// component's requestAnimationFrame loop rather than letting d3 run its own
// timer — so React owns the frame, drag stays in sync, and the loop can
// idle the instant nothing is moving. This replaces the old one-shot
// hand-rolled layout (graphLayout.ts, deleted): the graph is now a thing
// you can grab, and "restart" re-heats it. See mind/tarefas/empresa/
// mindview.md ("Rework do grafo").

const ENTER_MS = 380;
const EXIT_MS = 280;

// "Restart" is a staged re-growth, not just an alpha bump: the graph empties
// and comes back one node at a time. The gap between nodes is a user pref
// (GraphPrefs.revealStepMs) rather than something derived from the node
// count — this is the fallback when nobody passes one.
const DEFAULT_REVEAL_STEP_MS = 20;
const DRAG_ALPHA_TARGET = 0.08;

/** Order the staged restart brings nodes back in: 'waves' — orphans, then
 * breadth-first from the busiest hub out to the leaves (MindView's own);
 * 'random' — shuffled, the way Obsidian's graph animates. Either way an
 * edge only appears once both its ends are on screen. */
export type RevealMode = 'waves' | 'random';

export interface SimNode extends SimulationNodeDatum {
  id: string;
  kind: 'file' | 'tag';
  title: string;
  path?: string;
  tag?: string;
  tags: string[];
  degree: number;
  baseR: number;
  color: string;
  /** non-markdown file — drawn dimmer */
  asset: boolean;
  /** 0 → 1 linear presence; render eases it. Exiting nodes ride it back to 0. */
  p: number;
  present: boolean;
  /** ms still to wait before this node is allowed to fade in. Non-zero only
   * during a staged restart; the node stays fully hidden until it hits 0. */
  revealIn: number;
}

export interface SimEdge {
  id: string;
  from: string;
  to: string;
  directed: boolean;
  p: number;
  present: boolean;
}

interface Link {
  source: SimNode;
  target: SimNode;
  /** share of the correction the TARGET takes: d3's degree bias, so a
   * node with many links is "heavier" and moves less */
  bias: number;
}

// Tag links are the same as note links (Felipe, 2026-09-28). Springs at 0.5
// (were 0.09): Felipe's own Obsidian runs its link force at the maximum;
// with slack springs the neighbours of a dragged node barely followed.
const LINK_DISTANCE = 68;
const LINK_STRENGTH = 0.5;

/**
 * d3's forceLink, with one change: a node pinned by the mouse doesn't take
 * its share of the pull. d3 splits each spring's correction between both
 * ends by degree, and the pinned end's share was simply thrown away. A
 * tag, linked only to notes that have many links of their own, is "light":
 * its notes took ~15% of the pull, so dragging a tag left them behind and
 * it snapped back alone like a rubber band (Felipe, 2026-09-28: "a física
 * da tag é diferente da dos nós"). The hand is infinitely heavy — whoever
 * is on the other end of a spring from it takes the whole correction.
 */
function linkForce(): Force<SimNode, Link> & { links(l: Link[]): void } {
  let links: Link[] = [];
  let alpha = 0;
  const force = ((a: number) => {
    alpha = a;
    for (const { source: s, target: t, bias } of links) {
      let x = t.x! + t.vx! - s.x! - s.vx! || 1e-6;
      let y = t.y! + t.vy! - s.y! - s.vy! || 1e-6;
      let l = Math.sqrt(x * x + y * y);
      l = ((l - LINK_DISTANCE) / l) * alpha * LINK_STRENGTH;
      x *= l;
      y *= l;
      const sPinned = s.fx != null;
      const tPinned = t.fx != null;
      const bt = sPinned && !tPinned ? 1 : tPinned && !sPinned ? 0 : bias;
      t.vx! -= x * bt;
      t.vy! -= y * bt;
      s.vx! += x * (1 - bt);
      s.vy! += y * (1 - bt);
    }
  }) as Force<SimNode, Link> & { links(l: Link[]): void };
  force.links = (l: Link[]) => {
    links = l;
  };
  return force;
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
const easeOutBack = (t: number) => {
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
};

/** Render-space presence: 0 hidden, 1 fully in. */
export const nodeAppear = (n: SimNode) => easeOutCubic(clamp01(n.p));
export const nodeScale = (n: SimNode) => 0.35 + 0.65 * easeOutBack(clamp01(n.p));
export const edgeAppear = (e: SimEdge) => easeOutCubic(clamp01(e.p));

function clamp01(x: number) {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export class GraphSim {
  readonly nodes = new Map<string, SimNode>();
  readonly edges = new Map<string, SimEdge>();

  private sim: Simulation<SimNode, Link>;
  private linkForce = linkForce();
  private active: SimNode[] = [];
  private sizeMul = 1;
  private seeded = false;

  constructor() {
    this.sim = forceSimulation<SimNode, Link>([])
      // theta(0) = exact repulsion instead of the Barnes–Hut approximation.
      // The approximation shifts discontinuously as nodes move between
      // quadtree cells, and under a drag's heat that was THE tremble:
      // measured on the real vault, frame-to-frame jitter 0.09 → 0.007.
      // Exact is O(n²), which at a vault's size (~160 nodes) is nothing.
      .force('charge', forceManyBody<SimNode>().strength((d) => -150 - this.radius(d) * 7).distanceMax(560).theta(0))
      .force('link', this.linkForce)
      .force('x', forceX<SimNode>(0).strength(0.045))
      .force('y', forceY<SimNode>(0).strength(0.045))
      // No collision force — Obsidian has none either (its graph settings
      // are center / repel / link force / link distance). Repulsion already
      // keeps nodes apart, and collide fighting it was a second source of
      // shaking.
      .velocityDecay(0.42)
      // Cool down to d3's default 0.001: at the old 0.014 the simulation
      // stopped while a released node was still gliding ~0.25 px a frame,
      // so it halted with a jolt (Felipe, 2026-09-28). Now it has slowed to
      // ~0.02 when it stops — an ease-out. Cooling faster than d3's default
      // decay left the graph less settled, and a drag then stirred it.
      .alphaMin(0.001)
      .stop();
  }

  private radius(d: SimNode) {
    return d.baseR * this.sizeMul;
  }

  /** Global node-size multiplier changed — re-init the radius-dependent
   * forces without disturbing positions. */
  setSizeMul(mul: number) {
    if (mul === this.sizeMul) return;
    this.sizeMul = mul;
    this.sim.nodes(this.active); // re-runs force.initialize (charge caches per-node strength, which depends on radius)
    this.bump(0.25);
  }

  bump(to = 0.4) {
    if (this.sim.alpha() < to) this.sim.alpha(to);
  }

  /**
   * Obsidian's "restart simulation", but staged: everything vanishes (tag
   * nodes included — Obsidian keeps those on screen, Felipe wanted them to
   * take part) and grows back one node at a time, breadth-first, so you can
   * watch the structure assemble outward from its busiest hub. Orphans go
   * first — they belong to no wave, and leading with them gets them out of
   * the way instead of trailing as a confusing afterthought.
   *
   * @param stepMs gap between consecutive nodes; 0 brings the whole graph
   *               back at once (the stagger's off-switch).
   * @param mode   'waves' (default, below) or 'random' (Obsidian's way).
   */
  restart(stepMs: number = DEFAULT_REVEAL_STEP_MS, mode: RevealMode = 'waves', random: () => number = Math.random) {
    const order = mode === 'random' ? this.shuffledOrder(random) : this.revealOrder();
    const step = Math.max(0, stepMs);

    for (const n of this.nodes.values()) {
      n.fx = null;
      n.fy = null;
      n.p = 0;
      // re-seed positions so this is a genuine re-layout, not a re-fade of
      // the arrangement that was already on screen
      const a = Math.random() * Math.PI * 2;
      const r = 30 + Math.random() * 160;
      n.x = Math.cos(a) * r;
      n.y = Math.sin(a) * r;
      n.vx = 0;
      n.vy = 0;
      n.revealIn = 0;
    }
    order.forEach((id, i) => {
      const n = this.nodes.get(id);
      if (n) n.revealIn = i * step;
    });
    for (const e of this.edges.values()) e.p = 0;

    this.sim.alpha(1).alphaTarget(0);
  }

  /** Every present node, Fisher–Yates shuffled. */
  private shuffledOrder(random: () => number): string[] {
    const ids = [...this.nodes.values()].filter((n) => n.present).map((n) => n.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    return ids;
  }

  /** Orphans, then breadth-first from the most-connected node of each
   * remaining component. Deterministic: ties break on degree then id, so the
   * same graph always grows back in the same order. */
  private revealOrder(): string[] {
    const adj = new Map<string, Set<string>>();
    for (const n of this.nodes.values()) if (n.present) adj.set(n.id, new Set());
    for (const e of this.edges.values()) {
      if (!e.present) continue;
      const a = adj.get(e.from);
      const b = adj.get(e.to);
      if (!a || !b) continue;
      a.add(e.to);
      b.add(e.from);
    }
    const deg = (id: string) => adj.get(id)?.size ?? 0;
    const rank = (a: string, b: string) => deg(b) - deg(a) || (a < b ? -1 : 1);

    const out: string[] = [];
    const seen = new Set<string>();
    const ids = [...adj.keys()];

    for (const id of ids.filter((i) => deg(i) === 0).sort()) {
      out.push(id);
      seen.add(id);
    }
    for (const root of ids.filter((i) => !seen.has(i)).sort(rank)) {
      if (seen.has(root)) continue;
      seen.add(root);
      const queue = [root];
      while (queue.length) {
        const cur = queue.shift()!;
        out.push(cur);
        for (const nb of [...(adj.get(cur) ?? [])].sort(rank)) {
          if (seen.has(nb)) continue;
          seen.add(nb);
          queue.push(nb);
        }
      }
    }
    return out;
  }

  grab(id: string) {
    const n = this.nodes.get(id);
    if (!n) return;
    n.fx = n.x;
    n.fy = n.y;
    // Mild heat (was 0.3, the d3 example value): with the stiffer springs
    // the neighbours still follow, while an unlinked node being dragged no
    // longer sets the rest of the graph drifting (measured: others moved
    // ~20–40 px at 0.3, ~5 px here).
    this.sim.alphaTarget(DRAG_ALPHA_TARGET);
  }
  dragTo(id: string, x: number, y: number) {
    const n = this.nodes.get(id);
    if (!n) return;
    n.fx = x;
    n.fy = y;
  }
  release(id: string) {
    const n = this.nodes.get(id);
    if (n) {
      n.fx = null;
      n.fy = null;
    }
    this.sim.alphaTarget(0);
  }

  /** Node + edge ids of the last model, to tell a real change from the
   * same graph handed over again. */
  private structureKey = '';

  setModel(model: GraphModel) {
    // The same graph again (opening the Graph screen, a colour or label
    // setting) must not move anything: Obsidian's graph only re-lays out
    // when you ask it to (Felipe, 2026-09-27). Only a structural change
    // — nodes or edges added/removed — reheats below.
    const key = model.nodes.map((n) => n.id).join('\n') + '\u0000' + model.edges.map((e) => e.id).join('\n');
    const structural = key !== this.structureKey;
    this.structureKey = key;
    const seenN = new Set<string>();
    for (const m of model.nodes) {
      seenN.add(m.id);
      const cur = this.nodes.get(m.id);
      if (cur) {
        cur.kind = m.kind;
        cur.title = m.title;
        cur.path = m.path;
        cur.tag = m.tag;
        cur.tags = m.tags;
        cur.degree = m.degree;
        cur.baseR = m.baseR;
        cur.color = m.color;
        cur.asset = m.asset;
        cur.present = true;
      } else {
        this.nodes.set(m.id, {
          id: m.id,
          kind: m.kind,
          title: m.title,
          path: m.path,
          tag: m.tag,
          tags: m.tags,
          degree: m.degree,
          baseR: m.baseR,
          color: m.color,
          asset: m.asset,
          p: 0,
          present: true,
          revealIn: 0,
          x: NaN,
          y: NaN,
        });
      }
    }
    for (const n of this.nodes.values()) if (!seenN.has(n.id)) n.present = false;

    // seed newcomers near their neighbours (or the centre on first paint)
    const adj = new Map<string, string[]>();
    const addAdj = (a: string, b: string) => {
      let list = adj.get(a);
      if (!list) adj.set(a, (list = []));
      list.push(b);
    };
    for (const e of model.edges) {
      addAdj(e.from, e.to);
      addAdj(e.to, e.from);
    }
    for (const m of model.nodes) {
      const n = this.nodes.get(m.id)!;
      if (Number.isFinite(n.x) && Number.isFinite(n.y)) continue;
      let sx = 0;
      let sy = 0;
      let c = 0;
      for (const nb of adj.get(m.id) ?? []) {
        const p = this.nodes.get(nb);
        if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
          sx += p.x!;
          sy += p.y!;
          c++;
        }
      }
      const jitter = () => (Math.random() - 0.5) * 40;
      if (c > 0) {
        n.x = sx / c + jitter();
        n.y = sy / c + jitter();
      } else {
        const a = Math.random() * Math.PI * 2;
        const r = 30 + Math.random() * 160;
        n.x = Math.cos(a) * r;
        n.y = Math.sin(a) * r;
      }
      n.vx = 0;
      n.vy = 0;
    }

    const seenE = new Set<string>();
    for (const e of model.edges) {
      seenE.add(e.id);
      const cur = this.edges.get(e.id);
      if (cur) {
        cur.directed = e.directed;
        cur.present = true;
      } else {
        this.edges.set(e.id, { id: e.id, from: e.from, to: e.to, directed: e.directed, p: 0, present: true });
      }
    }
    for (const e of this.edges.values()) if (!seenE.has(e.id)) e.present = false;

    this.active = model.nodes.map((m) => this.nodes.get(m.id)!);
    if (!structural) return; // attributes updated above; layout untouched
    const count = new Map<string, number>();
    for (const e of model.edges) {
      count.set(e.from, (count.get(e.from) ?? 0) + 1);
      count.set(e.to, (count.get(e.to) ?? 0) + 1);
    }
    const links: Link[] = model.edges.map((e) => ({
      source: this.nodes.get(e.from)!,
      target: this.nodes.get(e.to)!,
      bias: count.get(e.from)! / (count.get(e.from)! + count.get(e.to)!),
    }));
    this.sim.nodes(this.active);
    this.linkForce.links(links);
    this.sim.alpha(this.seeded ? 0.75 : 1).alphaTarget(0);
    this.seeded = true;
  }

  /** Advance one frame. Returns true while anything is still moving. */
  tick(dtMs: number): boolean {
    let animating = false;
    const dIn = dtMs / ENTER_MS;
    const dOut = dtMs / EXIT_MS;

    for (const n of this.nodes.values()) {
      if (n.revealIn > 0) {
        n.revealIn -= dtMs;
        animating = true;
        if (n.revealIn > 0) {
          n.p = 0; // still queued for its turn in the staged restart
          continue;
        }
      }
      const target = n.present ? 1 : 0;
      if (n.p !== target) {
        n.p += n.present ? dIn : -dOut;
        n.p = clamp01(n.p);
        animating = true;
      }
      if (!n.present && n.p <= 0) this.nodes.delete(n.id);
    }
    const revealed = (n: SimNode | undefined) => !!n && n.present && n.revealIn <= 0;
    for (const e of this.edges.values()) {
      const from = this.nodes.get(e.from);
      const to = this.nodes.get(e.to);
      // an edge waits for BOTH its endpoints to have had their turn
      const target = e.present && revealed(from) && revealed(to) ? 1 : 0;
      if (e.p !== target) {
        e.p += target === 1 ? dIn : -dOut;
        e.p = clamp01(e.p);
        animating = true;
      }
      if (!e.present && e.p <= 0) this.edges.delete(e.id);
    }

    // At rest means at rest: below alphaMin (and with nothing pinned by a
    // drag keeping it warm) the forces are not applied at all. Ticking
    // anyway nudged every node a fraction of a pixel on each wake-up — a
    // hover, a resize — so the graph never truly stopped (Felipe wants
    // Obsidian's: settles, then stays put).
    const warm = this.sim.alpha() >= this.sim.alphaMin() || this.sim.alphaTarget() > 0;
    if (warm) this.sim.tick();
    return animating || warm;
  }

  bounds(): { minX: number; minY: number; maxX: number; maxY: number } | null {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of this.nodes.values()) {
      if (!n.present || !Number.isFinite(n.x) || !Number.isFinite(n.y)) continue;
      const r = this.radius(n);
      minX = Math.min(minX, n.x! - r);
      minY = Math.min(minY, n.y! - r);
      maxX = Math.max(maxX, n.x! + r);
      maxY = Math.max(maxY, n.y! + r);
    }
    return minX === Infinity ? null : { minX, minY, maxX, maxY };
  }

  radiusOf(n: SimNode) {
    return this.radius(n);
  }

  dispose() {
    this.sim.stop();
  }
}
