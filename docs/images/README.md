# Screenshots

The README references these files. Drop them in here with exactly these names and the README picks
them up. All are PNGs except `isolate-subgraph.gif`, which is animated.

| File | What to capture |
| --- | --- |
| `empty-state.png` | The page on first open, before any graph is loaded: the dashed dropzone ("Drop an exported Cytoscape JSON here") filling the canvas, the **Load Graph File** button in the sidebar, and `Loaded: — nothing yet —` with zeroed Active Nodes / Active Edges. |
| `explorer-overview.png` | The whole window after loading a graph: sidebar on the left, dagre layout filling the canvas. The hero shot — pick an index big enough to look interesting but not a hairball. |
| `node-selection.png` | A node clicked, so the two-generation neighborhood is pink and everything else is faded. Frame it so the sidebar's Selected Element panel (kind, upstream/downstream counts, file path) is readable. |
| `filtering.png` | Variables toggled off and two or three exclusion tags added, showing the reduced Active Nodes / Active Edges counts. |
| `isolate-subgraph.gif` | **Animated.** Isolate Subgraph in use: tick the toggle, click a node to anchor, drag **Focus Depth** to grow and shrink the neighborhood, then click a descendant to re-anchor and **← Back** to return. Frame it so all three border colors are visible — the anchor's cream halo, pink descendants, mauve parents — along with the sidebar's Focus line and the Focus Colors legend. |

Recapture the four PNGs against the current UI: the sidebar now has the **Load Graph File** control,
a **Loaded** file-name line, and the **Focus** control group, and the legend renders its color
swatches (earlier builds showed the legend with no swatches).

Capture at 2x if you can, then keep the width to roughly 1600px so GitHub doesn't downscale into
mush. Trim OS window chrome.

For the GIF, favor legibility over length: a slow 10–20s loop at the sidebar's natural width beats a
full-window capture scaled down until the node labels blur. Cropping to the canvas plus the Focus
controls usually reads best. Keep it under a few MB — GitHub serves README images on every page view,
and a canvas-heavy GIF balloons quickly.
