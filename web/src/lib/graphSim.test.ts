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
    degree: 0,
    baseR: 6,
    color: '#fff',
  })),
  edges: edges.map(([from, to]) => ({ id: `${from} ${to}`, from, to, directed: false })),
  allTags: [],
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
});
