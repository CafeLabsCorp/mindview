import { useSettings } from '../context/SettingsContext';
import { checkTagColorContrast } from '../lib/contrast';
import { autoColorForTag } from '../lib/tagPalette';
import { useThemeColors } from '../lib/useThemeColors';

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso + 'T00:00:00');
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function TagPill({ tag }: { tag: string }) {
  const { settings } = useSettings();
  const { fg, bg } = useThemeColors();
  // The Ajustes map wins; a tag the user hasn't coloured falls back to the
  // SAME stable hash the graph uses (tagPalette.autoColorForTag), not a flat
  // blue — one tag, one colour, everywhere. The old `var(--blue)` fallback
  // made every uncoloured tag identical in the reader while the graph gave
  // each its own hue.
  const color = settings.tagColors[tag] ?? autoColorForTag(tag);
  const isHex = /^#/.test(color);
  const contrast = isHex ? checkTagColorContrast(color, fg, bg) : null;
  // The pill only ever renders `color` as text over `bg`/`surface` — it is
  // never drawn as text over `fg` anywhere in this UI — so the guard-rail
  // that actually matters here is vsBg. checkTagColorContrast() also
  // reports vsFg (surfaced in Ajustes' tooltip for transparency), but
  // gating the visible warning on `passes` (requiring *both*) produced
  // false positives on perfectly legible colors like the default blue
  // (~7:1 against bg, ~2.4:1 against fg — a comparison that never
  // actually happens on screen) — caught via a real screenshot during
  // this round's manual QA.
  const failsRelevantContrast = contrast ? !contrast.vsBg.passes : false;
  return (
    <span
      className={`pill${failsRelevantContrast ? ' contrast-warn' : ''}`}
      style={{
        color,
        borderColor: `color-mix(in srgb, ${color} 45%, transparent)`,
        background: `color-mix(in srgb, ${color} 14%, transparent)`,
      }}
      title={failsRelevantContrast ? `Contraste abaixo de 4.5:1 (vs bg: ${contrast!.vsBg.ratio.toFixed(2)})` : tag}
    >
      #{tag}
    </span>
  );
}

interface FrontmatterCardProps {
  tags: string[];
  criado: string | null;
  atualizado: string | null;
}

/** Pretty frontmatter, per the Ajustes toggle "frontmatter renderizado
 * bonito" — tags as colored pills + formatted dates, never raw YAML. */
export function FrontmatterCard({ tags, criado, atualizado }: FrontmatterCardProps) {
  const { settings } = useSettings();
  if (!settings.frontmatterPretty) return null;
  const criadoFmt = formatDate(criado);
  const atualizadoFmt = formatDate(atualizado);
  if (tags.length === 0 && !criadoFmt && !atualizadoFmt) return null;
  return (
    <div className="meta-row">
      {tags.map((t) => (
        <TagPill key={t} tag={t} />
      ))}
      {(criadoFmt || atualizadoFmt) && (
        <span className="meta-dates">
          {criadoFmt && <span>criado {criadoFmt}</span>}
          {atualizadoFmt && <span>atualizado {atualizadoFmt}</span>}
        </span>
      )}
    </div>
  );
}
