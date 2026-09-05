**[Leia em Português](DESIGN.pt-br.md)**

# Design — MindView

Visual identity inherited 1:1 from [mind-landing](https://github.com/CafeLabsCorp/mind-landing)
— the dark, technical "terminal/CLI" aesthetic that already represents the
Mind product publicly. All tokens below live in `web/src/styles/tokens.css`,
ported directly from `mind-landing/src/app/[locale]/globals.css` (see the
comment at the top of that file).

## History: two design rounds, one rejected

The first design cycle produced a mockup in a skeuomorphic "Ateliê"
direction — wood textures, fabric-covered notebook covers, Fraunces/Inter/
JetBrains Mono. **Felipe rejected it**: it read as generic "nice design"
rather than an extension of Mind's actual brand — he specifically noted it
looked similar to Dindin's visual style (colors, fonts, box styling), not to
Mind's own identity. The root cause, named during the retro: the brief for
that cycle asked for something "bold/experimental" without anchoring it to
the identity that already exists (`mind-landing`), which left room to invent
a generic direction instead of applying the real brand. (That rejected
mockup is kept as a possible future reskin idea for Dindin — Felipe liked
the style, just not for MindView.)

The second round corrected this by extracting the actual source of truth —
`mind-landing`'s own `docs/DESIGN.md` and `globals.css` — and produced the
identity below, which Felipe approved.

## Palette

Both dark (default) and light variants are declared in `tokens.css` and
switched by a `[data-theme]` attribute on `<html>` (see
`context/SettingsContext.tsx`'s `applyThemeToDom`) — unlike `mind-landing`,
which only follows the OS's `prefers-color-scheme` with no manual toggle,
MindView has an explicit dark/light/system choice in Ajustes.

| Token | Dark (default) | Light | Use |
| --- | --- | --- | --- |
| `--bg` | `#0d0d0d` | `#f9f9f7` | page background |
| `--surface` | `#161615` | `#fcfcfb` | cards, terminal bar, panels |
| `--surface-2` | `#1c1c1a` | `#f1f0ec` | secondary surfaces, hover states |
| `--code-bg` | `#0a0a0a` | `#111110` | code/terminal blocks — **fixed dark in both themes**, see below |
| `--fg` | `#f2f1ec` | `#0b0b0b` | main text |
| `--muted` | `#c3c2b7` | `#52514e` | secondary text |
| `--subtle` | `#8a887f` | `#898781` | tertiary text, captions |
| `--border` | `rgba(255,255,255,.1)` | `rgba(11,11,11,.1)` | borders |
| `--green` | `#3fb950` | `#1a7f37` | **the accent** — CTAs, active state, prompt, the graph's future hub node |
| `--blue` | `#5b9eea` | `#1e5aa8` | secondary accent (given real use here — it was an unused `TODO: confirmar` token in `mind-landing`) |
| `--danger` | `#f0655c` | (same) | broken links, the contrast guard-rail |
| `--radius` | `14px` | | default corner radius |

`--on-code` / `--on-code-subtle` / `--on-code-accent` are **fixed, never
inverted by theme**, used only on top of `--code-bg` surfaces. These exist
because of a real bug found *during* MindView's own discovery: `mind-landing`
had `.term-line`/`.cursor` inheriting `var(--muted)`/`var(--green)`, both of
which invert to near-black in `mind-landing`'s light theme — unreadable text
over the (always-dark) fake-terminal background. MindView's design cycle
fixed the same category of bug locally with dedicated non-inverting tokens,
and separately reported and fixed the same root cause upstream in
`mind-landing` itself (commit `37b9d49`) — see
`mind/tarefas/empresa/mindview.md`.

### Tag color palette — deliberately no green

`server/src/app/houseA.ts`'s `DEFAULT_SETTINGS.tagColors` is a curated,
terminal-ANSI-inspired set (red, orange, blue, purple, pink, cyan/teal —
never green):

```
cafelabs: #3fb950 (this one IS green — see note)   projetos:   #e0913a
tarefas:  #5b9eea                                   dindin:     #a78bfa
mind:     #45b8c4                                   design:     #e685b5
infra:    #e0913a                                   legal:      #f0655c
lgpd:     #f0655c                                   financeiro: #8a7226
marketing: #e685b5                                  distribuicao: #e0913a
```

Green is reserved for the accent/system color (buttons, active states, the
eventual graph hub) precisely so a tag pill is never visually confusable with
"this is clickable/active." (`cafelabs`'s default happens to reuse the green
hex as a starting value in the shipped defaults — every tag color is
user-editable from Ajustes, so this isn't a hard rule enforced in code, just
the curated default set's intent.)

### Contrast is enforced, not just chosen carefully

`web/src/lib/contrast.ts` implements the real WCAG 2.1 relative-luminance
formula (not a stub) and `checkTagColorContrast` verifies every tag color
against both `--fg` and `--bg` at 4.5:1. This guard-rail found a genuine
failure during design review: the default `financeiro` tag color
(`#8a7226`, dark mustard) doesn't clear 4.5:1 against either `--fg` or
`--bg` in either theme. The Ajustes screen surfaces a "contraste baixo" flag
next to any tag color that fails the check (`SettingsScreen.tsx`), rather
than silently shipping an inaccessible default.

## Typography

Same three-family system as `mind-landing`, self-hosted via `@fontsource/*`
(no Google Fonts CDN dependency at runtime):

| Role | Font | Variable |
| --- | --- | --- |
| Display (headings) | Space Grotesk | `--font-display` |
| Body / UI | Inter | `--font-body` |
| Terminal, code, metadata | JetBrains Mono | `--font-mono` |

**The terminal chrome and app UI (sidebar, navigation) are never affected by
the reading-typography settings** in Ajustes — those always render in
Inter/JetBrains Mono regardless of what the user picks for the *content*
font/size/column width/line height (`--read-font`, `--read-size`,
`--read-col`, `--read-line-height` in `tokens.css`, set at runtime by
`SettingsContext`). This split is intentional: customization is allowed to
change how prose reads, never allowed to erode the app's own identity chrome.

## The terminal chrome: the app's signature

`web/src/components/TerminalChrome.tsx` — three colored dots
(`#ff5f57`/`#febc2e`/`#28c840`, a literal macOS-terminal reference) plus a
monospaced path string — renders at the top of **every** screen (Reader,
Shelf, Console, Graph, Ajustes), not only the Reader. This was confirmed in
the second design round specifically to make it the app's persistent visual
signature rather than a reading-mode detail: `~/mind/console`,
`~/mind/estante`, `~/mind/ajustes`, etc., always in `--font-mono`, always
these exact three colors, regardless of theme or user customization.

## Notebook covers

MVP notebook covers are **flat, no texture** — a deliberate reaction to the
rejected first mockup's wood/fabric skeuomorphism. Identity comes from
**color + a large monospaced glyph + a 5px spine**, not from a rendered
material. The curated glyph set (no emoji) ships in the MVP; image upload
for covers is an explicit future-phase item (see
[docs/ARQUITETURA.md](docs/ARQUITETURA.md#out-of-scope-in-this-version)).

## Motion

No dedicated animation library — this app has none of `mind-landing`'s
scroll-triggered reveal/typewriter sequences (there's no scrolling marketing
narrative to animate). Interaction feedback (hover/active states, the
quick-switcher modal, drag-and-drop into a notebook) uses plain CSS
transitions consistent with the rest of the token system; nothing here reads
`prefers-reduced-motion` yet, unlike `mind-landing`'s explicit handling of it
— a gap worth closing if any future animation is added, not a decision made
on purpose.
