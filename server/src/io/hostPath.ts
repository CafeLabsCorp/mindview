import { posix, win32 } from 'node:path';

// Turns a folder path the user typed or picked into one this server process
// can open. The desktop shell hands over whatever the OS dialog returned —
// always a Windows path on Windows — but in WSL mode the server runs inside
// the distro and only understands POSIX paths. This is the one place that
// crosses that boundary, so the shell and the web UI stay dumb about it.

export interface HostPathEnv {
  platform: NodeJS.Platform;
  /** $WSL_DISTRO_NAME when the server runs inside WSL, else null. */
  wslDistro: string | null;
}

/** `code` is what the web UI translates; `message` is the English fallback. */
export type HostPathErrorCode = 'empty' | 'notAbsolute' | 'otherDistro' | 'network';

export class HostPathError extends Error {
  constructor(
    public readonly code: HostPathErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export function currentHostPathEnv(): HostPathEnv {
  return { platform: process.platform, wslDistro: process.env.WSL_DISTRO_NAME || null };
}

// C:\a\b or C:/a/b
const DRIVE = /^([A-Za-z]):[\\/](.*)$/;
// \\wsl$\Ubuntu\home\... or \\wsl.localhost\Ubuntu\home\... (either slash)
// (a distro name of "." or ".." is never valid — refused, not normalised)
const WSL_UNC = /^[\\/]{2}(?:wsl\$|wsl\.localhost)[\\/](?!\.{1,2}(?:[\\/]|$))([^\\/]+)(?:[\\/](.*))?$/i;

/** Returns an absolute, normalised path for this host, or throws
 * HostPathError. Existence is the caller's check — this only fixes the shape. */
export function toHostPath(input: string, env: HostPathEnv = currentHostPathEnv()): string {
  const raw = input.trim().replace(/^"(.*)"$/, '$1'); // Explorer's "Copy as path" wraps in quotes
  if (!raw) throw new HostPathError('empty', 'vaultPath is empty');

  if (env.platform === 'win32') {
    // Local drive letters, plus the WSL share (served by the local 9P
    // redirector, not SMB). Any other UNC or device path (\\host\share,
    // \\?\UNC\…, \\.\pipe\…) is refused BEFORE anything touches the
    // disk: a stat on \\attacker\share makes Windows open an SMB session
    // with the user's credentials and leak their NTLM hash. A real network
    // vault still works by mapping it to a drive letter (Z:) in Explorer.
    if (DRIVE.test(raw)) return win32.resolve(raw);
    if (WSL_UNC.test(raw)) {
      // Re-check after normalising: ".." must not climb out of the WSL
      // server name into some other host.
      const resolved = win32.resolve(raw);
      if (WSL_UNC.test(resolved)) return resolved;
    }
    if (/^[\\/]{2}/.test(raw)) throw new HostPathError('network', `network paths are not accepted: ${raw}`);
    throw new HostPathError('notAbsolute', `not an absolute path: ${raw}`);
  }

  if (raw.startsWith('/') && !raw.startsWith('//')) return posix.resolve(raw);

  if (env.wslDistro) {
    const drive = DRIVE.exec(raw);
    if (drive) {
      // Assumes the default automount root (/mnt). A custom one in
      // /etc/wsl.conf just fails the caller's existence check.
      return posix.resolve(`/mnt/${drive[1].toLowerCase()}`, drive[2].replace(/\\/g, '/'));
    }
    const unc = WSL_UNC.exec(raw);
    if (unc) {
      if (unc[1].toLowerCase() !== env.wslDistro.toLowerCase()) {
        throw new HostPathError('otherDistro', `path is in WSL distro "${unc[1]}", server runs in "${env.wslDistro}"`);
      }
      return posix.resolve('/', (unc[2] ?? '').replace(/\\/g, '/'));
    }
  }

  throw new HostPathError('notAbsolute', `not an absolute path: ${raw}`);
}

/** The other direction: an absolute path on this server's host, turned into
 * one the DESKTOP shell can hand to the OS (shell.openPath / "show in
 * folder"). The shell always runs on Windows when the server runs in WSL:
 * /mnt/c/x becomes C:\x, anything else \\wsl.localhost\<distro>\...
 * Outside WSL the shell and server share the host: returned as is. */
export function toDesktopPath(absHostPath: string, env: HostPathEnv = currentHostPathEnv()): string {
  if (env.platform === 'win32' || !env.wslDistro) return absHostPath;
  // A Linux file name may contain \ or : — one file inside the vault named
  // `x\..\..\mnt\c\…\y.pdf` would become a path Windows normalises
  // somewhere else entirely. Such a name has no faithful Windows form.
  if (/[\\:*?"<>|\x00-\x1f]/.test(absHostPath)) {
    throw new HostPathError('notAbsolute', 'path has characters Windows cannot represent');
  }
  const mnt = /^\/mnt\/([a-z])(?:\/(.*))?$/.exec(absHostPath);
  if (mnt) return `${mnt[1].toUpperCase()}:\\${(mnt[2] ?? '').replace(/\//g, '\\')}`;
  return `\\\\wsl.localhost\\${env.wslDistro}${absHostPath.replace(/\//g, '\\')}`;
}
