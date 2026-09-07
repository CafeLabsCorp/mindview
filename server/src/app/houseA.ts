import { existsSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { atomicWriteFile, ensureOwnerOnlyDir, readIfExists } from '../io/atomicWrite.js';
import { HOUSE_A_ROOT, DEFAULT_VAULT_PATH } from './paths.js';

export interface Settings {
  accent: string;
  theme: 'dark' | 'light' | 'system';
  /** UI language. 'auto' follows the browser — the same three-state shape
   * as `theme`. Only the chrome is translated; vault content never is. */
  language: 'auto' | 'en' | 'pt';
  linkColorOverride: string | null;
  bodyFont: string;
  readSize: number;
  colWidth: number;
  lineHeight: number;
  tagColors: Record<string, string>;
  frontmatterPretty: boolean;
  tocEnabled: boolean;
  recentPinnedEnabled: boolean;
  /** Embedded terminal (Fase 2). Opt-in and off by default: a local web app
   * that can spawn an arbitrary shell is a very different attack surface
   * from a read-only reader, so the safe default ships enabled=false and
   * the WebSocket endpoint refuses the upgrade until it is turned on. */
  terminalEnabled: boolean;
  /** Empty = whatever this machine's default shell is (see shells.ts).
   * Never hardcoded to bash: someone cloning this may be on PowerShell. */
  terminalShell: string;
  terminalShellArgs: string[];
  /** Empty = the active vault root, so the terminal opens *in the Mind*. */
  terminalCwd: string;
  /** Typed into the shell right after it starts. Empty = plain shell. */
  terminalStartupCommand: string;
  /** 'command' (default): run terminalStartupCommand and nothing else —
   * the shell execs into it, so quitting the command ends the session and
   * there is never a prompt to fall back to. 'shell': a full interactive
   * terminal, with the command merely typed in at the start.
   * MindView is an app for the Mind, not a shell host, so unrestricted
   * shell access is opt-in rather than the default. */
  terminalMode: 'command' | 'shell';
  terminalFontSize: number;
}

export const DEFAULT_SETTINGS: Settings = {
  accent: '#3fb950',
  theme: 'dark',
  language: 'auto',
  linkColorOverride: null,
  bodyFont: "'Inter',system-ui,sans-serif",
  readSize: 15.5,
  colWidth: 680,
  lineHeight: 1.75,
  tagColors: {
    cafelabs: '#3fb950',
    tarefas: '#5b9eea',
    projetos: '#e0913a',
    dindin: '#a78bfa',
    mind: '#45b8c4',
    design: '#e685b5',
    infra: '#e0913a',
    legal: '#f0655c',
    lgpd: '#f0655c',
    financeiro: '#8a7226',
    marketing: '#e685b5',
    distribuicao: '#e0913a',
  },
  frontmatterPretty: true,
  tocEnabled: true,
  recentPinnedEnabled: true,
  terminalEnabled: false,
  terminalShell: '',
  terminalShellArgs: [],
  terminalCwd: '',
  terminalStartupCommand: 'claude',
  terminalMode: 'command',
  terminalFontSize: 13,
};

function ensureHouseA(): void {
  ensureOwnerOnlyDir(HOUSE_A_ROOT);
  ensureOwnerOnlyDir(join(HOUSE_A_ROOT, 'cadernos'));
}

// ---------------------------------------------------------------- config.yaml

export interface ConfigYaml {
  vault_path: string;
}

const CONFIG_PATH = () => join(HOUSE_A_ROOT, 'config.yaml');

export function readConfig(): ConfigYaml {
  ensureHouseA();
  const raw = readIfExists(CONFIG_PATH());
  if (!raw) return { vault_path: DEFAULT_VAULT_PATH };
  try {
    const parsed = parseYaml(raw);
    return { vault_path: typeof parsed?.vault_path === 'string' ? parsed.vault_path : DEFAULT_VAULT_PATH };
  } catch (err) {
    console.error('[houseA] config.yaml failed to parse, keeping last good state / defaults:', err);
    return { vault_path: DEFAULT_VAULT_PATH };
  }
}

export function writeConfig(cfg: ConfigYaml): void {
  ensureHouseA();
  const header = '# MindView — config.yaml\n# vault_path: absolute path to the Mind vault this instance reads.\n';
  atomicWriteFile(CONFIG_PATH(), header + stringifyYaml(cfg));
}

// -------------------------------------------------------------- settings.yaml

const SETTINGS_PATH = () => join(HOUSE_A_ROOT, 'settings.yaml');

/**
 * Coerces the terminal settings to their declared types before anything
 * downstream trusts them. settings.yaml is not a trusted file: it is
 * written by `PUT /api/settings` and editable on disk, and these
 * particular fields decide *which binary gets spawned with which argv*.
 * A wrong type here would otherwise reach `node-pty.spawn` (or throw on a
 * `.trim()` in the middle of an upgrade handler).
 */
function sanitizeTerminal(s: Settings): Settings {
  const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback);
  return {
    ...s,
    // Not a terminal field, but the same reason applies: settings.yaml is
    // hand-editable, and the web side switches on this exhaustively.
    language: s.language === 'en' || s.language === 'pt' ? s.language : 'auto',
    terminalEnabled: s.terminalEnabled === true,
    terminalShell: str(s.terminalShell, ''),
    terminalShellArgs: Array.isArray(s.terminalShellArgs) ? s.terminalShellArgs.filter((a): a is string => typeof a === 'string') : [],
    terminalCwd: str(s.terminalCwd, ''),
    terminalStartupCommand: str(s.terminalStartupCommand, DEFAULT_SETTINGS.terminalStartupCommand),
    terminalMode: s.terminalMode === 'shell' ? 'shell' : 'command',
    terminalFontSize: Number.isFinite(s.terminalFontSize) ? Math.min(32, Math.max(8, Number(s.terminalFontSize))) : DEFAULT_SETTINGS.terminalFontSize,
  };
}

