import { describe, expect, it } from 'vitest';
import type { VaultGraph } from '../api/types';
import { buildGraphModel, matchQuery } from './graphModel';
import { DEFAULT_GRAPH_PREFS, type GraphPrefs } from './graphPrefs';

const graph: VaultGraph = {
  nodes: [
    { path: 'a.md', title: 'Alpha', tags: ['proj', 'proj/alpha'], kind: 'mind-node', isIndex: false, backlinkCount: 2 },
    { path: 'b.md', title: 'Beta', tags: ['proj'], kind: 'mind-node', isIndex: false, backlinkCount: 0 },
    { path: 'lonely.md', title: 'Lonely', tags: [], kind: 'mind-node', isIndex: false, backlinkCount: 0 },
  ],
  edges: [{ from: 'a.md', to: 'b.md' }],
};

const prefs = (over: Partial<GraphPrefs> = {}): GraphPrefs => ({ ...DEFAULT_GRAPH_PREFS, ...over });

describe('buildGraphModel', () => {
  it('adds a node per distinct tag and links files to it when showTags is on', () => {
    const m = buildGraphModel(graph, prefs({ showTags: true }), {});
    const ids = m.nodes.map((n) => n.id).sort();
    expect(ids).toContain('tag:proj');
    expect(ids).toContain('tag:proj/alpha');
    expect(m.edges.some((e) => e.from === 'a.md' && e.to === 'tag:proj')).toBe(true);
    expect(m.edges.some((e) => e.from === 'b.md' && e.to === 'tag:proj')).toBe(true);
  });

  it('drops tag nodes entirely when showTags is off', () => {
    const m = buildGraphModel(graph, prefs({ showTags: false }), {});
    expect(m.nodes.every((n) => n.kind === 'file')).toBe(true);
  });

  it('hides zero-degree nodes when showOrphans is off', () => {
    const m = buildGraphModel(graph, prefs({ showTags: false, showOrphans: false }), {});
    expect(m.nodes.map((n) => n.id).sort()).toEqual(['a.md', 'b.md']);
  });

  it('keeps orphans by default', () => {
    const m = buildGraphModel(graph, prefs({ showTags: false, showOrphans: true }), {});
    expect(m.nodes.map((n) => n.id)).toContain('lonely.md');
  });

  it('search narrows to matching files (and their tags)', () => {
    const m = buildGraphModel(graph, prefs({ showTags: true, search: 'alpha' }), {});
    expect(m.nodes.some((n) => n.id === 'a.md')).toBe(true);
    expect(m.nodes.some((n) => n.id === 'b.md')).toBe(false);
  });

  it('colours a node by its FIRST tag, not the most specific one', () => {
    // a.md is tagged [proj, proj/alpha]; 'proj' decides, so it matches b.md
    const m = buildGraphModel(graph, prefs({ colorEnabled: true }), { proj: '#111111', 'proj/alpha': '#222222' });
    expect(m.nodes.find((n) => n.id === 'a.md')?.color).toBe('#111111');
    expect(m.nodes.find((n) => n.id === 'b.md')?.color).toBe('#111111');
  });

  it('falls back to the Mind identity when "cor por tag" is off', () => {
    const m = buildGraphModel(graph, prefs({ colorEnabled: false, showTags: true }), { proj: '#111111' });
    const files = m.nodes.filter((n) => n.kind === 'file');
    const tags = m.nodes.filter((n) => n.kind === 'tag');
    expect(files.every((n) => n.color === 'var(--accent)')).toBe(true);
    expect(tags.length).toBeGreaterThan(0);
    expect(tags.every((n) => n.color === 'var(--fg)')).toBe(true);
  });

  it('an untagged file takes the accent even with colouring on', () => {
    const m = buildGraphModel(graph, prefs({ colorEnabled: true }), {});
    expect(m.nodes.find((n) => n.id === 'lonely.md')?.color).toBe('var(--accent)');
  });

  it('a group query overrides the palette colour', () => {
    const m = buildGraphModel(graph, prefs({ groups: [{ id: 'g', query: 'tag:proj/alpha', color: '#123456' }] }), {});
    expect(m.nodes.find((n) => n.id === 'a.md')?.color).toBe('#123456');
    expect(m.nodes.find((n) => n.id === 'b.md')?.color).not.toBe('#123456');
  });

  it('gives every tag node the same radius, whatever its member count', () => {
    // 'proj' has 2 member files, 'proj/alpha' has 1 — same size regardless
    const m = buildGraphModel(graph, prefs({ showTags: true, tagNodeSize: 4 }), {});
    const tagRadii = m.nodes.filter((n) => n.kind === 'tag').map((n) => n.baseR);
    expect(tagRadii.length).toBeGreaterThan(1);
    expect(new Set(tagRadii)).toEqual(new Set([4]));

    const bigger = buildGraphModel(graph, prefs({ showTags: true, tagNodeSize: 9 }), {});
    expect(bigger.nodes.filter((n) => n.kind === 'tag').every((n) => n.baseR === 9)).toBe(true);
  });

  it('backlinkCount drives file radius only when sizeByBacklinks is on', () => {
    const on = buildGraphModel(graph, prefs({ sizeByBacklinks: true, showTags: false }), {});
    const off = buildGraphModel(graph, prefs({ sizeByBacklinks: false, showTags: false }), {});
    expect(on.nodes.find((n) => n.id === 'a.md')!.baseR).toBeGreaterThan(
      on.nodes.find((n) => n.id === 'b.md')!.baseR,
    );
    expect(off.nodes.find((n) => n.id === 'a.md')!.baseR).toBe(off.nodes.find((n) => n.id === 'b.md')!.baseR);
  });
});

describe('matchQuery', () => {
  const n = { title: 'Alpha', path: 'proj/a.md', tags: ['proj', 'proj/alpha'] };
  it('matches plain substrings over title/path/tags', () => {
    expect(matchQuery(n, 'alph')).toBe(true);
    expect(matchQuery(n, 'proj/a.md')).toBe(true);
    expect(matchQuery(n, 'zzz')).toBe(false);
  });
  it('supports tag: and path: prefixes', () => {
    expect(matchQuery(n, 'tag:alpha')).toBe(true);
    expect(matchQuery(n, 'tag:#alpha')).toBe(true);
    expect(matchQuery(n, 'path:proj/')).toBe(true);
    expect(matchQuery(n, 'path:other')).toBe(false);
  });
  it('blank matches everything', () => {
    expect(matchQuery(n, '   ')).toBe(true);
  });
});
