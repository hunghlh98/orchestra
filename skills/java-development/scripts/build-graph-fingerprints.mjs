#!/usr/bin/env node
// Build the per-file structural fingerprint baseline from a code-graph, at reverse-chain
// close. Future re-runs diff against this to classify STRUCTURAL vs cosmetic change and
// re-derive only affected artifacts.
//
// Usage: node build-graph-fingerprints.mjs <graph.json> <out-fingerprints.json> [commitHash]

import { readFileSync, writeFileSync } from 'node:fs';
import { perFileFingerprints } from './fingerprint-lib.mjs';

function fail(m) { process.stderr.write(`build-graph-fingerprints: ${m}\n`); process.exit(1); }

function main() {
  const [, , graphPath, outPath, commit] = process.argv;
  if (!graphPath || !outPath) fail('usage: build-graph-fingerprints.mjs <graph.json> <out.json> [commitHash]');
  let graph;
  try { graph = JSON.parse(readFileSync(graphPath, 'utf8')); } catch (e) { fail(`bad graph: ${e.message}`); }
  const files = perFileFingerprints(graph);
  const out = {
    version: '1.0.0',
    commit: commit || null,
    builtAt: new Date().toISOString(),
    files,
  };
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  process.stderr.write(`build-graph-fingerprints: ${Object.keys(files).length} file fingerprints${commit ? ` @ ${commit}` : ''}\n`);
}

try { main(); } catch (e) { fail(e.stack || e.message); }
