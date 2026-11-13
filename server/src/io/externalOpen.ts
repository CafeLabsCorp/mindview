// Builds OS-handled URI schemes so the browser/Electron shell can hand off
// directly to Obsidian/VS Code without the server shelling out.
//
// The shape depends on where the SERVER runs (the shell/browser it talks to
// is on the desktop side of that boundary):
//  - inside WSL: the desktop app is Windows, the vault is a POSIX path in the
//    distro → `\\wsl$\<distro>\…` for Obsidian, Remote-WSL for VS Code;
//  - native Windows / macOS / Linux: the vault path is already what the local
//    apps understand → plain path for Obsidian, `vscode://file/` for VS Code.
import { currentHostPathEnv, type HostPathEnv } from './hostPath.js';

function isWsl(env: HostPathEnv): boolean {
  return env.platform === 'linux' && env.wslDistro !== null;
}

/** \\wsl$\<distro>\home\... form, understood by Windows apps like Obsidian. */
export function toUncPath(absUnixPath: string, distro: string): string {
  return `\\\\wsl$\\${distro}${absUnixPath.replace(/\//g, '\\')}`;
}

export function obsidianUri(absPath: string, env: HostPathEnv = currentHostPathEnv()): string {
  const path = isWsl(env) ? toUncPath(absPath, env.wslDistro as string) : absPath;
  return `obsidian://open?path=${encodeURIComponent(path)}`;
}

/** WSL → vscode-remote form (VS Code Desktop connected to this exact WSL
 * path via Remote-WSL, no translation needed). Elsewhere → `vscode://file/`,
 * with forward slashes so a Windows `C:\x` becomes `C:/x`. */
export function vscodeUri(absPath: string, line?: number, env: HostPathEnv = currentHostPathEnv()): string {
  const suffix = line ? `:${line}` : '';
  if (isWsl(env)) return `vscode://vscode-remote/wsl+${env.wslDistro}${absPath}${suffix}`;
  const slashed = absPath.replace(/\\/g, '/');
  const rooted = slashed.startsWith('/') ? slashed : `/${slashed}`;
  return `vscode://file${encodeURI(rooted)}${suffix}`;
}
