import { describe, expect, it } from 'vitest';
import { parseHash } from './hashRoute';

describe('hash route', () => {
  it('opens on the Graph when there is no hash (the app just opened)', () => {
    expect(parseHash('')).toEqual({ screen: 'grafo', param: null });
    expect(parseHash('#')).toEqual({ screen: 'grafo', param: null });
    expect(parseHash('#/')).toEqual({ screen: 'grafo', param: null });
  });

  it('keeps an explicit hash, e.g. after a reload', () => {
    expect(parseHash('#/read/notas%2Fa.md')).toEqual({ screen: 'read', param: 'notas/a.md' });
    expect(parseHash('#/ajustes')).toEqual({ screen: 'ajustes', param: null });
  });

  it('sends an unknown screen to the reader, as before', () => {
    expect(parseHash('#/nope')).toEqual({ screen: 'read', param: null });
  });
});
