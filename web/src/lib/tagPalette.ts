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

/** A node is coloured by its FIRST tag — the broad one, which is the folder
 * name in ~93% of nodes. That makes the graph read as coloured regions
 * instead of confetti. There used to be a "most specific / first" pair of
 * chips here; it was cut because the distinction never explained itself in
 * the UI (see mind/tarefas/empresa/mindview.md). */
export function colorForNode(tags: string[], userColors: Record<string, string>, fallback: string): string {
  if (tags.length === 0) return fallback;
  const tag = tags[0];
  return userColors[tag] ?? autoColorForTag(tag);
}
