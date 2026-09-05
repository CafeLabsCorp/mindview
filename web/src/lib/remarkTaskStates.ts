// A small remark (mdast) plugin — NOT a second markdown parser. It runs
// inside the exact same remark pipeline (remark-parse + remark-frontmatter
// + remark-gfm) MarkdownBody.tsx feeds into react-markdown, which is the
// requirement from the backend/design cycles: the fence-safety guarantee
// that protects domain/src/parse.ts (frontmatter only recognized at
// position 0, never inside a fenced code block) comes from
// remark-frontmatter itself, so reusing the same library here inherits it
// for free — a hand-rolled regex extractor would not.
//
// remark-gfm recognizes `[ ]`/`[x]`/`[X]` as real checkboxes (mdast
// `checked: boolean`). It does NOT recognize `[~]` (paused) — see
// domain/src/parse.ts's own comment on this — so a paused item reaches us
// as an ordinary list item with `checked === null` and literal "[~] " text.
// This plugin normalizes all three states onto one `data-task-state`
// hast property so MarkdownBody's CSS can render one consistent custom
// checkbox glyph instead of mixing "native <input> for two states, plain
// text for the third".
import { toString as mdastToString } from 'mdast-util-to-string';
import type { ListItem, Paragraph, Root, Text } from 'mdast';
import type { Plugin } from 'unified';
import { visit } from 'unist-util-visit';

const PAUSED_PREFIX = /^\[~\]\s*/;

type TaskState = 'open' | 'done' | 'paused';

export const remarkTaskStates: Plugin<[], Root> = () => (tree) => {
  visit(tree, 'listItem', (node: ListItem) => {
    let state: TaskState | null = null;
    if (node.checked === true) state = 'done';
    else if (node.checked === false) state = 'open';

    const firstChild = node.children[0];
    if (firstChild && firstChild.type === 'paragraph') {
      const para = firstChild as Paragraph;
      if (PAUSED_PREFIX.test(mdastToString(para))) {
        state = 'paused';
        // Mirror domain/src/parse.ts's parseTask(): strip the literal
        // "[~] " marker so it never shows up twice (once as our custom
        // glyph, once as literal text).
        const firstText = para.children[0];
        if (firstText && firstText.type === 'text') {
          (firstText as Text).value = (firstText as Text).value.replace(PAUSED_PREFIX, '');
        }
      }
    }

    if (state) {
      node.data = node.data ?? {};
      node.data.hProperties = { ...(node.data.hProperties ?? {}), 'data-task-state': state };
    }
  });
};
