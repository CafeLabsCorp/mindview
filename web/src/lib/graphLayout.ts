// A tiny force-directed layout, run once per graph (in a useMemo) rather
// than animated frame-by-frame. The vault is ~70 nodes / ~450 edges — an
// O(n²) repulsion pass over that is a fraction of a millisecond, so there's
// no need for a Barnes-Hut quadtree or a d3-force dependency.

export interface LaidOutNode {
  path: string;
  x: number;
  y: number;
}

interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

// Deterministic PRNG so the layout is stable across reloads (mulberry32).
function rng(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function layoutGraph(
  paths: string[],
  edgePairs: Array<[string, string]>,
  opts: { width: number; height: number; iterations?: number } = { width: 1000, height: 700 },
): Map<string, LaidOutNode> {
  const { width, height } = opts;
  const iterations = opts.iterations ?? 320;
  const n = paths.length;
  const cx = width / 2;
  const cy = height / 2;

  const index = new Map(paths.map((p, i) => [p, i]));
  const edges: Array<[number, number]> = [];
  for (const [a, b] of edgePairs) {
    const ia = index.get(a);
    const ib = index.get(b);
    if (ia !== undefined && ib !== undefined && ia !== ib) edges.push([ia, ib]);
  }

  const rand = rng(0x9e3779b9 ^ n);
  const bodies: Body[] = paths.map((_, i) => {
    const angle = (i / Math.max(1, n)) * Math.PI * 2;
    const radius = 80 + rand() * Math.min(width, height) * 0.35;
    return { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius, vx: 0, vy: 0 };
  });

  const REPULSION = 5200;
  const SPRING_LEN = 74;
  const SPRING_K = 0.02;
  const GRAVITY = 0.006;
  const DAMPING = 0.86;

  for (let iter = 0; iter < iterations; iter++) {
    const cool = 1 - iter / iterations;

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = bodies[i].x - bodies[j].x;
        let dy = bodies[i].y - bodies[j].y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 0.01) {
          dx = (rand() - 0.5) * 0.1;
          dy = (rand() - 0.5) * 0.1;
          d2 = dx * dx + dy * dy + 0.01;
        }
        const d = Math.sqrt(d2);
        const f = REPULSION / d2;
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        bodies[i].vx += fx;
        bodies[i].vy += fy;
        bodies[j].vx -= fx;
        bodies[j].vy -= fy;
      }
    }

    for (const [a, b] of edges) {
      const dx = bodies[b].x - bodies[a].x;
      const dy = bodies[b].y - bodies[a].y;
      const d = Math.sqrt(dx * dx + dy * dy) || 1;
      const f = (d - SPRING_LEN) * SPRING_K;
      const fx = (dx / d) * f;
      const fy = (dy / d) * f;
      bodies[a].vx += fx;
      bodies[a].vy += fy;
      bodies[b].vx -= fx;
      bodies[b].vy -= fy;
    }

    for (let i = 0; i < n; i++) {
      bodies[i].vx += (cx - bodies[i].x) * GRAVITY;
      bodies[i].vy += (cy - bodies[i].y) * GRAVITY;
      bodies[i].vx *= DAMPING;
      bodies[i].vy *= DAMPING;
      bodies[i].x += bodies[i].vx * cool;
      bodies[i].y += bodies[i].vy * cool;
    }
  }

  const out = new Map<string, LaidOutNode>();
  paths.forEach((p, i) => out.set(p, { path: p, x: bodies[i].x, y: bodies[i].y }));
  return out;
}