export function readSettings(): Settings {
  ensureHouseA();
  const raw = readIfExists(SETTINGS_PATH());
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const parsed = parseYaml(raw) ?? {};
    return sanitizeTerminal({ ...DEFAULT_SETTINGS, ...parsed, tagColors: { ...DEFAULT_SETTINGS.tagColors, ...(parsed.tagColors ?? {}) } });
  } catch (err) {
    console.error('[houseA] settings.yaml failed to parse, operating read-only on it, using defaults:', err);
    return DEFAULT_SETTINGS;
  }
}

export function writeSettings(settings: Settings): void {
  ensureHouseA();
  const header = '# MindView — settings.yaml (accent, theme, typography, tag color map)\n';
  atomicWriteFile(SETTINGS_PATH(), header + stringifyYaml(settings));
}

// ------------------------------------------------------------------ cadernos/

export interface NotebookNodeRef {
  path: string; // mind://-relative, i.e. vault-root-relative path
  titleAtIndex: string; // the `<!-- t: -->` denormalized title
}

export interface Notebook {
  key: string;
  titulo: string;
  simbolo: string;
  cor: string;
  criado: string;
  nodes: NotebookNodeRef[];
}

const CADERNOS_DIR = () => join(HOUSE_A_ROOT, 'cadernos');

function slugKey(titulo: string): string {
  const base = titulo
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'caderno';
}

function uniqueKey(titulo: string): string {
  ensureHouseA();
  const base = slugKey(titulo);
  let key = base;
  let n = 1;
  while (existsSync(join(CADERNOS_DIR(), `${key}.md`))) {
    key = `${base}-${n++}`;
  }
  return key;
}

function serializeNotebook(nb: Notebook): string {
  const fm = stringifyYaml({ titulo: nb.titulo, simbolo: nb.simbolo, cor: nb.cor, criado: nb.criado });
  const lines = nb.nodes.map((n) => `- [${n.titleAtIndex}](mind://${n.path}) <!-- t: ${n.titleAtIndex} -->`);
  return `---\n${fm}---\n\n${lines.join('\n')}${lines.length ? '\n' : ''}`;
}

const LINE_RE = /^-\s*\[(.*?)\]\(mind:\/\/(.*?)\)(?:\s*<!--\s*t:\s*(.*?)\s*-->)?\s*$/;

