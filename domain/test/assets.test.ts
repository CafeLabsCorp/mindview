import { describe, expect, it } from 'vitest';
import { assetExt, assetView } from '../src/assets.js';
import { buildIndex } from '../src/buildIndex.js';
import { buildGraph, buildTree } from '../src/selectors.js';

describe('assetView — how each non-markdown file is shown', () => {
  it('classifies by extension, case-insensitively', () => {
    expect(assetView('carreira/cv.PDF')).toBe('pdf');
    expect(assetView('img/logo.png')).toBe('image');
    expect(assetView('img/logo.svg')).toBe('image');
    expect(assetView('scripts/status-all.sh')).toBe('text');
    expect(assetView('scripts/x.mjs')).toBe('text');
    expect(assetView('Untitled.base')).toBe('text');
    expect(assetView('docs/contrato.docx')).toBe('other');
    expect(assetView('bin/tool.exe')).toBe('other');
  });

  it('treats HTML as text (shown as source), never as a page', () => {
    expect(assetView('site/index.html')).toBe('text');
  });

  it('knows extensionless text files by name', () => {
    expect(assetView('VERSION')).toBe('text');
    expect(assetView('a/Makefile')).toBe('text');
    expect(assetView('a/blob')).toBe('other');
  });

  it('extracts the extension from the file name only', () => {
    expect(assetExt('a.b/c')).toBe('');
    expect(assetExt('.gitignore')).toBe('');
    expect(assetExt('x/arquivo.tar.gz')).toBe('gz');
  });
});

describe('assets in the index, tree and graph', () => {
  const note = { path: 'carreira/carreira.md', bytes: '---\ntags: [carreira]\n---\n# Carreira\n\n[cv](cv.pdf) e [script](../scripts/run.sh)\n', mtimeMs: 1, size: 1 };
  const assets = [
    { path: 'carreira/cv.pdf', mtimeMs: 2, size: 1000 },
    { path: 'scripts/run.sh', mtimeMs: 3, size: 20 },
    { path: 'solto.png', mtimeMs: 4, size: 5 },
  ];
  const index = buildIndex([note], assets);

  it('keeps assets apart from parsed nodes', () => {
    expect([...index.nodes.keys()]).toEqual(['carreira/carreira.md']);
    expect(index.assets.get('carreira/cv.pdf')).toMatchObject({ ext: 'pdf', view: 'pdf', size: 1000 });
  });

  it('a link to an asset is a backlink of that asset', () => {
    expect(index.backlinks.get('carreira/cv.pdf')?.map((b) => b.fromPath)).toEqual(['carreira/carreira.md']);
  });

  it('puts assets in the tree next to the notes, folders first', () => {
    const tree = buildTree(index);
    const carreira = tree.find((n) => n.path === 'carreira')!;
    expect(carreira.children?.map((c) => c.name)).toEqual(['carreira.md', 'cv.pdf']);
    expect(carreira.children?.[1]).toMatchObject({ view: 'pdf', ext: 'pdf' });
    expect(tree.map((n) => n.name)).toEqual(['carreira/', 'scripts/', 'solto.png']);
  });

  it('makes every asset a graph node — linked or not — with edges from the notes that link it', () => {
    const graph = buildGraph(index);
    expect(graph.nodes.map((n) => [n.path, n.kind, n.ext])).toEqual([
      ['carreira/carreira.md', 'mind-node', 'md'],
      ['carreira/cv.pdf', 'asset', 'pdf'],
      ['scripts/run.sh', 'asset', 'sh'],
      ['solto.png', 'asset', 'png'],
    ]);
    expect(graph.edges.map((e) => e.to).sort()).toEqual(['carreira/cv.pdf', 'scripts/run.sh']);
    expect(graph.nodes.find((n) => n.path === 'carreira/cv.pdf')?.backlinkCount).toBe(1);
    expect(graph.nodes.find((n) => n.path === 'solto.png')?.backlinkCount).toBe(0);
  });
});
