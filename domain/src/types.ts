// Pure domain types. No `fs`, no Node built-ins here — see ARCHITECTURE note
// in ../../README.md ("Camadas"). Everything below is derived from
// (path, bytes) alone.

export type NodeKind = 'mind-node' | 'engine-doc' | 'claude-asset';

export type TaskState = 'open' | 'done' | 'paused';

export interface Position {
  /** 1-based line */
  line: number;
  /** 1-based column */
  column: number;
  /** 0-based byte/char offset */
  offset: number;
}

export interface HeadingInfo {
  id: string;
  text: string;
  level: 1 | 2 | 3 | 4 | 5 | 6;
  position: Position;
}

export interface LinkInfo {
  /** raw href exactly as written in the markdown source */
  raw: string;
  /** visible link text, best-effort plain string */
  text: string;
  /** true for http(s):// links */
  external: boolean;
  /** anchor fragment, without the leading # */
  anchor: string | null;
  /**
   * vault-root-relative path this link resolves to, POSIX separators,
   * null when external or when the link has no path part (pure #anchor).
   */
  resolvedPath: string | null;
  /** true when resolvedPath climbs out of the vault root (`../../../..`) */
  outsideVault: boolean;
  position: Position;
}

export interface TaskInfo {
  text: string;
  state: TaskState;
  nested: boolean;
  position: Position;
}

export interface ParseProblem {
  kind: 'frontmatter-parse-error' | 'read-error';
  message: string;
}

export interface ParsedNode {
  /** vault-root-relative path, POSIX separators. This is node identity — never basename. */
  path: string;
  kind: NodeKind;
  /** raw frontmatter object, or null when the file has none */
  frontmatter: Record<string, unknown> | null;
  /** frontmatter.tags, normalized to string[], [] when absent */
  tags: string[];
  title: string;
  /** raw file bytes as text — the index never re-serializes back to Markdown from a model */
  raw: string;
  headings: HeadingInfo[];
  links: LinkInfo[];
  tasks: TaskInfo[];
  isIndex: boolean;
  problems: ParseProblem[];
  criado: string | null;
  atualizado: string | null;
}

export interface FileStat {
  mtimeMs: number;
  size: number;
}

/** A node as stored in the live index: parse result + read-time file stat. */
export interface IndexedNode extends ParsedNode {
  mtimeMs: number;
  size: number;
}

export interface BacklinkEntry {
  fromPath: string;
  excerpt: string;
}

export interface VaultIndex {
  nodes: Map<string, IndexedNode>;
  backlinks: Map<string, BacklinkEntry[]>;
  tagSet: Set<string>;
  builtAt: number;
  buildMs: number;
}

export interface BoardRow {
  path: string;
  open: number;
  done: number;
  paused: number;
  atualizado: string | null;
  stale: boolean;
}

export interface SearchHit {
  path: string;
  title: string;
  score: number;
  matchedIn: 'title' | 'heading' | 'body' | 'path';
}
