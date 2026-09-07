// The whole i18n engine. Two JSON catalogues and a lookup — no library.
//
// The landings (mind-landing, dindin-landing, …) use next-intl with
// `messages/en.json` + `messages/pt.json` and a `[locale]` route segment.
// MindView is a Vite SPA behind a hash router: there is no route segment
// to hang a locale on, and next-intl is bound to Next. So this keeps the
// part that matters for consistency — the catalogue files, in the same
// place with the same namespaced shape — and drops the part that does not
// transplant.
//
// English is the base language, as in every other repo here: `en.json` is
// the file that must have every key, and anything missing from `pt.json`
// falls back to it rather than rendering a raw key at the user.
import en from '../../messages/en.json';
import pt from '../../messages/pt.json';

export const LOCALES = ['en', 'pt'] as const;
export type Locale = (typeof LOCALES)[number];
/** What the user picked in Ajustes: a locale, or "follow the browser". */
export type LanguagePref = 'auto' | Locale;

/** BCP 47 tags for Intl (dates, numbers) — the catalogues are keyed by the
 * bare language, but `toLocaleDateString` wants a real tag. */
const INTL_TAG: Record<Locale, string> = { en: 'en-US', pt: 'pt-BR' };

interface Plural {
  one: string;
  other: string;
}
type Entry = string | Plural | { [key: string]: Entry };

const CATALOGS: Record<Locale, Entry> = { en, pt };

/** Dotted paths into en.json, so a typo in a key is a type error rather
 * than a string that quietly renders itself. A plural entry ends the path:
 * `console.badgeOpen`, never `console.badgeOpen.one`. */
type Keys<T> = T extends string
  ? never
  : T extends Plural
    ? never
    : {
        [K in keyof T & string]: T[K] extends string ? K : T[K] extends Plural ? K : `${K}.${Keys<T[K]>}`;
      }[keyof T & string];

export type MessageKey = Keys<typeof en>;

export type Vars = Record<string, string | number>;
export type TFn = (key: MessageKey, vars?: Vars) => string;

function isPlural(entry: Entry): entry is Plural {
  return typeof entry === 'object' && typeof (entry as Plural).other === 'string';
}

function lookup(catalog: Entry, key: string): Entry | undefined {
  let node: Entry | undefined = catalog;
  for (const part of key.split('.')) {
    if (node === undefined || typeof node === 'string' || isPlural(node)) return undefined;
    node = node[part];
  }
  return node;
}

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
}

/**
 * Reads the browser's preference. Only the primary subtag matters: pt-BR
 * and pt-PT are both `pt` here, and anything the app does not carry falls
 * through to English rather than to the first vaguely-related match.
 */
export function detectLocale(): Locale {
  const wanted = typeof navigator === 'undefined' ? [] : (navigator.languages ?? [navigator.language]);
  for (const tag of wanted) {
    const primary = tag.toLowerCase().split('-')[0];
    const hit = LOCALES.find((l) => l === primary);
    if (hit) return hit;
  }
  return 'en';
}

export function resolveLocale(pref: LanguagePref | undefined): Locale {
  if (pref === 'en' || pref === 'pt') return pref;
  return detectLocale();
}

export function intlTag(locale: Locale): string {
  return INTL_TAG[locale];
}

export function translate(locale: Locale, key: MessageKey, vars?: Vars): string {
  const entry = lookup(CATALOGS[locale], key) ?? lookup(CATALOGS.en, key);
  if (entry === undefined) {
    if (import.meta.env.DEV) console.warn(`[i18n] missing key: ${key}`);
    return key;
  }
  if (typeof entry === 'string') return interpolate(entry, vars);
  if (isPlural(entry)) return interpolate(Number(vars?.count) === 1 ? entry.one : entry.other, vars);
  if (import.meta.env.DEV) console.warn(`[i18n] key points at a group, not a message: ${key}`);
  return key;
}

/** For call sites with no React context to read — main.tsx's pre-boot
 * screen renders before <SettingsProvider> exists. */
export function makeT(locale: Locale): TFn {
  return (key, vars) => translate(locale, key, vars);
}
