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

    let cyInstance = null;
    let rawGraphData = null;
    let activeExclusions = [];

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

                nCount.innerText = filteredNodes.length;
                eCount.innerText = filteredEdges.length;

                checkLayoutThresholds(filteredNodes.length);

                const currentLayout = layoutSelect.value;
                const rSep = parseInt(slideRank.value, 10);
                const nSep = parseInt(slideNode.value, 10);

                valRank.innerText = rSep;
                valNode.innerText = nSep;

                const layoutConfig = {
                    name: currentLayout,
                    animate: filteredNodes.length < 400,
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

                status.innerText = 'Computing coordinates for ' + filteredNodes.length + ' elements...';

                if (!cyInstance) {
                    cyInstance = cytoscape({
                        container: document.getElementById('cy'),
                        elements: [...filteredNodes, ...filteredEdges],
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
                            { selector: 'edge.gen-2', style: { 'line-color': '#f38ba8', 'target-arrow-color': '#f38ba8', 'width': 2.5, 'opacity': 0.40 } }
                        ],
                        layout: layoutConfig
                    });
                    cyInstance.on('tap', (evt) => {
                        const target = evt.target;
                        if (target === cyInstance) {
                            cyInstance.elements().removeClass('faded gen-1 gen-2');
                            infoBox.innerHTML = "Click a node to inspect dependencies...";
                            return;
                        }

                        if (target.isNode()) {
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

                            const totalUpstream = target.predecessors().nodes().length;
                            const totalDownstream = target.successors().nodes().length;

                            infoBox.innerHTML =
                                '<strong>Name:</strong> ' + target.data('label') + '<br/>' +
                                '<strong>Kind:</strong> <span style="color:var(--accent-color)">' + (target.data('kind') || 'unknown').toUpperCase() + '</span><br/>' +
                                '<strong>Total Upstream (All Paths):</strong> ' + totalUpstream + '<br/>' +
                                '<strong>Total Downstream (All Calls):</strong> ' + totalDownstream + '<br/>' +
                                '<strong>File Location:</strong><br/><code style="color:#a6e3a1; font-size:11px;">' + (target.data('filePath') || 'No path specified') + '</code>';
                        }
                    });
                } else {
                    cyInstance.json({ elements: [...filteredNodes, ...filteredEdges] });
                    cyInstance.layout(layoutConfig).run();
                }

                cyInstance.one('layoutstop', () => {
                    if (!fitView && currentZoom !== null && currentPan !== null) {
                        cyInstance.viewport({ zoom: currentZoom, pan: currentPan });
                    }
                    status.style.display = 'none';
                });
            });
        });
    }

    try {
        status.innerText = "Loading graph layout payload...";
        const res = await fetch('cytoscape-graph.json');
        rawGraphData = await res.json();

        updateExclusionTagsUI();
        renderPipeline(true);

        filterVarsCheckbox.addEventListener('change', () => renderPipeline(false));

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
