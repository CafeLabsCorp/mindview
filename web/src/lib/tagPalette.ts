// Color a node by one of its tags. The user's own tag→color map from
// Ajustes (settings.tagColors) always wins; tags they haven't colored get a
// stable auto-color hashed from the tag name, out of an ANSI-terminal-ish
// set with NO green (green is the app accent — same rule as the reading
// pills, see mind/tarefas/empresa/mindview.md).
const AUTO_PALETTE = [
  '#e06c75', // red
  '#d19a66', // orange
  '#e5c07b', // yellow
  '#61afef', // blue
  '#c678dd', // purple
  '#e58fb0', // pink
  '#56b6c2', // cyan
  '#b07d48', // brown
];

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function autoColorForTag(tag: string): string {
  return AUTO_PALETTE[hash(tag) % AUTO_PALETTE.length];
}

/** Which tag on a node decides its color. "last" = most specific (the tag
 * list ends with the narrowest one in ~93% of nodes; the first tag is
 * almost always just the folder name). */
export type ColorBy = 'last' | 'first';

export function colorForNode(
  tags: string[],
  colorBy: ColorBy,
  userColors: Record<string, string>,
  fallback: string,
): string {
  if (tags.length === 0) return fallback;
  const tag = colorBy === 'first' ? tags[0] : tags[tags.length - 1];
  return userColors[tag] ?? autoColorForTag(tag);
}
