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

## 9. Known test failures / technical debt

Running `npm run test -w domain` originally showed **4 failing tests, all
vault content drift, not parser bugs** — confirmed by manually reparsing the
vault's current files and inspecting the mismatch by hand, not assumed. Two
of the four (9a) have since been fixed directly in the vault (out of this
project's control, but worth recording once it happened) — **2 failures
remain today (9b, 9c)**. **Do not fix those by editing the vault or by
hardcoding around the current content** — the fixes below are for a future
round, and are about making the tests robust to normal vault editing, not
about the parser being wrong today.

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

### 9b. Hardcoded line number in `docs/ARQUITETURA.md`'s test assertion

`fence.test.ts` asserts `bytes.split('\n')[77] === '---'` (0-based index 77,
i.e. line 78) to sanity-check that a mid-document horizontal rule is never
mistaken for frontmatter. The vault's `docs/ARQUITETURA.md` grew a line above
that point (an "organic growth" rule got longer) since the test was written,
so the `---` the test expects is now on a different line — the assertion
itself is fragile, not the parser: it hardcodes an absolute position in a
document that legitimately changes over time.

### 9c. Non-zero task count in the same fenced-example fixture

The same content growth in `docs/ARQUITETURA.md` gave the document more real
bullet lists elsewhere. `domain/src/parse.ts`'s task extraction
(`collectTasks`/`parseTask`) treats **every list item** as a task line (state
`open` by default, `done`/`paused` only for actual `- [x]`/`- [~]`
checkboxes) — this is intentional (it's what makes `[~]` detection work at
all, since remark-gfm doesn't recognize `[~]` as a checkbox), but it means
any bullet list in an `engine-doc` file also produces "tasks" in the parsed
node, even though `buildBoard` (`domain/src/selectors.ts`) only ever surfaces
tasks from `mind-node`-kind files, so this never reaches the actual UI. The
test asserting "this fixture has zero tasks" is really asserting "this
specific fenced example doesn't leak into task extraction," but it also
happens to count the file's unrelated real bullets, and now sees 30 instead
of 0.

### Suggested fix for a future `backend` round (not implemented here)

1. **Surface `frontmatter-parse-error` instead of it silently becoming
   `null`/`engine-doc`.** `ParsedNode.problems` already exists for exactly
   this (`domain/src/types.ts`) and is already populated in `parse.ts` — as
   of this writing, nothing in `server` or `web` reads it (confirmed by
   grepping both workspaces for `problems`). A `console.warn` on the server
   side when a node has a non-empty `problems` array, and/or a small "N
   parse issues" indicator surfaced somewhere in the Console screen, would
   make this class of bug visible immediately instead of silently
   reclassifying a node's `kind`.
2. **Stop hardcoding `fence.test.ts`'s mid-document `---` check to an
   absolute line index.** Search for the actual `<hr>`/`thematicBreak` mdast
   node's content or position relative to a known anchor (e.g., "the second
   `thematicBreak` in the document, wherever it lands") instead of
   `bytes.split('\n')[77]`, so normal vault editing doesn't break this test.

Neither of these was implemented as part of this documentation round — they
are scoped to a future `backend` cycle, per the task brief.

## 10. Graph placeholder: why it's last

The Graph screen ships as a literal "Graph — coming soon" placeholder,
confirmed by Felipe specifically so the screen doesn't read as empty/unfinished.
This isn't a scheduling afterthought — the `orchestrator`'s stress-test found
the vault genuinely has little to draw: 67 `.md` files, zero wikilinks (the
vault's own `ARQUITETURA.md` prohibits them), and 424 relative links that are
almost all index↔node pairs (a tree shape, not a graph shape). The real
dependency layer worth visualizing is ~6 files and ~8 edges. When it is
built, the planned customization is: color by the *last* tag (the most
specific one) rather than the first (which is the folder name in ~93% of
nodes, so "color by first tag" would just be "color by directory," no new
information), and node size by backlink count rather than total link count
(otherwise index files would dominate as giant balls).

## 11. Out of scope in this version, and why

Listed so nobody reopens these as "was this just forgotten?" — each was a
deliberate call, not an oversight:

- **Electron packaging.** MindView is a local web app (Vite + a Node
  server) today; Electron is deferred until an actual app icon/window is
  wanted, since neither the vault-path picker nor the Fase 2 terminal
  actually need it — a native Explorer dialog is the only thing Electron
  would add for free right now, and typing/pasting a path plus a "recent
  paths" list (mirroring how Obsidian's own vault switcher works) covers the
  same need without the packaging cost.
- **An embedded terminal.** Planned for a later phase (xterm.js +
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
- **A real force-directed/interactive graph.** See §10 — not enough graph
  structure in the vault today to justify the cost, and a placeholder
  avoids the screen looking broken/empty in the meantime.
- **Arbitrary CSS/snippets/third-party themes.** Ajustes exposes a fixed,
  curated set of appearance knobs (accent, link color, theme, reading
  typography, tag colors, a few toggles) — explicitly not an
  Obsidian-style "install any CSS snippet" surface. This keeps the app's
  visual identity (see `docs/DESIGN.md`) from eroding through customization.
- **Cloud sync, mobile, accounts, a paid API.** Desktop-only, local-only,
  single-user by construction — there is no server-side state that assumes
  more than one person using one machine.
