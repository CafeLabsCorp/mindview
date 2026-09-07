import { useMemo } from 'react';
import { useSettings } from '../context/SettingsContext';
import { intlTag, makeT, resolveLocale, type Locale, type TFn } from './index';

/** The translator for the locale currently in effect. Re-created only when
 * that locale changes, so it is safe in a dependency array. */
export function useT(): TFn {
  const { settings } = useSettings();
  return useMemo(() => makeT(resolveLocale(settings.language)), [settings.language]);
}

/** For Intl calls (dates, numbers), which need a real BCP 47 tag rather
 * than the bare language the catalogues are keyed by. */
export function useLocale(): { locale: Locale; intl: string } {
  const { settings } = useSettings();
  const locale = resolveLocale(settings.language);
  return { locale, intl: intlTag(locale) };
}
