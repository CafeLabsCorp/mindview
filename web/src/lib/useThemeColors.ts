import { useEffect, useState } from 'react';
import { useSettings } from '../context/SettingsContext';

function readColors(): { fg: string; bg: string } {
  const style = getComputedStyle(document.documentElement);
  return { fg: style.getPropertyValue('--fg').trim(), bg: style.getPropertyValue('--bg').trim() };
}

/** Resolves the *actual* active --fg/--bg (accounting for theme='system'
 * following the OS) so the contrast guard-rail (lib/contrast.ts) checks
 * against what's really on screen, not just the settings value. */
export function useThemeColors(): { fg: string; bg: string } {
  const { settings } = useSettings();
  const [colors, setColors] = useState(readColors);

  useEffect(() => {
    setColors(readColors());
    if (settings.theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setColors(readColors());
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, [settings.theme]);

  return colors;
}
