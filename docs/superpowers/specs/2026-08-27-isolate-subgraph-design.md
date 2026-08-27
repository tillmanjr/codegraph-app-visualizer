# Design: Isolate Subgraph focus mode

**Date:** 2026-08-27
**Branch:** `feature/isolate-subgraph`

## Summary

Add an optional **Isolate Subgraph** mode to the explorer. Today, clicking a node
fades everything outside its two-generation neighborhood but leaves it on the
canvas — on a large graph the faded remainder still dominates the layout and the
viewport. In isolate mode, clicking a node instead *prunes* the canvas to that
node's neighborhood: the anchor, its descendants to an adjustable depth, and
optionally its immediate parents. Clicking any node in the isolated view
re-anchors on it, and a Back button walks the anchor history.

Upstream and downstream elements are colored differently so direction is legible
at a glance. Node fills keep their kind colors; direction is carried by edge
color and node border color.

Isolate is a mode, not a replacement: with the toggle off, click behavior is
exactly what it is today.

## Goals

- Let the user reduce a large graph to one node's neighborhood, laid out on its own.
- Make the depth of that neighborhood adjustable without leaving the mode.
- Show, optionally, where the anchor is called *from* (immediate parents).
- Distinguish upstream from downstream visually.
- Support walking the graph by re-anchoring, with a way back.

## Non-goals

- Changing the default (non-isolate) selection/fade behavior.
- Persisting focus state across page reloads.
- Multi-anchor focus (isolating on a set of nodes).
- Changing the exporter, the filter controls, the spacing sliders, or the layout
  engine selection — all of these keep working, inside isolate mode and out.
- A clickable breadcrumb trail. History is a stack with a single Back step.

## Architecture

The existing pipeline in `app-visualizer.js` reduces `rawGraphData` to
`filteredNodes` / `filteredEdges` (variables toggle + path exclusions), then hands
that pair to `cytoscape.json()` and runs a layout. **Isolate adds one more
reduction on that same pair**, immediately before the elements reach Cytoscape.

```
rawGraphData
  → [variables toggle + path exclusions]  → filteredNodes/filteredEdges
  → [isolate stage, when a focus anchor exists]  → isolatedNodes/isolatedEdges
  → cytoscape.json({ elements }) + layout
```

Because the reduction happens upstream of Cytoscape, everything downstream is
unchanged: mounting, styling, the layout engine selection, the spacing sliders,
and the Active Nodes / Active Edges counts all keep working and now naturally
describe the isolated view.

Two approaches were rejected:

- **`cy.remove()` / `cy.restore()` on collections.** Preserves positions and skips
  a rebuild, but removed collections go stale whenever the filter set changes and
  the elements are replaced via `cy.json()`. The preserved positions are not
  wanted anyway — the subgraph should be laid out on its own.
- **A second Cytoscape instance for focus mode.** Duplicates the stylesheet and
  the event wiring across two code paths.

### New file: `subgraph.js`

The graph traversal is pure and worth isolating from the DOM. A new root-level
`subgraph.js` exposes a single function on `window`, loaded by a plain `<script>`
tag alongside the vendored Cytoscape copies:

```js
computeSubgraph(nodes, edges, anchorId, { depth, includeParents })
//   → { nodes, edges, directions: Map<nodeId, 'anchor' | 'up' | 'down'> }
```

- `nodes` / `edges` are the already-filtered arrays, in Cytoscape element shape.
- `depth` is generations downstream (integer ≥ 0). The UI slider only produces
  1–6; the function still accepts and handles `0` (anchor alone), and is tested
  at that boundary.
- `includeParents` adds the anchor's immediate (depth-1) predecessors.
- Returned `edges` are every input edge whose source **and** target both survive,
  so sibling cross-links inside the neighborhood remain visible.
- `directions` drives styling; it has one entry per returned node.
- If `anchorId` is not present in `nodes`, the function returns
  `{ nodes: [], edges: [], directions: new Map() }`. The caller treats an empty
  result as "anchor is gone" (see Error handling).