function parseNotebook(key: string, raw: string): Notebook | null {
  if (!raw.startsWith('---\n') && !raw.startsWith('---\r\n')) return null;
  const closeIdx = raw.indexOf('\n---', 3);
  if (closeIdx === -1) return null;
  const fmText = raw.slice(4, closeIdx);
  const rest = raw.slice(closeIdx + 4);
  let fm: Record<string, unknown>;
  try {
    fm = parseYaml(fmText) ?? {};
  } catch (err) {
    console.error(`[houseA] cadernos/${key}.md frontmatter failed to parse, skipping this notebook:`, err);
    return null;
  }
  const nodes: NotebookNodeRef[] = [];
  for (const line of rest.split('\n')) {
    const m = LINE_RE.exec(line.trim());
    if (m) nodes.push({ path: m[2], titleAtIndex: m[3] ?? m[1] });
  }
  return {
    key,
    titulo: String(fm.titulo ?? key),
    simbolo: String(fm.simbolo ?? '◆'),
    cor: String(fm.cor ?? '#5b9eea'),
    criado: String(fm.criado ?? ''),
    nodes,
  };
}

export function listNotebooks(): Notebook[] {
  ensureHouseA();
  const dir = CADERNOS_DIR();
  const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
  const out: Notebook[] = [];
  for (const f of files) {
    const key = f.slice(0, -3);
    const raw = readFileSync(join(dir, f), 'utf-8');
    const nb = parseNotebook(key, raw);
    if (nb) out.push(nb);
  }
  out.sort((a, b) => a.criado.localeCompare(b.criado));
  return out;
}

export function getNotebook(key: string): Notebook | null {
  const p = join(CADERNOS_DIR(), `${key}.md`);
  const raw = readIfExists(p);
  return raw ? parseNotebook(key, raw) : null;
}

function saveNotebook(nb: Notebook): void {
  ensureHouseA();
  atomicWriteFile(join(CADERNOS_DIR(), `${nb.key}.md`), serializeNotebook(nb));
}

export function createNotebook(input: { titulo: string; simbolo: string; cor: string }): Notebook {
  const key = uniqueKey(input.titulo);
  const nb: Notebook = {
    key,
    titulo: input.titulo,
    simbolo: input.simbolo,
    cor: input.cor,
    criado: new Date().toISOString().slice(0, 10),
    nodes: [],
  };
  saveNotebook(nb);
  return nb;
}

export function updateNotebookCover(key: string, patch: Partial<Pick<Notebook, 'titulo' | 'simbolo' | 'cor'>>): Notebook | null {
  const nb = getNotebook(key);
  if (!nb) return null;
  const updated = { ...nb, ...patch };
  saveNotebook(updated);
  return updated;
}

export function deleteNotebook(key: string): void {
  const p = join(CADERNOS_DIR(), `${key}.md`);
  if (existsSync(p)) unlinkSync(p);
}

/** Adds a node reference by path. `title` is the node's *current* indexed
 * title, denormalized into the `<!-- t: -->` comment at write time. */
export function addNodeToNotebook(key: string, path: string, title: string): Notebook | null {
  const nb = getNotebook(key);
  if (!nb) return null;
  if (nb.nodes.some((n) => n.path === path)) return nb;
  nb.nodes.push({ path, titleAtIndex: title });
  saveNotebook(nb);
  return nb;
}

export function removeNodeFromNotebook(key: string, path: string): Notebook | null {
  const nb = getNotebook(key);
  if (!nb) return null;
  nb.nodes = nb.nodes.filter((n) => n.path !== path);
  saveNotebook(nb);
  return nb;
}

/** Full replace, used only by backup import (`app/backup.ts`): every
 * `cadernos/*.md` not present in `notebooks` is deleted first, then each
 * incoming notebook is (re)written — the same replace-all semantics as
 * Dindin's backup import, not a merge. */
export function replaceAllNotebooks(notebooks: Notebook[]): void {
  ensureHouseA();
  for (const f of readdirSync(CADERNOS_DIR()).filter((f) => f.endsWith('.md'))) {
    unlinkSync(join(CADERNOS_DIR(), f));
  }
  for (const nb of notebooks) saveNotebook(nb);
}
