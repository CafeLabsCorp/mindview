import { app, BrowserWindow, clipboard, dialog, Menu, shell } from 'electron';
import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { detectMode, readStoredMode, writeStoredMode, type LaunchMode } from './launchMode.js';
import { startServer, type RunningServer } from './serverProcess.js';

// MindView desktop shell — a window and nothing else. The Node server does
// all the work as a child process; this file only starts it, points a
// BrowserWindow at it, and makes sure both die together. Architecture and
// rationale: mind/tarefas/empresa/mindview.md ("Empacotamento").

// Keep state/config under …/MindView, not …/@mindview/desktop (the package
// name). Must run before app is ready — it moves userData.
app.setName('MindView');

let server: RunningServer | null = null;
let win: BrowserWindow | null = null;
let launchMode: LaunchMode = 'native';

const MAX_LOG_LINES = 800;
const logs: string[] = [];
let logFile: string | null = null;

function initLogFile(): void {
  try {
    const dir = join(app.getPath('userData'), 'logs');
    mkdirSync(dir, { recursive: true });
    logFile = join(dir, 'main.log');
    // One-generation rotation at ~1 MB so a bad loop can't grow unbounded.
    try {
      if (statSync(logFile).size > 1_000_000) renameSync(logFile, join(dir, 'main.prev.log'));
    } catch {
      /* no existing file */
    }
    appendFileSync(logFile, `\n=== ${new Date().toISOString()} — MindView ${app.getVersion()} (${process.platform}) ===\n`);
  } catch {
    logFile = null; // logging is best-effort, never fatal
  }
}

const log = (line: string) => {
  logs.push(line);
  if (logs.length > MAX_LOG_LINES) logs.shift();
  if (!app.isPackaged) console.log(line);
  if (logFile) {
    try {
      appendFileSync(logFile, line + '\n');
    } catch {
      /* ignore */
    }
  }
};

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
  app.whenReady().then(main).catch((err) => fatal(err));
}

async function main(): Promise<void> {
  initLogFile();
  // A minimal Edit menu (not null): keeps Ctrl+C/V/X/A working in the
  // reader and terminal. autoHideMenuBar hides the bar itself.
  Menu.setApplicationMenu(Menu.buildFromTemplate([{ role: 'editMenu' }]));

  launchMode = await resolveMode();
  log(`[shell] launch mode: ${launchMode}`);

  try {
    server = await startServer(launchMode, log);
  } catch (err) {
    return fatal(err, 'O backend do MindView não subiu.');
  }
  log(`[shell] server ready at ${server.url}`);

  // Headless self-check: boot the server, confirm the URL, tear down. Used
  // to smoke-test the shell where there's no display (CI, WSL without WSLg).
  if (process.env.MINDVIEW_SMOKE === '1') {
    log(`[smoke] ok`);
    await server.stop();
    server = null;
    app.quit();
    return;
  }

  createWindow();
}

async function resolveMode(): Promise<LaunchMode> {
  const stored = readStoredMode();
  if (stored) return stored.mode;

  const d = detectMode();

  // Nothing to ask: not Windows, or WSL isn't even installed.
  if (!d.platformIsWindows || !d.wslAvailable) {
    writeStoredMode('native', null);
    return 'native';
  }

  const yes = (b: boolean) => (b ? 'sim' : 'não');
  const findings =
    `• WSL instalado: sim\n` +
    `• comando "claude" no WSL: ${yes(d.claudeInWsl)}\n` +
    `• comando "claude" no Windows: ${yes(d.claudeNative)}`;
  const recommendWsl = d.recommended === 'wsl';

  const { response } = await dialog.showMessageBox({
    type: 'question',
    title: 'MindView — como rodar o backend',
    message: recommendWsl
      ? 'Detectei WSL nesta máquina e o "claude" só existe lá dentro — recomendo rodar o backend no WSL.'
      : 'Detectei WSL nesta máquina. Pelo que vi, rodar nativo no Windows é o suficiente.',
    detail: `${findings}\n\nDá pra trocar depois nos Ajustes.`,
    buttons: recommendWsl
      ? ['Rodar no WSL (recomendado)', 'Rodar nativo no Windows']
      : ['Rodar nativo no Windows (recomendado)', 'Rodar no WSL'],
    defaultId: 0,
    cancelId: 0,
  });

  const picked: LaunchMode = recommendWsl ? (response === 0 ? 'wsl' : 'native') : response === 0 ? 'native' : 'wsl';

  // Picking native when we recommended WSL: say the consequence now, not later.
  if (recommendWsl && picked === 'native' && !d.claudeNative) {
    await dialog.showMessageBox({
      type: 'warning',
      title: 'MindView',
      message: 'O terminal embutido não vai achar o comando "claude".',
      detail:
        'Você escolheu rodar nativo, mas o "claude" só está instalado no WSL. ' +
        'Instale o Claude Code no Windows, ou deixe o campo "comando ao abrir" vazio nos Ajustes do terminal. ' +
        'O resto do MindView funciona normalmente.',
      buttons: ['Entendi'],
    });
  }

  writeStoredMode(picked, d.wslDistro);
  return picked;
}

function createWindow(): void {
  const origin = new URL(server!.url).origin;

  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#0d0d0d',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      devTools: !app.isPackaged,
      // No preload / node integration: the page is the same web app served
      // over loopback, it must not gain Electron powers it wouldn't have in
      // a browser.
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.once('ready-to-show', () => win?.show());
  win.loadURL(server!.url);

  // Keep it a window, not a browser: external links open in the real
  // browser, and in-app navigation can never leave the loopback origin.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    try {
      if (new URL(url).origin !== origin) e.preventDefault();
    } catch {
      e.preventDefault();
    }
  });

  win.on('closed', () => {
    win = null;
  });
}

function fatal(err: unknown, headline = 'MindView encontrou um erro.'): void {
  const message = err instanceof Error ? err.message : String(err);
  log(`[fatal] ${message}`);
  const diag =
    `MindView ${app.getVersion()} · ${process.platform} · modo ${launchMode}\n` +
    `${message}\n\n` +
    logs.slice(-40).join('\n');

  const picked = dialog.showMessageBoxSync({
    type: 'error',
    title: 'MindView',
    message: headline,
    detail:
      `${message}\n\n` +
      'Seus cadernos e ajustes ficam em %APPDATA%\\MindView e não são afetados por isso.' +
      (logFile ? `\nLog completo: ${logFile}` : ''),
    buttons: ['Copiar diagnóstico', 'Fechar'],
    defaultId: 1,
    cancelId: 1,
  });
  if (picked === 0) clipboard.writeText(diag);
  app.quit();
}

// Close means quit — Felipe's spec: opening starts everything, closing ends
// everything (including the server child and its PTYs).
app.on('window-all-closed', () => app.quit());
app.on('before-quit', async (e) => {
  if (!server) return;
  e.preventDefault();
  const s = server;
  server = null;
  try {
    await s.stop();
  } catch (err) {
    log(`[shell] server stop error: ${err instanceof Error ? err.message : String(err)}`);
  } finally {
    app.quit();
  }
});
