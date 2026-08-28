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