No DOM access, no Cytoscape dependency, no module system — same loading pattern
the page already uses.

### Changed: `app-visualizer.js`

Owns focus state and UI wiring:

```js
let focusMode = false;        // Isolate Subgraph checkbox
let focusAnchorId = null;     // current anchor node id
let focusHistory = [];        // stack of previous anchor ids
let focusDepth = 2;           // depth slider
let focusIncludeParents = true;
let searchScope = 'full';     // 'full' | 'subgraph'
```

`renderPipeline` gains the isolate stage. After layout completes, `directions` is
translated into per-element classes (`.focus-anchor`, `.focus-up`, `.focus-down`)
on nodes, and `.focus-up` / `.focus-down` on edges based on which endpoint set
they connect.

### Changed: `index.html`

Adds the Focus control group, the search scope selector, the `Focus:` stats line,
the focus-mode legend block, the new stylesheet rules, and the `subgraph.js`
script tag.

## Components & data flow

### Controls

A new **Focus** control group in the sidebar, placed after **Filter Elements**:

| Control | id | Default | Notes |
| --- | --- | --- | --- |
| `Isolate Subgraph` checkbox | `focus-mode` | off | Master toggle |
| `Include Immediate Parents` checkbox | `focus-parents` | on | Disabled while Isolate is off |
| `Focus Depth` slider (1–6) | `focus-depth` | 2 | Value readout, matching the spacing sliders |
| `← Back` button | `btn-focus-back` | disabled | Pops the anchor history |

The stats box gains a `Focus:` line (`focus-anchor-name`) showing the anchor's
label, or `— none —`.

The Search group gains a scope `<select>` (`search-scope`) with **Full Graph** and
**Current Subgraph**. The Current Subgraph option is disabled unless isolate mode
is active with an anchor; when it becomes disabled, the scope resets to Full Graph.

### Interactions

1. **Isolate off** — unchanged from today. Clicking a node applies the existing
   `faded` / `gen-1` / `gen-2` classes; nothing is pruned.

2. **Turning Isolate on**
   - With a node currently selected: that node becomes the anchor immediately and
     the graph prunes.
   - With nothing selected: the graph is unchanged, and the status overlay reads
     "Click a node to focus".

3. **Clicking a node while isolate is on** — the clicked node becomes the anchor.
   The previous anchor (if any) is pushed onto `focusHistory`. This applies to
   *every* node in the view, parents included, so the user can walk upstream as
   well as down. The pipeline re-runs, the selected layout runs, and the view fits.

4. **Clicking empty canvas while isolate is on** — resets the info panel to its
   placeholder text. The isolated view and its direction colors are untouched:
   the `focus-*` classes describe the view itself, not a transient selection, so
   only the non-focus highlight classes are cleared.

5. **Adjusting Focus Depth or Include Parents while anchored** — recomputes in
   place. Anchor and history are preserved.

6. **`← Back`** — pops `focusHistory` and re-anchors on that id. Disabled when the
   stack is empty.

7. **Turning Isolate off** — restores the full filtered graph, clears
   `focusAnchorId` and `focusHistory`, re-runs the layout, and fits.

8. **Search**
   - **Isolate off** — unchanged from today: typing centers and selects the first
     matching node on every keystroke.
   - **Full Graph** scope with isolate on — typing does *not* re-anchor, because
     the existing per-keystroke handler would push a history entry and re-run a
     layout for every character typed. Instead, typing shows a match count under
     the box (e.g. "3 matches — Enter to focus"), and pressing **Enter** anchors
     on the first match, pushing history. This is the one place the search input's
     behavior differs between modes.
   - **Current Subgraph** scope searches only nodes in the isolated view, centers
     and selects the first match per keystroke, and never re-anchors.

9. **Loading a new file** — resets focus mode state along with exclusions, the
   same way `loadGraphData` resets exclusions today.

### Styling

Direction is carried by edge color and node **border** color. Node fills keep
their kind colors, so the component legend stays accurate inside isolate mode.

