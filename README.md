**[Leia em Português](README.pt-br.md)**

# MindView (MV)

A [Café Labs](https://cafelabs.net) project. "MindView" is the final name
(confirmed 2026-09-05 — see `mind/tarefas/empresa/mindview.md`).

A desktop, **read-only** viewer for [Mind](https://github.com/CafeLabsCorp/mind-template),
Felipe's personal knowledge vault (Markdown + git, built for Claude Code).
MindView never writes into the vault's folder structure — it only reads and
renders it more pleasantly than Obsidian, with a few "frills" (a global
board of task files, a curated notebook shelf, per-tag colors, backlinks)
that the vault's own engine already makes possible but Obsidian doesn't
surface. Without MindView the vault works exactly the same; this is a lens
on top, not a dependency.

Built as a portfolio + craft project (Fork B, decided 2026-09-04 — see
`mind/tarefas/empresa/mindview.md`), not a productivity tool with a growth
target. Desktop-only, local-only, no cloud, no mobile, no accounts. Read-only
in this version; a real editor is an explicit future phase (see "Out of
scope" in [docs/ARQUITETURA.md](docs/ARQUITETURA.md)).

Full product/design/architecture history — three Forge cycles (`product`,
`design` ×2, `backend`, `frontend-web`) — lives in
`mind/tarefas/empresa/mindview.md`. This repo's docs summarize the decisions
that matter for running and extending the code; that file is the complete
narrative if you need the "why" behind a decision not covered here.

## Stack

| Layer | Technology |
| --- | --- |
| Monorepo | npm workspaces (`domain`, `server`, `web`), no separate build orchestrator |
| Parsing | `unified` + `remark-parse` + `remark-frontmatter` + `remark-gfm` (also used to *render* Markdown in `web`, via `react-markdown` — one pipeline, not two) |
| Server | Plain `node:http` (no framework), TypeScript, `tsx` for dev/run |
| File watching | `chokidar` |
| Web | Vite + React 19 |
| Graph | `d3-force` (layout only — SVG render + interaction are hand-written) |
| Terminal | `node-pty` (a real PTY, same library VS Code's terminal uses) + `ws` (the bidirectional channel SSE can't provide) + `@xterm/xterm` in the browser, code-split so a session that never opens the panel never downloads it |
| Fonts | Space Grotesk (display), Inter (body), JetBrains Mono (terminal/code/metadata) — self-hosted via `@fontsource/*` |
| Tests | Vitest, one suite per workspace |

See [docs/ARQUITETURA.md](docs/ARQUITETURA.md) for why each of these was
chosen over the alternatives that were on the table (CodeMirror, Electron,
incremental indexing, a search library).

## Prerequisites

- Node.js (no `engines` field pinned yet — developed against a recent Node
  20/22; there's nothing version-specific in the code, this is just an
  unverified gap).
- npm (uses `package-lock.json`, workspaces — not pnpm/yarn).
- **Run `node` inside WSL, not as a native Windows process reading `\\wsl$\...`.**
  The vault lives on the WSL ext4 filesystem; a Windows-native process
  watching it over the `\\wsl$\` UNC path does not receive `inotify` events
  (only polling, which is worse). See
  [docs/ARQUITETURA.md](docs/ARQUITETURA.md#why-node-runs-inside-wsl).
- A local clone of the Mind vault (defaults to `/home/felip/projetos/mind`;
  changeable at runtime from the Ajustes screen, or via `PUT /api/config`).

## Running

```bash
npm install                 # once, at the repo root — installs all 3 workspaces
```

**Dev mode** — hot reload on both sides, two processes:

```bash
npm run dev
# → server on http://127.0.0.1:4317 (API only)
# → Vite   on http://localhost:5173  (open this one)
```

`concurrently` runs `server`'s `tsx watch` and `web`'s `vite` side by side.
The browser talks only to the Vite origin; Vite proxies `/api/*` to the
server process (see `web/vite.config.ts`) and injects that run's auth token
into the served `index.html` automatically — no manual copy/paste of a token
between terminals.

**Production-local mode** — a single process serves everything:

```bash
npm run start
# builds web/dist, then serves it + /api/* from http://127.0.0.1:4317
```

Open `http://127.0.0.1:4317` directly in this mode (the server injects the
token into the HTML it serves — see `server/src/index.ts`'s `injectToken`).
There's no separate deploy/packaging step yet — "production" here means "the
built static bundle, served locally," not a distributed app. Electron
packaging is an explicit future phase, not started (see
[docs/ARQUITETURA.md](docs/ARQUITETURA.md#out-of-scope-in-this-version)).

### Configuration / env vars

None are required to run with defaults. Available overrides, all optional:

| Var | Default | Meaning |
| --- | --- | --- |
| `MINDVIEW_PORT` | `4317` | server port (both processes must agree — Vite reads it too) |
| `MINDVIEW_DATA_DIR` | `~/.local/share/mindview` | override for settings/notebooks (see [docs/ARQUITETURA.md](docs/ARQUITETURA.md#2-one-local-only-home-for-mindviews-own-data-outside-the-vault)) |
| `MINDVIEW_STATE_DIR` | `~/.local/share/mindview` | override for session/recent/pinned/usage state — same directory as above by default; there is no separate repo behind either one (see [docs/ARQUITETURA.md](docs/ARQUITETURA.md#2b-durability-via-exportimport-not-a-second-repository)) |
| `MINDVIEW_POLL` | unset | set to `1` to force chokidar polling instead of native events (escape hatch, shouldn't be needed inside WSL) |

The vault path itself is **not** an env var — it's stored in
`~/.local/share/mindview/config.yaml` and changed at runtime via the Ajustes
screen or `PUT /api/config`. Everything MindView persists locally (settings,
notebooks, pinned nodes) can be exported/restored from the Ajustes screen's
"Backup" section — see the same doc section above.

## Tests

```bash
npm run check       # typecheck + all three suites + build:web — the full gate
npm run test        # all three suites
npm run typecheck   # tsc --noEmit in all three workspaces
npm run test -w web # a single workspace
```

| Workspace | Status | What it covers |
| --- | --- | --- |
| `domain` | 36/36 passing | parser, index builder, selectors (search, board, staleness, broken/outside links, orphans, graph) |
| `server` | 10/10 passing | end-to-end HTTP tests against a disposable vault fixture |
| `web` | 34/34 passing | WCAG contrast guard-rail (`src/lib/contrast.test.ts`), the graph render model + filters/groups (`graphModel.test.ts`), the force-sim reconciliation across model swaps (`graphSim.test.ts`), and a jsdom render of the whole graph screen (`screens/GraphScreen.test.tsx`) |

There is no linter — no ESLint/Prettier/Biome is installed and none was
configured. `tsc --noEmit` (via `npm run typecheck`) is the only static
check. A root `lint` script used to point at a `lint` script the `web`
workspace never had; it was removed rather than left broken.

The `domain` suite had four vault-drift failures through early 2026-09-05;
all are resolved. Two were a broken `SKILL.md` frontmatter line + a
mis-quoted `description:`, fixed in the vault. The other two were
`fence.test.ts` pinning an absolute line number and a total task count
against the live `docs/ARQUITETURA.md` — the test now locates the mid-doc
`---` by scanning and asserts by content, and the parser only counts a list
item as a task when it's a `[ ]`/`[x]`/`[~]` item (see
[docs/ARQUITETURA.md §9](docs/ARQUITETURA.md#9-known-test-failures-technical-debt)).

## Folder structure

```
mindview/
├── domain/            # @mindview/domain — pure parser + index + selectors, zero `fs`
│   ├── src/
│   │   ├── parse.ts        # (path, bytes) -> ParsedNode — the whole markdown pipeline
│   │   ├── buildIndex.ts   # full reindex: nodes + backlinks + tag set
│   │   ├── selectors.ts    # search, buildBoard, computeStaleIndexes, listBrokenLinks,
│   │   │                   # listOutsideVaultLinks, listOrphans, buildTree
│   │   ├── slugify.ts, paths.ts, types.ts
│   └── test/           # parse.test.ts + fence.test.ts (the mandated regression, see below)
├── server/            # @mindview/server — HTTP composition root + all IO
│   ├── src/
│   │   ├── index.ts        # the server: routes, security checks, static/SPA serving
│   │   ├── app/             # houseA.ts, stateB.ts, vaultService.ts, paths.ts,
│   │   │                    # shells.ts + terminalService.ts (PTY, see §12 of ARQUITETURA)
│   │   ├── io/              # walk.ts, readAll.ts, watcher.ts, confine.ts, security.ts,
│   │   │                    # atomicWrite.ts, externalOpen.ts — every fs/network touch lives here
│   │   └── http/            # router.ts, respond.ts — tiny hand-rolled HTTP helpers,
│   │                        # terminalSocket.ts — the WebSocket upgrade gate + PTY bridge
│   └── test/           # server.test.ts (HTTP, disposable vault fixture),
│                       # terminalUnits.test.ts + terminalSocket.test.ts (real PTY over a real socket)
└── web/               # @mindview/web — Vite + React 19 UI
    └── src/
        ├── screens/     # Reader, Shelf, Console, GraphScreen, SettingsScreen
        ├── components/  # Sidebar, Tree, QuickSwitcher, TerminalChrome, MarkdownBody,
        │                # TerminalPanel (lazy-loaded — xterm.js is ~250 KB), …
        ├── context/     # TreeContext, SettingsContext, ReindexContext, AppStateEvents
        ├── api/         # client.ts, types.ts — thin fetch wrapper + shared response shapes
        ├── lib/         # hashRoute.ts, contrast.ts (WCAG), remarkTaskStates.ts, useThemeColors.ts,
        │                # graphSim.ts (live d3-force sim), graphModel.ts, tagPalette.ts, graphPrefs.ts,
        │                # tocCollapsed.ts / treeOpenState.ts / terminalPanelState.ts
        │                # (per-browser UI state)
        └── styles/      # tokens.css (identity, see docs/DESIGN.md), global.css
```

`domain` has zero Node built-ins by design (see the comment at the top of
`domain/src/types.ts`) — every filesystem/network concern lives in `server`,
so the parser/index/selectors can be unit-tested with plain strings and
reused unmodified if a second frontend (or a CLI) is ever built on top.

## Screens

Four tabs in the sidebar (none is "the home screen") plus the Reader, which
isn't a tab — see "Post-launch polish" below for why:

1. **Grafo** — an Obsidian-style live graph of the vault: one dot per node
   (`GET /api/graph` → `domain/buildGraph`), plus an optional node per tag,
   laid out by a running [`d3-force`](https://github.com/d3/d3-force)
   simulation you can grab. Pan / zoom, **drag nodes**, click to open in the
   Reader, hover to highlight the neighbourhood; ↻ restarts the simulation,
   ⊙ re-frames. Labels reveal on zoom (Obsidian's "text fade threshold") and
   on hover. Collapsible panels (persisted per browser): **Filtros** (search,
   tags-as-nodes, orphans), **Grupos** (colour a query-matched subset),
   **Aparência** (colour by tag, size by backlinks, arrows, and node-size /
   link-thickness / label-threshold sliders). Every enter/exit is animated.
   See [docs/ARQUITETURA.md](docs/ARQUITETURA.md#10-the-graph-screen). Listed
   first in the sidebar by explicit choice, even though it was built last.
2. **Estante** (Shelf) — a shelf of notebooks (cadernos); each notebook is a
   curated set of node *references* (drag a node in, it doesn't move
   anything — works both from the shelf's closed cover card and from inside
   an already-open notebook). A node can live in several notebooks at once.
3. **Console** — an aggregated board over every `tarefas/*.md` file: open /
   done / paused (`[~]`) task counts, stale folder-indexes, broken links,
   links leaving the vault, orphans. The one thing no generic Markdown
   viewer does, because it requires understanding the vault's own engine
   conventions.
4. **Ajustes (Settings)** — accent color, link color, theme (dark/light/system),
   reading typography (font/size/column width/line height), a per-tag color
   map with a real WCAG contrast guard, frontmatter pretty-printing toggle,
   TOC toggle, recents/pinned toggle, and the vault-path switcher. "Restaurar
   padrão" resets a whole section (Aparência, Tipografia) to defaults at once.
5. **Terminal** — not a sidebar tab either: a dock at the bottom of the
   window whose *collapsed form is the bar beneath it*, not a separate
   control for it. Collapsed, the bar lists the running sessions with
   their state dots, so you can see what is alive without expanding, and
   clicking one expands straight to it. Expanded, the tabs move into the
   panel header and the bar steps aside, with three actions grouped on the
   right: `+` new session, `›` collapse, `✕` end them all. Collapsing
   kills nothing; `✕` on a tab is the only thing that ends a shell.
   `Ctrl+`` ` toggles, and the height is dragged and persisted per
   browser. **Off by default** — it has to be
   enabled in Ajustes, because a local web app that can open a shell is a
   very different surface from a read-only reader. The shell, its working
   directory and the command typed on open are all configurable: the
   defaults resolve to this machine's own shell, the *active vault root*,
   and `claude` (Claude Code). Nothing is hardcoded to bash — the dropdown
   offers whatever really exists here, which is what makes the app work
   unchanged for someone on PowerShell.
6. **Reader** — not a sidebar tab. Opens from clicking a node in the file
   tree, global search (`Ctrl+K`), quick-switcher (`Ctrl+O`), or a
   recent/pinned item. Rendered Markdown, backlinks panel, "open in
   Obsidian / VS Code" button, pin toggle. The foundation the other screens
   build on (same indexer/parser), even without a nav entry of its own.

## API reference

All endpoints are served under `/api/*`, require `?token=<per-run token>`,
and are rejected unless the `Host` header names this machine's loopback
address on the bound port (see
[docs/ARQUITETURA.md](docs/ARQUITETURA.md#network-hardening) for why). This
is a reference list, not a full OpenAPI spec — see `server/src/index.ts` for
exact request/response shapes.

| Method | Path | What it does |
| --- | --- | --- |
| GET | `/api/health` | vault path, node count, last (re)index timestamp/duration |
| GET | `/api/tree` | full folder/file tree of the vault, annotated with node `kind` |
| GET | `/api/node?path=` | one parsed node + its backlinks + Obsidian/VS Code open URIs |
| GET | `/api/search?q=&limit=` | title/heading/body/path search (also backs the quick-switcher) |
| GET | `/api/board` | Console screen's aggregated data: task rows, stale indexes, broken/outside links, orphans |
| GET | `/api/graph` | Grafo screen's data: one node per file (title, tags, kind, distinct-inbound count), one undirected deduped edge per resolved internal link |
| GET/PUT | `/api/settings` | reading/appearance settings (Casa A `settings.yaml`) |
| GET/PUT | `/api/config` | current vault path + recent vault paths; `PUT` triggers a full re-walk + reindex |
| GET/POST | `/api/notebooks` | list / create notebooks (Casa A `cadernos/*.md`) |
| GET/PATCH/DELETE | `/api/notebooks/:key` | read / update cover (title, glyph, color) / delete one notebook |
| POST | `/api/notebooks/:key/nodes` | add a node reference to a notebook |
| DELETE | `/api/notebooks/:key/nodes?path=` | remove a node reference from a notebook |
| GET | `/api/open?path=&target=obsidian\|vscode` | builds an `obsidian://` or `vscode://` URI for a node |
| GET | `/api/state` | Casa B state: recent nodes, pinned nodes, recent vault paths |
| POST | `/api/state/pin` | toggle a node's pinned status |
| GET | `/api/backup/export` | downloads `mindview-backup.json` — settings, notebooks, pinned/recent nodes |
| POST | `/api/backup/import` | replaces settings, notebooks and pinned/recent nodes from an uploaded backup file |
| GET | `/api/events` | Server-Sent Events stream, one `reindex` event per completed reindex |
| GET | `/api/terminal/shells` | shells that really exist on this machine + what the current settings resolve to (shell, args, cwd, startup command) |
| WS | `/api/terminal/pty` | the embedded terminal's WebSocket. Refused unless the token matches, the `Host` names loopback, the `Origin` (when sent) is loopback, **and** the terminal is enabled in settings. Server→client: binary frames are raw output, text frames are JSON control (`ready` / `exit` / `error`). Client→server: JSON text only (`input` / `resize`) |

## Docs

- [docs/ARQUITETURA.md](docs/ARQUITETURA.md) — the local-only data home
  outside the vault and why, the `domain` → `server` → `web` pipeline, why reindex
  is full rather than incremental, why `remark` rather than CodeMirror,
  network hardening, why `node` runs inside WSL, the fence-test regression,
  the graph screen, and what's explicitly out of scope this version.
- [docs/DESIGN.md](docs/DESIGN.md) — visual identity (inherited 1:1 from
  `mind-landing`), design tokens, the deliberately green-free tag palette,
  the terminal-chrome signature.

## Post-launch polish (2026-09-05, five rounds of hands-on feedback)

Not a new Forge cycle — small, direct fixes to code the `frontend-web` cycle
had already delivered, made while Felipe used the running app. Full detail
in `mind/tarefas/empresa/mindview.md`; summary of what changed:

- **Navigation**: Grafo is now the first sidebar tab; "Leitor" was removed as
  a tab entirely (a node click/search/switcher/recent/pinned item opens the
  reader directly — a dedicated "Leitor" button with no node picked did
  nothing new). A collapse button next to the "MindView" title hides the
  whole tab list; a second button (`><`/`<>`) next to the "Vault" label
  expands/collapses every folder in the tree at once, cascading through
  every depth (a folder that's never been opened still mounts its children,
  just clipped to zero height — see `Tree.tsx`'s `.tree-collapse`).
- **Motion**: opening/closing a folder or the nav menu animates (CSS
  `grid-template-rows: 0fr → 1fr` on a one-row grid — the modern way to
  animate to an unknown content height without measuring it in JS); the
  folder caret rotates instead of swapping glyphs.
- **Shelf (Estante)**: dragging a node into an *already-open* notebook works
  now (it silently did nothing before — only the closed notebook's cover
  card in the shelf grid accepted a drop). The drop-target outline is
  clipped to the visible pane and scrolls internally instead of overflowing
  past the viewport. Cards clamp to 2 title lines and a fixed min-height so
  they're visually uniform regardless of content length. "Remove from
  notebook" is a small `✕` that only appears on hover, and asks for
  confirmation before removing.
- **Settings**: native `<input type="color">` swatches are re-skinned (the
  browser default is a thick grey bezel) into a plain rounded chip matching
  the design tokens. "Restaurar padrão" buttons reset the whole Aparência or
  Tipografia section at once (replacing a narrower per-field reset that only
  covered the link-color override).
- **Cross-screen state sync, generalized**: pinning/unpinning a node, or
  opening a new one, used to leave *other* open screens' own copy of
  `GET /state` stale until something unrelated refetched it (a reload, or
  navigating elsewhere) — each `useApi('/state')` call is independent, no
  shared cache. Fixed once, generally: `context/AppStateEvents.tsx` is a
  bump counter (same shape as `ReindexContext`, but for app-state mutations
  instead of vault-file changes) that every `useApi` call now also depends
  on, so any screen's pin/recent mutation refreshes every other screen
  immediately.

Later the same day, three more fixes and the last MVP screen:

- **Task counting**: `domain` counted *every* list item as a task, so
  `docs/ARQUITETURA.md`'s prose bullets inflated the Console board. Now a
  list item is a task only if it's a GFM checkbox (`[ ]`/`[x]`) or the
  vault's `[~]` paused convention. This also let `domain/test/fence.test.ts`
  stop pinning an absolute line number / total task count (both drift with
  normal vault edits) and assert by content instead — the two long-standing
  `domain` test failures are gone.
- **Reader TOC**: a `☰ Índice` toggle in the node toolbar collapses the
  260px TOC rail entirely (persisted per browser); useful on a narrow
  window. Separate from the global Ajustes "Índice (TOC) por nó" switch.
- **Reader double scrollbar**: `.reader-layout` was `height:100%` and, under
  the terminal chrome, overflowed `.screen-area` — a `.reader-screen` flex
  wrapper now keeps the chrome fixed and lets only the article column
  scroll.
- **Grafo**: the placeholder is gone — see "Screens" above and
  [docs/ARQUITETURA.md §10](docs/ARQUITETURA.md#10-the-graph-screen).

### Graph rework — Obsidian-style (2026-09-05)

The first graph was a one-shot static layout. Reworked to match Obsidian's
graph view (minus adjustable forces), then refined over several rounds of
live feedback. `domain` was never touched — tag nodes and all filtering live
in the new `web/src/lib/graphModel.ts`, so the vault selector and its tests
stay about the vault. Prefs moved to `mindview.graphPrefs.v2`. Full
architecture in [docs/ARQUITETURA.md §10](docs/ARQUITETURA.md#10-the-graph-screen),
full narrative in `mind/tarefas/empresa/mindview.md`.

- **Live simulation.** The hand-rolled layout is replaced by
  [`d3-force`](https://github.com/d3/d3-force) (`web/src/lib/graphSim.ts`),
  ticked from the screen's `requestAnimationFrame` loop. Nodes are draggable.
- **↻ is a staged re-growth**, not an alpha bump: the graph empties (tag
  nodes included) and returns one node at a time — orphans first, then
  breadth-first from each component's busiest hub, with edges waiting for
  both endpoints. The gap between nodes is a slider (`revealStepMs`, 0 turns
  the stagger off).
- **Tags are real nodes** (toggle), all one configurable size — size on this
  screen means "how linked-to is this note", so a popular tag shouldn't read
  as a hub.
- **Labels** show on the hovered node only, plus a zoom reveal (Obsidian's
  "text fade threshold"). Labelling the hovered node's *neighbours* too —
  what the pre-rework screen did — is unusable once tags are nodes.
- **Panels**: Aparência / Filtros / Grupos, collapsible, with a
  "Restaurar padrão".
- **Colour** is one checkbox: on → the node's first tag's colour; off → the
  mind-landing identity, file nodes in the accent and tag nodes in white.
- **Every enter and exit is eased** — nodes and edges fade + scale in JS
  (frame-rate independent), labels and panels via CSS transitions, and
  "recenter" tweens rather than jumps.

## Naming

"MindView" is final — see `mind/tarefas/empresa/mindview.md`.
