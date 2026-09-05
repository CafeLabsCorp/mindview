import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { atomicWriteFile, readIfExists } from '../io/atomicWrite.js';
import { HOUSE_A_ROOT, DEFAULT_VAULT_PATH } from './paths.js';

export interface Settings {
  accent: string;
  theme: 'dark' | 'light' | 'system';
  linkColorOverride: string | null;
  bodyFont: string;
  readSize: number;
  colWidth: number;
  lineHeight: number;
  tagColors: Record<string, string>;
  frontmatterPretty: boolean;
  tocEnabled: boolean;
  recentPinnedEnabled: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  accent: '#3fb950',
  theme: 'dark',
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
};

function ensureHouseA(): void {
  mkdirSync(HOUSE_A_ROOT, { recursive: true });
  mkdirSync(join(HOUSE_A_ROOT, 'cadernos'), { recursive: true });
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

export function readSettings(): Settings {
  ensureHouseA();
  const raw = readIfExists(SETTINGS_PATH());
  if (!raw) return DEFAULT_SETTINGS;
  try {
    const parsed = parseYaml(raw) ?? {};
    return { ...DEFAULT_SETTINGS, ...parsed, tagColors: { ...DEFAULT_SETTINGS.tagColors, ...(parsed.tagColors ?? {}) } };
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
