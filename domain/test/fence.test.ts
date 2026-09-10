// THE FENCE TEST — mandated regression.
//
// This exact bug (a naive `grep ^tags:`-style extractor inventing a
// `tag1`/`tag2` tag and an invalid `AAAA-MM-DD` date out of a *code example*
// inside docs/ARQUITETURA.md) has hit three different agents. It must never
// silently reappear — see the task brief, section "REGRESSÃO OBRIGATÓRIA".
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseNode } from '../src/parse.js';
import { buildIndex } from '../src/buildIndex.js';

// These suites assert the parser against the *real* vault files that have
// bitten three agents. That content only exists on a machine with the vault
// checked out — set MINDVIEW_VAULT_ROOT, or keep the default. On CI (no
// vault) they skip; the parser's own behaviour is covered by parse.test.ts,
// and Felipe's local `npm run check` still runs the full thing before any
// release tag.
const VAULT_ROOT = process.env.MINDVIEW_VAULT_ROOT ?? '/home/felip/projetos/mind';
const HAVE_VAULT = existsSync(`${VAULT_ROOT}/docs/ARQUITETURA.md`);

function readVaultFile(relPath: string): string {
  // The suites below are describe.skipIf(!HAVE_VAULT), but their describe
  // bodies still run at collection time — return empty so that parse call
  // is harmless; the skipped `it`s never assert on it.
  if (!HAVE_VAULT) return '';
  return readFileSync(`${VAULT_ROOT}/${relPath}`, 'utf-8');
}

describe.skipIf(!HAVE_VAULT)('the fence test — docs/ARQUITETURA.md', () => {
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

  it('does not turn the fenced example into links, tasks or extra headings', () => {
    // the fence contains `tags: [tag1, tag2]`, `criado: AAAA-MM-DD` etc. as
    // plain text inside a code block — none of that may surface as a link,
    // task or heading in the parsed node. Assert by *content*, not by a
    // total count: this doc grows prose lists and headings over time
    // (the "crescimento orgânico" rule) and a fixed count would rot.
    expect(node.links.some((l) => /tag1|tag2|AAAA-MM-DD/.test(l.raw))).toBe(false);
    expect(node.tasks.some((t) => /tag1|tag2|AAAA-MM-DD|^criado:|^atualizado:/.test(t.text))).toBe(false);
    expect(node.headings.some((h) => /tag1|tag2|AAAA-MM-DD/.test(h.text))).toBe(false);
    // A prose doc with no checkboxes and no `[~]` items has zero tasks even
    // though it has dozens of bullet lists — the parser must not count a
    // plain bullet as a task.
    expect(node.tasks.length).toBe(0);
  });

  it('does not treat a mid-document `---` (horizontal rule) as frontmatter', () => {
    // Sanity: the file uses `---` as an <hr> somewhere past line 1. Only
    // position-0 frontmatter should ever be recognized. Locate the rule by
    // scanning, not by a hard-coded line number that every edit shifts.
    const lines = bytes.split('\n');
    const midRule = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
    expect(midRule).toBeGreaterThan(0);
    expect(node.frontmatter).toBeNull();
  });
});

describe.skipIf(!HAVE_VAULT)('the fence test — claude-user/skills/mind/SKILL.md', () => {
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

describe.skipIf(!HAVE_VAULT)('the fence test — vault-wide tag set', () => {
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
