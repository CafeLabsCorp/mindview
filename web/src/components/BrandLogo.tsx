// The MindView wordmark, drawn by Felipe (2026-09-09). Inlined rather than
// loaded as <img src>: the neutral stems are `currentColor` so the mark
// follows the light/dark theme, and an <img>-embedded SVG would not inherit
// the page's color. Green stays literal `#3FB950` (the Mind accent). Full
// artwork and the colour rationale live in docs/assets/logo.svg and
// docs/DESIGN.md ("Logo & icon").
export function BrandLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 2555 980"
      role="img"
      aria-label="MindView"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M1183.06 482.547C1241.92 482.547 1289.63 530.26 1289.63 589.116C1289.63 647.973 1241.92 695.686 1183.06 695.686C1124.2 695.686 1076.49 647.973 1076.49 589.116C1076.49 530.26 1124.2 482.547 1183.06 482.547Z"
        fill="#3FB950"
        fillOpacity="0.2"
      />
      <path
        d="M1183.35 528.586C1216.93 528.586 1244.16 555.814 1244.16 589.402C1244.16 622.989 1216.93 650.217 1183.35 650.217C1149.76 650.217 1122.53 622.989 1122.53 589.402C1122.53 555.814 1149.76 528.586 1183.35 528.586Z"
        fill="#3FB950"
      />
      <path
        d="M551.889 707.182L439.351 978.875V979.871H311.467V979.185L198.931 707.497L198.93 336.19L375.345 762.093L551.889 335.877V707.182ZM984.418 762.935V979.87H1041.25V953.157H1048.08V979.871H920.191V979.185L807.655 707.498V336.19L984.418 762.935ZM1183.35 837.869V979.869H1183.35V837.869H1183.35ZM1240.19 203.011C1428.99 230.455 1574 392.993 1574 589.4L1573.99 591.926C1572.75 787.2 1428.18 948.462 1240.19 975.788V831.38C1350.11 805.742 1432 707.134 1432 589.4C1432 471.666 1350.11 373.057 1240.19 347.419V203.011ZM1051.75 925.484L1041.25 929.83V900.151L1051.75 925.484ZM750.818 198.974V570.282L679.706 398.603L608.726 569.965V198.976L679.707 228.377L750.8 198.93L750.818 198.974ZM142.094 198.974V570.28L10.7988 253.307L142.075 198.93L142.094 198.974ZM1183.35 198.93V340.93H1183.35V198.93H1183.35ZM750.817 142.093H608.725V0H750.817V142.093Z"
        fill="#3FB950"
      />
      <rect
        x="608.725"
        y="198.93"
        width="142.093"
        height="780.941"
        fill="currentColor"
      />
      <rect y="198.93" width="142.093" height="780.941" fill="currentColor" />
      <rect
        x="1041.26"
        y="198.93"
        width="142.093"
        height="780.941"
        fill="currentColor"
      />
      <g clipPath="url(#brandlogo-view)">
        <path
          d="M1845 412H1916V483H1987V412H2058V199H2129V483H2058V554H1845V483H1774V199H1845V412Z"
          fill="#3FB950"
        />
        <path
          d="M2555 199V270H2413V483H2555V554H2200V483H2342V270H2200V199H2555Z"
          fill="#3FB950"
        />
        <path
          d="M2129 696H1845V767H2129V838H1845V909H2129V980H1774V625H2129V696Z"
          fill="#3FB950"
        />
        <path
          d="M2271 909H2342V625H2413V909H2484V625H2555V980H2200V625H2271V909Z"
          fill="#3FB950"
        />
      </g>
      <defs>
        <clipPath id="brandlogo-view">
          <rect
            width="781"
            height="781"
            fill="#fff"
            transform="translate(1774 199)"
          />
        </clipPath>
      </defs>
    </svg>
  );
}
