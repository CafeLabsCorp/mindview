// Casa B — disposable, machine-local state. Everything here "regenera
// sozinho" if deleted: per-run auth session, recent vault paths, recently
// opened / pinned nodes, usage log. Never versioned, never read by the
// maintenance agent, never inside the vault. See server/src/app/paths.ts
// and the task brief's "Onde vive o estado do MV".
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { atomicWriteFile, readIfExists } from '../io/atomicWrite.js';
import { HOUSE_B_ROOT } from './paths.js';

function ensureHouseB(): void {
  mkdirSync(HOUSE_B_ROOT, { recursive: true });
}

// ------------------------------------------------------------- session.json

export interface Session {
  token: string;
  port: number;
  startedAt: number;
}

const SESSION_PATH = () => join(HOUSE_B_ROOT, 'session.json');

/** Written once at server startup so the web dev server (a separate Vite
 * process, started concurrently) can pick up this run's token without any
 * manual copy/paste — see web/vite.config.ts's transformIndexHtml hook. */
export function writeSession(session: Session): void {
  ensureHouseB();
  atomicWriteFile(SESSION_PATH(), JSON.stringify(session));
}

// --------------------------------------------------------------- state.json

export interface AppState {
  recentVaultPaths: string[];
  recentNodes: string[];
  pinnedNodes: string[];
}

const STATE_PATH = () => join(HOUSE_B_ROOT, 'state.json');
const DEFAULT_STATE: AppState = { recentVaultPaths: [], recentNodes: [], pinnedNodes: [] };
const MAX_LIST = 12;

export function readState(): AppState {
  ensureHouseB();
  const raw = readIfExists(STATE_PATH());
  if (!raw) return DEFAULT_STATE;
  try {
    return { ...DEFAULT_STATE, ...JSON.parse(raw) };
  } catch (err) {
    console.error('[stateB] state.json failed to parse, using defaults:', err);
    return DEFAULT_STATE;
  }
}

export function writeState(state: AppState): void {
  ensureHouseB();
  atomicWriteFile(STATE_PATH(), JSON.stringify(state));
}

function pushUnique(list: string[], value: string): string[] {
  return [value, ...list.filter((v) => v !== value)].slice(0, MAX_LIST);
}

export function noteRecentVaultPath(path: string): void {
  const state = readState();
  writeState({ ...state, recentVaultPaths: pushUnique(state.recentVaultPaths, path) });
}

export function noteRecentNode(path: string): void {
  const state = readState();
  writeState({ ...state, recentNodes: pushUnique(state.recentNodes, path) });
}

export function togglePinnedNode(path: string): AppState {
  const state = readState();
  const pinned = state.pinnedNodes.includes(path)
    ? state.pinnedNodes.filter((p) => p !== path)
    : [path, ...state.pinnedNodes];
  const next = { ...state, pinnedNodes: pinned };
  writeState(next);
  return next;
}

// -------------------------------------------------------------- usage.jsonl

/** Append-only open log — Ciclo 1's "app loga aberturas", relocated out of
 * the vault into Casa B. Best-effort: a logging failure must never break a
 * node read. */
export function logUsage(event: Record<string, unknown>): void {
  try {
    ensureHouseB();
    appendFileSync(join(HOUSE_B_ROOT, 'usage.jsonl'), JSON.stringify({ ts: Date.now(), ...event }) + '\n', 'utf-8');
  } catch (err) {
    console.error('[stateB] usage log append failed (ignored):', err);
  }
}
