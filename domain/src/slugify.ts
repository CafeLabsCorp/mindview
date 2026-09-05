// Heading -> anchor slug. Must keep accented characters (the vault has 60
// links with anchors, e.g. `#configuração-desta-instância`) rather than
// stripping diacritics the way a naive ASCII slugifier would.

export function slugifyHeading(text: string): string {
  return text
    .trim()
    .toLowerCase()
    // drop markdown emphasis / code marks that may leak into heading text
    .replace(/[`*_~]/g, '')
    // anything that isn't a unicode letter/number/space/hyphen becomes a space
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Dedupe slugs within a single document, GitHub-style (`foo`, `foo-1`, `foo-2`). */
export class SlugCounter {
  private seen = new Map<string, number>();

  next(text: string): string {
    const base = slugifyHeading(text) || 'section';
    const count = this.seen.get(base) ?? 0;
    this.seen.set(base, count + 1);
    return count === 0 ? base : `${base}-${count}`;
  }
}
