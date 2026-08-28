# Isolate Subgraph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an optional Isolate Subgraph mode that prunes the canvas to a clicked anchor's neighborhood — adjustable depth downstream plus optional immediate parents — with re-anchoring, a Back history, and upstream/downstream direction colors.

**Architecture:** The existing pipeline reduces `rawGraphData` to filtered nodes/edges, then hands them to Cytoscape. Isolate inserts one more pure reduction on that pair, immediately before the elements reach Cytoscape, so mounting/styling/layout/filters are untouched. The traversal lives in a new DOM-free `subgraph.js` with `node:test` coverage; `app-visualizer.js` owns focus state and UI wiring.

**Tech Stack:** Vanilla ES5-flavored browser JS (no build step, no modules), Cytoscape.js 3.x + cytoscape-dagre (vendored at repo root, loaded via `<script>`), `node:test` from Node 20+ for unit tests.

## Global Constraints

- No new npm dependencies. `node:test` is built into Node 20+.
- No build step and no ES modules in browser code. `subgraph.js` loads via a plain `<script>` tag and exposes `computeSubgraph` as a global, exactly like the vendored Cytoscape copies.
- `subgraph.js` must also be `require()`-able from `node:test` (package is `"type": "commonjs"`), so it assigns to `module.exports` when `module` exists.
- Direction colors, exact values: anchor `#f5e0dc`, downstream `#f38ba8`, upstream `#cba6f7`.
- Focus Depth slider range 1–6, default 2. `computeSubgraph` itself accepts `depth: 0`.
- Include Immediate Parents defaults to **on**. Isolate Subgraph defaults to **off**.
- With Isolate off, click/fade behavior must be byte-for-byte what it is today.
- Node fills keep their kind colors in all modes; direction is carried by node **border** color and edge color only.
- Follow the existing file's style: 4-space indent, `document.getElementById` lookups grouped at the top of the DOMContentLoaded handler, string concatenation for HTML.

---

### Task 1: `computeSubgraph` traversal + test harness

**Files:**
- Create: `subgraph.js`
- Create: `subgraph.test.js`
- Modify: `package.json` (the `scripts.test` line)

**Interfaces:**
- Consumes: nothing (first task).
- Produces: global/CommonJS `computeSubgraph(nodes, edges, anchorId, options)` where `nodes`/`edges` are Cytoscape element arrays (`{ data: { id, label, kind, filePath } }` / `{ data: { id, source, target, relationship } }`), `options` is `{ depth: number, includeParents: boolean }`, returning `{ nodes: Array, edges: Array, directions: Map<string, 'anchor'|'up'|'down'> }`. Tasks 3–5 consume this.

- [x] **Step 1: Wire up the test script**

In `package.json`, replace the placeholder test script:

```json
  "scripts": {
    "test": "node --test"
  },
```

- [x] **Step 2: Write the failing tests**

