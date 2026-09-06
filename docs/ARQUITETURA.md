**[Leia em Português](ARQUITETURA.pt-br.md)**

# Architecture — MindView

MindView is a read-only viewer over the Mind vault: a local HTTP server
(`server`) exposes a pure parser/index (`domain`) to a React SPA (`web`).
There is no database, no user accounts, no cloud dependency — the vault's own
Markdown files are the only source of truth, and MindView's own data (theme,
notebooks, pinned nodes) lives in two small stores outside the vault, never
mixed into it.

## 1. The three packages, and why the split

```
domain  (pure, no fs)  →  server  (all IO + HTTP)  →  web  (React UI)
```

- **`domain`** — `(path, bytes) -> ParsedNode`, plus an index builder and a
  handful of selectors (search, board, staleness, broken/outside links,
  orphans, tree). It never touches `node:fs` or the network — see the
  comment at the top of `domain/src/types.ts`. This is deliberate, not
  incidental: it means the entire parsing/indexing logic can be unit-tested
  with plain strings (no fixtures on disk), and it can be reused unmodified
  if MindView ever grows a second frontend (a CLI, an Electron shell with a
  different renderer) — none of that would touch a line of `domain`.
- **`server`** — the composition root. Everything that reads a real file,
  watches the filesystem, binds a socket, or writes app state lives here,
  under `server/src/io/` and `server/src/app/`. `server/src/index.ts` is the
  only place that wires `domain`'s pure functions to actual disk I/O and
  turns the result into HTTP responses.
- **`web`** — a Vite + React 19 SPA that talks to `server` over `/api/*` and
  nothing else (no direct filesystem access, ever — even in dev, it goes
  through Vite's own proxy to the server process, see §7).

This was written in the `frontend-web` cycle after `domain` and a design
mockup already existed but no process actually served the vault over HTTP —
`server` was the missing composition root, not a new architectural layer
invented on top of already-agreed decisions.

## 2. One local-only home for MindView's own data, outside the vault

MindView needs to persist its own state — theme, notebooks, pinned nodes,
per-run auth token — but **none of it goes inside the vault's folder tree**.
An earlier idea (a `.mind-app/` folder inside the vault) was rejected during
the `backend` cycle:

- it would permanently dirty `scripts/status-all.sh`'s output;
- it lives in a directory patrol pattern the vault's own `maintenance` agent
  (which has write access and a mandate to prune cruft) would eventually
  touch;
- it would leak into `mind-template` (the generic, cloneable mirror of the
  vault) and its weekly divergence check;
- it would create merge conflicts on `git merge upstream/main` for anyone
  who clones the template.

`.md`/YAML was the right **format** for notebooks; inside the vault was the
wrong **place**. MindView's own state lives instead in a single directory —
`server/src/app/paths.ts`: `~/.local/share/mindview` (override:
`MINDVIEW_DATA_DIR` / `MINDVIEW_STATE_DIR`, both point here by default).
The code still keeps two logical groupings, `houseA.ts` and `stateB.ts`,
because they're written differently (`atomicWriteFile` with a `.bak` for one,
plain writes for the other) — but there is only one physical directory.

An earlier design (2026-09-04) split this into two directories — "Casa A", a
*separate git repository* (`mindview-data`, under a dedicated GitHub account)
meant to hold the durable half (settings, notebooks), versus "Casa B", the
disposable machine-local half. **Cut on 2026-09-05**: MindView's whole pitch
is "open it and use it" — nobody wants to `git init`/clone a repository just
to keep 4 preferences. See §2b for what replaced it.

- **`config.yaml`** — which vault path this instance points at.
- **`settings.yaml`** — accent color, theme, reading typography, tag→color
  map, the fixed set of toggles (`server/src/app/houseA.ts`,
  `DEFAULT_SETTINGS`).
- **`cadernos/*.md`** — one file per notebook. Frontmatter (`titulo`,
  `simbolo`, `cor`, `criado`) plus a list of
  `- [title](mind://<vault-relative-path>) <!-- t: title -->` lines. The
  `<!-- t: -->` comment is a **denormalized title snapshot** — see §2a below
  for why that matters.
- **`session.json`** — this run's auth token + port, read by Vite's dev-mode
  plugin to inject the token automatically (see §7).
- **`state.json`** — recent nodes, pinned nodes, recent vault paths.
- **`usage.jsonl`** — append-only open-event log.

