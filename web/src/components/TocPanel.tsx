import type { HeadingInfo } from '../api/types';

// Just the list. The "Índice" header + collapse control live in the Reader's
// rail (Reader.tsx), which also decides whether to render this at all.
export function TocPanel({ headings }: { headings: HeadingInfo[] }) {
  return (
    <ul className="toc-list">
      {headings.map((h) => (
        <li key={h.id} className={`toc-lvl-${h.level}`}>
          <a
            href={`#toc-target-${h.id}`}
            onClick={(e) => {
              e.preventDefault();
              document.getElementById(`heading-${h.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
          >
            {h.text}
          </a>
        </li>
      ))}
    </ul>
  );
}
