# Screenshots

The README references these files. Drop them in here with exactly these names and the README picks
them up. The three `.gif` entries are animated; the two `.png` entries are stills.

| File | What to capture |
| --- | --- |
| `empty-state.gif` | **Animated.** The page on first open — the dashed dropzone ("Drop an exported Cytoscape JSON here") filling the canvas, the **Load Graph File** button in the sidebar, `Loaded: — nothing yet —` and zeroed Active Nodes / Active Edges — then a graph being loaded and the layout appearing. |
| `explorer-overview.png` | The whole window after loading a graph: sidebar on the left, dagre layout filling the canvas. The hero shot — pick an index big enough to look interesting but not a hairball. |
| `node-selection.png` | A node clicked, so the two-generation neighborhood is pink and everything else is faded. Frame it so the sidebar's Selected Element panel (kind, upstream/downstream counts, file path) is readable. |
| `filtering.gif` | **Animated.** Variables toggled off and two or three exclusion tags added one at a time, so the Active Nodes / Active Edges counts can be seen dropping as the graph thins. |
| `isolate-subgraph.gif` | **Animated.** Isolate Subgraph in use: tick the toggle, click a node to anchor, drag **Focus Depth** to grow and shrink the neighborhood, then click a descendant to re-anchor and **← Back** to return. Frame it so all three border colors are visible — the anchor's cream halo, pink descendants, mauve parents — along with the sidebar's Focus line and the Focus Colors legend. |

`explorer-overview.png` and `node-selection.png` are the two remaining stills, and both predate the
**Focus** control group — recapture them against the current UI when you get a chance. The three
GIFs are current.

Capture at 2x if you can, then keep the width to roughly 1600px so GitHub doesn't downscale into
mush. Trim OS window chrome.

For the GIFs, favor legibility over length: a slow 10–20s loop at the sidebar's natural width beats a
full-window capture scaled down until the node labels blur. Keep each under a few MB — GitHub serves
README images on every page view, and a canvas-heavy GIF balloons quickly.
