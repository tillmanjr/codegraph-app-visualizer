# Design: Load Cytoscape JSON via upload

**Date:** 2026-08-24
**Branch:** `feature/upload-cytoscape-json`

## Summary

Replace the hardcoded `fetch('cytoscape-graph.json')` startup with a user-driven
file load. The explorer opens empty and renders whatever exported Cytoscape JSON
the user provides — dropped on the canvas, dropped anywhere on the page, or
picked via a sidebar button — and lets them swap graphs without reloading.

The uploaded file is the **already-exported Cytoscape JSON** (the output of
`export-cytoscape.js`), not a raw SQLite `.db`. No browser-side SQLite/WASM is
involved.

## Goals

- Remove the hardcoded dependency on a single `cytoscape-graph.json` at a fixed path.
- Let the user load any exported graph JSON from their filesystem.
- Let the user swap to a different graph after one is loaded, without a page reload.
- Fail safe on bad input: never clobber an already-loaded graph with an invalid file.

## Non-goals

- Reading raw `codegraph.db` (SQLite) in the browser. Users still run
  `export-cytoscape.js` offline to produce the JSON.
- Changing the exporter, the render/filter pipeline, Cytoscape styling, or the
  sidebar filter controls.
- Persisting the loaded graph across reloads (no localStorage, no history).

## Architecture

This is purely a change to **how `rawGraphData` gets populated**. Everything
downstream of `rawGraphData` is untouched.

- **Unchanged:** `export-cytoscape.js` (still the db→JSON exporter); the entire
  render/filter pipeline (`renderPipeline`); Cytoscape styling; sidebar filter,
  spacing, search, layout, and legend controls.
- **Changed:**
  - `index.html` — add an empty-state canvas dropzone and a persistent sidebar
    "Load Graph File" control (button + hidden `<input type="file" accept=".json,application/json">`).
  - `app-visualizer.js` — replace the startup `fetch(...)` with a file-reading
    path; wire up drop and picker events; add validation and filename display.
- **Removed:** the automatic `fetch('cytoscape-graph.json')` on load. The
  committed `cytoscape-graph.json` stays in the repo as a **sample the user can
  upload**, not something auto-loaded.

## Components & data flow

1. **On load:** no fetch. Empty-state dropzone visible over the canvas; sidebar
   stats show 0 nodes / 0 edges; the render pipeline is idle. The sidebar
   "Load Graph File" control is present.

2. **User provides a file** — three entry points, all funneling into one handler:
   - Drop on the canvas dropzone.
   - Drop anywhere on the page (page-level dragover/drop, with default prevented
     so the browser doesn't navigate to the file).
   - Sidebar "Load Graph File" button → native file picker.

   Handler steps:
   - `FileReader.readAsText(file)` → `JSON.parse(text)`.
   - **Validate:** parsed value is a non-null object with `nodes` **and** `edges`
     as arrays. If not, treat as invalid (see Error handling).
   - **On success:** set `rawGraphData`; reset `activeExclusions` to empty and
     refresh the exclusion tags UI; hide the dropzone; call `renderPipeline(true)`;
     display the loaded filename in the stats box.

3. **Swap:** the sidebar "Load Graph File" control remains available after a graph
   loads. Re-loading a valid file replaces `rawGraphData`, resets exclusions, and
   re-renders. The canvas dropzone is hidden once a graph is loaded (page-level
   drop still works for swapping).

## Error handling

- **Invalid JSON** (`JSON.parse` throws) → red status-overlay message
  (e.g. "Could not parse file as JSON"); no state change. A previously loaded
  graph stays intact.
- **Valid JSON, wrong shape** (missing/`non-array` `nodes` or `edges`) → red
  status-overlay message (e.g. "Not a Cytoscape graph: expected `nodes` and
  `edges` arrays"); no state change.
- **Empty graph** (parses fine, `nodes.length === 0`) → loads successfully, shows
  an empty canvas and 0/0 counts. Not an error.
- **Wrong endpoints etc.** — out of scope; the exporter already sanitizes. The
  page trusts the JSON's shape beyond the top-level `nodes`/`edges` check.

## UI notes

- **Empty-state dropzone:** a centered overlay on `#cy-wrapper` with a short
  prompt ("Drop an exported Cytoscape JSON here, or use Load Graph File"). Styled
  to match the existing dark theme (uses the CSS variables already defined).
  Highlights on dragover. Hidden once a graph is loaded.
- **Sidebar control:** placed near the top of the sidebar (above or just under
  the stats box) so it's the first thing available. Reuses existing `button`
  styling.
- **Filename display:** shown in the stats box (e.g. a "Loaded: <name>" line) so
  the user knows which graph is active, especially after swapping.

## Testing

Manual verification, driven in the browser:

1. Open the page → empty-state dropzone visible, stats 0/0, no console/network
   error from a missing JSON fetch.
2. Drop the committed `cytoscape-graph.json` → graph renders; filename shown;
   dropzone hidden; filters/search/layout all still work.
3. Load a second valid file via the sidebar button → graph swaps; exclusions
   reset; counts update.
4. Drop a `.txt` / garbage file → red error message; the previously loaded graph
   remains intact and interactive.
5. Sidebar button opens the native picker and behaves identically to dropping.

## Documentation

- Update `README.md` Usage section: the browser no longer needs the JSON at a
  fixed path; instead, run the exporter to produce a JSON, then load it via the
  page (drop or Load Graph File button).
- Note that because loading now uses `FileReader`, opening `index.html` as a
  `file://` URL works for loading (the old "must serve over HTTP for fetch"
  caveat no longer blocks loading), though serving still works fine.
