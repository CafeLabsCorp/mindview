// The vault picker hands the server whatever the OS dialog returned — a
// Windows path on Windows — and the server may be running inside WSL. These
// pin the conversion rules for every shape that can arrive.
import { describe, expect, it } from 'vitest';
import { HostPathError, toDesktopPath, toHostPath, type HostPathEnv } from '../src/io/hostPath.js';

const wsl: HostPathEnv = { platform: 'linux', wslDistro: 'Ubuntu' };
const linux: HostPathEnv = { platform: 'linux', wslDistro: null };
const windows: HostPathEnv = { platform: 'win32', wslDistro: null };

function codeOf(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (err) {
    return err instanceof HostPathError ? err.code : 'not-a-HostPathError';
  }
  return undefined;
}

describe('toHostPath — server inside WSL', () => {
  it('keeps POSIX paths, normalised', () => {
    expect(toHostPath('/home/felip/projetos/mind/', wsl)).toBe('/home/felip/projetos/mind');
    expect(toHostPath('/home/felip/./x/../mind', wsl)).toBe('/home/felip/mind');
  });

  it('maps a drive-letter path onto /mnt, either slash', () => {
    expect(toHostPath('C:\\Users\\felip\\Documents\\mind', wsl)).toBe('/mnt/c/Users/felip/Documents/mind');
    expect(toHostPath('D:/vaults/mind', wsl)).toBe('/mnt/d/vaults/mind');
    expect(toHostPath('C:\\', wsl)).toBe('/mnt/c');
  });

  it('strips the quotes Explorer adds with "Copy as path"', () => {
    expect(toHostPath('"C:\\Users\\felip\\mind"', wsl)).toBe('/mnt/c/Users/felip/mind');
  });

  it('maps \\\\wsl.localhost and \\\\wsl$ paths of the same distro back to POSIX', () => {
    expect(toHostPath('\\\\wsl.localhost\\Ubuntu\\home\\felip\\projetos\\mind', wsl)).toBe('/home/felip/projetos/mind');
    expect(toHostPath('\\\\wsl$\\ubuntu\\home\\felip', wsl)).toBe('/home/felip');
    expect(toHostPath('\\\\wsl.localhost\\Ubuntu', wsl)).toBe('/');
  });

  it('refuses a folder from a different distro, by code', () => {
    expect(codeOf(() => toHostPath('\\\\wsl.localhost\\Debian\\home\\x', wsl))).toBe('otherDistro');
  });

  it('refuses relative paths and non-WSL network shares', () => {
    expect(codeOf(() => toHostPath('mind', wsl))).toBe('notAbsolute');
    expect(codeOf(() => toHostPath('\\\\server\\share\\mind', wsl))).toBe('notAbsolute');
    expect(codeOf(() => toHostPath('   ', wsl))).toBe('empty');
  });

  it('cannot escape through ".." in a converted path', () => {
    expect(toHostPath('\\\\wsl.localhost\\Ubuntu\\..\\..\\etc', wsl)).toBe('/etc');
  });
});

describe('toHostPath — plain Linux/macOS (no WSL)', () => {
  it('does not guess at Windows paths', () => {
    expect(toHostPath('/srv/mind', linux)).toBe('/srv/mind');
    expect(codeOf(() => toHostPath('C:\\Users\\x', linux))).toBe('notAbsolute');
  });
});

describe('toHostPath — native Windows', () => {
  it('accepts drive-letter and UNC paths (including the WSL share)', () => {
    expect(toHostPath('C:\\Users\\amigo\\Documents\\mind\\', windows)).toBe('C:\\Users\\amigo\\Documents\\mind');
    expect(toHostPath('C:/Users/amigo/mind', windows)).toBe('C:\\Users\\amigo\\mind');
    expect(toHostPath('\\\\wsl.localhost\\Ubuntu\\home\\x', windows)).toBe('\\\\wsl.localhost\\Ubuntu\\home\\x');
  });

  it('refuses network and device paths before they can reach the disk (NTLM leak via SMB)', () => {
    expect(codeOf(() => toHostPath('\\\\attacker.example\\share\\mind', windows))).toBe('network');
    expect(codeOf(() => toHostPath('//attacker.example/share', windows))).toBe('network');
    expect(codeOf(() => toHostPath('\\\\?\\UNC\\attacker\\share', windows))).toBe('network');
    expect(codeOf(() => toHostPath('\\\\.\\pipe\\x', windows))).toBe('network');
  });

  it('refuses a ".." distro name on the WSL share instead of trusting normalisation', () => {
    expect(codeOf(() => toHostPath('\\\\wsl.localhost\\..\\attacker\\share', windows))).toBe('network');
  });

  it('refuses drive-relative and POSIX-looking paths — their meaning depends on the cwd', () => {
    expect(codeOf(() => toHostPath('\\Users\\x', windows))).toBe('notAbsolute');
    expect(codeOf(() => toHostPath('/home/x', windows))).toBe('notAbsolute');
    expect(codeOf(() => toHostPath('mind', windows))).toBe('notAbsolute');
  });
});

describe('toDesktopPath — handing a server path to the Windows shell', () => {
  it('maps /mnt/<drive> back to a drive letter', () => {
    expect(toDesktopPath('/mnt/c/Users/felip/mind/cv.pdf', wsl)).toBe('C:\\Users\\felip\\mind\\cv.pdf');
    expect(toDesktopPath('/mnt/d', wsl)).toBe('D:\\');
  });

  it('maps a distro path to the \\\\wsl.localhost share', () => {
    expect(toDesktopPath('/home/felip/projetos/mind/carreira/cv.pdf', wsl)).toBe('\\\\wsl.localhost\\Ubuntu\\home\\felip\\projetos\\mind\\carreira\\cv.pdf');
  });

  it('round-trips with toHostPath', () => {
    for (const p of ['/home/felip/mind/a b.pdf', '/mnt/c/Users/x/y.sh']) {
      expect(toHostPath(toDesktopPath(p, wsl), wsl)).toBe(p);
    }
  });

  it('refuses a Linux name that Windows would re-parse as a different path', () => {
    const sneaky = '/home/felip/mind/x\\..\\..\\..\\mnt\\c\\Users\\me\\y.pdf';
    expect(codeOf(() => toDesktopPath(sneaky, wsl))).toBe('notAbsolute');
    expect(codeOf(() => toDesktopPath('/home/felip/mind/a:b.pdf', wsl))).toBe('notAbsolute');
  });

  it('leaves paths alone when shell and server share the host', () => {
    expect(toDesktopPath('/home/x/a.pdf', linux)).toBe('/home/x/a.pdf');
    expect(toDesktopPath('C:\\a\\b.pdf', windows)).toBe('C:\\a\\b.pdf');
  });
});
