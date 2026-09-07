import { useRef, useState } from 'react';
import { TerminalChrome } from '../components/TerminalChrome';
import { useSettings, FALLBACK_SETTINGS } from '../context/SettingsContext';
import { useApi } from '../hooks/useApi';
import { useBumpAppState } from '../context/AppStateEvents';
import { api, ApiError } from '../api/client';
import type { ConfigResponse, TerminalShellsResponse } from '../api/types';
import { checkTagColorContrast } from '../lib/contrast';
import { useThemeColors } from '../lib/useThemeColors';
import { useT } from '../i18n/useT';
import { LOCALES, type MessageKey, type TFn } from '../i18n';

/** Two of the four names are real product names and stay untranslated;
 * only the two descriptive ones carry a key. */
const READ_FONTS: { label: MessageKey | null; literal?: string; value: string }[] = [
  { label: 'settings.fontInter', value: "'Inter',system-ui,sans-serif" },
  { label: null, literal: 'Space Grotesk', value: "'Space Grotesk',system-ui,sans-serif" },
  { label: null, literal: 'JetBrains Mono', value: "'JetBrains Mono',ui-monospace,monospace" },
  { label: 'settings.fontSystem', value: 'system-ui,sans-serif' },
];

/** Endonyms: a language is always listed in its own language, so someone
 * who cannot read the current UI can still find theirs. */
const LANGUAGE_NAMES: Record<(typeof LOCALES)[number], string> = { en: 'English', pt: 'Português' };

const fontLabel = (t: TFn, f: (typeof READ_FONTS)[number]) => (f.label ? t(f.label) : f.literal!);

/** A fixed set of knobs, deliberately not arbitrary CSS/snippets/3rd-party
 * themes (that's an explicit MVP exclusion) — see the task brief's
 * "Escopo de customização". Everything here round-trips through
 * server/src/app/houseA.ts's settings.yaml (Casa A). */
