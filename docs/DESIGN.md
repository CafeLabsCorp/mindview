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
| `--green` | `#3fb950` | `#1a7f37` | **the accent** — CTAs, active state, prompt, the graph's hub nodes |
| `--danger` | `#f0655c` | (same) | broken links, the contrast guard-rail |
| `--radius` | `14px` | | default corner radius |

**There is no `--blue`, deliberately.** An earlier cycle promoted
`mind-landing`'s unused `TODO: confirmar` blue into a "secondary accent" and
spent it on three things — the `engine-doc` tree dot, the paused `[~]`
checkbox, and the Console's paused badge — plus a fallback colour for
uncoloured tag pills. Blue was never part of the Mind identity (which is
green + white); the token has been removed and those four uses reassigned:
the engine-doc dot to `--fg`, both paused states to `--muted` (paused reads
as *parked*, dimmer than an open task's `--fg`, and can't be confused with
done's `--accent`), and tag pills to the same hashed palette the graph uses.
A blue **can** still appear on screen — but only as a colour the user picked
for a tag in Ajustes, or as one entry in the hashed ANSI tag palette.

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

Green is reserved for the accent/system color (buttons, active states,
the graph's index hub nodes) precisely so a tag pill is never visually confusable with
"this is clickable/active." The Grafo screen follows the same rule — node
colours come from this palette (or a hashed fallback from the same ANSI
set), never the accent green. (`cafelabs`'s default happens to reuse the green
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

### The real terminal, under the fake one

Fase 2 added an actual terminal panel (`web/src/components/TerminalPanel.tsx`),
which raised an obvious risk: a genuine shell sitting under a decorative
terminal chrome could read as a duplicated metaphor. It doesn't, because
the two occupy different roles — the chrome is a *frame* (top of the
screen, three dots, a path), the panel is a *dock* (bottom of the window,
resizable, closable). They never touch.

The panel keeps `--code-bg` as its ground in **both** themes rather than
following `--surface`, for the same reason the `--on-code-*` tokens exist
(see Palette): a terminal on a white page reads wrong, and those tokens
were introduced precisely for content that always sits on a dark surface.
Everything else follows the user's own choices — the cursor and the ANSI
`green` are `--accent`, and the rest of the ANSI set is drawn from the tag
palette instead of xterm's defaults, which clash with this identity. The
one place the terminal deviates from the reading typography is that it is
always JetBrains Mono at its own size: column alignment is not a
preference, it is a correctness requirement for a TUI.

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
quick-switcher modal, drag-and-drop into a notebook, the collapsible
tree/nav) uses plain CSS transitions consistent with the rest of the token
system.

The **Grafo screen** is the one place with continuous motion: a live
`d3-force` simulation, plus a rule that *every enter and exit is eased,
never a pop* — nodes and edges fade + scale in/out when a filter changes
(driven in JS from `graphSim.ts` so it's frame-rate-independent), labels
cross-fade on the zoom threshold and on hover, panels animate open/closed
(`grid-template-rows: 0fr → 1fr`), and "recenter" tweens the viewport
instead of jumping. The graph's CSS transitions and the hover card's
keyframe are wrapped in `@media (prefers-reduced-motion: reduce)`; the rest
of the app still doesn't read that flag — a gap worth closing if more
animation is added, not a decision made on purpose.

## Logo & icon

Both marks are derived from the Mind logo's grammar — light stems are
*nodes*, green is the *link* between them — and were drawn by Felipe
(2026-09-09). Assets live in `docs/assets/`.

**Wordmark** (`logo.svg`, plus `logo-dark.svg` / `logo-light.svg` for
`<picture>` in Markdown): "MiND" in the shared-stem construction — three
light stems, a green chevron / dot / diagonal / arc separating the letters,
the "D" node carrying a haloed green disc — followed by **VIEW** set as a
green 2×2 monospaced grid (the same mark as the app icon). The stems are the
**same neutral**, not a third colour: an earlier draft coloured VIEW a marigold
(`#EFAC39`) and it was dropped — it read as a warning amber, collided with
the ANSI tag palette, and failed WCAG on the light background (1.9:1). The
neutral parts are `currentColor` so the wordmark works on either theme;
green stays literal `#3FB950`. Do not reintroduce a third brand hue — same
rule that killed `--blue`.

**App icon** (`icon.svg`, mirrored to `web/public/favicon.svg`): the word
**VIEW** as a 2×2 monospaced grid, green `#3FB950` on a `#0d0d0d` rounded
plate (22% radius). An app icon owns its background, so it does **not**
follow the theme — the fixed dark plate is the terminal-chrome identity and
keeps the green readable on any taskbar or tab bar. This is also the source
for the future Electron package icon (`electron-builder` generates the
`.ico` / `.icns` / png set from it). It does not resolve to legible letters
at 16px — acceptable for a single-window desktop app; a simplified 16px
variant is a future item if it ever matters.
