import type { HeadingInfo } from '../api/types';

export function TocPanel({ headings }: { headings: HeadingInfo[] }) {
  if (headings.length === 0) return null;
  return (
    <div>
      <div className="sidebar-section-label" style={{ padding: '0 0 8px' }}>
        Índice
      </div>
      <ul className="toc-list">
        {headings.map((h) => (
          <li key={h.id} className={`toc-lvl-${h.level}`}>
            <a href={`#toc-target-${h.id}`} onClick={(e) => {
              e.preventDefault();
              document.getElementById(`heading-${h.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}>
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
