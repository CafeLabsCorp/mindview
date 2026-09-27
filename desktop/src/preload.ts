import { contextBridge, ipcRenderer } from 'electron';
import { canOpenExternally } from './openable.js';

// The only Electron powers the page gets. MindView is the same web app it
// is in a browser; this adds exactly what a browser can't do, each returning
// data and nothing else — no fs, no shell, no generic ipc. Anything wider is
// a new decision (see mind/tarefas/empresa/mindview.md).
//
// Paths go in vault-relative. The main process resolves them through the
// server (which confines them to the vault) — the page never hands the OS
// an absolute path.

const bridge = {
  /** The real path of a folder picked in the OS dialog, in the OS's own
   * shape (C:\… on Windows); converting it for a server in WSL is the
   * server's job (server/src/io/hostPath.ts). */
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke('mindview:pick-folder'),
  /** Whether "open in default app" is offered for this extension at all.
   * main.ts enforces the same list; this only hides a button. */
  canOpenExternally: (ext: string): boolean => canOpenExternally(ext),
  openAsset: (vaultPath: string): Promise<boolean> => ipcRenderer.invoke('mindview:open-asset', vaultPath),
  showAssetInFolder: (vaultPath: string): Promise<boolean> => ipcRenderer.invoke('mindview:show-asset', vaultPath),
  /** Keep a terminal balloon above other apps, or let it go behind. */
  setPopoutOnTop: (id: number, onTop: boolean): Promise<boolean> => ipcRenderer.invoke('mindview:popout-on-top', id, onTop),
};

export type DesktopBridge = typeof bridge;

contextBridge.exposeInMainWorld('mindviewDesktop', bridge);
