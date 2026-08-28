document.addEventListener('DOMContentLoaded', async () => {
    const status = document.getElementById('status-overlay');
    const infoBox = document.getElementById('info-box');
    const layoutWarning = document.getElementById('layout-warning');

    // UI Elements
    const filterVarsCheckbox = document.getElementById('filter-variables');
    const excludeInput = document.getElementById('exclude-input');
    const btnAddExclude = document.getElementById('btn-add-exclude');
    const btnClearExclude = document.getElementById('btn-clear-exclude');
    const exclusionContainer = document.getElementById('exclusion-container');

    const slideRank = document.getElementById('slide-rank');
    const slideNode = document.getElementById('slide-node');
    const valRank = document.getElementById('val-rank');
    const valNode = document.getElementById('val-node');
    const layoutSelect = document.getElementById('layout-select');
    const searchInput = document.getElementById('search-input');
    const btnFit = document.getElementById('btn-fit');
    const nCount = document.getElementById('n-count');
    const eCount = document.getElementById('e-count');

    const btnLoad = document.getElementById('btn-load');
    const fileInput = document.getElementById('file-input');
    const loadedName = document.getElementById('loaded-name');
    const dropzone = document.getElementById('dropzone');

    const focusModeCheckbox = document.getElementById('focus-mode');
    const focusParentsCheckbox = document.getElementById('focus-parents');
    const focusParentsLabel = document.getElementById('focus-parents-label');
    const focusDepthSlider = document.getElementById('focus-depth');
    const valFocusDepth = document.getElementById('val-focus-depth');
    const btnFocusBack = document.getElementById('btn-focus-back');
    const focusAnchorName = document.getElementById('focus-anchor-name');
    const searchScopeSelect = document.getElementById('search-scope');
    const searchHint = document.getElementById('search-hint');

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

    if (typeof cytoscapeDagre !== 'undefined') {
        cytoscape.use(cytoscapeDagre);
    }

    function checkLayoutThresholds(nodeCount) {
        const selectedLayout = layoutSelect.value;
        if (selectedLayout === 'cose' && nodeCount > 500) {
            layoutWarning.style.display = 'block';
            if (nodeCount > 1200) {
                layoutWarning.innerText = '🛑 High Risk: COSE math on ' + nodeCount + ' elements will freeze your browser tab for several seconds.';
            } else {
                layoutWarning.innerText = '⚠️ Warning: Force-Directed rendering on ' + nodeCount + ' nodes will be slow.';
            }
        } else {
            layoutWarning.style.display = 'none';
        }
    }

    function predictLayoutRisks() {
        if (!cyInstance) return false;
        const selectedLayout = layoutSelect.value;
        const currentCount = cyInstance.nodes().length;

        if (selectedLayout === 'cose' && currentCount > 500) {
            layoutWarning.style.display = 'block';
            if (currentCount > 1200) {
                layoutWarning.innerHTML = '🛑 High Risk: COSE math on ' + currentCount + ' elements will freeze your browser tab for several seconds.';
            } else {
                layoutWarning.innerHTML = '⚠️ Warning: Force-Directed rendering on ' + currentCount + ' nodes will be slow.';
            }
            return true;
        } else {
            layoutWarning.style.display = 'none';
            return false;
        }
    }

    function updateExclusionTagsUI() {
        exclusionContainer.innerHTML = '';
        if (activeExclusions.length === 0) {
            exclusionContainer.innerHTML = '<span style="color:#6c7086; font-size:0.8rem; padding:4px;">No active exclusions</span>';
            return;
        }

        activeExclusions.forEach((token, index) => {
            const tag = document.createElement('div');
            tag.className = 'exclusion-tag';
            tag.innerHTML = '<span>' + token + '</span><span class="remove-btn" data-index="' + index + '">×</span>';
            exclusionContainer.appendChild(tag);
        });

        const buttons = exclusionContainer.querySelectorAll('.remove-btn');
        buttons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.getAttribute('data-index'), 10);
                activeExclusions.splice(idx, 1);
                updateExclusionTagsUI();
                renderPipeline(false);
            });
        });
    }

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

    function renderPipeline(fitView = true) {
        if (!rawGraphData) return;

        status.style.display = 'block';
        status.style.color = '#a6e3a1';
        status.innerText = "Processing filters & preparing physics math...";

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                let currentZoom = null;
                let currentPan = null;
                if (cyInstance) {
                    currentZoom = cyInstance.zoom();
                    currentPan = { ...cyInstance.pan() };
                }

                const showVariables = filterVarsCheckbox.checked;

                const filteredNodes = rawGraphData.nodes.filter(n => {
                    if (!showVariables) {
                        const kind = n.data.kind || '';
                        if (kind === 'variable' || kind === 'constant') return false;
                    }

                    if (activeExclusions.length > 0) {
                        const pathString = (n.data.filePath || '').toLowerCase();
                        const labelString = (n.data.label || '').toLowerCase();
                        for (let token of activeExclusions) {
                            if (pathString.includes(token) || labelString.includes(token)) {
                                return false;
                            }
                        }
                    }
                    return true;
                });

                const activeNodeIds = new Set(filteredNodes.map(n => n.data.id));
                const filteredEdges = rawGraphData.edges.filter(e => {
                    return activeNodeIds.has(e.data.source) && activeNodeIds.has(e.data.target);
                });

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

                nCount.innerText = viewNodes.length;
                eCount.innerText = viewEdges.length;

                checkLayoutThresholds(viewNodes.length);

                const currentLayout = layoutSelect.value;
                const rSep = parseInt(slideRank.value, 10);
                const nSep = parseInt(slideNode.value, 10);

                valRank.innerText = rSep;
                valNode.innerText = nSep;

                const layoutConfig = {
                    name: currentLayout,
                    animate: viewNodes.length < 400,
                    animationDuration: 300,
                    fit: fitView,
                    padding: 50
                };

                if (currentLayout === 'dagre') {
                    layoutConfig.rankSep = rSep;
                    layoutConfig.nodeSep = nSep;
                    layoutConfig.rankDir = 'LR';
                } else if (currentLayout === 'cose') {
                    layoutConfig.nodeRepulsion = () => nSep * 250;
                    layoutConfig.idealEdgeLength = () => rSep * 0.7;
                    layoutConfig.infinite = false;
                    layoutConfig.numIter = 1000;
                }

                status.innerText = 'Computing coordinates for ' + viewNodes.length + ' elements...';

                if (!cyInstance) {
                    cyInstance = cytoscape({
                        container: document.getElementById('cy'),
                        elements: [...viewNodes, ...viewEdges],
                        userZoomingEnabled: true,
                        userPanningEnabled: true,
                        boxSelectionEnabled: false,
                        style: [
                            { selector: 'node', style: { 'background-color': '#94e2d5', 'label': 'data(label)', 'color': '#cdd6f4', 'font-size': '11px', 'text-valign': 'center', 'text-halign': 'right', 'text-margin-x': 6, 'width': 22, 'height': 22, 'transition-property': 'opacity, scale, border-width, background-color', 'transition-duration': '0.2s' } },
                            { selector: 'node[kind = "function"], node[kind = "method"]', style: { 'background-color': '#a6e3a1', 'width': 24, 'height': 24 } },
                            { selector: 'node[kind = "class"], node[kind = "interface"]', style: { 'background-color': '#fab387', 'width': 32, 'height': 32 } },
                            { selector: 'node[kind = "file"], node[kind = "module"]', style: { 'background-color': '#89b4fa', 'width': 30, 'height': 30 } },
                            { selector: 'node[kind = "variable"], node[kind = "constant"]', style: { 'background-color': '#f9e2af', 'width': 14, 'height': 14 } },
                            { selector: 'edge', style: { 'width': 2, 'line-color': '#45475a', 'target-arrow-color': '#45475a', 'target-arrow-shape': 'triangle', 'curve-style': 'bezier', 'arrow-scale': 0.8, 'transition-property': 'line-color, opacity, width, target-arrow-color', 'transition-duration': '0.2s' } },
                            { selector: '.faded', style: { 'opacity': 0.10, 'text-opacity': 0.02 } },

                            // 2-Generation Unified Color Fading System
                            { selector: 'node.gen-1', style: { 'background-color': '#f38ba8', 'border-width': 4, 'border-color': '#f5e0dc', 'scale': 1.20, 'opacity': 1.0 } },
                            { selector: 'edge.gen-1', style: { 'line-color': '#f38ba8', 'target-arrow-color': '#f38ba8', 'width': 5.0, 'opacity': 1.0 } },
                            { selector: 'node.gen-2', style: { 'background-color': '#f38ba8', 'border-width': 2, 'border-color': '#f38ba8', 'scale': 1.05, 'opacity': 0.45 } },
                            { selector: 'edge.gen-2', style: { 'line-color': '#f38ba8', 'target-arrow-color': '#f38ba8', 'width': 2.5, 'opacity': 0.40 } },

                            // Isolate Subgraph: direction lives on borders and edges,
                            // so node fills keep their kind colors.
                            { selector: 'node.focus-down', style: { 'border-width': 3, 'border-color': '#f38ba8' } },
                            { selector: 'node.focus-up', style: { 'border-width': 3, 'border-color': '#cba6f7' } },
                            { selector: 'node.focus-anchor', style: { 'border-width': 5, 'border-color': '#f5e0dc' } },
                            { selector: 'edge.focus-down', style: { 'line-color': '#f38ba8', 'target-arrow-color': '#f38ba8', 'width': 3 } },
                            { selector: 'edge.focus-up', style: { 'line-color': '#cba6f7', 'target-arrow-color': '#cba6f7', 'width': 3 } }
                        ],
                        layout: layoutConfig
                    });
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
                } else {
                    cyInstance.json({ elements: [...viewNodes, ...viewEdges] });
                    cyInstance.layout(layoutConfig).run();
                }

                applyFocusClasses(focusDirections);

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
            });
        });
    }

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
        focusMode = false;
        focusModeCheckbox.checked = false;
        lastClickedNodeId = null;
        clearFocus();
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

    try {
        status.style.display = 'none';
        updateExclusionTagsUI();
        updateFocusUI();

        btnLoad.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            readFile(e.target.files[0]);
            fileInput.value = '';
        });

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

        filterVarsCheckbox.addEventListener('change', () => renderPipeline(false));

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

        btnAddExclude.addEventListener('click', () => {
            const val = excludeInput.value.trim().toLowerCase();
            if (val.length > 0 && !activeExclusions.includes(val)) {
                activeExclusions.push(val);
                excludeInput.value = '';
                updateExclusionTagsUI();
                renderPipeline(false);
            }
        });

        excludeInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                btnAddExclude.click();
            }
        });

        btnClearExclude.addEventListener('click', () => {
            if (activeExclusions.length > 0) {
                activeExclusions = [];
                updateExclusionTagsUI();
                renderPipeline(false);
            }
        });

        layoutSelect.addEventListener('change', () => {
            const isRisky = predictLayoutRisks();
            if (isRisky) {
                status.style.display = 'block';
                status.innerText = "Holding execution for layout confirmation alert...";
                setTimeout(() => { renderPipeline(true); }, 100);
            } else {
                renderPipeline(true);
            }
        });

        slideRank.addEventListener('input', (e) => { valRank.innerText = e.target.value; });
        slideNode.addEventListener('input', (e) => { valNode.innerText = e.target.value; });
        slideRank.addEventListener('change', () => renderPipeline(false));
        slideNode.addEventListener('change', () => renderPipeline(false));

        btnFit.addEventListener('click', () => {
            if (cyInstance) {
                cyInstance.elements().removeClass('faded gen-1 gen-2');
                cyInstance.fit([], 50);
            }
        });

        searchInput.addEventListener('input', (e) => {
            if (!cyInstance) return;
            const query = e.target.value.toLowerCase().trim();
            cyInstance.elements().removeClass('faded gen-1 gen-2');

            if (query.length > 1) {
                const matches = cyInstance.nodes().filter(node => node.data('label').toLowerCase().includes(query));
                if (matches.length > 0) {
                    cyInstance.animate({ center: { eles: matches.first() } }, { duration: 300 });
                    matches.first().trigger('tap');
                }
            }
        });

    } catch (e) {
        status.style.color = '#f38ba8';
        status.innerText = "System Error: " + e.message;
    }
});
