# Load Cytoscape JSON via Upload — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user load any exported Cytoscape JSON from their filesystem (drop or file picker) instead of the hardcoded `fetch('cytoscape-graph.json')`, and swap graphs without reloading.

**Architecture:** Purely changes how `rawGraphData` is populated. The empty page shows a canvas dropzone and a persistent sidebar "Load Graph File" button; a `FileReader` reads the picked/dropped file, validates it has top-level `nodes`/`edges` arrays, then calls the existing `renderPipeline`. Everything downstream of `rawGraphData` is untouched.

**Tech Stack:** Vanilla JS, browser `FileReader` + drag-and-drop API, Cytoscape.js (already vendored). No new dependencies.

## Global Constraints

- No new npm dependencies; no build step. Plain `<script>` + vanilla JS only.
- Match existing dark theme via the CSS variables already defined in `index.html` (`--bg-color`, `--sidebar-bg`, `--text-color`, `--accent-color`, `--border-color`).
- Do not modify `export-cytoscape.js`, `renderPipeline`, Cytoscape styling, or the filter/spacing/search/layout controls.
- No test runner exists; verification is manual in a served browser page (`npx serve .`). Commit after each task.
- Reset `activeExclusions` to `[]` on each successful load. Keep the committed `cytoscape-graph.json` as a sample (do not delete, do not auto-load).

---

## File Structure

- **Modify `index.html`** — add: (a) a "Loaded" line + "Load Graph File" button + hidden file input in the sidebar; (b) a `#dropzone` overlay inside `#cy-wrapper`; (c) CSS for the dropzone.
- **Modify `app-visualizer.js`** — remove the startup `fetch`; add DOM refs, `showLoadError`, `loadGraphData`, `readFile`; wire the button, hidden input, and document-level drag/drop; start in the empty state.
- **Modify `README.md`** — update Usage to describe loading via the page.

---

### Task 1: Empty-state UI scaffolding (HTML + CSS)

Add the sidebar load control, the "Loaded" filename line, the hidden file input, and the canvas dropzone overlay with styling. No JS wiring yet — this task just makes the empty state render.

**Files:**
- Modify: `index.html` (sidebar stats box ~lines 51-54; add sidebar control group after it; `#cy-wrapper` ~lines 124-127; CSS in `<style>`)

**Interfaces:**
- Consumes: nothing.
- Produces: DOM element IDs used by Task 2 & 3 — `#btn-load` (button), `#file-input` (`<input type="file">`), `#loaded-name` (span), `#dropzone` (overlay div). CSS class `dropzone.dragover` for drag feedback.

- [ ] **Step 1: Add the "Loaded" line to the stats box**

In `index.html`, change the stats box (currently):

```html
        <div class="stats-box">
            <div><strong>Active Nodes:</strong> <span id="n-count">0</span></div>
            <div><strong>Active Edges:</strong> <span id="e-count">0</span></div>
        </div>
```

to:

```html
        <div class="stats-box">
            <div><strong>Loaded:</strong> <span id="loaded-name">— nothing yet —</span></div>
            <div><strong>Active Nodes:</strong> <span id="n-count">0</span></div>
            <div><strong>Active Edges:</strong> <span id="e-count">0</span></div>
        </div>
```

- [ ] **Step 2: Add the sidebar load control**

Immediately after the closing `</div>` of the stats box (before the `Filter Elements` control group), insert:

```html
        <div class="control-group">
            <label>Graph Source</label>
            <input type="file" id="file-input" accept=".json,application/json" style="display:none;">
            <button id="btn-load">Load Graph File</button>
        </div>
```

- [ ] **Step 3: Add the dropzone overlay inside the canvas wrapper**

Change `#cy-wrapper` (currently):

```html
    <div id="cy-wrapper">
        <div id="status-overlay">Initializing Engine...</div>
        <div id="cy"></div>
    </div>
```

to:

```html
    <div id="cy-wrapper">
        <div id="status-overlay">Initializing Engine...</div>
        <div id="dropzone">
            <div class="dropzone-inner">
                <div class="dropzone-title">Drop an exported Cytoscape JSON here</div>
                <div class="dropzone-sub">or use “Load Graph File” in the sidebar</div>
            </div>
        </div>
        <div id="cy"></div>
    </div>
```

- [ ] **Step 4: Add dropzone CSS**

In the `<style>` block, after the `#status-overlay { ... }` rule, add:

```css
        #dropzone { position: absolute; inset: 0; z-index: 90; display: flex; align-items: center; justify-content: center; background: var(--bg-color); text-align: center; }
        #dropzone.dragover .dropzone-inner { border-color: var(--accent-color); color: var(--text-color); }
        .dropzone-inner { border: 2px dashed var(--border-color); border-radius: 12px; padding: 48px 64px; color: #a6adc8; pointer-events: none; }
        .dropzone-title { font-size: 1.1rem; margin-bottom: 8px; color: var(--text-color); }
        .dropzone-sub { font-size: 0.85rem; color: #6c7086; }
```

