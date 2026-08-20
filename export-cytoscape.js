const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

const dbPath = path.join(process.cwd(), 'import', 'codegraph.db');
const outputPath = path.join(process.cwd(), 'cytoscape-graph.json');

if (!fs.existsSync(dbPath)) {
    console.error(`Error: Could not find database at ${dbPath}`);
    process.exit(1);
}

const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
    if (err) { process.exit(1); }
    exportData();
});

function exportData() {
    console.log('Sanitizing CodeGraph indices directly from database rows...');

    db.all(`SELECT id, name, kind, file_path FROM nodes`, [], (err, nodeRows) => {
        if (err) { db.close(); return; }

        const validNodeIds = new Set();
        const nodes = [];

        // Parse and sanitize nodes safely
        nodeRows.forEach(row => {
            // Strict check: skip if id is null, undefined, or empty string
            if (row.id === null || row.id === undefined || String(row.id).trim() === "") return;

            const stringId = String(row.id);
            validNodeIds.add(stringId);

            nodes.push({
                data: {
                    id: stringId,
                    label: String(row.name || 'anonymous'),
                    kind: String(row.kind || 'unknown').toLowerCase(),
                    filePath: String(row.file_path || '')
                }
            });
        });

        db.all(`SELECT source, target, kind FROM edges`, [], (err, edgeRows) => {
            if (err) { db.close(); return; }

            const edges = [];
            let edgeCounter = 0;

            // Parse and filter edges against valid nodes
            edgeRows.forEach(row => {
                const srcStr = String(row.source);
                const tgtStr = String(row.target);

                // Validation: Only draw edge if BOTH ends exist in nodes set
                if (validNodeIds.has(srcStr) && validNodeIds.has(tgtStr)) {
                    edges.push({
                        data: {
                            id: `edge-${edgeCounter++}`,
                            source: srcStr,
                            target: tgtStr,
                            relationship: String(row.kind || 'references')
                        }
                    });
                }
            });

            const payload = { nodes, edges };

            try {
                fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf-8');
                console.log(`\n--- SANITIZATION SUCCESS ---`);
                console.log(`Saved Nodes to JSON: ${nodes.length} (Discarded invalid: ${nodeRows.length - nodes.length})`);
                console.log(`Saved Edges to JSON: ${edges.length} (Discarded orphaned: ${edgeRows.length - edges.length})`);
            } catch (writeErr) {
                console.error(writeErr.message);
            }

            db.close();
        });
    });
}
