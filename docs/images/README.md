# Screenshots

The README references these four files. Drop the PNGs in here with exactly these names and the
README picks them up.

| File | What to capture |
| --- | --- |
| `empty-state.png` | The page on first open, before any graph is loaded: the dashed dropzone ("Drop an exported Cytoscape JSON here") filling the canvas, the **Load Graph File** button in the sidebar, and `Loaded: — nothing yet —` with zeroed Active Nodes / Active Edges. |
| `explorer-overview.png` | The whole window after loading a graph: sidebar on the left, dagre layout filling the canvas. The hero shot — pick an index big enough to look interesting but not a hairball. |
| `node-selection.png` | A node clicked, so the two-generation neighborhood is pink and everything else is faded. Frame it so the sidebar's Selected Element panel (kind, upstream/downstream counts, file path) is readable. |
| `filtering.png` | Variables toggled off and two or three exclusion tags added, showing the reduced Active Nodes / Active Edges counts. |

Recapture all four against the current UI: the sidebar now has the **Load Graph File** control and a
**Loaded** file-name line, and the legend renders its color swatches (earlier builds showed the
legend with no swatches).

Capture at 2x if you can, then keep the width to roughly 1600px so GitHub doesn't downscale into
mush. Trim OS window chrome.