Create `subgraph.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { computeSubgraph } = require('./subgraph.js');

// Helpers keep the fixtures readable; Cytoscape's element shape is verbose.
const n = (id) => ({ data: { id, label: id, kind: 'function', filePath: id + '.js' } });
const e = (source, target) => ({ data: { id: source + '->' + target, source, target } });

// anchor A: parents P1, P2; chain A -> B -> C -> D -> E; sibling link B -> C2
const NODES = ['P1', 'P2', 'A', 'B', 'B2', 'C', 'C2', 'D', 'E', 'ORPHAN'].map(n);
const EDGES = [
    e('P1', 'A'), e('P2', 'A'),
    e('A', 'B'), e('A', 'B2'),
    e('B', 'C'), e('B', 'C2'), e('B2', 'C'),
    e('C', 'D'), e('D', 'E')
];

const ids = (result) => result.nodes.map(node => node.data.id).sort();

test('depth 0 with parents off yields the anchor alone', () => {
    const result = computeSubgraph(NODES, EDGES, 'A', { depth: 0, includeParents: false });
    assert.deepStrictEqual(ids(result), ['A']);
    assert.strictEqual(result.directions.get('A'), 'anchor');
});

test('depth 1 yields the anchor and its direct successors only', () => {
    const result = computeSubgraph(NODES, EDGES, 'A', { depth: 1, includeParents: false });
    assert.deepStrictEqual(ids(result), ['A', 'B', 'B2']);
    assert.strictEqual(result.directions.get('B'), 'down');
});

test('depth stops at the requested number of generations', () => {
    const result = computeSubgraph(NODES, EDGES, 'A', { depth: 3, includeParents: false });
    assert.deepStrictEqual(ids(result), ['A', 'B', 'B2', 'C', 'C2', 'D']);
    assert.ok(!result.directions.has('E'), 'E is 4 generations down and must be excluded');
});

test('includeParents adds immediate predecessors marked up, but not grandparents', () => {
    const nodes = NODES.concat([n('GP')]);
    const edges = EDGES.concat([e('GP', 'P1')]);
    const result = computeSubgraph(nodes, edges, 'A', { depth: 1, includeParents: true });
    assert.deepStrictEqual(ids(result), ['A', 'B', 'B2', 'P1', 'P2']);
    assert.strictEqual(result.directions.get('P1'), 'up');
    assert.ok(!result.directions.has('GP'), 'grandparents must not be included');
});

test('includeParents false omits pure predecessors', () => {
    const result = computeSubgraph(NODES, EDGES, 'A', { depth: 2, includeParents: false });
    assert.ok(!result.directions.has('P1'));
    assert.ok(!result.directions.has('P2'));
});

test('sibling cross-links between surviving nodes are retained', () => {
    const result = computeSubgraph(NODES, EDGES, 'A', { depth: 2, includeParents: false });
    const edgeIds = result.edges.map(edge => edge.data.id);
    assert.ok(edgeIds.includes('B2->C'), 'edge between two descendants must survive');
});

test('edges with an endpoint outside the subgraph are dropped', () => {
    const result = computeSubgraph(NODES, EDGES, 'A', { depth: 2, includeParents: false });
    const edgeIds = result.edges.map(edge => edge.data.id);
    assert.ok(!edgeIds.includes('C->D'), 'D is outside the subgraph at depth 2');
});

test('cycles terminate and each node appears once', () => {
    const nodes = ['A', 'B', 'C'].map(n);
    const edges = [e('A', 'B'), e('B', 'C'), e('C', 'A')];
    const result = computeSubgraph(nodes, edges, 'A', { depth: 10, includeParents: false });
    assert.deepStrictEqual(ids(result), ['A', 'B', 'C']);
    assert.strictEqual(result.directions.get('A'), 'anchor');
});

test('a node that is both immediate parent and descendant is marked down', () => {
    const nodes = ['A', 'B'].map(n);
    const edges = [e('A', 'B'), e('B', 'A')];
    const result = computeSubgraph(nodes, edges, 'A', { depth: 1, includeParents: true });
    assert.strictEqual(result.directions.get('B'), 'down');
});

test('an unknown anchor yields an empty result', () => {
    const result = computeSubgraph(NODES, EDGES, 'NOPE', { depth: 2, includeParents: true });
    assert.deepStrictEqual(result.nodes, []);
    assert.deepStrictEqual(result.edges, []);
    assert.strictEqual(result.directions.size, 0);
});

test('an anchor with no successors still gets its parents', () => {
    const result = computeSubgraph(NODES, EDGES, 'E', { depth: 3, includeParents: true });
    assert.deepStrictEqual(ids(result), ['D', 'E']);
    assert.strictEqual(result.directions.get('D'), 'up');
});
```

- [x] **Step 3: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `Cannot find module './subgraph.js'`.

- [x] **Step 4: Write the implementation**

Create `subgraph.js`:

```js
/**
 * Pure graph traversal for the explorer's Isolate Subgraph mode.
 *
 * No DOM, no Cytoscape. Loaded in the browser via a plain <script> tag (sets a
 * global) and required directly by subgraph.test.js.
 */
(function (global) {
    'use strict';

    /**
     * Reduce a filtered graph to one anchor's neighborhood.
     *
     * @param {Array} nodes   Cytoscape node elements, already filtered.
     * @param {Array} edges   Cytoscape edge elements, already filtered.
     * @param {string} anchorId
     * @param {{depth?: number, includeParents?: boolean}} options
     * @returns {{nodes: Array, edges: Array, directions: Map<string, string>}}
     *          Empty nodes/edges and an empty map when the anchor is absent.
     */
    function computeSubgraph(nodes, edges, anchorId, options) {
        const opts = options || {};
        const depth = typeof opts.depth === 'number' ? opts.depth : 2;
        const includeParents = opts.includeParents !== false;
        const empty = { nodes: [], edges: [], directions: new Map() };

        if (!Array.isArray(nodes) || !Array.isArray(edges)) return empty;

        const byId = new Map();
        nodes.forEach(node => {
            if (node && node.data && node.data.id !== undefined && node.data.id !== null) {
                byId.set(node.data.id, node);
            }
        });
        if (!byId.has(anchorId)) return empty;

        // Adjacency, restricted to edges whose endpoints both survived filtering.
        const successors = new Map();
        const predecessors = new Map();
        edges.forEach(edge => {
            if (!edge || !edge.data) return;
            const source = edge.data.source;
            const target = edge.data.target;
            if (!byId.has(source) || !byId.has(target)) return;
            if (!successors.has(source)) successors.set(source, []);
            successors.get(source).push(target);
            if (!predecessors.has(target)) predecessors.set(target, []);
            predecessors.get(target).push(source);
        });

        // directions doubles as the visited set, so cycles terminate.
        const directions = new Map();
        directions.set(anchorId, 'anchor');

        let frontier = [anchorId];
        for (let level = 0; level < depth; level++) {
            const next = [];
            frontier.forEach(id => {
                (successors.get(id) || []).forEach(childId => {
                    if (directions.has(childId)) return;
                    directions.set(childId, 'down');
                    next.push(childId);
                });
            });
            if (next.length === 0) break;
            frontier = next;
        }

        // Parents last, so anything already reached downstream keeps 'down'.
        if (includeParents) {
            (predecessors.get(anchorId) || []).forEach(parentId => {
                if (directions.has(parentId)) return;
                directions.set(parentId, 'up');
            });
        }

        const keptNodes = [];
        directions.forEach((_direction, id) => keptNodes.push(byId.get(id)));

        const keptEdges = edges.filter(edge =>
            edge && edge.data &&
            directions.has(edge.data.source) &&
            directions.has(edge.data.target));

        return { nodes: keptNodes, edges: keptEdges, directions: directions };
    }

    global.computeSubgraph = computeSubgraph;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { computeSubgraph: computeSubgraph };
    }
})(typeof window !== 'undefined' ? window : globalThis);
```

