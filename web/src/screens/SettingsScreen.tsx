import { useRef, useState } from 'react';
import { TerminalChrome } from '../components/TerminalChrome';
import { useSettings, FALLBACK_SETTINGS } from '../context/SettingsContext';
import { useApi } from '../hooks/useApi';
import { useBumpAppState } from '../context/AppStateEvents';
import { api, ApiError } from '../api/client';
import type { ConfigResponse } from '../api/types';
import { checkTagColorContrast } from '../lib/contrast';
import { useThemeColors } from '../lib/useThemeColors';

const READ_FONTS = [
  { label: 'Inter (padrão)', value: "'Inter',system-ui,sans-serif" },
  { label: 'Space Grotesk', value: "'Space Grotesk',system-ui,sans-serif" },
  { label: 'JetBrains Mono', value: "'JetBrains Mono',ui-monospace,monospace" },
  { label: 'Fonte do sistema', value: 'system-ui,sans-serif' },
];

/** A fixed set of knobs, deliberately not arbitrary CSS/snippets/3rd-party
 * themes (that's an explicit MVP exclusion) — see the task brief's
 * "Escopo de customização". Everything here round-trips through
 * server/src/app/houseA.ts's settings.yaml (Casa A). */
export function SettingsScreen() {
  const { settings, update } = useSettings();
  const { fg, bg } = useThemeColors();

  return (
    <>
      <TerminalChrome path="~/mind/ajustes" />
      <div className="settings-screen">
        <section className="settings-group">
          <div className="settings-group-head">
            <h3>Aparência</h3>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => update({ accent: FALLBACK_SETTINGS.accent, linkColorOverride: FALLBACK_SETTINGS.linkColorOverride, theme: FALLBACK_SETTINGS.theme })}
            >
              restaurar padrão
            </button>
          </div>
          <div className="settings-row">
            <div>
              <label>Cor de destaque (accent)</label>
              <span className="hint">botões, seleção, links ativos — default é o verde do Mind</span>
            </div>
            <input type="color" value={settings.accent} onChange={(e) => update({ accent: e.target.value })} />
          </div>
          <div className="settings-row">
            <div>
              <label>Cor dos links</label>
              <span className="hint">deixe em branco pra usar a cor de destaque</span>
            </div>
            <input
              type="color"
              value={settings.linkColorOverride ?? settings.accent}
              onChange={(e) => update({ linkColorOverride: e.target.value })}
            />
          </div>
          <div className="settings-row">
            <label>Tema</label>
            <select className="text-input" value={settings.theme} onChange={(e) => update({ theme: e.target.value as typeof settings.theme })}>
              <option value="dark">Escuro</option>
              <option value="light">Claro</option>
              <option value="system">Seguir o sistema</option>
            </select>
          </div>
        </section>

        <section className="settings-group">
          <div className="settings-group-head">
            <h3>Tipografia da leitura</h3>
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
              restaurar padrão
            </button>
          </div>
          <span className="hint" style={{ display: 'block', marginBottom: 10 }}>
            afeta só o conteúdo lido — sidebar, terminal e navegação ficam sempre em Inter/JetBrains Mono.
          </span>
          <div className="settings-row">
            <label>Fonte</label>
            <select className="text-input" value={settings.bodyFont} onChange={(e) => update({ bodyFont: e.target.value })}>
              {READ_FONTS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>
          <div className="settings-row">
            <label>Tamanho ({settings.readSize}px)</label>
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
            <label>Largura da coluna ({settings.colWidth}px)</label>
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
            <label>Espaçamento de linha ({settings.lineHeight.toFixed(2)})</label>
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
          <h3>Cores das tags</h3>
          <span className="hint" style={{ display: 'block', marginBottom: 10 }}>
            reaproveitadas na leitura, na estante e no grafo. Uma tag sem cor aqui recebe uma cor estável da paleta ANSI de
            terminal, sem verde — verde é reservado pro accent.
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
                    <span className="contrast-flag" title={`vs bg: ${contrast.vsBg.ratio.toFixed(2)}:1, vs fg: ${contrast.vsFg.ratio.toFixed(2)}:1 (mín. 4.5:1)`}>
                      contraste baixo
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="settings-group">
          <h3>Opções</h3>
          <ToggleRow
            label="Frontmatter renderizado bonito"
            hint="tags como pills + datas formatadas, em vez de YAML cru"
            checked={settings.frontmatterPretty}
            onChange={(v) => update({ frontmatterPretty: v })}
          />
          <ToggleRow label="Índice (TOC) por nó" checked={settings.tocEnabled} onChange={(v) => update({ tocEnabled: v })} />
          <ToggleRow
            label="Recentes + fixados na sidebar"
            checked={settings.recentPinnedEnabled}
            onChange={(v) => update({ recentPinnedEnabled: v })}
          />
        </section>

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
function BackupSection() {
  const { reload: reloadSettings } = useSettings();
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
      setMessage({ kind: 'error', text: 'arquivo não é um JSON válido' });
      return;
    }
    if (!window.confirm('Importar este backup substitui TODOS os cadernos, tema, cores de tag e fixados atuais. Continuar?')) {
      return;
    }
    setImporting(true);
    try {
      const result = await api.post<{ notebookCount: number }>('/backup/import', parsed);
      await reloadSettings();
      bumpAppState(); // refetches every open '/notebooks' and '/state' call
      setMessage({ kind: 'ok', text: `backup importado — ${result.notebookCount} caderno(s) restaurado(s)` });
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof ApiError ? err.message : String(err) });
    } finally {
      setImporting(false);
    }
  };

  return (
    <section className="settings-group">
      <h3>Backup</h3>
      <span className="hint" style={{ display: 'block', marginBottom: 10 }}>
        cadernos, tema e cores de tag vivem só nesta máquina — sem repositório, sem nuvem. Exporte de vez em quando pra
        não perder se reinstalar o app ou trocar de máquina.
      </span>
      <div className="settings-row" style={{ justifyContent: 'flex-start', gap: 10 }}>
        <a className="btn btn-primary" href={api.rawUrl('/backup/export')} download="mindview-backup.json">
          Exportar backup
        </a>
        <button className="btn btn-ghost" disabled={importing} onClick={() => fileInputRef.current?.click()}>
          {importing ? 'Importando…' : 'Importar backup'}
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
      <h3>Vault</h3>
      <span className="hint" style={{ display: 'block', marginBottom: 10 }}>
        caminho absoluto do vault a ler. Sem diálogo nativo do Explorer (isso viria de graça só se um dia embrulhar em
        Electron) — digite/cole o caminho ou escolha um recente.
      </span>
      <div className="settings-row">
        <span className="mono" style={{ fontSize: 12.5 }}>
          atual: {config?.vaultPath ?? '…'}
        </span>
      </div>
      <div className="settings-row">
        <input
          className="text-input"
          style={{ flex: 1 }}
          placeholder="/caminho/absoluto/pro/vault"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && value.trim() && apply(value.trim())}
        />
        <button className="btn btn-primary" disabled={!value.trim() || saving} onClick={() => apply(value.trim())}>
          trocar
        </button>
      </div>
      {error && <div className="error-banner">{error}</div>}
      {config && config.recentVaultPaths.length > 0 && (
        <>
          <div className="sidebar-section-label" style={{ padding: '10px 0 4px' }}>
            Recentes
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
