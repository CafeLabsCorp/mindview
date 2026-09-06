// Domain shapes come straight from the workspace package — one source of
// truth, no hand-copied duplicate types drifting from the parser's real
// output. Everything below that is NOT re-exported here is server-only
// (touches node:fs) and gets its own small mirror type instead.
export type {
  BacklinkEntry,
  BoardRow,
  GraphEdge,
  GraphNode,
  HeadingInfo,
  IndexedNode,
  LinkInfo,
  NodeKind,
  ParsedNode,
  SearchHit,
  TaskInfo,
  TaskState,
  VaultGraph,
} from '@mindview/domain';
import type { TreeNode as DomainTreeNode } from '@mindview/domain';
export type TreeNode = DomainTreeNode;

import type { BacklinkEntry, BoardRow, IndexedNode } from '@mindview/domain';

export interface NodeResponse {
  node: IndexedNode;
  backlinks: BacklinkEntry[];
  obsidian: string | null;
  vscode: string | null;
}

export interface BoardResponse {
  rows: BoardRow[];
  stale: string[];
  brokenLinks: { fromPath: string; raw: string; resolvedPath: string }[];
  outsideVaultLinks: { fromPath: string; raw: string }[];
  orphans: string[];
  builtAt: number;
  buildMs: number;
}

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
  terminalEnabled: boolean;
  terminalShell: string;
  terminalShellArgs: string[];
  terminalCwd: string;
  terminalStartupCommand: string;
  terminalMode: 'command' | 'shell';
  terminalFontSize: number;
}

export interface ShellOption {
  label: string;
  command: string;
  args: string[];
}

/** What the server can really launch on *this* machine, plus what the
 * current settings resolve to — the Ajustes screen shows both so an empty
 * "shell" field still tells you what it will actually run. */
export interface TerminalShellsResponse {
  platform: string;
  shells: ShellOption[];
  effective: { shell: string; args: string[]; cwd: string; startupCommand: string; mode: 'command' | 'shell' };
}

export interface NotebookNodeRef {
  path: string;
  titleAtIndex: string;
}

export interface Notebook {
  key: string;
  titulo: string;
  simbolo: string;
  cor: string;
  criado: string;
  nodes: NotebookNodeRef[];
}

export interface ConfigResponse {
  vaultPath: string;
  recentVaultPaths: string[];
}

export interface AppState {
  recentVaultPaths: string[];
  recentNodes: string[];
  pinnedNodes: string[];
}

export interface ReindexEvent {
  builtAt: number;
  buildMs: number;
  nodeCount: number;
}

export interface BackupPayload {
  version: number;
  exportedAt: string;
  settings: Settings;
  notebooks: Notebook[];
  pinnedNodes: string[];
  recentNodes: string[];
}
