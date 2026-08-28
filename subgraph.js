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
