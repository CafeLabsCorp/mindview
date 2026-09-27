import { contextBridge, ipcRenderer } from 'electron';

// The only Electron power the page gets. MindView is the same web app it is
// in a browser; this adds exactly one thing a browser can't do — hand back
// the real path of a folder the user picked in the OS dialog. It returns a
// string and nothing else: no fs, no shell, no generic ipc. Anything wider
// is a new decision (see mind/tarefas/empresa/mindview.md, "Seletor de pasta").
//
// The path comes back in the OS's own shape (C:\… on Windows); converting it
// for a server running inside WSL is the server's job (server/src/io/hostPath.ts).

const bridge = {
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke('mindview:pick-folder'),
};

export type DesktopBridge = typeof bridge;

contextBridge.exposeInMainWorld('mindviewDesktop', bridge);