- [x] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — 11 passing tests, 0 failing.

- [x] **Step 6: Commit**

```bash
git add subgraph.js subgraph.test.js package.json
git commit -m "feat: add computeSubgraph traversal with node:test coverage"
```

---

### Task 2: Sidebar controls, styles, and script tag

**Files:**
- Modify: `index.html`

**Interfaces:**
- Consumes: `subgraph.js` from Task 1 (script tag only).
- Produces: DOM ids consumed by Tasks 3–5 — `focus-mode`, `focus-parents`, `focus-parents-label`, `focus-depth`, `val-focus-depth`, `btn-focus-back`, `focus-anchor-name`, `focus-legend`, `search-scope`, `search-hint`; body class `focus-active`; Cytoscape classes `focus-anchor`, `focus-up`, `focus-down`.

- [x] **Step 1: Add the script tag**

In `index.html`, after the `cytoscape-dagre.js` script tag in `<head>`:

```html
    <script src="cytoscape-dagre.js"></script>
    <script src="subgraph.js"></script>
```

- [x] **Step 2: Add the stylesheet rules**

Append inside the existing `<style>` block, after the `.dropzone-sub` rule:

```css
        button:disabled { opacity: 0.45; cursor: not-allowed; }
        .checkbox-label input:disabled { cursor: not-allowed; }
        .control-group.disabled label, .checkbox-label.disabled { opacity: 0.5; }
        #focus-legend { display: none; }
        body.focus-active #focus-legend { display: flex; }
        .search-hint { font-size: 0.75rem; color: #6c7086; min-height: 1em; }
```

- [x] **Step 3: Add the Focus line to the stats box**

In the `.stats-box` div, after the Active Edges line:

```html
            <div><strong>Active Edges:</strong> <span id="e-count">0</span></div>
            <div><strong>Focus:</strong> <span id="focus-anchor-name">— none —</span></div>
```

- [x] **Step 4: Add the Focus control group**

Insert a new control group immediately after the existing "Filter Elements" group (the one containing `filter-variables`) and before "Path Omission Exclusions":

```html
        <div class="control-group">
            <label>Focus</label>
            <label class="checkbox-label">
                <input type="checkbox" id="focus-mode"> Isolate Subgraph
            </label>
            <label class="checkbox-label disabled" id="focus-parents-label">
                <input type="checkbox" id="focus-parents" checked disabled> Include Immediate Parents
            </label>
            <div class="slider-row" style="margin-top: 5px;">
                <span>Focus Depth:</span>
                <span id="val-focus-depth">2</span>
            </div>
            <input type="range" id="focus-depth" min="1" max="6" value="2" disabled>
            <button id="btn-focus-back" class="btn-secondary" style="margin-top: 4px;" disabled>← Back</button>
        </div>
```

- [x] **Step 5: Add the search scope selector**

Replace the existing "Search Nodes" control group with:

```html
        <div class="control-group">
            <label>Search Nodes</label>
            <input type="text" id="search-input" placeholder="Type module or function name...">
            <select id="search-scope">
                <option value="full">Full Graph</option>
                <option value="subgraph" disabled>Current Subgraph</option>
            </select>
            <div id="search-hint" class="search-hint"></div>
        </div>
```

- [x] **Step 6: Add the focus legend block**

Insert immediately after the existing "Component Legend" control group:

```html
        <div class="control-group" id="focus-legend">
            <label>Focus Colors</label>
            <div class="legend">
                <div class="legend-item"><div class="legend-color" style="background: #f5e0dc;"></div> Anchor</div>
                <div class="legend-item"><div class="legend-color" style="background: #f38ba8;"></div> Downstream (calls)</div>
                <div class="legend-item"><div class="legend-color" style="background: #cba6f7;"></div> Upstream (parents)</div>
            </div>
        </div>
```

