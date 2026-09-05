// Backup export/import — the durability story for the single local-only
// home (see paths.ts's note), same shape as Dindin's
// `lib/services/import_export_service.dart`: a single indented JSON file,
// full replace-all on import (never a merge), confirmed by the caller
// before it ever reaches this module. Deliberately excludes session.json
// (per-run auth token) and usage.jsonl (an append-only log, not state worth
// restoring) — only what the user would actually miss.
import type { Notebook, Settings } from './houseA.js';
import { DEFAULT_SETTINGS, listNotebooks, readSettings, replaceAllNotebooks, writeSettings } from './houseA.js';
import { readState, writeState } from './stateB.js';

export const BACKUP_VERSION = 1;

export interface BackupPayload {
  version: number;
  exportedAt: string;
  settings: Settings;
  notebooks: Notebook[];
  pinnedNodes: string[];
  recentNodes: string[];
}

export function exportBackup(): BackupPayload {
  const state = readState();
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    settings: readSettings(),
    notebooks: listNotebooks(),
    pinnedNodes: state.pinnedNodes,
    recentNodes: state.recentNodes,
  };
}

export class InvalidBackupError extends Error {}

function isNotebook(v: unknown): v is Notebook {
  if (typeof v !== 'object' || v === null) return false;
  const nb = v as Record<string, unknown>;
  return typeof nb.key === 'string' && typeof nb.titulo === 'string' && Array.isArray(nb.nodes);
}

/** Throws `InvalidBackupError` rather than silently importing a partial or
 * malformed file — unlike settings.yaml's read path, there is no "keep last
 * good state" fallback here because this is a user-initiated destructive
 * replace, not a background read. */
export function validateBackup(raw: unknown): BackupPayload {
  if (typeof raw !== 'object' || raw === null) throw new InvalidBackupError('backup file is not a JSON object');
  const body = raw as Record<string, unknown>;
  if (body.version !== BACKUP_VERSION) throw new InvalidBackupError(`unsupported backup version: ${String(body.version)}`);
  if (typeof body.settings !== 'object' || body.settings === null) throw new InvalidBackupError('missing settings');
  if (!Array.isArray(body.notebooks) || !body.notebooks.every(isNotebook)) throw new InvalidBackupError('missing or malformed notebooks');
  const pinnedNodes = Array.isArray(body.pinnedNodes) ? body.pinnedNodes.filter((p): p is string => typeof p === 'string') : [];
  const recentNodes = Array.isArray(body.recentNodes) ? body.recentNodes.filter((p): p is string => typeof p === 'string') : [];
  return {
    version: BACKUP_VERSION,
    exportedAt: typeof body.exportedAt === 'string' ? body.exportedAt : new Date().toISOString(),
    settings: { ...DEFAULT_SETTINGS, ...(body.settings as Partial<Settings>) },
    notebooks: body.notebooks as Notebook[],
    pinnedNodes,
    recentNodes,
  };
}

/** vaultPath / recentVaultPaths are deliberately left untouched — a backup
 * made on one machine must not silently repoint another machine's running
 * instance at a vault path that may not even exist there. */
export function importBackup(payload: BackupPayload): void {
  writeSettings(payload.settings);
  replaceAllNotebooks(payload.notebooks);
  const state = readState();
  writeState({ ...state, pinnedNodes: payload.pinnedNodes, recentNodes: payload.recentNodes });
}
