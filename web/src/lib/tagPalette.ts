// Color of a tag. The user's own tag→color map from Ajustes
// (settings.tagColors) always wins; a tag they haven't coloured is drawn in
// the app's foreground — white on the dark theme, near-black on the light
// one (Felipe, 2026-09-14). Tags used to get a stable auto-colour hashed
// from the name out of an ANSI-ish palette; colour is now something the
// user chooses, never something assigned for them.
export const DEFAULT_TAG_COLOR = 'var(--fg)';

export function tagColor(tag: string, userColors: Record<string, string>): string {
  return userColors[tag] ?? DEFAULT_TAG_COLOR;
}

/** A node is coloured by its FIRST tag — the broad one, which is the folder
 * name in ~93% of nodes. That makes the graph read as coloured regions
 * instead of confetti. There used to be a "most specific / first" pair of
 * chips here; it was cut because the distinction never explained itself in
 * the UI (see mind/tarefas/empresa/mindview.md). */
export function colorForNode(tags: string[], userColors: Record<string, string>, fallback: string): string {
  if (tags.length === 0) return fallback;
  return tagColor(tags[0], userColors);
}
