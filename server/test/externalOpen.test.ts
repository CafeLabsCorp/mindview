import { describe, expect, it } from 'vitest';
import { obsidianUri, vscodeUri } from '../src/io/externalOpen.js';
import type { HostPathEnv } from '../src/io/hostPath.js';

const wsl: HostPathEnv = { platform: 'linux', wslDistro: 'Ubuntu' };
const linux: HostPathEnv = { platform: 'linux', wslDistro: null };
const windows: HostPathEnv = { platform: 'win32', wslDistro: null };

describe('externalOpen', () => {
  it('WSL: UNC path for Obsidian and Remote-WSL for VS Code', () => {
    expect(obsidianUri('/home/u/mind/a.md', wsl)).toBe(
      `obsidian://open?path=${encodeURIComponent('\\\\wsl$\\Ubuntu\\home\\u\\mind\\a.md')}`,
    );
    expect(vscodeUri('/home/u/mind/a.md', 3, wsl)).toBe('vscode://vscode-remote/wsl+Ubuntu/home/u/mind/a.md:3');
  });

  it('native Windows: plain drive path, no WSL URI', () => {
    expect(obsidianUri('C:\\Users\\u\\mind\\a.md', windows)).toBe(
      `obsidian://open?path=${encodeURIComponent('C:\\Users\\u\\mind\\a.md')}`,
    );
    expect(vscodeUri('C:\\Users\\u\\mind\\a.md', undefined, windows)).toBe('vscode://file/C:/Users/u/mind/a.md');
    expect(vscodeUri('C:\\My Vault\\a.md', 2, windows)).toBe('vscode://file/C:/My%20Vault/a.md:2');
  });

  it('native Linux/macOS: plain path, vscode://file', () => {
    expect(obsidianUri('/home/u/mind/a.md', linux)).toBe(
      `obsidian://open?path=${encodeURIComponent('/home/u/mind/a.md')}`,
    );
    expect(vscodeUri('/home/u/mind/a.md', undefined, linux)).toBe('vscode://file/home/u/mind/a.md');
  });
});
