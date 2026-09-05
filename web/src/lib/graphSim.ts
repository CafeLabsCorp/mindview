import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type ForceLink,
  type Simulation,
  type SimulationLinkDatum,
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

type Link = SimulationLinkDatum<SimNode> & { kind: 'ff' | 'ft' };

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
  private linkForce: ForceLink<SimNode, Link>;
  private active: SimNode[] = [];
  private sizeMul = 1;
  private seeded = false;

  constructor() {
    this.linkForce = forceLink<SimNode, Link>([])
      .id((d) => d.id)
      .distance((l) => (l.kind === 'ft' ? 42 : 68))
      .strength((l) => (l.kind === 'ft' ? 0.25 : 0.09));

    this.sim = forceSimulation<SimNode, Link>([])
      .force('charge', forceManyBody<SimNode>().strength((d) => -150 - this.radius(d) * 7).distanceMax(560))
      .force('link', this.linkForce)
      .force('x', forceX<SimNode>(0).strength(0.045))
      .force('y', forceY<SimNode>(0).strength(0.045))
      .force('collide', forceCollide<SimNode>((d) => this.radius(d) + 6).strength(0.85))
      .velocityDecay(0.42)
      .alphaMin(0.014)
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
    this.sim.nodes(this.active); // re-runs force.initialize (collide caches radius)
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
   */
  restart(stepMs: number = DEFAULT_REVEAL_STEP_MS) {
    const order = this.revealOrder();
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
    this.sim.alphaTarget(0.3);
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

  setModel(model: GraphModel) {
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
    const links: Link[] = model.edges.map((e) => ({
      source: e.from,
      target: e.to,
      kind: e.to.startsWith('tag:') || e.from.startsWith('tag:') ? 'ft' : 'ff',
    }));
    // clear links before swapping the node set — forceLink.initialize()
    // (run by sim.nodes()) resolves its current links against the new
    // nodes and throws on any id that just disappeared.
    this.linkForce.links([]);
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

    this.sim.tick();
    return animating || this.sim.alpha() > this.sim.alphaMin();
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
