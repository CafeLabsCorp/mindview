// The sidebar mark: just the VIEW half of Felipe's MindView wordmark
// (2026-09-09) — the 2×2 green grid of V/I/E/W — with the MIND half
// dropped (Felipe, 2026-09-27). Same paths as the full artwork, viewBox
// cropped to the VIEW square; all green, no background. The full wordmark
// and the app icon are unchanged: docs/assets/logo.svg, docs/DESIGN.md
// ("Logo & icon").
export function BrandLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="1774 199 781 781" role="img" aria-label="MindView" xmlns="http://www.w3.org/2000/svg">
      <path d="M1845 412H1916V483H1987V412H2058V199H2129V483H2058V554H1845V483H1774V199H1845V412Z" fill="#3FB950" />
      <path d="M2555 199V270H2413V483H2555V554H2200V483H2342V270H2200V199H2555Z" fill="#3FB950" />
      <path d="M2129 696H1845V767H2129V838H1845V909H2129V980H1774V625H2129V696Z" fill="#3FB950" />
      <path d="M2271 909H2342V625H2413V909H2484V625H2555V980H2200V625H2271V909Z" fill="#3FB950" />
    </svg>
  );
}
