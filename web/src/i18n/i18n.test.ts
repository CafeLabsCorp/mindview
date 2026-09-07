import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import pt from '../../messages/pt.json';
import { makeT, translate, type MessageKey } from './index';

type Entry = string | { one: string; other: string } | { [k: string]: Entry };

/** Every leaf, as a dotted path — a plural entry counts as one leaf. */
function leaves(entry: Entry, prefix = ''): string[] {
  if (typeof entry === 'string') return [prefix];
  if (typeof (entry as { other?: unknown }).other === 'string') return [prefix];
  return Object.entries(entry as { [k: string]: Entry }).flatMap(([k, v]) =>
    leaves(v, prefix ? `${prefix}.${k}` : k),
  );
}

describe('the catalogues', () => {
  it('carry exactly the same keys on both sides', () => {
    // en.json is the base language: a key here and not there would render
    // English inside a Portuguese UI, silently.
    expect(leaves(pt as Entry).sort()).toEqual(leaves(en as Entry).sort());
  });

  it('have no empty message', () => {
    for (const catalog of [en, pt] as Entry[]) {
      for (const key of leaves(catalog)) {
        expect(translate('en', key as MessageKey).length).toBeGreaterThan(0);
      }
    }
  });

  it('agree on which placeholders each message uses', () => {
    // A {count} that exists in one language and not the other is a bug that
    // only shows up in the language nobody is testing in.
    const holders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of leaves(en as Entry)) {
      expect(holders(translate('pt', key as MessageKey))).toEqual(holders(translate('en', key as MessageKey)));
    }
  });
});

describe('translate', () => {
  const t = makeT('pt');

  it('fills placeholders', () => {
    expect(t('graph.counts', { nodes: 141, edges: 438 })).toBe('141 nós · 438 arestas');
  });

  it('picks the singular only for exactly one', () => {
    expect(t('graph.degree', { count: 1 })).toBe('1 conexão');
    expect(t('graph.degree', { count: 2 })).toBe('2 conexões');
    expect(t('graph.degree', { count: 0 })).toBe('0 conexões');
  });

  it('falls back to English rather than showing a raw key', () => {
    const partial = 'settings.vaultSwitch' as MessageKey;
    expect(translate('pt', partial)).toBe('trocar');
    expect(translate('en', partial)).toBe('switch');
  });

  it('leaves an unknown placeholder untouched instead of printing undefined', () => {
    expect(t('graph.counts', { nodes: 3 })).toBe('3 nós · {edges} arestas');
  });
});
