// Shared: derive a per-file structural fingerprint from a code-graph.
// A file's fingerprint hashes its node ids + the edges anchored to those nodes,
// canonically sorted — so whitespace/comment edits (no structural change) hash
// identically, while an added endpoint / entity / call flips the hash.

import { createHash } from 'node:crypto';

export function perFileFingerprints(graph) {
  const nodes = graph.nodes || [];
  const edges = graph.edges || [];

  // node id -> owning file (file node itself, or member's `file`)
  const nodeFile = new Map();
  for (const n of nodes) if (n.file) nodeFile.set(n.id, n.file);

  const byFile = new Map(); // file -> { nodes:Set, edges:Set }
  const bucket = (f) => {
    if (!byFile.has(f)) byFile.set(f, { nodes: new Set(), edges: new Set() });
    return byFile.get(f);
  };

  for (const n of nodes) if (n.file) {
    // structural identity of a node: id + kind + stereotype + signature + transactional + route
    const sig = [n.id, n.kind, n.stereotype || '', n.signature || '', n.transactional ? 'tx' : '', n.route || ''].join('|');
    bucket(n.file).nodes.add(sig);
  }
  for (const e of edges) {
    const f = nodeFile.get(e.source);
    if (!f) continue; // edge anchored by its source file
    bucket(f).edges.add(`${e.source}>${e.target}:${e.type}`);
  }

  const out = {};
  for (const [file, sets] of byFile) {
    const canon = JSON.stringify({
      nodes: [...sets.nodes].sort(),
      edges: [...sets.edges].sort(),
    });
    out[file] = createHash('sha256').update(canon).digest('hex');
  }
  return out;
}
