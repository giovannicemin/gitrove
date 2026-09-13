# gitrove

A git-style commit graph for work that isn't code. Branches are **threads of work**;
nodes are things you actually did, placed on a real time axis. Only the past is drawn —
plus one `current` node and a few ghosted `planned` ones past the TODAY line.

## Running it

    npm install          # once: fetches the Tauri CLI
    npm run dev          # the app, with the page reloading as you edit ui/
    npm run build        # the app, packaged

`npm run build` leaves you three things:

    src-tauri/target/release/gitrove                              the binary — just run it
    src-tauri/target/release/bundle/deb/gitrove_0.3.0_amd64.deb   sudo dpkg -i, then it is in your menu
    src-tauri/target/release/bundle/appimage/*.AppImage           chmod +x, then run it anywhere

`npm run serve` opens the same interface in a browser at http://localhost:5173, reading the
bundled example read-only — handy for working on the drawing, useless for keeping notes.

## How it fits together

    ui/          the window's contents: plain ES modules, no build step, no dependencies
    src-tauri/   the native shell: a small Rust program that opens a window and shows ui/

The shell exists for the four things a web page cannot do for itself — ask you for a file,
read one, write one, and notice when one changes underneath it. That is the whole of
`src-tauri/src/lib.rs`. Everything else — parsing, layout, drawing, animation — is
JavaScript, which is why the same code still runs in a plain browser.

Writes go to a temporary file first and are then renamed over the original, so a crash
mid-write leaves the old file intact rather than half a new one. The watcher polls the
file's modification time once a second; if it changed and you have unsaved edits, you are
asked before anything is discarded.

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

### Your file is yours

gitrove never rewrites a project file. Every change is a patch — *replace source lines
[start,end) with these* — and they are spliced in one pass, back to front. Anything the
parser did not model lies outside every patch, so it survives by construction rather than by
being carefully re-emitted: `:LOGBOOK:` drawers, `#+begin_src` blocks, links, lists, tables,
your comments and your blank lines.

    node test/orgedit.test.mjs

28 checks, and the ones that matter are: applying no edits returns the file byte for byte;
retitling an entry changes exactly one line; and an entry carrying a logbook drawer, a source
block and a list keeps all three when its description is rewritten.

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