export function SettingsScreen() {
  const { settings, update } = useSettings();
  const { fg, bg } = useThemeColors();
  const t = useT();

  return (
    <>
      <TerminalChrome path={t('chrome.settings')} />
      <div className="settings-screen">
        <section className="settings-group">
          <div className="settings-group-head">
            <h3>{t('settings.appearance')}</h3>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => update({ accent: FALLBACK_SETTINGS.accent, linkColorOverride: FALLBACK_SETTINGS.linkColorOverride, theme: FALLBACK_SETTINGS.theme })}
            >
              {t('common.restoreDefaults')}
            </button>
          </div>
          <div className="settings-row">
            <div>
              <label>{t('settings.accent')}</label>
              <span className="hint">{t('settings.accentHint')}</span>
            </div>
            <input type="color" value={settings.accent} onChange={(e) => update({ accent: e.target.value })} />
          </div>
          <div className="settings-row">
            <div>
              <label>{t('settings.linkColor')}</label>
              <span className="hint">{t('settings.linkColorHint')}</span>
            </div>
            <input
              type="color"
              value={settings.linkColorOverride ?? settings.accent}
              onChange={(e) => update({ linkColorOverride: e.target.value })}
            />
          </div>
          <div className="settings-row">
            <label>{t('settings.theme')}</label>
            <select className="text-input" value={settings.theme} onChange={(e) => update({ theme: e.target.value as typeof settings.theme })}>
              <option value="dark">{t('settings.themeDark')}</option>
              <option value="light">{t('settings.themeLight')}</option>
              <option value="system">{t('settings.themeSystem')}</option>
            </select>
          </div>
          <div className="settings-row">
            <div>
              <label>{t('settings.language')}</label>
              <span className="hint">{t('settings.languageHint')}</span>
            </div>
            <select
              className="text-input"
              value={settings.language}
              onChange={(e) => update({ language: e.target.value as typeof settings.language })}
            >
              <option value="auto">{t('settings.languageAuto')}</option>
              {LOCALES.map((l) => (
                <option key={l} value={l}>
                  {LANGUAGE_NAMES[l]}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="settings-group">
          <div className="settings-group-head">
            <h3>{t('settings.typography')}</h3>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() =>
                update({
                  bodyFont: FALLBACK_SETTINGS.bodyFont,
                  readSize: FALLBACK_SETTINGS.readSize,
                  colWidth: FALLBACK_SETTINGS.colWidth,
                  lineHeight: FALLBACK_SETTINGS.lineHeight,
                })
              }
            >
              {t('common.restoreDefaults')}
            </button>
          </div>
          <span className="hint" style={{ display: 'block', marginBottom: 10 }}>
            {t('settings.typographyHint')}
          </span>
          <div className="settings-row">
            <label>{t('settings.font')}</label>
            <select className="text-input" value={settings.bodyFont} onChange={(e) => update({ bodyFont: e.target.value })}>
              {READ_FONTS.map((f) => (
                <option key={f.value} value={f.value}>
                  {fontLabel(t, f)}
                </option>
              ))}
            </select>
          </div>
          <div className="settings-row">
            <label>{t('settings.size', { value: settings.readSize })}</label>
            <input
              type="range"
              min={13}
              max={20}
              step={0.5}
              value={settings.readSize}
              onChange={(e) => update({ readSize: Number(e.target.value) })}
            />
          </div>
          <div className="settings-row">
            <label>{t('settings.colWidth', { value: settings.colWidth })}</label>
            <input
              type="range"
              min={480}
              max={960}
              step={20}
              value={settings.colWidth}
              onChange={(e) => update({ colWidth: Number(e.target.value) })}
            />
          </div>
          <div className="settings-row">
            <label>{t('settings.lineHeight', { value: settings.lineHeight.toFixed(2) })}</label>
            <input
              type="range"
              min={1.3}
              max={2.2}
              step={0.05}
              value={settings.lineHeight}
              onChange={(e) => update({ lineHeight: Number(e.target.value) })}
            />
          </div>
        </section>

        <section className="settings-group">
          <h3>{t('settings.tagColors')}</h3>
          <span className="hint" style={{ display: 'block', marginBottom: 10 }}>
            {t('settings.tagColorsHint')}
          </span>
          <div className="tag-color-grid">
            {Object.entries(settings.tagColors).map(([tag, color]) => {
              const contrast = checkTagColorContrast(color, fg, bg);
              // Pills only ever render this color as text over the app
              // background — see TagPill's note — so vsBg is the check
              // that maps to a real defect; vsFg stays in the tooltip.
              return (
                <div key={tag} className="tag-color-row">
                  <input type="color" value={color} onChange={(e) => update({ tagColors: { [tag]: e.target.value } })} />
                  <span>#{tag}</span>
                  {!contrast.vsBg.passes && (
                    <span
                      className="contrast-flag"
                      title={t('settings.contrastTitle', {
                        bg: contrast.vsBg.ratio.toFixed(2),
                        fg: contrast.vsFg.ratio.toFixed(2),
                      })}
                    >
                      {t('settings.lowContrast')}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="settings-group">
          <h3>{t('settings.options')}</h3>
          <ToggleRow
            label={t('settings.frontmatterPretty')}
            hint={t('settings.frontmatterPrettyHint')}
            checked={settings.frontmatterPretty}
            onChange={(v) => update({ frontmatterPretty: v })}
          />
          <ToggleRow label={t('settings.tocEnabled')} checked={settings.tocEnabled} onChange={(v) => update({ tocEnabled: v })} />
          <ToggleRow
            label={t('settings.recentPinned')}
            checked={settings.recentPinnedEnabled}
            onChange={(v) => update({ recentPinnedEnabled: v })}
          />
        </section>

        <TerminalSection />
        <BackupSection />
        <VaultPathSection />
      </div>
    </>
  );
}

/** Local-only storage has no repo/versioning behind it (decisão 2026-09-05
 * — ver mind/tarefas/empresa/mindview.md, "Onde vive o estado do MV"), so
 * this is the only durability story for cadernos/tema/tags/fixados: same
 * shape as the Dindin app's backup ("Exportar backup" / "Importar backup",
 * um `.json`, import é replace-all com confirmação). */
/** The shell is deliberately not hardcoded: the vault owner runs WSL, but
 * anyone cloning this repo may be on PowerShell, cmd, zsh or fish. The
 * dropdown lists only what really exists on this machine (server-side
 * detection, app/shells.ts) and the free-text field covers the rest. */
function TerminalSection() {
  const { settings, update } = useSettings();
  const t = useT();
  const { data: shells } = useApi<TerminalShellsResponse>('/terminal/shells');
  const [shellDraft, setShellDraft] = useState<string | null>(null);
  const [cwdDraft, setCwdDraft] = useState<string | null>(null);
  const [startupDraft, setStartupDraft] = useState<string | null>(null);

  const shellValue = shellDraft ?? settings.terminalShell;
  const cwdValue = cwdDraft ?? settings.terminalCwd;
  const startupValue = startupDraft ?? settings.terminalStartupCommand;

  const pickPreset = (command: string) => {
    const preset = shells?.shells.find((s) => s.command === command);
    setShellDraft(null);
    update({ terminalShell: command, terminalShellArgs: preset?.args ?? [] });
  };

  return (
    <section className="settings-group">
      <div className="settings-group-head">
        <h3>{t('settings.terminal')}</h3>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            setShellDraft(null);
            setCwdDraft(null);
            setStartupDraft(null);
            update({
              terminalShell: FALLBACK_SETTINGS.terminalShell,
              terminalShellArgs: FALLBACK_SETTINGS.terminalShellArgs,
              terminalCwd: FALLBACK_SETTINGS.terminalCwd,
              terminalStartupCommand: FALLBACK_SETTINGS.terminalStartupCommand,
              terminalMode: FALLBACK_SETTINGS.terminalMode,
              terminalFontSize: FALLBACK_SETTINGS.terminalFontSize,
            });
          }}
        >
          {t('common.restoreDefaults')}
        </button>
      </div>
      <ToggleRow
        label={t('settings.terminalEnabled')}
        hint={t('settings.terminalEnabledHint')}
        checked={settings.terminalEnabled}
        onChange={(v) => update({ terminalEnabled: v })}
      />
      {settings.terminalEnabled && (
        <>
          <div className="settings-row">
            <div>
              <label>{t('settings.shell')}</label>
              <span className="hint">
                {shells ? t('settings.shellHint', { platform: shells.platform }) : t('settings.shellDetecting')}
              </span>
            </div>
            <select className="text-input" value={shells?.shells.some((s) => s.command === settings.terminalShell) ? settings.terminalShell : ''} onChange={(e) => pickPreset(e.target.value)}>
              <option value="">
                {t('settings.shellMachineDefault')}
                {shells ? ` (${shells.effective.shell})` : ''}
              </option>
              {shells?.shells.map((s) => (
                <option key={s.command} value={s.command}>
                  {s.label} — {s.command}
                </option>
              ))}
            </select>
          </div>
          <div className="settings-row">
            <div>
              <label>{t('settings.shellPath')}</label>
              <span className="hint">{t('settings.shellPathHint')}</span>
            </div>
            <input
              className="text-input"
              style={{ flex: 1 }}
              placeholder={shells?.effective.shell ?? '/bin/bash'}
              value={shellValue}
              onChange={(e) => setShellDraft(e.target.value)}
              onBlur={() => {
                if (shellDraft !== null) update({ terminalShell: shellDraft.trim() });
                setShellDraft(null);
              }}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />
          </div>
          <div className="settings-row">
            <div>
              <label>{t('settings.cwd')}</label>
              <span className="hint">
                {t('settings.cwdHint')}
                {shells ? ` (${shells.effective.cwd})` : ''}
              </span>
            </div>
            <input
              className="text-input"
              style={{ flex: 1 }}
              placeholder={shells?.effective.cwd ?? ''}
              value={cwdValue}
              onChange={(e) => setCwdDraft(e.target.value)}
              onBlur={() => {
                if (cwdDraft !== null) update({ terminalCwd: cwdDraft.trim() });
                setCwdDraft(null);
              }}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />
          </div>
          <div className="settings-row">
            <div>
              <label>{t('settings.mode')}</label>
              <span className="hint">
                {settings.terminalMode === 'command' ? t('settings.modeCommandHint') : t('settings.modeShellHint')}
              </span>
            </div>
            <select
              className="text-input"
              value={settings.terminalMode}
              onChange={(e) => update({ terminalMode: e.target.value as 'command' | 'shell' })}
            >
              <option value="command">{t('settings.modeCommand')}</option>
              <option value="shell">{t('settings.modeShell')}</option>
            </select>
          </div>
          <div className="settings-row">
            <div>
              <label>{t('settings.startupCommand')}</label>
              <span className="hint">
                {settings.terminalMode === 'command'
                  ? t('settings.startupCommandHintCommand')
                  : t('settings.startupCommandHintShell')}
              </span>
            </div>
            <input
              className="text-input"
              style={{ flex: 1 }}
              placeholder="claude"
              value={startupValue}
              onChange={(e) => setStartupDraft(e.target.value)}
              onBlur={() => {
                if (startupDraft !== null) update({ terminalStartupCommand: startupDraft.trim() });
                setStartupDraft(null);
              }}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />
          </div>
          <div className="settings-row">
            <label>{t('settings.fontSize')}</label>
            <input
              type="range"
              min={10}
              max={20}
              step={0.5}
              value={settings.terminalFontSize}
              onChange={(e) => update({ terminalFontSize: Number(e.target.value) })}
            />
            <span className="mono">{settings.terminalFontSize}px</span>
          </div>
        </>
      )}
    </section>
  );
}

function BackupSection() {
  const { reload: reloadSettings } = useSettings();
  const t = useT();
  const bumpAppState = useBumpAppState();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const handleImportFile = async (file: File) => {
    setMessage(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      setMessage({ kind: 'error', text: t('settings.backupBadJson') });
      return;
    }
    if (!window.confirm(t('settings.backupConfirm'))) {
      return;
    }
    setImporting(true);
    try {
      const result = await api.post<{ notebookCount: number }>('/backup/import', parsed);
      await reloadSettings();
      bumpAppState(); // refetches every open '/notebooks' and '/state' call
      setMessage({ kind: 'ok', text: t('settings.backupImported', { count: result.notebookCount }) });
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof ApiError ? err.message : String(err) });
    } finally {
      setImporting(false);
    }
  };

  return (
    <section className="settings-group">
      <h3>{t('settings.backup')}</h3>
      <span className="hint" style={{ display: 'block', marginBottom: 10 }}>
        {t('settings.backupHint')}
      </span>
      <div className="settings-row" style={{ justifyContent: 'flex-start', gap: 10 }}>
        <a className="btn btn-primary" href={api.rawUrl('/backup/export')} download="mindview-backup.json">
          {t('settings.backupExport')}
        </a>
        <button className="btn btn-ghost" disabled={importing} onClick={() => fileInputRef.current?.click()}>
          {importing ? t('settings.backupImporting') : t('settings.backupImport')}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = ''; // allow re-selecting the same file next time
            if (file) handleImportFile(file);
          }}
        />
      </div>
      {message && <div className={message.kind === 'error' ? 'error-banner' : 'hint'}>{message.text}</div>}
    </section>
  );
}

/** Takes already-translated strings: every call site has a `t` in scope,
 * and passing keys instead would make the component guess the namespace. */
function ToggleRow({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="settings-row">
      <div>
        <label>{label}</label>
        {hint && <span className="hint">{hint}</span>}
      </div>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </div>
  );
}

function VaultPathSection() {
  const { data: config, refetch } = useApi<ConfigResponse>('/config');
  const t = useT();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const apply = async (path: string) => {
    setSaving(true);
    setError(null);
    try {
      await api.put('/config', { vaultPath: path });
      refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="settings-group">
      <h3>{t('settings.vault')}</h3>
      <span className="hint" style={{ display: 'block', marginBottom: 10 }}>
        {t('settings.vaultHint')}
      </span>
      <div className="settings-row">
        <span className="mono" style={{ fontSize: 12.5 }}>
          {t('settings.vaultCurrent')} {config?.vaultPath ?? '…'}
        </span>
      </div>
      <div className="settings-row">
        <input
          className="text-input"
          style={{ flex: 1 }}
          placeholder={t('settings.vaultPlaceholder')}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && value.trim() && apply(value.trim())}
        />
        <button className="btn btn-primary" disabled={!value.trim() || saving} onClick={() => apply(value.trim())}>
          {t('settings.vaultSwitch')}
        </button>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {config && config.recentVaultPaths.length > 0 && (
        <>
          <div className="sidebar-section-label" style={{ padding: '10px 0 4px' }}>
            {t('settings.vaultRecent')}
          </div>
          <div className="quick-list" style={{ padding: 0 }}>
            {config.recentVaultPaths.map((p) => (
              <button key={p} className="quick-list-item" onClick={() => apply(p)}>
                {p}
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
