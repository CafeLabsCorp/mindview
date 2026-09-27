// The fence between the vault and the rest of the disk. Every path derived
// from a link or a query goes through confine(), so each escape route gets
// pinned here — including the ones only reachable through symlinks.
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { confine, isInsideRoot, OutsideRootError } from '../src/io/confine.js';

let base: string;
let vault: string;
let outside: string;

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), 'mv-confine-'));
  vault = join(base, 'vault');
  outside = join(base, 'outside');
  mkdirSync(join(vault, 'notes'), { recursive: true });
  mkdirSync(outside);
  writeFileSync(join(vault, 'notes', 'a.md'), '# a');
  writeFileSync(join(outside, 'secret.md'), 'secret');
  symlinkSync(outside, join(vault, 'escape')); // a symlink inside the vault pointing out
  symlinkSync(vault, join(base, 'vault-link')); // the vault itself reached through a symlink
});

afterAll(() => rmSync(base, { recursive: true, force: true }));

describe('confine', () => {
  it('resolves relative paths inside the vault', () => {
    expect(confine(vault, 'notes/a.md')).toBe(join(vault, 'notes', 'a.md'));
    expect(confine(vault, '')).toBe(vault);
  });

  it('accepts absolute paths inside the vault', () => {
    expect(confine(vault, join(vault, 'notes', 'a.md'))).toBe(join(vault, 'notes', 'a.md'));
  });

  it('refuses .. traversal and absolute paths outside', () => {
    expect(() => confine(vault, '../outside/secret.md')).toThrow(OutsideRootError);
    expect(() => confine(vault, join(outside, 'secret.md'))).toThrow(OutsideRootError);
    expect(() => confine(vault, '/etc/passwd')).toThrow(OutsideRootError);
  });

  it('refuses a sibling whose name merely starts with the vault name', () => {
    mkdirSync(join(base, 'vault-evil'), { recursive: true });
    expect(isInsideRoot(vault, join(base, 'vault-evil'))).toBe(false);
  });

  it('refuses an existing file reached through a symlink that points out', () => {
    expect(() => confine(vault, 'escape/secret.md')).toThrow(OutsideRootError);
  });

  it('refuses a NOT-yet-existing file under a symlink that points out', () => {
    expect(() => confine(vault, 'escape/new-file.md')).toThrow(OutsideRootError);
    expect(() => confine(vault, 'escape/deep/er/new.md')).toThrow(OutsideRootError);
  });

  it('still allows a not-yet-existing file inside the vault', () => {
    expect(confine(vault, 'notes/new.md')).toBe(join(vault, 'notes', 'new.md'));
  });

  it('works when the vault root itself is a symlink, with either spelling of the path', () => {
    const linked = join(base, 'vault-link');
    expect(confine(linked, 'notes/a.md')).toBe(join(vault, 'notes', 'a.md'));
    expect(confine(linked, join(linked, 'notes', 'a.md'))).toBe(join(vault, 'notes', 'a.md'));
    expect(confine(linked, join(vault, 'notes', 'a.md'))).toBe(join(vault, 'notes', 'a.md'));
    expect(() => confine(linked, '../outside/secret.md')).toThrow(OutsideRootError);
  });
});
