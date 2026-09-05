import { describe, expect, it } from 'vitest';
import { checkTagColorContrast, contrastRatio } from './contrast';

const DARK_FG = '#f2f1ec';
const DARK_BG = '#0d0d0d';
const LIGHT_FG = '#0b0b0b';
const LIGHT_BG = '#f9f9f7';

describe('contrastRatio', () => {
  it('is 1 for identical colors', () => {
    expect(contrastRatio('#3fb950', '#3fb950')).toBeCloseTo(1, 5);
  });

  it('is ~21 for black vs white', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
  });
});

describe('checkTagColorContrast — the guard-rail the design cycle asked for', () => {
  it('flags the default `financeiro` mustard (#8a7226) as failing in the dark theme', () => {
    const result = checkTagColorContrast('#8a7226', DARK_FG, DARK_BG);
    expect(result.passes).toBe(false);
  });

  it('flags the default `financeiro` mustard (#8a7226) as failing in the light theme too', () => {
    const result = checkTagColorContrast('#8a7226', LIGHT_FG, LIGHT_BG);
    expect(result.passes).toBe(false);
  });

  it('passes the accent green (#3fb950) against the dark background', () => {
    const result = checkTagColorContrast('#3fb950', DARK_FG, DARK_BG);
    expect(result.vsBg.passes).toBe(true);
  });
});
