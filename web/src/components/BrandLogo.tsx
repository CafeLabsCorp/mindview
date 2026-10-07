// The sidebar mark: the VIEW grid (2×2 green V/I/E/W, Felipe 2026-09-09),
// which is now the brand's one official logo — the "MiND + VIEW" wordmark
// was discontinued on 2026-10-07. All green, no background. Same artwork as
// docs/assets/logo.svg; see docs/DESIGN.md ("Logo & icon").
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
