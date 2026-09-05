// Real WCAG 2.1 contrast checking — not a decorative stub. The design
// cycle found a genuine failure with this exact formula: the default
// `financeiro` tag color (#8a7226, dark mustard) reads below 4.5:1 against
// both --fg and --bg in *both* themes. See docs/DESIGN spec in
// mind/tarefas/empresa/mindview.md ("guarda-corpo de contraste").
function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const [rl, gl, bl] = [channel(r), channel(g), channel(b)];
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

/** WCAG 2.1 contrast ratio between two hex colors, in [1, 21]. */
export function contrastRatio(hexA: string, hexB: string): number {
  const lumA = relativeLuminance(hexToRgb(hexA));
  const lumB = relativeLuminance(hexToRgb(hexB));
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

export const WCAG_AA_TEXT_MIN = 4.5;

export interface ContrastCheck {
  ratio: number;
  passes: boolean;
}

/** Checks a tag color against both the active theme's foreground and
 * background — the guard the design cycle asked for. A color used as pill
 * text over `bg`/`surface` (this app's actual pill styling) needs to clear
 * 4.5:1 against `bg`; checking `fg` too catches colors that would also be
 * unreadable if ever used the other way around (text-on-tag-as-background). */
export function checkTagColorContrast(tagHex: string, fgHex: string, bgHex: string): { vsFg: ContrastCheck; vsBg: ContrastCheck; passes: boolean } {
  const vsFg = contrastRatio(tagHex, fgHex);
  const vsBg = contrastRatio(tagHex, bgHex);
  const vsFgCheck = { ratio: vsFg, passes: vsFg >= WCAG_AA_TEXT_MIN };
  const vsBgCheck = { ratio: vsBg, passes: vsBg >= WCAG_AA_TEXT_MIN };
  return { vsFg: vsFgCheck, vsBg: vsBgCheck, passes: vsFgCheck.passes && vsBgCheck.passes };
}
