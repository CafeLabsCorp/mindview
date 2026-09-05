import ReactMarkdown from 'react-markdown';
import remarkFrontmatter from 'remark-frontmatter';
import remarkGfm from 'remark-gfm';
import type { HeadingInfo, LinkInfo } from '../api/types';
import { navigate } from '../lib/hashRoute';
import { remarkTaskStates } from '../lib/remarkTaskStates';
import { useTree } from '../context/TreeContext';

interface MarkdownBodyProps {
  raw: string;
  headings: HeadingInfo[];
  links: LinkInfo[];
}

/**
 * The one place the vault's raw Markdown bytes get turned into prose. Runs
 * the *same* remark plugin set domain/src/parse.ts uses
 * (remark-frontmatter + remark-gfm) so it inherits the fence-safety
 * guarantee for free (frontmatter recognized only at byte 0, never inside
 * a fenced block, never mid-document) instead of re-deriving it with a
 * second, naive parser — see domain/test/fence.test.ts and the task
 * brief's mandated regression. remark-frontmatter's `yaml` node type has
 * no react-markdown renderer registered, so the frontmatter block is
 * simply skipped rather than shown as a stray paragraph; the pretty
 * version (tags/dates) is FrontmatterCard.tsx, driven by the already-
 * parsed `node.tags`/`criado`/`atualizado` from the server, not by
 * anything reparsed here.
 */
export function MarkdownBody({ raw, headings, links }: MarkdownBodyProps) {
  const { pathSet } = useTree();
  const linkMap = new Map(links.map((l) => [l.raw, l] as const));
  let headingIndex = 0;

  function headingComponent(level: 1 | 2 | 3 | 4 | 5 | 6) {
    const Tag = `h${level}` as const;
    return function Heading(props: React.ComponentPropsWithoutRef<'h1'>) {
      const h = headings[headingIndex];
      headingIndex++;
      return (
        <Tag id={h ? `heading-${h.id}` : undefined} {...props}>
          {props.children}
        </Tag>
      );
    };
  }

  function AnchorRenderer(props: React.ComponentPropsWithoutRef<'a'>) {
    const href = props.href ?? '';
    const link = linkMap.get(href);

    if (!link || link.external) {
      return (
        <a href={href} target="_blank" rel="noopener noreferrer">
          {props.children}
        </a>
      );
    }

    if (link.outsideVault) {
      return (
        <a href={href} data-outside-vault="true" title="este link sai do vault — não é seguido" onClick={(e) => e.preventDefault()}>
          {props.children}
        </a>
      );
    }

    if (!link.resolvedPath) {
      // pure #anchor, same document
      return (
        <a
          href={href}
          onClick={(e) => {
            e.preventDefault();
            if (link.anchor) document.getElementById(`heading-${link.anchor}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }}
        >
          {props.children}
        </a>
      );
    }

    const exists = pathSet.has(link.resolvedPath);
    const target = link.resolvedPath;
    return (
      <a
        href={`#/read/${encodeURIComponent(target)}`}
        data-broken={!exists}
        title={exists ? target : `link quebrado — ${target} não existe no vault`}
        onClick={(e) => {
          e.preventDefault();
          if (!exists) return;
          navigate('read', target);
          if (link.anchor) {
            setTimeout(() => document.getElementById(`heading-${link.anchor}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 160);
          }
        }}
      >
        {props.children}
      </a>
    );
  }

  return (
    <div className="prose">
      <ReactMarkdown
        remarkPlugins={[remarkFrontmatter, remarkGfm, remarkTaskStates]}
        components={{
          h1: headingComponent(1),
          h2: headingComponent(2),
          h3: headingComponent(3),
          h4: headingComponent(4),
          h5: headingComponent(5),
          h6: headingComponent(6),
          a: AnchorRenderer,
          // the custom checkbox glyph is pure CSS keyed off the
          // `data-task-state` attribute remarkTaskStates attaches to the
          // <li> — the native checkbox input would just duplicate it.
          input: () => null,
        }}
      >
        {raw}
      </ReactMarkdown>
    </div>
  );
}
