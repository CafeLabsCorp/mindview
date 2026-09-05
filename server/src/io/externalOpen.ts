// Builds OS-handled URI schemes so the browser (running on Windows) can
// hand off directly to Obsidian/VS Code without the server shelling out —
// `code -g` would need to cross the WSL/Windows boundary, which is exactly
// the kind of fragile process-spawning this avoids.

function distroName(): string {
  return process.env.WSL_DISTRO_NAME || 'Ubuntu';
}

/** \\wsl$\<distro>\home\... form, understood by Windows apps like Obsidian. */
export function toUncPath(absUnixPath: string): string {
  return `\\\\wsl$\\${distroName()}${absUnixPath.replace(/\//g, '\\')}`;
}

export function obsidianUri(absUnixPath: string): string {
  return `obsidian://open?path=${encodeURIComponent(toUncPath(absUnixPath))}`;
}

/** vscode-remote WSL form — opens VS Code Desktop connected to this exact
 * WSL path via the Remote-WSL extension, no path translation needed. */
export function vscodeUri(absUnixPath: string, line?: number): string {
  const suffix = line ? `:${line}` : '';
  return `vscode://vscode-remote/wsl+${distroName()}${absUnixPath}${suffix}`;
}