- [ ] **Step 7: Verify in the browser**

Run: `npx serve .` and open the printed URL.
Expected: the sidebar shows the Focus group with Isolate Subgraph unchecked, Include Immediate Parents checked but greyed, the depth slider greyed at 2, and Back disabled. The Focus Colors legend is **not** visible. The search box has a Full Graph scope dropdown whose Current Subgraph option is disabled. No console errors — `subgraph.js` loads.

- [x] **Step 8: Commit**

```bash
git add index.html
git commit -m "feat: add focus mode controls, search scope, and focus legend markup"
```

---

### Task 3: Focus state, the isolate stage, direction styling, and re-anchoring

**Files:**
- Modify: `app-visualizer.js`

**Interfaces:**
- Consumes: `computeSubgraph` (Task 1); the DOM ids from Task 2.
- Produces: module-level `focusMode`, `focusAnchorId`, `focusHistory`, `lastClickedNodeId`, `lastFiltered`, and the functions `updateFocusUI()`, `clearFocus()`, `applyFocusClasses(directions)`, `setAnchor(nodeId, pushHistory)`, `showNodeInfo(nodeId)`, `applyGenerationHighlight(node)`, `reachableCount(adjacency, startId)` — consumed by Tasks 4 and 5.

This task carries the whole click path, not just the state: without the tap handler rewrite there is no way to set an anchor, so a smaller Task 3 would have nothing testable at its end.

- [x] **Step 1: Add the element lookups and state**

In `app-visualizer.js`, after the existing `const dropzone = ...` lookup, add:

```js
    const focusModeCheckbox = document.getElementById('focus-mode');
    const focusParentsCheckbox = document.getElementById('focus-parents');
    const focusParentsLabel = document.getElementById('focus-parents-label');
    const focusDepthSlider = document.getElementById('focus-depth');
    const valFocusDepth = document.getElementById('val-focus-depth');
    const btnFocusBack = document.getElementById('btn-focus-back');
    const focusAnchorName = document.getElementById('focus-anchor-name');
    const searchScopeSelect = document.getElementById('search-scope');
    const searchHint = document.getElementById('search-hint');
```

Then extend the state block that currently reads `let cyInstance = null; let rawGraphData = null; let activeExclusions = [];`:

```js
    let cyInstance = null;
    let rawGraphData = null;
    let activeExclusions = [];

    let focusMode = false;
    let focusAnchorId = null;
    let focusHistory = [];
    let lastClickedNodeId = null;
    // The most recent filtered (pre-isolate) graph, plus adjacency built from it.
    // Info-panel counts and full-graph search read from here so they mean the
    // same thing whether or not the canvas is currently isolated.
    let lastFiltered = { nodes: [], edges: [], successors: new Map(), predecessors: new Map(), byId: new Map() };
```

- [x] **Step 2: Add the focus helper functions**

Insert these after `updateExclusionTagsUI()` and before `renderPipeline`:

