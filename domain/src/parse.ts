import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import { visit } from 'unist-util-visit';
import { toString as mdastToString } from 'mdast-util-to-string';
import { parse as parseYaml } from 'yaml';
import type { Root, Heading, Link, List, ListItem, Yaml, Paragraph } from 'mdast';
import type {
  HeadingInfo,
  LinkInfo,
  NodeKind,
  ParsedNode,
  ParseProblem,
  Position,
  TaskInfo,
} from './types.js';
import { SlugCounter } from './slugify.js';
import { basename, dirname, isOutsideVault, resolveRelative } from './paths.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// remark-frontmatter (micromark-extension-frontmatter under the hood) only
// recognizes a `---`/`---` block when it is the very first thing in the
// document — never mid-document, and never inside a fenced code block
// (fences are tokenized as their own block type before frontmatter would
// even be considered). That is exactly the regression this project cares
// about: docs/ARQUITETURA.md's ```yaml example fence at lines 87-92 must
// never be mistaken for real frontmatter. See domain/test/fence.test.ts.
const processor = unified()
  .use(remarkParse)
  .use(remarkFrontmatter, ['yaml'])
  .use(remarkGfm);

function toPosition(node: { position?: { start: { line: number; column: number; offset?: number } } }): Position {
  const p = node.position?.start;
  return { line: p?.line ?? 0, column: p?.column ?? 0, offset: p?.offset ?? 0 };
}

function detectKind(frontmatter: Record<string, unknown> | null): NodeKind {
  if (frontmatter === null) return 'engine-doc';
  if (Object.prototype.hasOwnProperty.call(frontmatter, 'tags')) return 'mind-node';
  return 'claude-asset';
}

function normalizeTags(frontmatter: Record<string, unknown> | null): string[] {
  const raw = frontmatter?.tags;
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((t) => String(t).trim()).filter(Boolean);
  if (typeof raw === 'string') return raw.split(',').map((t) => t.trim()).filter(Boolean);
  return [];
}

function normalizeDate(frontmatter: Record<string, unknown> | null, key: string): string | null {
  const v = frontmatter?.[key];
  if (typeof v !== 'string') return v instanceof Date ? v.toISOString().slice(0, 10) : null;
  return DATE_RE.test(v) ? v : null;
}

function computeIsIndex(path: string): boolean {
  const dir = dirname(path);
  if (!dir) return false;
  const dirName = dir.split('/').pop()!;
  return basename(path, '.md') === dirName;
}

/** Pure parse: (path, bytes) -> ParsedNode. No fs access, ever. */
export function parseNode(path: string, bytes: string): ParsedNode {
  const problems: ParseProblem[] = [];
  const tree = processor.parse(bytes) as Root;

  let frontmatter: Record<string, unknown> | null = null;
  const first = tree.children[0];
  if (first && first.type === 'yaml') {
    const yamlNode = first as Yaml;
    try {
      const parsed = parseYaml(yamlNode.value);
      frontmatter = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
    } catch (err) {
      problems.push({ kind: 'frontmatter-parse-error', message: (err as Error).message });
      frontmatter = null;
    }
  }

  const headings: HeadingInfo[] = [];
  const links: LinkInfo[] = [];
  const tasks: TaskInfo[] = [];
  const slugs = new SlugCounter();
  let h1Text: string | null = null;

  visit(tree, (node) => {
    if (node.type === 'heading') {
      const h = node as Heading;
      const text = mdastToString(h);
      const id = slugs.next(text);
      headings.push({ id, text, level: h.depth as HeadingInfo['level'], position: toPosition(h) });
      if (h.depth === 1 && h1Text === null) h1Text = text;
    } else if (node.type === 'link') {
      const l = node as Link;
      links.push(parseLink(path, l));
    }
  });
  collectTasks(tree, 0, tasks);

  const frontmatterTitle = typeof frontmatter?.titulo === 'string' ? (frontmatter.titulo as string) : null;
  const title = frontmatterTitle ?? h1Text ?? basename(path, '.md');

  return {
    path,
    kind: detectKind(frontmatter),
    frontmatter,
    tags: normalizeTags(frontmatter),
    title,
    raw: bytes,
    headings,
    links,
    tasks,
    isIndex: computeIsIndex(path),
    problems,
    criado: normalizeDate(frontmatter, 'criado'),
    atualizado: normalizeDate(frontmatter, 'atualizado'),
  };
}

// Manual recursion (rather than unist-util-visit, which only exposes the
// immediate parent) so we can tell a top-level task apart from a task
// nested inside another list item's sub-list — the vault has 10 of those.
function collectTasks(node: Root | List | ListItem | { children?: unknown[] }, listDepth: number, out: TaskInfo[]): void {
  const children = (node as { children?: unknown[] }).children;
  if (!children) return;
  for (const child of children as Array<{ type: string }>) {
    if (child.type === 'list') {
      collectTasks(child as unknown as List, listDepth + 1, out);
    } else if (child.type === 'listItem') {
      const li = child as ListItem;
      // Only real tasks count — a GFM checkbox (`[ ]`/`[x]`) or the vault's
      // `[~]` paused convention (which remark-gfm leaves as a plain item,
      // see parseTask). A plain bullet is prose, not a task: docs/ARQUITETURA.md
      // is all prose lists and must yield zero tasks.
      if (isTaskItem(li)) out.push(parseTask(li, listDepth > 1));
      collectTasks(li as unknown as ListItem, listDepth, out);
    } else {
      collectTasks(child as { children?: unknown[] }, listDepth, out);
    }
  }
}

function firstParagraphText(li: ListItem): string {
  const firstChild = li.children[0];
  if (firstChild && firstChild.type === 'paragraph') {
    return mdastToString(firstChild as Paragraph);
  }
  return mdastToString(li);
}

// remark-gfm only recognizes `[ ]`/`[x]`/`[X]` (→ li.checked is a boolean).
// `[~]` (paused) is not a GFM checkbox, so it arrives as a plain list item
// with checked === null and literal "[~] " leading text — see backend spec.
function isPausedItem(li: ListItem): boolean {
  return firstParagraphText(li).startsWith('[~]');
}

function isTaskItem(li: ListItem): boolean {
  return li.checked === true || li.checked === false || isPausedItem(li);
}

function parseTask(li: ListItem, nested: boolean): TaskInfo {
  const text = firstParagraphText(li);
  let state: TaskInfo['state'];
  if (li.checked === true) state = 'done';
  else if (li.checked === false) state = 'open';
  else state = 'paused'; // only reached for `[~]` items (isTaskItem gate)
  return { text: text.replace(/^\[~\]\s*/, ''), state, nested, position: toPosition(li) };
}

function parseLink(fromPath: string, l: Link): LinkInfo {
  const raw = l.url;
  const text = mdastToString(l);
  const position = toPosition(l);
  const external = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) && !raw.startsWith('mind://');
  if (external) {
    return { raw, text, external: true, anchor: null, resolvedPath: null, outsideVault: false, position };
  }
  const hashIdx = raw.indexOf('#');
  const pathPart = decodeURIComponent(hashIdx === -1 ? raw : raw.slice(0, hashIdx));
  const anchor = hashIdx === -1 ? null : decodeURIComponent(raw.slice(hashIdx + 1)) || null;
  if (!pathPart) {
    return { raw, text, external: false, anchor, resolvedPath: null, outsideVault: false, position };
  }
  const resolved = resolveRelative(fromPath, pathPart);
  return {
    raw,
    text,
    external: false,
    anchor,
    resolvedPath: resolved,
    outsideVault: isOutsideVault(resolved),
    position,
  };
}
