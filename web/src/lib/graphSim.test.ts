import { describe, expect, it } from 'vitest';
import type { GraphModel } from './graphModel';
import { GraphSim } from './graphSim';

const model = (nodeIds: string[], edges: [string, string][]): GraphModel => ({
  nodes: nodeIds.map((id) => ({
    id,
    kind: id.startsWith('tag:') ? 'tag' : 'file',
    title: id,
    path: id.startsWith('tag:') ? undefined : id,
    tags: [],
    ext: id.startsWith('tag:') ? '' : 'md',
    asset: false,
    degree: 0,
    baseR: 6,
    color: '#fff',
  })),
  edges: edges.map(([from, to]) => ({ id: `${from} ${to}`, from, to, directed: false })),
  allTags: [],
  extCounts: [],
});

function settle(sim: GraphSim, frames = 400) {
  for (let i = 0; i < frames; i++) sim.tick(16);
}

describe('GraphSim', () => {
  it('lays out a small graph with finite positions', () => {
    const sim = new GraphSim();
    sim.setModel(model(['a.md', 'b.md', 'c.md'], [['a.md', 'b.md'], ['b.md', 'c.md']]));
    settle(sim);
    for (const n of sim.nodes.values()) {
      expect(Number.isFinite(n.x)).toBe(true);
      expect(Number.isFinite(n.y)).toBe(true);
    }
    expect(sim.bounds()).not.toBeNull();
    sim.dispose();
  });

  it('reconciles across model swaps without throwing (nodes and edges added / removed)', () => {
    const sim = new GraphSim();
    sim.setModel(model(['a.md', 'b.md', 'tag:x'], [['a.md', 'b.md'], ['a.md', 'tag:x']]));
    settle(sim, 50);
    // drop b + its edge, drop the tag, add c
    expect(() => sim.setModel(model(['a.md', 'c.md'], [['a.md', 'c.md']]))).not.toThrow();
    settle(sim);
    // exiting nodes fade out and are eventually removed
    expect([...sim.nodes.keys()].sort()).toEqual(['a.md', 'c.md']);
    expect([...sim.edges.keys()]).toEqual(['a.md c.md']);
    sim.dispose();
  });

  it('pins a node while dragged and releases it', () => {
    const sim = new GraphSim();
    sim.setModel(model(['a.md', 'b.md'], [['a.md', 'b.md']]));
    settle(sim, 30);
    sim.grab('a.md');
    sim.dragTo('a.md', 500, -300);
    settle(sim, 10);
    const a = sim.nodes.get('a.md')!;
    expect(a.x).toBeCloseTo(500);
    expect(a.y).toBeCloseTo(-300);
    sim.release('a.md');
    expect(a.fx == null && a.fy == null).toBe(true);
    sim.dispose();
  });

  it('restart clears pins and re-energises the simulation', () => {
    const sim = new GraphSim();
    sim.setModel(model(['a.md', 'b.md'], [['a.md', 'b.md']]));
    settle(sim);
    sim.grab('a.md');
    sim.dragTo('a.md', 100, 100);
    sim.restart();
    const a = sim.nodes.get('a.md')!;
    expect(a.fx == null).toBe(true);
    expect(sim.tick(16)).toBe(true); // hot again
    sim.dispose();
  });

  it('restart empties the graph and grows it back one node at a time', () => {
    const sim = new GraphSim();
    sim.setModel(
      model(
        ['hub.md', 'a.md', 'b.md', 'c.md', 'lonely.md'],
        [
          ['hub.md', 'a.md'],
          ['hub.md', 'b.md'],
          ['a.md', 'c.md'],
        ],
      ),
    );
    settle(sim);
    const shown = () => [...sim.nodes.values()].filter((n) => n.p > 0).length;
    expect(shown()).toBe(5);

    sim.restart();
    expect(shown()).toBe(0); // everything vanishes, tag nodes included

    // ... then comes back gradually, never all at once
    sim.tick(16);
    const first = shown();
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(5);

    settle(sim);
    expect(shown()).toBe(5);
    sim.dispose();
  });

  it('grows back orphans first, then breadth-first from the busiest hub', () => {
    const sim = new GraphSim();
    sim.setModel(
      model(
        ['hub.md', 'a.md', 'b.md', 'c.md', 'd.md', 'lonely.md'],
        [
          ['hub.md', 'a.md'],
          ['hub.md', 'b.md'],
          ['hub.md', 'c.md'],
          ['a.md', 'd.md'], // d is one hop further out than a/b/c
        ],
      ),
    );
    sim.restart();
    // revealIn is the queue position in ms — sorting by it gives the order
    const order = [...sim.nodes.values()].sort((x, y) => x.revealIn - y.revealIn).map((n) => n.id);
    expect(order[0]).toBe('lonely.md'); // orphan leads
    expect(order[1]).toBe('hub.md'); // then the most connected node
    // its neighbours next, busiest first (a has 2 edges, b and c have 1)
    expect(order.slice(2, 5)).toEqual(['a.md', 'b.md', 'c.md']);
    expect(order[5]).toBe('d.md'); // and only then the next ring out
    sim.dispose();
  });

  it('holds an edge back until both of its endpoints have appeared', () => {
    const sim = new GraphSim();
    sim.setModel(model(['hub.md', 'a.md'], [['hub.md', 'a.md']]));
    settle(sim);
    sim.restart();
    sim.tick(16);
    const edge = sim.edges.get('hub.md a.md')!;
    const hidden = [...sim.nodes.values()].filter((n) => n.revealIn > 0);
    if (hidden.length > 0) expect(edge.p).toBe(0);
    settle(sim);
    expect(edge.p).toBe(1);
    sim.dispose();
  });

  /** Order nodes first become visible during a staged restart. */
  function revealSequence(sim: GraphSim): string[] {
    const seen: string[] = [];
    for (let i = 0; i < 400 && seen.length < sim.nodes.size; i++) {
      sim.tick(16);
      for (const n of sim.nodes.values()) if (n.p > 0 && !seen.includes(n.id)) seen.push(n.id);
    }
    return seen;
  }
  const hubAndLeaves = () =>
    model(
      ['hub.md', 'a.md', 'b.md', 'c.md', 'd.md', 'e.md'],
      [['hub.md', 'a.md'], ['hub.md', 'b.md'], ['hub.md', 'c.md'], ['c.md', 'd.md'], ['d.md', 'e.md']],
    );

  it('"waves" restart grows out from the busiest hub', () => {
    const sim = new GraphSim();
    sim.setModel(hubAndLeaves());
    settle(sim);
    sim.restart(20, 'waves');
    const order = revealSequence(sim);
    expect(order[0]).toBe('hub.md');
    expect(order.indexOf('e.md')).toBe(order.length - 1); // the far leaf comes last
    sim.dispose();
  });

  it('"random" restart brings nodes back in a shuffled order — Obsidian-style', () => {
    let seed = 7;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const sim = new GraphSim();
    sim.setModel(hubAndLeaves());
    settle(sim);
    sim.restart(20, 'random', rng);
    const order = revealSequence(sim);
    expect(order.sort()).toEqual(['a.md', 'b.md', 'c.md', 'd.md', 'e.md', 'hub.md']); // everyone comes back
    sim.restart(20, 'random', rng);
    const again = revealSequence(sim);
    sim.restart(20, 'waves');
    const waves = revealSequence(sim);
    expect(again).not.toEqual(waves);
    sim.dispose();
  });

  it('an edge only appears once both of its ends are on screen', () => {
    const sim = new GraphSim();
    sim.setModel(hubAndLeaves());
    settle(sim);
    sim.restart(40, 'random');
    for (let i = 0; i < 200; i++) {
      sim.tick(16);
      for (const e of sim.edges.values()) {
        if (e.p > 0) {
          expect(sim.nodes.get(e.from)!.p).toBeGreaterThan(0);
          expect(sim.nodes.get(e.to)!.p).toBeGreaterThan(0);
        }
      }
    }
    sim.dispose();
  });

  it('settles and STOPS after a drag is released — no endless shiver', () => {
    const sim = new GraphSim();
    sim.setModel(hubAndLeaves());
    settle(sim);
    sim.grab('c.md');
    sim.dragTo('c.md', 300, 200);
    settle(sim, 30);
    sim.release('c.md');
    let frames = 0;
    while (sim.tick(16) && frames < 2000) frames++;
    expect(frames).toBeLessThan(2000); // tick() reports "still moving" → it must end
    sim.dispose();
  });

  it('the same graph handed over again moves nothing — only a structural change re-lays out', () => {
    const sim = new GraphSim();
    sim.setModel(hubAndLeaves());
    let frames = 0;
    while (sim.tick(16) && frames < 3000) frames++;
    const before = [...sim.nodes.values()].map((n) => [n.id, n.x, n.y]);
    sim.setModel(hubAndLeaves()); // e.g. the Graph screen opened again
    expect(sim.tick(16)).toBe(false); // nothing to animate
    expect([...sim.nodes.values()].map((n) => [n.id, n.x, n.y])).toEqual(before);
    // a real change (a new note) does reheat
    const grown = hubAndLeaves();
    grown.nodes.push({ ...grown.nodes[1], id: 'f.md', path: 'f.md', title: 'f.md' });
    sim.setModel(grown);
    expect(sim.tick(16)).toBe(true);
    sim.dispose();
  });

  it('dragging an unlinked node through the graph barely disturbs the others, and they do not tremble', () => {
    // 40 notes in a few linked clusters, plus one unlinked file
    const ids = Array.from({ length: 40 }, (_, i) => `n${i}.md`);
    const links: [string, string][] = ids.slice(1).map((id, i) => [ids[Math.floor(i / 4) * 4], id]);
    const sim = new GraphSim();
    sim.setModel(model([...ids, 'solto.pdf'], links));
    let f = 0;
    while (sim.tick(16) && f < 5000) f++;
    const others = [...sim.nodes.values()].filter((n) => n.id !== 'solto.pdf');
    const start = others.map((n) => [n.x!, n.y!]);
    const pdf = sim.nodes.get('solto.pdf')!;
    const x0 = pdf.x!, y0 = pdf.y!;
    const hist: number[][][] = [];
    sim.grab('solto.pdf');
    for (let i = 1; i <= 60; i++) {
      sim.dragTo('solto.pdf', x0 + i * 3, y0 + i * 1.5);
      sim.tick(16);
      hist.push(others.map((n) => [n.x!, n.y!]));
    }
    sim.release('solto.pdf');
    const moved = others.reduce((acc, n, j) => acc + Math.hypot(n.x! - start[j][0], n.y! - start[j][1]), 0) / others.length;
    expect(moved).toBeLessThan(8);
    // tremble = change in acceleration frame to frame (third difference)
    let jitter = 0;
    let count = 0;
    for (let k = 3; k < hist.length; k++)
      for (let j = 0; j < others.length; j++) {
        const d = (a: number) => hist[k][j][a] - 3 * hist[k - 1][j][a] + 3 * hist[k - 2][j][a] - hist[k - 3][j][a];
        jitter += Math.hypot(d(0), d(1));
        count++;
      }
    expect(jitter / count).toBeLessThan(0.02);
    sim.dispose();
  });
  it('a dragged tag pulls its notes along even when they have many links of their own', () => {
    // tag:t has 2 links; each of its notes also links to 6 others of its own,
    // so by degree the tag is "light". Dragged, its notes must still follow.
    const ids = ['a.md', 'b.md', ...Array.from({ length: 12 }, (_, i) => `x${i}.md`), 'tag:t'];
    const links: [string, string][] = [['a.md', 'tag:t'], ['b.md', 'tag:t']];
    for (let i = 0; i < 12; i++) links.push([i < 6 ? 'a.md' : 'b.md', `x${i}.md`]);
    const sim = new GraphSim();
    sim.setModel(model(ids, links));
    let f = 0;
    while (sim.tick(16) && f < 5000) f++;
    const tag = sim.nodes.get('tag:t')!;
    const a = sim.nodes.get('a.md')!;
    const b = sim.nodes.get('b.md')!;
    const [ax, bx] = [a.x!, b.x!];
    const x0 = tag.x!;
    sim.grab('tag:t');
    for (let i = 1; i <= 40; i++) {
      sim.dragTo('tag:t', x0 + i * 5, tag.y!);
      sim.tick(16);
    }
    // the tag went 200 px right; its notes come a real part of the way
    expect((a.x! - ax + (b.x! - bx)) / 2).toBeGreaterThan(25);
    sim.dispose();
  });
});