```js
    function anchorLabel() {
        const node = lastFiltered.byId.get(focusAnchorId);
        return node ? (node.data.label || focusAnchorId) : '— none —';
    }

    function updateFocusUI() {
        focusParentsCheckbox.disabled = !focusMode;
        focusDepthSlider.disabled = !focusMode;
        focusParentsLabel.classList.toggle('disabled', !focusMode);
        btnFocusBack.disabled = focusHistory.length === 0;
        focusAnchorName.innerText = focusAnchorId === null ? '— none —' : anchorLabel();
        document.body.classList.toggle('focus-active', focusMode);

        const subgraphOption = searchScopeSelect.querySelector('option[value="subgraph"]');
        const subgraphAvailable = focusMode && focusAnchorId !== null;
        subgraphOption.disabled = !subgraphAvailable;
        if (!subgraphAvailable && searchScopeSelect.value === 'subgraph') {
            searchScopeSelect.value = 'full';
        }
    }

    function clearFocus() {
        focusAnchorId = null;
        focusHistory = [];
        updateFocusUI();
    }

    function applyFocusClasses(directions) {
        if (!cyInstance) return;
        cyInstance.elements().removeClass('focus-anchor focus-up focus-down faded gen-1 gen-2');
        if (!directions) return;

        cyInstance.nodes().forEach(node => {
            const direction = directions.get(node.id());
            if (direction === 'anchor') node.addClass('focus-anchor');
            else if (direction === 'up') node.addClass('focus-up');
            else if (direction === 'down') node.addClass('focus-down');
        });

        // An edge is "upstream" when it touches an immediate parent; parents are
        // the only nodes marked 'up', so this is unambiguous.
        cyInstance.edges().forEach(edge => {
            const source = directions.get(edge.data('source'));
            const target = directions.get(edge.data('target'));
            edge.addClass(source === 'up' || target === 'up' ? 'focus-up' : 'focus-down');
        });
    }

    function setAnchor(nodeId, pushHistory) {
        if (pushHistory && focusAnchorId !== null && focusAnchorId !== nodeId) {
            focusHistory.push(focusAnchorId);
        }
        focusAnchorId = nodeId;
        updateFocusUI();
        renderPipeline(true);
    }

    // Reachability over the filtered graph, so the counts mean the same thing
    // whether or not the canvas is currently isolated.
    function reachableCount(adjacency, startId) {
        const seen = new Set();
        const stack = [startId];
        while (stack.length > 0) {
            const id = stack.pop();
            (adjacency.get(id) || []).forEach(nextId => {
                if (nextId === startId || seen.has(nextId)) return;
                seen.add(nextId);
                stack.push(nextId);
            });
        }
        return seen.size;
    }

    function showNodeInfo(nodeId) {
        const node = lastFiltered.byId.get(nodeId);
        if (!node) return;
        const data = node.data;
        const totalUpstream = reachableCount(lastFiltered.predecessors, nodeId);
        const totalDownstream = reachableCount(lastFiltered.successors, nodeId);

        infoBox.innerHTML =
            '<strong>Name:</strong> ' + data.label + '<br/>' +
            '<strong>Kind:</strong> <span style="color:var(--accent-color)">' + (data.kind || 'unknown').toUpperCase() + '</span><br/>' +
            '<strong>Total Upstream (All Paths):</strong> ' + totalUpstream + '<br/>' +
            '<strong>Total Downstream (All Calls):</strong> ' + totalDownstream + '<br/>' +
            '<strong>File Location:</strong><br/><code style="color:#a6e3a1; font-size:11px;">' + (data.filePath || 'No path specified') + '</code>';
    }

    function applyGenerationHighlight(target) {
        cyInstance.elements().removeClass('gen-1 gen-2').addClass('faded');
        target.removeClass('faded').addClass('gen-1');

        // Upstream direct (Parent)
        const parents1 = target.incomers();
        parents1.removeClass('faded').addClass('gen-1');

        // Upstream depth-2 (Grandparent)
        const parents2 = parents1.nodes().incomers();
        parents2.not('.gen-1').removeClass('faded').addClass('gen-2');

        // Downstream direct (Child)
        const children1 = target.outgoers();
        children1.removeClass('faded').addClass('gen-1');

        // Downstream depth-2 (Grandchild)
        const children2 = children1.nodes().outgoers();
        children2.not('.gen-1').removeClass('faded').addClass('gen-2');
    }
```

- [x] **Step 3: Cache the filtered graph inside `renderPipeline`**

In `renderPipeline`, immediately after `const filteredEdges = rawGraphData.edges.filter(...)`, add:

```js
                lastFiltered = { nodes: filteredNodes, edges: filteredEdges, successors: new Map(), predecessors: new Map(), byId: new Map() };
                filteredNodes.forEach(node => lastFiltered.byId.set(node.data.id, node));
                filteredEdges.forEach(edge => {
                    const source = edge.data.source;
                    const target = edge.data.target;
                    if (!lastFiltered.successors.has(source)) lastFiltered.successors.set(source, []);
                    lastFiltered.successors.get(source).push(target);
                    if (!lastFiltered.predecessors.has(target)) lastFiltered.predecessors.set(target, []);
                    lastFiltered.predecessors.get(target).push(source);
                });
```

- [x] **Step 4: Add the isolate stage**

Directly after the block from Step 3, and **before** the `nCount.innerText = ...` lines, add:

```js
                let viewNodes = filteredNodes;
                let viewEdges = filteredEdges;
                let focusDirections = null;
                // Held until layoutstop: renderPipeline's own status text and the
                // layoutstop hide would otherwise overwrite the message instantly.
                let focusClearedMessage = null;

                if (focusMode && focusAnchorId !== null) {
                    const subgraph = computeSubgraph(filteredNodes, filteredEdges, focusAnchorId, {
                        depth: parseInt(focusDepthSlider.value, 10),
                        includeParents: focusParentsCheckbox.checked
                    });
                    if (subgraph.nodes.length === 0) {
                        // The anchor was filtered out. Ancestors may be gone too,
                        // so the history goes with it. Isolate stays switched on.
                        clearFocus();
                        focusClearedMessage = 'Anchor was filtered out — focus cleared';
                    } else {
                        viewNodes = subgraph.nodes;
                        viewEdges = subgraph.edges;
                        focusDirections = subgraph.directions;
                    }
                }
```

- [x] **Step 5: Point the rest of the pipeline at the view arrays**