| Role | Color | Applied to |
| --- | --- | --- |
| Anchor | `#f5e0dc` (rosewater) | Thick node border |
| Downstream | `#f38ba8` (pink) | Descendant node borders, edges into the descendant set |
| Upstream | `#cba6f7` (mauve) | Parent node borders, edges from parents into the anchor |

Pink for downstream is deliberate continuity with the existing `gen-1` / `gen-2`
highlight color. None of the three collide with a node-kind fill.

A second legend block explaining these three roles is rendered in the sidebar and
shown only while Isolate is on.

## Error handling

- **Anchor filtered out.** Adding a path exclusion or unchecking
  *Show Variables & Constants* can remove the anchor from the filtered set.
  `computeSubgraph` returns an empty result; the app exits isolate for that render
  (restoring the full filtered graph), clears `focusAnchorId` and `focusHistory`,
  leaves the Isolate checkbox **on**, and shows the status message
  "Anchor was filtered out — focus cleared." History is cleared as well, since
  ancestors may have been filtered out too.
- **Stale history entries.** When popping, ids no longer present in the filtered
  set are discarded silently and the pop continues to the next entry. If the stack
  empties this way, Back becomes disabled and the current view is left as-is.
- **Cycles.** The traversal marks visited ids, so a cycle back through the anchor
  terminates rather than looping.
- **Node that is both parent and descendant** (mutual recursion). Descendant wins:
  it is styled `down` and appears once.
- **Leaf anchor with parents off.** The subgraph is a single node. This is valid
  and renders one centered node.
- **Info panel counts.** *Total Upstream* / *Total Downstream* currently come from
  `cyInstance.predecessors()` / `.successors()`, which inside isolate would only
  see the subgraph and report misleadingly small numbers. They move to a traversal
  of the full **filtered** graph so they mean the same thing in both modes.

## Testing

`computeSubgraph` is pure, so it gets real automated coverage using **`node:test`**
— built into Node 20+, no new dependencies. New file `subgraph.test.js`; `npm test`
becomes `node --test`, replacing the current placeholder that exits 1.

Cases:

1. `depth: 0`, parents off → anchor alone.
2. `depth: 1` → anchor plus direct successors only.
3. `depth: 3` on a 5-deep chain → stops at 3 generations.
4. `includeParents: true` → immediate predecessors present and marked `up`;
   grandparents absent.
5. `includeParents: false` → predecessors absent even when they are also reachable
   downstream by no other route.
6. Sibling cross-link between two descendants is retained.
7. Edge with one endpoint outside the subgraph is dropped.
8. Cycle (A→B→C→A) terminates and yields each node once.
9. Node reachable both as immediate parent and as a descendant is marked `down`.
10. Unknown `anchorId` → empty nodes, empty edges, empty directions.
11. Anchor with no successors and parents on → anchor plus its parents.

Manual browser verification for the DOM wiring, as with the upload feature:

1. Isolate off → click behavior identical to before.
2. Isolate on with a selection → prunes immediately to that anchor.
3. Depth slider 1→6 → subgraph grows and shrinks, anchor unchanged.
4. Include Parents on/off → parent nodes and mauve edges appear/disappear.
5. Click a descendant → re-anchors; Back returns to the previous anchor.
6. Click a parent → re-anchors upstream; Back returns.
7. Add an exclusion matching the anchor → focus clears with the status message,
   full filtered graph restored.
8. Search in Full Graph scope while isolated → typing shows a match count and does
   not re-anchor; Enter anchors on the first match. In Current Subgraph scope →
   centers per keystroke without re-anchoring.
9. Turn Isolate off → full filtered graph restored, Back disabled, `Focus: — none —`.
10. Load a different file while isolated → focus resets with exclusions.

## Documentation

- Update `README.md`'s "The explorer UI" section with an **Isolate Subgraph**
  entry covering the toggle, depth, parents option, re-anchoring, Back, the
  direction colors, and the search scope selector.
- Update the repo layout block with `subgraph.js` and `subgraph.test.js`.
- Note the new `npm test` script in the Setup section.
- Add a screenshot of an isolated subgraph to `docs/images/`, following the
  existing screenshot conventions.
