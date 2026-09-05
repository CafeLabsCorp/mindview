// THE FENCE TEST — mandated regression.
//
// This exact bug (a naive `grep ^tags:`-style extractor inventing a
// `tag1`/`tag2` tag and an invalid `AAAA-MM-DD` date out of a *code example*
// inside docs/ARQUITETURA.md) has hit three different agents. It must never
// silently reappear — see the task brief, section "REGRESSÃO OBRIGATÓRIA".
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseNode } from '../src/parse.js';
import { buildIndex } from '../src/buildIndex.js';

const VAULT_ROOT = '/home/felip/projetos/mind';

function readVaultFile(relPath: string): string {
  return readFileSync(`${VAULT_ROOT}/${relPath}`, 'utf-8');
}

describe('the fence test — docs/ARQUITETURA.md', () => {
  const path = 'docs/ARQUITETURA.md';
  const bytes = readVaultFile(path);
  const node = parseNode(path, bytes);

  it('has no frontmatter — line 1 is a heading, not `---`', () => {
    expect(bytes.startsWith('# Mind')).toBe(true);
    expect(node.frontmatter).toBeNull();
  });

  it('is classified as engine-doc, never mind-node', () => {
    expect(node.kind).toBe('engine-doc');
  });

  it('extracts zero tags — not `tag1`/`tag2` from the fenced yaml example', () => {
    expect(node.tags).toEqual([]);
  });

  it('extracts zero invalid dates — not the literal placeholder `AAAA-MM-DD`', () => {
    expect(node.criado).toBeNull();
    expect(node.atualizado).toBeNull();
  });

  it('does not turn the fenced example `---` lines into links, tasks or extra headings', () => {
    // the fence contains `tags: [tag1, tag2]`, `criado: AAAA-MM-DD` etc. as
    // plain text inside a code block — none of that may surface as a link
    // or task in the parsed node.
    const fencedText = 'tags: [tag1, tag2]';
    expect(node.links.some((l) => l.raw.includes(fencedText))).toBe(false);
    expect(node.tasks.length).toBe(0);
  });

  it('does not treat a mid-document `---` (horizontal rule, e.g. line 78) as frontmatter', () => {
    // Sanity: the file has a `---` far from line 1 used as an <hr>. Only
    // position-0 frontmatter should ever be recognized; this is implicit
    // in remark-frontmatter's own behavior, asserted here so a future
    // change to the parsing pipeline can't quietly break it.
    expect(bytes.split('\n')[77]).toBe('---'); // 0-based index 77 == line 78
    expect(node.frontmatter).toBeNull();
  });
});

describe('the fence test — claude-user/skills/mind/SKILL.md', () => {
  // Same shape of bug (§ ARQUITETURA.md:87-92 pattern) is called out for
  // this file too (lines 38-42 in the task brief) — it has *real*
  // frontmatter (name/description) at position 0, which is legitimate and
  // must be picked up, but is a claude-asset, not a mind-node (no `tags`
  // key) and must not contribute to the vault's tag set.
  const path = 'claude-user/skills/mind/SKILL.md';
  const bytes = readVaultFile(path);
  const node = parseNode(path, bytes);

  it('has real frontmatter (name/description), not null', () => {
    expect(node.frontmatter).not.toBeNull();
    expect(node.frontmatter?.name).toBe('mind');
  });

  it('is classified as claude-asset (has frontmatter, but no `tags` key)', () => {
    expect(node.kind).toBe('claude-asset');
  });

  it('contributes zero tags to the vault tag set', () => {
    expect(node.tags).toEqual([]);
  });
});

describe('the fence test — vault-wide tag set', () => {
  it('never contains tag1 or tag2', () => {
    const path = 'docs/ARQUITETURA.md';
    const skillPath = 'claude-user/skills/mind/SKILL.md';
    const index = buildIndex([
      { path, bytes: readVaultFile(path), mtimeMs: 0, size: 0 },
      { path: skillPath, bytes: readVaultFile(skillPath), mtimeMs: 0, size: 0 },
      {
        path: 'projetos/produtos-cafelabs/dindin.md',
        bytes: readVaultFile('projetos/produtos-cafelabs/dindin.md'),
        mtimeMs: 0,
        size: 0,
      },
    ]);
    expect(index.tagSet.has('tag1')).toBe(false);
    expect(index.tagSet.has('tag2')).toBe(false);
  });
});

describe('the fence test — folder-tree fences do not become links', () => {
  it('a fenced folder-tree example (e.g. lines with `├──`/`└──`) never parses as a markdown link', () => {
    const fenced = [
      '```',
      'mind/',
      '├── projetos/',
      '│   └── [dindin.md](dindin.md)',
      '└── README.md',
      '```',
      '',
      'texto normal depois da fence.',
    ].join('\n');
    const node = parseNode('fixture.md', fenced);
    expect(node.links.length).toBe(0);
  });
});