Inside `renderPipeline`, replace every remaining use of `filteredNodes` / `filteredEdges` with `viewNodes` / `viewEdges`. Those uses are:

```js
                nCount.innerText = viewNodes.length;
                eCount.innerText = viewEdges.length;

                checkLayoutThresholds(viewNodes.length);
```

```js
                const layoutConfig = {
                    name: currentLayout,
                    animate: viewNodes.length < 400,
```

```js
                status.innerText = 'Computing coordinates for ' + viewNodes.length + ' elements...';
```

and both element arrays — in the `cytoscape({...})` constructor:

```js
                        elements: [...viewNodes, ...viewEdges],
```

and in the update branch:

```js
                    cyInstance.json({ elements: [...viewNodes, ...viewEdges] });
```

- [x] **Step 6: Apply the direction classes and surface the cleared-focus message**

In `renderPipeline`, immediately after the `if (!cyInstance) { ... } else { ... }` block closes and before `cyInstance.one('layoutstop', ...)`, add:

```js
                applyFocusClasses(focusDirections);
```

Then replace the `layoutstop` callback so the cleared-focus message survives — the
existing callback unconditionally hides the status overlay, which would swallow it:

```js
                cyInstance.one('layoutstop', () => {
                    if (!fitView && currentZoom !== null && currentPan !== null) {
                        cyInstance.viewport({ zoom: currentZoom, pan: currentPan });
                    }
                    if (focusClearedMessage) {
                        status.style.display = 'block';
                        status.style.color = '#f38ba8';
                        status.innerText = focusClearedMessage;
                    } else {
                        status.style.display = 'none';
                    }
                });
```

- [x] **Step 7: Rewrite the tap handler**

Replace the whole `cyInstance.on('tap', (evt) => { ... });` registration — its info-panel
and highlight bodies moved into the helpers added in Step 2 — with:

```js
                    cyInstance.on('tap', (evt) => {
                        const target = evt.target;
                        if (target === cyInstance) {
                            // In focus mode the focus-* classes describe the view
                            // itself, not a selection, so they must survive.
                            if (!focusMode) cyInstance.elements().removeClass('faded gen-1 gen-2');
                            infoBox.innerHTML = "Click a node to inspect dependencies...";
                            return;
                        }
                        if (!target.isNode()) return;

                        const nodeId = target.id();
                        lastClickedNodeId = nodeId;
                        // Info first: re-anchoring rebuilds the elements and makes
                        // `target` stale.
                        showNodeInfo(nodeId);

                        if (focusMode) {
                            setAnchor(nodeId, true);
                        } else {
                            applyGenerationHighlight(target);
                        }
                    });
```

- [x] **Step 8: Add the Cytoscape style rules**

In the `style` array passed to `cytoscape({...})`, append after the existing `edge.gen-2` rule (last position wins, so these override the base node/edge rules):

```js
                            { selector: 'edge.gen-2', style: { 'line-color': '#f38ba8', 'target-arrow-color': '#f38ba8', 'width': 2.5, 'opacity': 0.40 } },

                            // Isolate Subgraph: direction lives on borders and edges,
                            // so node fills keep their kind colors.
                            { selector: 'node.focus-down', style: { 'border-width': 3, 'border-color': '#f38ba8' } },
                            { selector: 'node.focus-up', style: { 'border-width': 3, 'border-color': '#cba6f7' } },
                            { selector: 'node.focus-anchor', style: { 'border-width': 5, 'border-color': '#f5e0dc' } },
                            { selector: 'edge.focus-down', style: { 'line-color': '#f38ba8', 'target-arrow-color': '#f38ba8', 'width': 3 } },
                            { selector: 'edge.focus-up', style: { 'line-color': '#cba6f7', 'target-arrow-color': '#cba6f7', 'width': 3 } }
```

- [x] **Step 9: Wire the Focus controls**

In the event-wiring block at the bottom (inside the `try`), after the `filterVarsCheckbox` listener, add:

```js
        focusModeCheckbox.addEventListener('change', () => {
            focusMode = focusModeCheckbox.checked;
            if (focusMode) {
                if (lastClickedNodeId !== null && lastFiltered.byId.has(lastClickedNodeId)) {
                    setAnchor(lastClickedNodeId, false);
                    return;
                }
                updateFocusUI();
                status.style.display = 'block';
                status.style.color = '#a6e3a1';
                status.innerText = 'Click a node to focus';
                return;
            }
            clearFocus();
            renderPipeline(true);
        });

        focusParentsCheckbox.addEventListener('change', () => {
            if (focusMode && focusAnchorId !== null) renderPipeline(true);
        });

        focusDepthSlider.addEventListener('input', (e) => { valFocusDepth.innerText = e.target.value; });
        focusDepthSlider.addEventListener('change', () => {
            if (focusMode && focusAnchorId !== null) renderPipeline(true);
        });
```

