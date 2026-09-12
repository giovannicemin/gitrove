# gitrove

A git-style commit graph for work that isn't code. Branches are **threads of work**;
nodes are things you actually did, placed on a real time axis. Only the past is drawn —
plus one `current` node and a few ghosted `planned` ones past the TODAY line.

    python3 -m http.server 5173     # then open http://localhost:5173

No build step and no dependencies — plain ES modules, served as files.

## Project layout

    index.html          markup only
    css/base.css        palette (both themes), page shell, top bar
    css/chrome.css      sidebar, settings card, controls, detail panel, tooltip
    css/graph.css       the SVG: lanes, edges, nodes, labels
    src/config.js       every tunable number
    src/state.js        the one shared mutable object, S
    src/util.js         DOM, dates, text measurement, SVG helpers
    src/color.js        branch colours, adapted to the active theme
    src/tree.js         branch hierarchy (drives the sidebar)
    src/layout.js       the layout engine — pure geometry, draws nothing
    src/render.js       layout to SVG — reads positions, never computes them
    src/ui.js           header, branch tree, tooltip, detail panel
    src/camera.js       pan, zoom, and the two framings
    src/app.js          a setting changed: recompute, then redraw
    src/main.js         entry point and control wiring
    data/thesis.json    the project file

The dependency direction is one-way: `layout` never imports `render`, `render` never
computes a position. `window.gitrove` exposes `{S, layout, render, relayout, select}` for
poking at from the console.

## Data format

One JSON file per project. The DAG is *derived*, so you never write parent pointers by hand:

```jsonc
{
  "project":  { "name": "...", "subtitle": "...", "started": "2025-10-06" },

  "branches": [
    { "id": "main", "name": "Thesis", "color": "#e8c37a", "status": "active" },
    // "from" = the node this thread forked off; status: active | merged | abandoned
    { "id": "lit", "name": "Literature review", "color": "#7aa2f7", "status": "merged", "from": "m3" },
    // a SUB-branch is just a branch whose "from" points at a node on another branch.
    // main → ch3 → stats is three levels deep; the sidebar nests and collapses accordingly.
    { "id": "stats", "name": "Error bars, properly", "color": "#5fb86a", "status": "merged", "from": "r2" }
  ],

  "nodes": [
    { "id": "m3", "branch": "main", "date": "2025-10-15", "title": "Outline agreed", "tags": ["milestone"],
      "desc": "Free text. Shown on hover and in the side panel, never on the graph itself." },
    // a node that closes a thread: second parent = last node of the merged branch
    { "id": "m4", "branch": "main", "date": "2025-11-20", "title": "Folded in", "merges": ["lit"] },
    { "id": "d5", "branch": "ch4", "date": "2026-09-10", "title": "Working on this", "status": "current" },
    // planned nodes carry no date; they queue up after TODAY
    { "id": "f4", "branch": "main", "title": "Submit", "status": "planned", "tags": ["milestone"] }
  ]
}
```

Rules the renderer applies:

- within a branch, nodes chain in date order; the first one hangs off `branches[].from`
- `merges: ["id"]` adds a second parent — the last dated node of that branch
- `status`: `done` (default) · `current` · `planned`
- `tags: ["milestone"]` → larger ringed node, label always visible
- `desc` is the node's description: hover tooltip + detail panel
- a branch merging into its *parent branch* (rather than into main) is fine — see `stats` → `ch3`
- x = real date (with a minimum spacing sweep so busy weeks stay readable), y = lane

## Layout

**Lanes are reused.** A branch takes the first row that is free for its span, so a row can
carry several branches over the life of the project — with one constraint that keeps the
hierarchy readable: *a sub-branch always lands strictly below its parent*. Branches are
placed in fork order, which guarantees a parent is already placed when its children are
considered. In the sample data this packs 11 branches into 5 rows, and the one branch still
open stays near the top instead of drifting to the bottom of the canvas.

The sidebar is the opposite view: a depth-first tree with collapsible subtrees, independent
of which row a branch ended up on.

**Labels** are wrapped at `CFG.wrapChars` and packed into collision tiers, with a leader
line down to the node when they are not on the first tier. Lane heights are derived from
how many tiers each row actually needed.

Every outgoing edge leaves to the *right* of its node, climbing to a lane above (a merge)
or dropping to one below (a fork), so each label goes where no curve of its own will run:

| node's outgoing edges | label goes |
|---|---|
| drops to a sub-branch, or none | above the line |
| climbs to a merge | below the line |
| both at once | left of the node, right-aligned |

Branch titles sit just before the first node of the branch — exactly `ctrlOffset` away,
which is the distance the incoming fork curve needs to flatten out — and the branch's
shaded band starts at the title rather than at the first node.

Edges crossing a *neighbouring* label while traversing a lane gap are unavoidable; those
pass behind a background halo on the text, so the text stays legible.

An **abandoned** branch ends in a terminator — a stub and a bar across it — instead of
trailing off, so a thread that stopped is distinguishable at a glance from one still open.

## Settings

| control | what it does |
|---|---|
| label every node | all titles, or only milestones and whatever is still ahead |
| time spacing — **by date** | x is the real calendar date; quiet months are visibly quiet |
| time spacing — **even** | constant distance between consecutive events; month ticks are then placed wherever the month happens to turn over |
| label placement — **auto** | edge-aware (the table above), with nodes free of cross-lane edges going to whichever side needs the lower tier |
| label placement — above / below | force one side; label-vs-label packing still holds, but labels will cross their own merge or fork curves |
| sun / moon | light and dark palette. Branch colours are tuned for the dark canvas and darkened on the fly for light; the choice is remembered in `localStorage` |
