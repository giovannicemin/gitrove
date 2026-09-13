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
    src/org.js          reads the org subset a project file uses
    src/color.js        the palette, and colours adapted to the active theme
    src/tree.js         branch hierarchy (drives the sidebar)
    src/layout.js       the layout engine — pure geometry, draws nothing
    src/render.js       layout to SVG — reads positions, never computes them
    src/ui.js           header, branch tree, tooltip, detail panel
    src/camera.js       pan, zoom, and the two framings
    src/animate.js      springs the drawing from one layout to the next
    src/app.js          a setting changed: recompute, then redraw
    src/main.js         entry point and control wiring
    data/example_thesis.org    a sample project — swap in your own

The dependency direction is one-way: `layout` never imports `render`, `render` never
computes a position. `window.gitrove` exposes `{S, layout, render, relayout, select}` for
poking at from the console.

## The project file

One org file per project. Branches are level-1 headings, the things you did are their
level-2 children, and the body text under a heading is its description.

```org
#+TITLE:    PhD Thesis
#+SUBTITLE: Nonequilibrium dynamics of driven lattices
#+STARTED:  [2025-10-06 Mon]
#+TODO:     TODO DOING | DONE
#+TODO:     ACTIVE | MERGED CANCELLED

* ACTIVE Thesis
:PROPERTIES:
:ID:       main
:END:
** DONE Thesis repo and LaTeX template set up
CLOSED: [2025-10-09 Thu]
One repo for text, code and figures. Compiles to an empty 3-page PDF.
** DONE Outline agreed: five chapters                             :milestone:
CLOSED: [2025-10-15 Wed]
:PROPERTIES:
:ID:       m3
:END:
** DONE Related work folded into Chapter 1
CLOSED: [2025-11-20 Thu]
:PROPERTIES:
:MERGES:   lit
:END:
** TODO Submit                                                    :milestone:

* MERGED Literature review
:PROPERTIES:
:ID:       lit
:FROM:     m3
:END:
```

| | |
|---|---|
| `DONE` + `CLOSED:` | it happened, on that date |
| `DOING` + `SCHEDULED:` | what you are on right now |
| `TODO`, no timestamp | planned; sits past the TODAY line, ghosted |
| `ACTIVE` / `MERGED` / `CANCELLED` | on a level-1 heading: the state of that thread |
| `:FROM:` | the entry this branch grew out of — this is what makes a sub-branch |
| `:MERGES:` | this entry folds that branch back in |
| `:milestone:` | larger ringed node, label always visible |
| `:COLOR:` | optional override; see below |

**Most entries need no `:ID:`.** Only ones something points at do — fork points and
branches. In the sample that is 8 entries out of 63; the rest are a heading, a date and a
paragraph. The app assigns an id only when you create a reference to something.

**Colours are not in the file.** Top-level branches take successive palette entries; a
sub-branch takes its parent's hue, shifted and darkened a little, so a family stays
recognisable. Write `:COLOR: #7aa2f7` on a branch to override one.

Because the file uses real org TODO keywords and `CLOSED:`/`SCHEDULED:` timestamps, it also
works in the Emacs agenda without any extra setup.

## Layout

**Lanes are reused.** A branch takes the first row that is free for its span, so a row can
carry several branches over the life of the project. Rows are *signed* — negative above the
trunk, positive below — and two rules keep the tree readable: a sub-branch stays on the same
side of the trunk as its parent, and always lands further out than it. Branches are placed in
fork order, which guarantees a parent is already placed when its children are considered. In
the sample data this packs 11 branches into 5 rows, and the one branch still open stays near
the trunk instead of drifting to the bottom of the canvas.

The `branches` setting decides which signs are on offer: `below` (positive only), `above`
(negative only) or `both sides`. Both sides reads more like a tree, but costs a row here —
splitting across two sides halves the chances of reusing one.

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
| branches | which side of the trunk they hang from: below, above, or both |
| sun / moon switch | light and dark palette. Branch colours are tuned for the dark canvas and darkened on the fly for light; the choice is remembered in `localStorage` |
