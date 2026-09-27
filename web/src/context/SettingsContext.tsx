import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { api } from '../api/client';
import type { Settings, SettingsPatch } from '../api/types';
import { resolveLocale } from '../i18n';

export const FALLBACK_SETTINGS: Settings = {
  accent: '#3fb950',
  theme: 'dark',
  language: 'auto',
  linkColorOverride: null,
  bodyFont: "'Inter',system-ui,sans-serif",
  readSize: 15.5,
  colWidth: 680,
  lineHeight: 1.75,
  tagColors: {},
  extColors: {},
  frontmatterPretty: true,
  tocEnabled: true,
  recentPinnedEnabled: true,
  terminalEnabled: false,
  terminalShell: '',
  terminalShellArgs: [],
  terminalCwd: '',
  terminalStartupCommand: 'claude',
  terminalMode: 'command',
  terminalFontSize: 13,
};

interface SettingsContextValue {
  settings: Settings;
  loaded: boolean;
  update: (patch: SettingsPatch) => Promise<void>;
  /** Re-fetches from the server without diffing a patch in — needed after a
   * backup import, which replaces settings.yaml outside the normal
   * `update()` path. */
  reload: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

function applyThemeToDom(theme: Settings['theme']): void {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
}

function applyLanguageToDom(pref: Settings['language']): void {
  // Screen readers and the browser's own spell-check/hyphenation read this,
  // and it is the only place the resolved locale is visible outside React.
  document.documentElement.lang = resolveLocale(pref);
}

function applyTokensToDom(settings: Settings): void {
  const root = document.documentElement.style;
  root.setProperty('--accent', settings.accent);
  root.setProperty('--link-color', settings.linkColorOverride ?? settings.accent);
  // Reading-only typography — never applied to chrome (sidebar, terminal
  // bar, nav), which stays fixed Inter/JetBrains Mono. See src/styles/
  // global.css: only `.prose` reads these variables.
  root.setProperty('--read-font', settings.bodyFont);
  root.setProperty('--read-size', `${settings.readSize}px`);
  root.setProperty('--read-col', `${settings.colWidth}px`);
  root.setProperty('--read-line-height', String(settings.lineHeight));
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(FALLBACK_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  // Only the newest PUT's answer may land: an older one arriving late would
  // repaint a value the user has already moved past.
  const latestUpdate = useRef(0);

  useEffect(() => {
    let cancelled = false;
    api
      .get<Settings>('/settings')
      .then((s) => {
        if (!cancelled) {
          setSettings(s);
          setLoaded(true);
        }
      })
      .catch((err) => console.error('[settings] failed to load, using fallback defaults:', err));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    applyThemeToDom(settings.theme);
    applyLanguageToDom(settings.language);
    applyTokensToDom(settings);
  }, [settings]);

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      loaded,
      update: async (patch) => {
        const merge = (current: Record<string, string>, p: Record<string, string | null> | undefined) => {
          const next = { ...current };
          for (const [k, color] of Object.entries(p ?? {})) {
            if (color === null) delete next[k];
            else next[k] = color;
          }
          return next;
        };
        // Merged onto the CURRENT state, not the `settings` this closure
        // captured — two quick updates must not undo each other.
        setSettings((cur) => ({
          ...cur,
          ...patch,
          tagColors: merge(cur.tagColors, patch.tagColors),
          extColors: merge(cur.extColors, patch.extColors),
        })); // instant UI feedback
        const mine = ++latestUpdate.current;
        const saved = await api.put<Settings>('/settings', patch);
        if (mine === latestUpdate.current) setSettings(saved); // reconcile with what the server persisted
      },
      reload: async () => {
        setSettings(await api.get<Settings>('/settings'));
      },
    }),
    [settings, loaded],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside <SettingsProvider>');
  return ctx;
}
