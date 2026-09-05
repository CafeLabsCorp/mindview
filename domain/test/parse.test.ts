import { describe, expect, it } from 'vitest';
import { parseNode } from '../src/parse.js';
import { buildIndex } from '../src/buildIndex.js';
import { computeStaleIndexes, listBrokenLinks, listOutsideVaultLinks, search } from '../src/selectors.js';
import { slugifyHeading } from '../src/slugify.js';

describe('frontmatter + kind detection', () => {
  it('detects a mind-node (frontmatter with tags)', () => {
    const bytes = ['---', 'tags: [projetos, cafelabs, dindin]', 'criado: 2026-07-10', 'atualizado: 2026-08-31', '---', '', '# Dindin', ''].join('\n');
    const node = parseNode('projetos/produtos-cafelabs/dindin.md', bytes);
    expect(node.kind).toBe('mind-node');
    expect(node.tags).toEqual(['projetos', 'cafelabs', 'dindin']);
    expect(node.criado).toBe('2026-07-10');
    expect(node.atualizado).toBe('2026-08-31');
    expect(node.title).toBe('Dindin');
  });

  it('rejects an invalid placeholder date', () => {
    const bytes = ['---', 'tags: [x]', 'criado: AAAA-MM-DD', '---', '# X'].join('\n');
    const node = parseNode('x.md', bytes);
    expect(node.criado).toBeNull();
  });

  it('a file with no frontmatter is engine-doc', () => {
    const node = parseNode('README.md', '# Mind\n\nsome text');
    expect(node.kind).toBe('engine-doc');
    expect(node.frontmatter).toBeNull();
  });
});

describe('checkbox states, including [~] paused', () => {
  const bytes = [
    '# Tasks',
    '',
    '- [ ] aberto',
    '- [x] feito',
    '- [~] ~~pausado~~ motivo',
    '- [ ] com sublista',
    '  - [ ] filho aberto',
    '  - [~] filho pausado',
  ].join('\n');
  const node = parseNode('t.md', bytes);

  it('finds all 6 tasks', () => {
    expect(node.tasks.length).toBe(6);
  });

  it('open/done/paused states are correct', () => {
    const states = node.tasks.map((t) => t.state);
    expect(states).toEqual(['open', 'done', 'paused', 'open', 'open', 'paused']);
  });

  it('marks sub-list items as nested', () => {
    const nested = node.tasks.filter((t) => t.nested);
    expect(nested.length).toBe(2);
  });
});

describe('heading slugs with accents', () => {
  it('keeps accented characters (Obsidian/GitHub-style anchors)', () => {
    expect(slugifyHeading('Configuração desta instância')).toBe('configuração-desta-instância');
  });

  it('dedupes repeated headings within a document', () => {
    const bytes = ['# Doc', '## Estado', 'texto', '## Estado', 'texto2'].join('\n');
    const node = parseNode('d.md', bytes);
    expect(node.headings.map((h) => h.id)).toEqual(['doc', 'estado', 'estado-1']);
  });
});

describe('link resolution', () => {
  it('resolves a relative link against the linking document path', () => {
    const bytes = '[dindin](../../projetos/produtos-cafelabs/dindin.md)';
    const node = parseNode('tarefas/empresa/transversais.md', bytes);
    expect(node.links[0].resolvedPath).toBe('projetos/produtos-cafelabs/dindin.md');
    expect(node.links[0].outsideVault).toBe(false);
  });

  it('flags a link that climbs out of the vault root', () => {
    const bytes = '[fora](../../../../projetos/cafelabs-posts/x.md)';
    const node = parseNode('a/b.md', bytes);
    expect(node.links[0].outsideVault).toBe(true);
  });

  it('treats http(s) links as external, not resolved', () => {
    const node = parseNode('a.md', '[site](https://obsidian.md)');
    expect(node.links[0].external).toBe(true);
    expect(node.links[0].resolvedPath).toBeNull();
  });

  it('splits path and anchor correctly', () => {
    const node = parseNode('a.md', '[link](b.md#seção-x)');
    expect(node.links[0].resolvedPath).toBe('b.md');
    expect(node.links[0].anchor).toBe('seção-x');
  });
});

describe('buildIndex: backlinks + broken/outside links + staleness', () => {
  const a = { path: 'a.md', bytes: '# A\n\n[para b](b.md)\n[fora](../../outside.md)\n[quebrado](missing.md)\n', mtimeMs: 1, size: 1 };
  const b = { path: 'b.md', bytes: '# B\ntexto', mtimeMs: 1, size: 1 };
  const idx = { path: 'idx/idx.md', bytes: '---\ntags: [x]\ncriado: 2026-01-01\natualizado: 2026-01-01\n---\n# Índice', mtimeMs: 1, size: 1 };
  const child = { path: 'idx/child.md', bytes: '---\ntags: [x]\ncriado: 2026-01-01\natualizado: 2026-06-01\n---\n# Child', mtimeMs: 1, size: 1 };
  const index = buildIndex([a, b, idx, child]);

  it('registers a backlink from a.md to b.md', () => {
    expect(index.backlinks.get('b.md')?.[0].fromPath).toBe('a.md');
  });

  it('does not register a backlink for a link that does not resolve', () => {
    expect(index.backlinks.get('missing.md')).toBeUndefined();
  });

  it('lists the broken link, not the outside-vault one, as broken', () => {
    const broken = listBrokenLinks(index);
    expect(broken.some((l) => l.resolvedPath === 'missing.md')).toBe(true);
    expect(broken.some((l) => l.resolvedPath.includes('outside'))).toBe(false);
  });

  it('lists the outside-vault link separately', () => {
    const outside = listOutsideVaultLinks(index);
    expect(outside.length).toBe(1);
  });

  it('flags a folder index as stale when a child was updated more recently', () => {
    const stale = computeStaleIndexes(index);
    expect(stale.has('idx/idx.md')).toBe(true);
  });
});

describe('search scorer', () => {
  const index = buildIndex([
    { path: 'dindin.md', bytes: '---\ntags: [x]\n---\n# Dindin\n\ncontrole financeiro por caixinhas', mtimeMs: 1, size: 1 },
    { path: 'domo.md', bytes: '---\ntags: [x]\n---\n# Domo\n\noutro produto', mtimeMs: 1, size: 1 },
  ]);

  it('ranks a title match above a body match', () => {
    const hits = search(index, 'dindin');
    expect(hits[0].path).toBe('dindin.md');
    expect(hits[0].matchedIn).toBe('title');
  });

  it('finds a body match when title does not match', () => {
    const hits = search(index, 'caixinhas');
    expect(hits[0].path).toBe('dindin.md');
    expect(hits[0].matchedIn).toBe('body');
  });

  it('returns nothing for an empty query', () => {
    expect(search(index, '')).toEqual([]);
  });
});