- [ ] **Step 5: Verify the empty state renders**

Run: `npx serve .` and open the printed URL.
Expected: The canvas area is fully covered by the dropzone showing "Drop an exported Cytoscape JSON here". Sidebar shows `Loaded: — nothing yet —`, `Active Nodes: 0`, `Active Edges: 0`, and a `Load Graph File` button. No console errors. (The button/dropzone do nothing yet — that's Task 2/3.)

- [ ] **Step 6: Commit**

```bash
git add index.html
git commit -m "feat: add empty-state dropzone and load control markup"
```

---

### Task 2: File load handler, validation, and render (picker path)

Remove the startup `fetch`, start in the empty state, and wire the sidebar button + hidden input to read, validate, and render a chosen JSON file. Show the filename, reset exclusions, and hide the dropzone on success; show an error without clobbering state on failure.

**Files:**
- Modify: `app-visualizer.js` (DOM refs block ~lines 6-25; startup `try` block ~lines 240-246; add new functions)

**Interfaces:**
- Consumes (from Task 1): `#btn-load`, `#file-input`, `#loaded-name`, `#dropzone`.
- Produces: `loadGraphData(parsed, fileName)`, `readFile(file)`, `showLoadError(msg)` — used by Task 3's drop handler. `readFile` takes a `File`; `loadGraphData` throws `Error` on invalid shape.

- [ ] **Step 1: Add DOM references**

In `app-visualizer.js`, after the existing `const eCount = document.getElementById('e-count');` line, add:

```javascript
    const btnLoad = document.getElementById('btn-load');
    const fileInput = document.getElementById('file-input');
    const loadedName = document.getElementById('loaded-name');
    const dropzone = document.getElementById('dropzone');
```

- [ ] **Step 2: Add the load/validate/error helper functions**

Immediately after the `renderPipeline` function definition (after its closing `}` near line 238, before the startup `try`), add:

```javascript
    function showLoadError(msg) {
        status.style.display = 'block';
        status.style.color = '#f38ba8';
        status.innerText = 'Load error: ' + msg;
    }

    function loadGraphData(parsed, fileName) {
        if (!parsed || typeof parsed !== 'object' ||
            !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) {
            throw new Error('Not a Cytoscape graph: expected "nodes" and "edges" arrays');
        }
        rawGraphData = parsed;
        activeExclusions = [];
        updateExclusionTagsUI();
        loadedName.innerText = fileName;
        dropzone.style.display = 'none';
        status.style.color = '#a6e3a1';
        renderPipeline(true);
    }

    function readFile(file) {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            let parsed;
            try {
                parsed = JSON.parse(reader.result);
            } catch (err) {
                showLoadError('Could not parse file as JSON');
                return;
            }
            try {
                loadGraphData(parsed, file.name);
            } catch (err) {
                showLoadError(err.message);
            }
        };
        reader.onerror = () => showLoadError('Could not read file');
        reader.readAsText(file);
    }
```

- [ ] **Step 3: Replace the startup `fetch` block with empty-state startup**

Replace the current startup block (from `status.innerText = "Loading graph layout payload...";` through `renderPipeline(true);`, i.e. lines ~241-246 inside the `try`):

```javascript
        status.innerText = "Loading graph layout payload...";
        const res = await fetch('cytoscape-graph.json');
        rawGraphData = await res.json();

        updateExclusionTagsUI();
        renderPipeline(true);
```

with:

```javascript
        status.style.display = 'none';
        updateExclusionTagsUI();

        btnLoad.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            readFile(e.target.files[0]);
            fileInput.value = '';
        });
```

Note: the surrounding `try { ... } catch (e) { ... }` and the other event-listener registrations below it stay as-is. `renderPipeline` already returns early when `rawGraphData` is null, so the existing listeners are safe to register with no graph loaded.

- [ ] **Step 4: Verify picker load, swap, and error handling**

Run: `npx serve .`, open the URL.
Expected sequence:
1. Empty state shows dropzone; no console error (no failed JSON fetch).
2. Click `Load Graph File` → native picker → choose the committed `cytoscape-graph.json` → graph renders, dropzone disappears, sidebar shows `Loaded: cytoscape-graph.json` with non-zero node/edge counts.
3. Confirm existing controls still work: toggle "Show Variables & Constants", add a path exclusion, run a search — all behave as before.
4. Click `Load Graph File` again, pick the same file → reloads (exclusions reset to "No active exclusions").
5. Create a throwaway `bad.txt` containing `hello` and pick it → red `Load error: Could not parse file as JSON` appears; the previously loaded graph stays intact and interactive. Then create `badshape.json` containing `{"foo":1}` and pick it → red `Load error: Not a Cytoscape graph: expected "nodes" and "edges" arrays`; graph still intact.

- [ ] **Step 5: Commit**

```bash
git add app-visualizer.js
git commit -m "feat: load Cytoscape JSON via file picker with validation"
```

---

### Task 3: Drag-and-drop loading

Add document-level drag-and-drop so dropping a file anywhere loads/swaps the graph, with the dropzone giving visual dragover feedback. Reuses `readFile` from Task 2.

**Files:**
- Modify: `app-visualizer.js` (inside the startup `try`, alongside the Task 2 listener registrations)

**Interfaces:**
- Consumes (from Task 2): `readFile(file)`, and (from Task 1) `#dropzone` (`dropzone` ref) with the `.dragover` CSS class.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Register document-level drag/drop handlers**

In `app-visualizer.js`, immediately after the `fileInput.addEventListener('change', ...)` block added in Task 2, add:

```javascript
        document.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (dropzone.style.display !== 'none') dropzone.classList.add('dragover');
        });
        document.addEventListener('dragleave', (e) => {
            if (e.relatedTarget === null) dropzone.classList.remove('dragover');
        });
        document.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('dragover');
            if (e.dataTransfer && e.dataTransfer.files.length > 0) {
                readFile(e.dataTransfer.files[0]);
            }
        });
```

- [ ] **Step 2: Verify drag-and-drop load and swap**

Run: `npx serve .`, open the URL.
Expected:
1. Drag a `.json` over the empty page → dropzone border highlights to the accent color (`.dragover`).
2. Drop the committed `cytoscape-graph.json` → graph renders, dropzone hidden, filename shown. The browser does NOT navigate away to the file (default prevented).
3. Drop a different valid JSON on the loaded graph → it swaps (counts/filename update, exclusions reset).
4. Drop `bad.txt` → red parse error; existing graph intact.

- [ ] **Step 3: Commit**

```bash
git add app-visualizer.js
git commit -m "feat: drag-and-drop loading with dropzone feedback"
```

---

### Task 4: Update README

Document the new load-via-page workflow and drop the "must serve over HTTP for fetch" framing where it no longer applies.

**Files:**
- Modify: `README.md` (Usage section, ~lines 37-63; Notes/limits, ~lines 117-123)

**Interfaces:**
- Consumes: nothing. Produces: nothing.

- [ ] **Step 1: Rewrite the Usage step 3**

In `README.md`, replace the current "3. Serve and open" step:

```markdown
3. Serve and open:

   ```bash
   npx serve .
   ```

   Open the printed URL (usually <http://localhost:3000>). The page must be served over HTTP —
   opening `index.html` as a `file://` URL fails, because the JSON is loaded with `fetch`.
```

with:

```markdown
3. Serve and open:

   ```bash
   npx serve .
   ```

   Open the printed URL (usually <http://localhost:3000>). The page opens empty. Load a graph by
   dragging an exported `cytoscape-graph.json` onto the page, or click **Load Graph File** in the
   sidebar and pick one. You can drop a different file at any time to swap graphs. Because loading
   uses the browser's `FileReader` (not `fetch`), the page also works when opened as a `file://`
   URL, though serving over HTTP works fine too.
```

- [ ] **Step 2: Fix the step-2 export note about the hardcoded browser path**

In the same Usage section, the exporter still writes `cytoscape-graph.json` — leave step 1 and 2 as-is. Verify no remaining sentence claims the browser auto-fetches a fixed path. Search the file:

Run: `grep -n "fetch" README.md`
Expected: only the updated step-3 mention (describing that loading no longer uses `fetch`). If any other line still says the page fetches the JSON automatically, reword it to say the page loads a user-provided file.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: describe loading graphs via drop / file picker"
```

---

## Self-Review

**Spec coverage:**
- Remove hardcoded fetch / open empty → Task 2 Step 3. ✓
- Load any exported JSON (drop / page / picker) → Task 2 (picker) + Task 3 (drop, incl. page-level). ✓
- Swap without reload → Task 2 Step 4.3 / Task 3 Step 2.3 (persistent button + document drop). ✓
- Validation: parse error, wrong shape, empty-graph-ok → Task 2 Step 2 (`readFile`/`loadGraphData`), verified Task 2 Step 4.5. ✓
- Never clobber loaded graph on bad input → `showLoadError` returns without touching `rawGraphData`; verified Task 2 Step 4.5. ✓
- Reset exclusions on load → Task 2 Step 2 (`activeExclusions = []; updateExclusionTagsUI()`). ✓
- Filename display → `#loaded-name` (Task 1) set in `loadGraphData` (Task 2). ✓
- Empty-state dropzone + persistent sidebar control → Task 1. ✓
- Keep committed JSON as sample, don't auto-load → no fetch added; file untouched. ✓
- README update → Task 4. ✓

**Placeholder scan:** No TBD/TODO; all code shown in full. ✓

**Type consistency:** `readFile(file)`, `loadGraphData(parsed, fileName)`, `showLoadError(msg)` referenced identically in Tasks 2 and 3. DOM IDs (`btn-load`, `file-input`, `loaded-name`, `dropzone`) match between Task 1 markup and Task 2/3 refs. ✓