Nothing here is versioned, and nothing here is read by the vault's own
`maintenance` agent.

### 2a. The risk of referencing a vault MindView doesn't control

Notebook entries are foreign keys into a vault whose content changes
concurrently — the vault's own engine reorganizes files (its
`docs/ARQUITETURA.md` §5 promotes a growing collection of related nodes into
its own folder, moving files), and a Mind maintenance round can rewrite
several files in one pass. If a notebook only stored a bare path, a renamed
or moved node would silently disappear from every notebook that referenced
it, with no way to tell "this node moved" from "this node was deleted."

The mitigation, named by the `backend` cycle and implemented in
`server/src/app/houseA.ts`, is small (~20 lines): every notebook entry stores
`titleAtIndex`, the node's title **as last seen at indexing time**, next to
its path. When a referenced path no longer resolves in the live index (see
`Shelf.tsx`'s `pathSet` check, rendered as `.is-missing`), MindView marks the
card as missing and shows the last-known title instead of silently dropping
the reference — it never removes a dangling reference on its own. Re-linking
it to wherever the node moved is a manual step, on purpose: guessing by
title match risks reattaching to the wrong file.

### 2b. Durability via export/import, not a second repository

Since there's no repo behind settings/notebooks anymore, `server/src/app/
backup.ts` is the entire durability story: `GET /api/backup/export` returns a
single indented JSON file (`{version, exportedAt, settings, notebooks,
pinnedNodes, recentNodes}`, download served via a `Content-Disposition`
header) and `POST /api/backup/import` replaces settings, notebooks (a full
`cadernos/` wipe-then-rewrite — never a merge — via `houseA.ts`'s
`replaceAllNotebooks`), and pinned/recent nodes from an uploaded file. Same
shape as the Dindin app's own backup feature (`lib/services/
import_export_service.dart`: "Exportar backup" / "Importar backup", replace-
all on import, confirmed by the user first). `vaultPath`/`recentVaultPaths`
are deliberately excluded from the payload — a backup made on one machine
must never silently repoint another machine's running instance at a path
that may not exist there. `session.json` and `usage.jsonl` are excluded too:
one is a per-run secret, the other a log, neither is state worth restoring.
The Ajustes screen's "Backup" section (`web/src/screens/SettingsScreen.tsx`)
is the only UI for this — no automatic/scheduled export exists.

## 3. Reindex is full, not incremental — on purpose

`domain/src/buildIndex.ts` rebuilds the entire `VaultIndex` (nodes, backlinks,
tag set) from scratch on every change, with no partial-update path. Measured
at **~4.1ms for 68 files / 356KB** (comment in `buildIndex.ts`). Incremental
indexing was considered and rejected: it would save an unmeasurable amount of
time (4ms) while introducing a whole class of stale-state bugs (a node that
changes which other nodes link to it, a rename that needs to update
backlinks in every referencing node, a folder-index staleness check that
depends on every descendant). `VaultService`
(`server/src/app/vaultService.ts`) treats the index as a single mutable slot
that gets swapped wholesale — there is never a "partially updated" state to
reason about, by construction. This only holds because the vault stays in
the tens-of-files, sub-second-parse range; if the vault grew by two orders of
magnitude, this trade-off would need revisiting.

## 4. Why `remark`, not CodeMirror

The renderer is `unified` + `remark-parse` + `remark-frontmatter` +
`remark-gfm` — the exact same pipeline in both `domain` (parsing, for the
index) and `web` (rendering, via `react-markdown` with the same remark
plugins). This is one parser used twice, never two independent ones that
could drift apart.

CodeMirror 6 (Obsidian's own editor engine) was considered and rejected for
this version: Obsidian itself still maintains two separate rendering modes
(live-preview/CM6 for editing, reading-view for display) years after
adopting CM6 — taming its decoration system is real, multi-week work, and
MindView is read-only in this version, so there's no editing surface that
would justify that cost. `remark` produces an mdast (Markdown AST) with
source positions for free, which is exactly what's needed both for indexing
(link/task/heading extraction with positions — see §5) and for rendering to
React components. Adopting CM6 now would have spent the project's first two
or three weeks domming an editor for a feature (editing) that's explicitly
out of scope until a future phase — see §8.

## 5. Write-shaped, not write-capable

The product brief calls for editing to return in a future phase, but nothing
in this version writes to `.md` content, and the `backend` cycle's explicit
position was: don't write unused write code now ("passive, untested code
gives false confidence"). What actually de-risks a future editor, instead:

- **Source positions in every parsed structure.** `HeadingInfo`, `LinkInfo`,
  and `TaskInfo` (`domain/src/types.ts`) all carry a `Position` (line,
  column, byte offset). Without this, a future "rename this node and fix its
  ~424 incoming links" feature would have to reparse-and-guess where to
  inject text; with it, that becomes an exact byte-offset replace.
- **`mtime` + raw text kept in the index** (`IndexedNode` extends
  `ParsedNode` with `mtimeMs`/`size`; `ParsedNode.raw` keeps the original
  bytes) — a future writer would diff against the exact bytes last read, not
  a reconstruction.
- **Parsing is pure, with one single IO gate.** All disk access funnels
  through `server/src/io/`; there's no second, informal path a future
  feature could bypass.
- **The model is never re-serialized back into Markdown.** `ParsedNode.raw`
  is kept verbatim precisely so nothing ever needs to turn an AST back into
  text — a `.md` file's only representation across this codebase is its own
  original bytes plus a derived, read-only view. (Notebook files, in Casa A,
  are the one place MindView does serialize — see `houseA.ts`'s
  `serializeNotebook` — but that's MindView's *own* file format, never the
  vault's.)

## 6. Network hardening

`server/src/index.ts` runs a plain `node:http` server, no framework. It binds
`127.0.0.1` only (never `0.0.0.0`) and enforces, on **every** request inside
`dispatch()`:

1. **Host header allow-list** (`server/src/io/security.ts`,
   `isHostAllowed`) — only `127.0.0.1`/`localhost` on the exact bound port is
   accepted; anything else is rejected with 403. This defeats DNS rebinding
   (a malicious page resolving a hostname to `127.0.0.1` after your browser
   already trusts it). It's applied to **every** request, including the
   static HTML/SPA shell — not just `/api/*`. If it were only enforced on
   `/api/*`, a rebound page could still same-origin-fetch `/` (the HTML
   shell) and read the auth token embedded in it (see next point) before the
   Host check would ever run on the API call itself.
2. **Per-process token**, required as `?token=` on every `/api/*` request
   (`generateToken`, `randomBytes(24)`, regenerated every time the server
   starts — never persisted beyond `session.json` in Casa B). Compared with
   `tokenFromRequest` from the query string; mismatches get 403.
3. **No CORS headers, ever** (`server/src/http/respond.ts`). Cross-origin
   access during `npm run dev` goes through Vite's *own* dev-server proxy —
   a same-process Node→Node HTTP hop, not a browser-granted CORS exception —
   so the browser only ever talks to one origin (Vite's), and the actual
   server never needs to trust any origin at all.
4. **`confine()`** (`server/src/io/confine.ts`) — every path derived from
   user or link input is resolved via `realpathSync` (following symlinks)
   and checked against the vault root before any read/URI-building happens.
   This exists because it's not a hypothetical: **the live vault has 7 links
   that point outside its own root** — real path-traversal targets, not a
   theoretical attack surface invented for this doc.

The token-injection mechanism itself (how the browser gets the token without
manual copy/paste) is covered in §7.

## 6a. Why `node` runs inside WSL

The vault lives on the WSL distro's own ext4 filesystem. A native Windows
process reading it through the `\\wsl$\<distro>\...` UNC path would work for
reads, but **does not receive `inotify` events** — file-watching would have
to fall back to polling (`usePolling`, the escape hatch `MINDVIEW_POLL=1`
still exists in `server/src/io/watcher.ts` for exactly this case, but isn't
the default). Running `node` natively inside WSL gets real `inotify` for
free. This decision also unlocks a future phase item for free: an embedded
terminal (Fase 2, xterm.js + node-pty) can open a WSL shell and run the
Claude Code CLI natively, with no `wsl.exe` process-spawning bridge — see §8.

## 7. Auth-token bridging between the two dev processes

In dev mode, `server` and `web` are two separate processes on two separate
ports (4317 and 5173). The server generates a fresh token on every start
(`TOKEN` in `server/src/index.ts`) and writes it to Casa B's
`session.json` (`writeSession`). Vite's own plugin
(`injectTokenPlugin` in `web/vite.config.ts`) reads that same file on every
`index.html` request and stamps
`<script>window.__MV_TOKEN__=...;window.__MV_PORT__=...;</script>` into the
`<head>` before serving it — so the browser has the current run's token with
no manual step. In `npm run start` (single process), the server does the
same stamping itself when it serves the built `index.html`
(`injectToken` in `server/src/index.ts`) — same mechanism, two different
places emitting the HTML depending on which mode is running.

Vite also proxies `/api/*` to the server (`server.proxy` in
`web/vite.config.ts`), which is why dev mode never needs CORS: from the
browser's point of view there is only one origin (Vite's), and the
Vite→server hop is a same-process Node HTTP request, not a cross-origin
browser fetch.

## 8. The fence test: a mandated, permanent regression case

`domain/test/fence.test.ts` exists because **the same false positive has
independently fooled three different people/agents working on this
project** — each one, looking at `docs/ARQUITETURA.md` in the vault, saw a
`tags: [tag1, tag2]` / `criado: AAAA-MM-DD` block and concluded the parser
was inventing garbage tags/dates. In every case the real explanation was the
same: that block is a **documentation example of the frontmatter format,
written inside a fenced ` ```yaml ` code block**, not real frontmatter. The
file's actual line 1 is a `# ` heading, not `---`.

Why this keeps recurring: `remark-frontmatter` only recognizes a `---`
block when it is the very first thing in the document — never mid-document,
and never inside a fence (fences tokenize as their own block type before
frontmatter would even be considered). That's exactly right, but it means
any naive `grep ^tags:`-style extractor, or a human skimming the raw text
top-to-bottom, will find the fenced example first and misread it as
frontmatter. `domain/src/parse.ts` gets this right (only `tree.children[0]`
being a `yaml` mdast node counts), and `fence.test.ts` locks that behavior
down permanently against exactly this fenced-example shape, plus a second,
related case: `claude-user/skills/mind/SKILL.md`, which has **real**
frontmatter (`name`/`description`) but no `tags` key, so it must classify as
`claude-asset`, not `mind-node`, and must contribute zero tags to the vault's
tag set.

**Anyone touching `parse.ts`, `buildIndex.ts`, or the frontmatter-detection
logic must run `fence.test.ts` and understand why each assertion exists
before changing behavior around fences or frontmatter detection.**

## 9. Known test failures (technical debt)

Running `npm run test -w domain` once showed **4 failing tests, all vault
content drift, not parser bugs** — confirmed by manually reparsing the
vault's current files and inspecting the mismatch by hand, not assumed.
**All four are resolved as of 2026-09-05** (`domain` is 36/36). This section
records what they were and how each was fixed, because the shape of bug
(a test coupled too tightly to the live vault's content) is worth not
repeating.

### 9a. `claude-user/skills/mind/SKILL.md` misclassified as `engine-doc` — FIXED 2026-09-05

The vault's `SKILL.md` frontmatter had, inside its `description:` field, a
fragment shaped like `no Mind: decidir...` — a colon-space inside an
**unquoted** YAML scalar. YAML reads `key: value` inside that scalar as a
nested mapping attempt and fails with `mapping values are not allowed here`.
`parse.ts`'s `parseYaml(yamlNode.value)` threw, `problems` got a
`frontmatter-parse-error` entry, and `frontmatter` fell back to `null` —
which made `detectKind` classify the file as `engine-doc` (no frontmatter)
instead of `claude-asset` (frontmatter present, no `tags` key). Two
assertions in `fence.test.ts` failed because of this one root cause. Not
MindView's bug, and out of this project's scope to fix directly — but it got
fixed anyway: the `description:` value is now quoted in both
`mind/claude-user/skills/mind/SKILL.md` and its `mind-template` mirror,
found and fixed while working the MindView backlog (see
`mind/tarefas/empresa/mindview.md`). `npm run test -w domain` reflects this:
27/31 → 29/31.

### 9b. Hardcoded line number in `docs/ARQUITETURA.md`'s test assertion — FIXED 2026-09-05

`fence.test.ts` asserted `bytes.split('\n')[77] === '---'` (line 78) to
sanity-check that a mid-document horizontal rule is never mistaken for
frontmatter. The vault's `docs/ARQUITETURA.md` grew lines above that point
(an "organic growth" rule got longer), so the `---` moved. The test now
finds the first `---` line past line 1 by scanning (`lines.findIndex((l, i)
=> i > 0 && l.trim() === '---')`) and asserts that one exists and that
`frontmatter` is still `null` — no absolute position.

### 9c. Parser counted every bullet as a task — FIXED 2026-09-05

`domain/src/parse.ts`'s `collectTasks` pushed **every** `listItem` as a
task, so a prose document like `docs/ARQUITETURA.md` produced dozens of
phantom "open tasks" — harmless in the UI (`buildBoard` only reads
`mind-node` files) but enough to inflate the Console board's totals and to
make a "this fixture has zero tasks" assertion fail. `collectTasks` now
gates on `isTaskItem`: a list item counts only if it's a GFM checkbox
(`li.checked` is a boolean) or its text starts with `[~]` (the vault's
paused convention, which remark-gfm leaves as a plain item). `parseTask` is
correspondingly simpler — the "plain bullet → open task" branch is gone.
`parse.test.ts` has a regression case ("does not count a plain bullet as a
task").

### Still open: surface `frontmatter-parse-error` instead of swallowing it

`parse.ts` populates `ParsedNode.problems` with a `frontmatter-parse-error`
when a node's YAML frontmatter fails to parse, then falls back to
`frontmatter: null` — which silently reclassifies the node as `engine-doc`
(this was root cause 9a). Nothing in `server` or `web` reads `problems`
today. A `console.warn` server-side when a node has a non-empty `problems`
array, and/or a small "N parse issues" indicator in the Console, would make
this visible instead of a silent `kind` change. Not yet scheduled.

## 10. The graph screen

Built last on purpose, and shipped as a "Graph — coming soon" placeholder
until 2026-09-05. That wasn't a scheduling afterthought: the `orchestrator`'s
stress-test found the vault has relatively little graph structure — ~70
`.md` files, zero wikilinks (the vault's own `ARQUITETURA.md` prohibits
them), and relative links that are mostly index↔node pairs (a tree shape).
The real graph today is ~69 nodes / ~236 deduped edges, with the folder
indexes as the natural hubs.

**Data — `domain/buildGraph(index)` → `GET /api/graph`.** One `GraphNode`
per indexed file (`path`, `title`, `tags`, `kind`, `isIndex`,
`backlinkCount`). Edges are resolved internal links between two indexed
nodes; external links, outside-vault links, pure anchors and self-links are
dropped, and A→B / B→A / duplicate links collapse to **one undirected
edge**. `backlinkCount` is the number of *distinct other nodes* that link in
(not `index.backlinks.get(path).length`, which counts every link occurrence
including repeats and self-links) — this is what the screen sizes nodes by,
deliberately not outbound link count (an index node links out to everything
and would dominate).

**Render model — `web/src/lib/graphModel.ts`.** The server graph is
file-only; the *renderable* model is derived in the web layer (kept out of
`domain` so the selector and its tests stay about the vault, not about how
it's drawn). It optionally adds one node per distinct tag with an edge to
every file that carries it, then applies the Filters (search query, orphans
on/off, tags on/off) and resolves each node's final colour (a matching
**group** query wins over the tag palette) and radius.

**Simulation — `web/src/lib/graphSim.ts`.** A live [`d3-force`][d3f]
simulation, ticked by hand from the screen's `requestAnimationFrame` loop
(`sim.stop()` at construction, `sim.tick()` per frame) so React owns the
frame and the loop can idle the instant `alpha` drops below `alphaMin` and
nothing is animating. This **reverses the earlier decision** to hand-roll a
one-shot static layout (`graphLayout.ts`, deleted): the graph is now
something you grab, and "restart" re-heats it — that needs a real running
simulation, and `d3-force` (~11 KB gzipped) is the engine Obsidian's graph
effectively mirrors. `GraphSim` also owns node/edge **enter-exit state**: a
linear `p ∈ [0,1]` presence value per item that the render eases into
opacity + scale, so filter changes fade in/out instead of popping. Forces
are fixed (no "Forces" panel): many-body repulsion scaled by node radius,
link distance/strength by kind (file↔file vs file↔tag), gentle `forceX/Y`
centring, `forceCollide`.

**Screen — `web/src/screens/GraphScreen.tsx`.** SVG under a `<g transform>`
for pan / zoom (wheel toward the cursor). Drag the background to pan; drag a
**node** to move it (pinned via `fx/fy` while held, `alphaTarget` raised so
neighbours follow, released on pointer-up). Click a node (no drag) → open it
in the Reader. Hover → highlight the node + its direct neighbours, dim the
rest (CSS-transitioned). The view **auto-frames** the graph as it settles
until the first manual pan/zoom/drag; the ⊙ button tweens back to that fit,
↻ restarts the simulation — not a plain alpha bump but a **staged
re-growth**: positions are re-seeded, the graph empties (tag nodes included —
Obsidian keeps those on screen, we don't), and it comes back one node at a
time. The order is orphans first, then breadth-first from the most-connected
node of each component, busiest neighbour first; an edge waits for both its
endpoints. The per-node gap is the `revealStepMs` pref (0–150 ms, default
20; `0` skips the stagger entirely and the graph returns in one piece) — it
used to be derived from the node count and is now just a slider, since the
right pace is a matter of taste, not arithmetic. The order is deterministic
(ties break on degree, then id), so the same graph always assembles the same
way. Labels follow Obsidian's "text fade threshold":
hidden when zoomed out, fading in past a zoom the slider controls, and always
shown for **the hovered node only** — extending that to its neighbours (what
the pre-rework screen did) is unusable once tags are nodes, since hovering a
hub tag would shout the name of every file carrying it. The neighbourhood is
still highlighted, by not being dimmed rather than by being labelled.
Controls
(`web/src/screens/GraphControls.tsx`), persisted per browser in
`localStorage` (`mindview.graphPrefs.v2`, see `web/src/lib/graphPrefs.ts`):

- **Aparência** — *cor por tag* is a single on/off. **On**, a node takes its
  **first** tag's colour, from the Ajustes `settings.tagColors` map, else a
  stable hash into an ANSI-terminal palette with **no green**
  (`web/src/lib/tagPalette.ts`). **Off**, the graph falls back to the
  mind-landing identity — green + white: file nodes in `var(--accent)`, tag
  nodes in `var(--fg)`. (There used to be a "most specific / first" pair of
  chips; cut because the distinction never explained itself on screen, and
  the first tag — the folder name in ~93% of nodes — is what makes the graph
  read as coloured regions rather than confetti.) Also: size by backlinks
  on/off; a flat tag-node size; arrows on/off (drawn on the stored link
  direction — approximate, since the domain edge is deduped/undirected);
  node-size, tag-size, link-thickness and label-threshold sliders.
- **Filtros** — search (`tag:` / `path:` prefixes or plain substring),
  *tags como nós* on/off, *órfãos* on/off. "Existing files only" and
  "attachments" from Obsidian's panel don't apply here: the vault is
  read-only, has no attachments, and its engine forbids unresolved links.
- **Grupos** — colour a subset by a search query, Obsidian-style; a match
  overrides the tag palette for that node.
- **Restaurar padrão** in the panel footer puts every pref back to
  `DEFAULT_GRAPH_PREFS` and re-enables auto-framing.

A **tag node** is drawn as a filled dot in that tag's own colour plus a halo
ring — the ring, not a hollow centre, is what distinguishes it from a file
node. The same `tagColors` map (with the same `autoColorForTag` hash
fallback) also drives the reader's tag pills, so one tag is one colour
everywhere; the pills used to fall back to a flat `var(--blue)` for any tag
the user hadn't coloured, which made them all look alike next to a graph
that gave each its own hue.

[d3f]: https://github.com/d3/d3-force

## 11. Out of scope in this version, and why

Listed so nobody reopens these as "was this just forgotten?" — each was a
deliberate call, not an oversight:

- **Electron packaging.** Still out of scope *in this version*, but the
  decision changed on 2026-09-06: Electron **will** happen, as a window
  only — the Node server and the PTY stay in their own process and Electron
  just frames `http://127.0.0.1:<port>`, starting the backend on open and
  killing it on close. That shape dissolves the objection recorded below:
  Electron never loads `node-pty`, so there is no `electron-rebuild`
  against Electron's ABI. It also keeps one app for two launch modes —
  spawn `node` natively (the ordinary case: a Windows user with the vault
  in `Documents`, `claude` installed natively and PowerShell as the shell)
  or spawn it inside WSL (this vault's own, unusual case). Original note,
  kept for the record: MindView is a local web app (Vite + a Node
  server) today; Electron was deferred until an actual app icon/window is
  wanted, since neither the vault-path picker nor the Fase 2 terminal
  actually need it — a native Explorer dialog is the only thing Electron
  would add for free right now, and typing/pasting a path plus a "recent
  paths" list (mirroring how Obsidian's own vault switcher works) covers the
  same need without the packaging cost.
- ~~**An embedded terminal.**~~ **Shipped 2026-09-06 — see §12 below.**
  The transport boundary kept open for it turned out to be exactly what was
  needed: `/api/events` stayed SSE and the terminal got its own WebSocket.
  Original note kept for the record: planned for a later phase (xterm.js +
  node-pty, running the Claude Code CLI inside the app) — deliberately
  easier in this web-local + WSL setup than it would be in Electron
  (`node-pty` needs `electron-rebuild` against Electron's ABI; here it just
  compiles normally, and the PTY can open a WSL shell directly instead of
  crossing a `wsl.exe` bridge from a native Windows Electron process). Not
  started; the one thing kept open for it is an abstract transport module
  boundary, since today's `/api/events` is SSE (server→client only) and a
  terminal needs a bidirectional channel (likely WebSocket) later.
- **A real content editor.** The product brief wants an Obsidian/VS
  Code-style editor eventually, but this version is deliberately read-only —
  see §5 for what's already in place to make that safer to add later, and
  why nothing is half-built now.
- **Cover image upload for notebooks.** MVP notebooks use a curated set of
  monochrome glyphs (no emoji, no image upload) — a smaller, controlled
  surface than "any image," deferred rather than cut.
- **Arbitrary CSS/snippets/third-party themes.** Ajustes exposes a fixed,
  curated set of appearance knobs (accent, link color, theme, reading
  typography, tag colors, a few toggles) — explicitly not an
  Obsidian-style "install any CSS snippet" surface. This keeps the app's
  visual identity (see `docs/DESIGN.md`) from eroding through customization.
- **Cloud sync, mobile, accounts, a paid API.** Desktop-only, local-only,
  single-user by construction — there is no server-side state that assumes
  more than one person using one machine.

## 12. The embedded terminal

Shipped in Fase 2 (2026-09-06). The goal is narrow and concrete: run the
Claude Code CLI *inside* MindView, in the vault, without paying for a
pay-as-you-go API integration — it reuses the CLI and plan that already
exist.

**Why a PTY and not a plain pipe.** A pseudo-terminal is what makes an
interactive program believe a human is typing at a real screen. Programs
ask the OS "am I talking to a terminal or to a pipe?" and behave
differently: `ls` drops its colours when redirected to a file. A full-screen
TUI like `claude` needs far more than colour — the window's rows/columns
(and a signal when they change), each keystroke delivered as it happens
rather than a whole line on Enter, cursor-movement escape codes, and Ctrl+C
arriving as a *signal* instead of a literal character. None of that exists
over an ordinary stdio pipe, so without a PTY `claude` cannot draw its UI at
all. `node-pty` (`server/src/app/terminalService.ts`) is the same library
VS Code's terminal uses; it carries native code because creating a PTY is a
direct OS call, not something JavaScript can do alone.

**Why WebSocket, and an honest correction.** A terminal needs a
low-latency, bidirectional channel; `/api/events` is SSE, which only pushes
server→client. The alternatives weighed were: implement RFC6455 by hand
(~150 lines of binary framing, masking, fragmentation and ping/pong — a
plausible portfolio piece, but the place subtle bugs hide) and SSE plus a
POST per keystroke (no new dependency, but every key becomes an HTTP
request, and a full-screen TUI would feel it). `ws` won: zero dependencies
of its own, ~100 KB, pure JS. The trade-off was originally argued as
"the server loses its zero-runtime-dependency purity" — **that framing was
wrong**: `chokidar` and `yaml` were already runtime dependencies. There was
no purity to protect, only the ordinary question of whether a dependency
pays for itself.

**The upgrade gate** (`server/src/http/terminalSocket.ts`). An HTTP
`upgrade` never reaches the normal request handler, so every guard in
`server/src/index.ts` has to be re-applied by hand. Four checks, in order:
path, `Host` (anti DNS-rebinding, §6), `Origin`, and the per-run token —
plus the terminal being enabled in settings. **The `Origin` check is not
redundant with the token.** The same-origin policy does *not* cover
WebSockets: any page on the internet can open one to `127.0.0.1` (this is
Cross-Site WebSocket Hijacking), and here the thing on the other end is a
shell. In dev it is in fact the *only* cross-origin lock left standing,
because Vite's proxy rewrites `Host` (`changeOrigin`) and the anti-rebinding
check therefore passes by construction.

The allowlist is an **exact set** of origins — this server's own, plus the
pinned Vite dev origin (`MINDVIEW_DEV_ORIGIN`, default
`http://localhost:5173`, which is why `web/vite.config.ts` sets
`strictPort: true`). An earlier version accepted *any* loopback port, which
the security review showed was exploitable end to end: Vite's default CORS
policy answers any loopback origin, the HTML it serves carries the run
token, so a page on any other local port could read the token and open a
shell with it. Hence `cors: false` in the Vite config as well — the SPA only
ever fetches same-origin, so it costs nothing. A missing `Origin` is
allowed: browsers always send one on a WebSocket handshake, so this only
admits non-browser clients, which still need the token.

**`terminalEnabled` is a usability switch, not a security boundary.**
Anyone holding the token can turn it back on through `PUT /api/settings`
and then connect. The token is the boundary — which is why it is no longer
printed to the console and why Casa A/B are created `0700` with files
written `0600`: those two facts decide the blast radius when it leaks. The
terminal settings that reach `spawn` are type-coerced on every read
(`sanitizeTerminal` in `houseA.ts`), because `settings.yaml` is written by
an HTTP endpoint and editable on disk — it is not a trusted file.

**Wire protocol, deliberately asymmetric.** Server→client: binary frames
are raw terminal output (high volume, no reason to JSON-escape every
chunk), text frames are JSON control (`ready` / `exit` / `error`).
Client→server: JSON text only (`input` / `resize`) — keystrokes are tiny,
so clarity beats bytes. The browser decodes output with a streaming
`TextDecoder`, because a UTF-8 character can be split across two frames.

**Off by default.** A local web app that can spawn an arbitrary shell is a
very different surface from a read-only reader, so `terminalEnabled` ships
`false` and the endpoint refuses the upgrade until it is turned on — the
socket is not merely hidden in the UI, it does not exist.

**Nothing is hardcoded to bash.** The vault owner runs WSL, but anyone
cloning this repo may be on PowerShell, cmd, zsh or fish, so
`server/src/app/shells.ts` detects what really exists on *this* machine and
`GET /api/terminal/shells` reports both that list and what the current
settings resolve to. Three settings drive a session: the shell (blank =
this machine's default), the working directory (blank = **the active vault
root**, so the terminal always opens in the Mind rather than wherever the
server was started) and the command typed on open (default `claude`, blank
= a plain shell). This is the difference between an app that works for its
author and one that works for anyone who clones it.

**Discoverability, and why the bar exists.** The first version shipped as a
silent opt-in: disabled by default, with no affordance anywhere and a
keyboard shortcut that deliberately does nothing while the feature is off.
That is undiscoverable — the only way to learn the terminal existed was to
read the settings screen end to end. So there is now a permanent bar along
the bottom of the window. When the terminal is switched off it says so and
links to the switch; showing that link grants no capability, since the
socket still refuses every connection. The lesson generalises: *off by
default* and *invisible* are different decisions, and only the first one
was intended.

**Minimising is not ending.** A session's shell dies when its `TerminalView`
unmounts — the cleanup closes the socket and the server kills the PTY on
`close`. That single fact defines the whole panel: minimising keeps every
tab mounted and merely hides them, while `✕` on a tab unmounts it and is
therefore the only thing that ends a shell. Sessions are tabs, each with
its own xterm and its own socket, capped server-side at 8. A hidden panel
with no tabs opens none: starting `claude` behind something nobody can see
would be both wasteful and surprising.

**Session lifetime.** One PTY per socket; it dies with the socket. The
panel survives *screen* changes because the SPA never reloads while you
navigate, but a browser reload starts a fresh shell. Re-attaching to a
surviving session (a scrollback buffer plus a grace period after
disconnect) was considered and deliberately left out of this round — it
adds orphan-process lifecycle to a feature whose first version is better
kept small.

**Cost control on the client.** `@xterm/xterm` is ~250 KB and the terminal
ships disabled, so `TerminalPanel` is `React.lazy()`-ed into its own chunk:
a session that never opens the panel never downloads it.