Also add `updateFocusUI();` next to the existing `updateExclusionTagsUI();` call at the top of the `try` block, so the controls start in the right state.

- [x] **Step 10: Reset focus when a new file loads**

In `loadGraphData`, after `activeExclusions = [];`:

```js
        rawGraphData = parsed;
        activeExclusions = [];
        focusMode = false;
        focusModeCheckbox.checked = false;
        lastClickedNodeId = null;
        clearFocus();
        updateExclusionTagsUI();
```

- [ ] **Step 11: Verify in the browser**

Run: `npx serve .`, load `cytoscape-graph.json`, click a node, then check **Isolate Subgraph**.

Expected:
- The canvas prunes to that node's neighborhood. The anchor has a thick cream border, descendants pink borders with pink edges, immediate parents mauve borders with mauve edges. Node fills still show kind colors.
- The Focus Colors legend appears; the stats box shows the anchor's label; Active Nodes/Edges drop to the subgraph counts.
- Moving the depth slider grows and shrinks the subgraph; unchecking Include Immediate Parents removes the mauve nodes. The anchor does not change in either case.
- Clicking any node in the isolated view — descendant or parent — re-anchors on it.
- Clicking empty canvas resets the info panel but leaves the subgraph and its colors intact.
- Unchecking Isolate Subgraph restores the whole filtered graph.
- With Isolate off, clicking a node produces the old fade highlight, unchanged. The Total Upstream/Downstream numbers for a given node are identical in both modes.
- Adding a path exclusion that matches the anchor clears focus and leaves the message "Anchor was filtered out — focus cleared" visible on the canvas.

- [x] **Step 12: Commit**

```bash
git add app-visualizer.js
git commit -m "feat: prune canvas to the focused subgraph with direction colors"
```

---

### Task 4: Anchor history and Back

**Files:**
- Modify: `app-visualizer.js`

**Interfaces:**
- Consumes: `focusHistory`, `focusAnchorId`, `updateFocusUI`, `showNodeInfo`, `lastFiltered` (Task 3).
- Produces: nothing consumed downstream. Task 3 already pushes onto `focusHistory` inside `setAnchor`; this task is the other half — popping it.

- [x] **Step 1: Wire the Back button**

Add to the event-wiring block, after the focus depth listeners:

```js
        btnFocusBack.addEventListener('click', () => {
            // Ancestors can disappear when filters change; skip the stale ones.
            while (focusHistory.length > 0) {
                const previousId = focusHistory.pop();
                if (lastFiltered.byId.has(previousId)) {
                    focusAnchorId = previousId;
                    updateFocusUI();
                    showNodeInfo(previousId);
                    renderPipeline(true);
                    return;
                }
            }
            updateFocusUI();
        });
```

- [ ] **Step 2: Verify in the browser**

Run: `npx serve .`, load a graph, enable Isolate, click a node, then click a descendant.
Expected: Back becomes enabled after the first re-anchor. Clicking it returns to the previous
anchor, re-prunes the view, updates the stats Focus label and the info panel, and disables
itself once the stack empties. Walking three anchors deep and pressing Back three times
retraces the path exactly. Adding a path exclusion that removes an anchor still in the history
and then pressing Back skips that entry rather than showing an empty graph.

- [x] **Step 3: Commit**

```bash
git add app-visualizer.js
git commit -m "feat: step back through the anchor history"
```

---

### Task 5: Search scope

**Files:**
- Modify: `app-visualizer.js`

**Interfaces:**
- Consumes: `setAnchor`, `showNodeInfo`, `applyGenerationHighlight`, `lastClickedNodeId`, `lastFiltered`, `focusMode` (Task 3); `search-scope` / `search-hint` (Task 2).
- Produces: nothing consumed downstream.

- [x] **Step 1: Replace the search listener**

Replace the existing `searchInput.addEventListener('input', ...)` block with:

```js
        function centerOnCyNode(node) {
            cyInstance.animate({ center: { eles: node } }, { duration: 300 });
            showNodeInfo(node.id());
            lastClickedNodeId = node.id();
        }

        searchInput.addEventListener('input', (e) => {
            if (!cyInstance) return;
            const query = e.target.value.toLowerCase().trim();
            searchHint.innerText = '';

            if (!focusMode) {
                cyInstance.elements().removeClass('faded gen-1 gen-2');
            }
            if (query.length <= 1) return;

            // Isolated + Full Graph scope: typing must not re-anchor, or every
            // keystroke would push history and re-run a layout. Enter commits.
            if (focusMode && searchScopeSelect.value === 'full') {
                const matches = lastFiltered.nodes.filter(node =>
                    (node.data.label || '').toLowerCase().includes(query));
                searchHint.innerText = matches.length === 0
                    ? 'No matches'
                    : matches.length + ' match' + (matches.length === 1 ? '' : 'es') + ' — Enter to focus';
                return;
            }

            // Otherwise search whatever is on the canvas: the full filtered graph
            // when isolate is off, the subgraph when scope is Current Subgraph.
            const matches = cyInstance.nodes().filter(node =>
                node.data('label').toLowerCase().includes(query));
            if (matches.length === 0) {
                searchHint.innerText = 'No matches';
                return;
            }
            const first = matches.first();
            centerOnCyNode(first);
            if (!focusMode) applyGenerationHighlight(first);
        });

        searchInput.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter') return;
            if (!focusMode || searchScopeSelect.value !== 'full') return;
            const query = searchInput.value.toLowerCase().trim();
            if (query.length <= 1) return;

            const match = lastFiltered.nodes.find(node =>
                (node.data.label || '').toLowerCase().includes(query));
            if (!match) return;
            lastClickedNodeId = match.data.id;
            showNodeInfo(match.data.id);
            setAnchor(match.data.id, true);
            searchHint.innerText = '';
        });

        searchScopeSelect.addEventListener('change', () => {
            searchHint.innerText = '';
            searchInput.dispatchEvent(new Event('input'));
        });
```

- [ ] **Step 2: Verify in the browser**

Run: `npx serve .`, load a graph, enable Isolate and anchor on a node.
Expected: with scope **Full Graph**, typing shows "N matches — Enter to focus" and does not change the view; pressing Enter anchors on the first match and pushes history. Switching scope to **Current Subgraph** (now enabled) and typing centers on a match inside the subgraph without re-anchoring, and reports "No matches" for a name outside it. With Isolate off, search behaves as it always has — centering and highlighting per keystroke — and the Current Subgraph option is disabled.

- [x] **Step 3: Commit**

```bash
git add app-visualizer.js
git commit -m "feat: scope search to the full graph or the current subgraph"
```

---

### Task 6: Documentation

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: everything above.
- Produces: nothing.

- [x] **Step 1: Document the mode in "The explorer UI"**

Add a bullet after the **Show Variables & Constants** bullet:

```markdown
- **Isolate Subgraph** — off by default; with it off, clicking a node fades the rest of
  the graph as before. Switch it on and clicking a node *prunes* the canvas to that
  node's neighborhood: the anchor, everything within **Focus Depth** generations
  downstream (1–6, default 2), plus its immediate parents when **Include Immediate
  Parents** is on. Clicking any node in the isolated view — descendant or parent —
  re-anchors on it; **← Back** steps to the previous anchor. Direction shows in the
  borders and edges: cream for the anchor, pink downstream, mauve upstream. Node fills
  keep their kind colors. Turning the toggle off restores the full filtered graph.
  If a filter or exclusion removes the current anchor, focus clears and says so.
```

- [x] **Step 2: Document the search scope**

Replace the existing **Search** bullet with:

```markdown
- **Search** — centers on the first label match and selects it. The scope selector next
  to the box offers **Full Graph** always, and **Current Subgraph** while a subgraph is
  isolated. Searching the full graph while isolated does not re-anchor as you type —
  it reports the match count and waits for Enter, which anchors on the first match.
```

- [x] **Step 3: Update the repo layout and setup blocks**

In the repo layout block, add after `app-visualizer.js`:

```
subgraph.js             focus-mode graph traversal (pure, no DOM)
subgraph.test.js        node:test coverage for subgraph.js
```

And add to the Setup section, after the `npm install` paragraph:

```markdown
Run the unit tests with:

```bash
npm test
```

This runs `node --test`, which covers the focus-mode graph traversal in
`subgraph.js`. No test framework is installed — `node:test` ships with Node.
```

- [ ] **Step 4: Add a screenshot (animated GIF)**

Record Isolate Subgraph in use — anchor plus two generations down with parents on, so all
three border colors are visible, then a depth change and a re-anchor — and save it as
`docs/images/isolate-subgraph.gif`. See `docs/images/README.md` for framing and size
guidance. The reference is already in place under the Isolate Subgraph bullet:

```markdown
![An animated walkthrough of Isolate Subgraph: clicking a node prunes the canvas to that node's neighborhood — the anchor ringed in cream, pink-bordered descendants on pink edges, and mauve-bordered immediate parents on mauve edges — then the Focus Depth slider grows and shrinks the subgraph, and clicking a descendant re-anchors the view on it](docs/images/isolate-subgraph.gif)
```

- [x] **Step 5: Verify**

Run: `npm test`
Expected: PASS — 11 passing.

Re-read `README.md` and confirm no bullet still claims search always re-anchors, and that the layout block lists both new files.

- [x] **Step 6: Commit**

```bash
git add README.md docs/images/isolate-subgraph.png
git commit -m "docs: describe Isolate Subgraph mode and search scoping"
```
