#!/usr/bin/env node
// Classify a re-extracted code-graph against a fingerprint baseline. Drives incremental
// reverse-chain re-derivation: only `structural` + `added` files need their artifacts
// re-authored; `unchanged` files are skipped; `removed` files flag stale artifacts.
//
// Usage: node classify-graph-diff.mjs <old-fingerprints.json> <new-graph.json> <out.json>

import { readFileSync, writeFileSync } from 'node:fs';
import { perFileFingerprints } from './fingerprint-lib.mjs';

function fail(m) { process.stderr.write(`classify-graph-diff: ${m}\n`); process.exit(1); }

function main() {
  const [, , oldPath, newGraphPath, outPath] = process.argv;
  if (!oldPath || !newGraphPath || !outPath) fail('usage: classify-graph-diff.mjs <old-fingerprints.json> <new-graph.json> <out.json>');

  let oldFp, newGraph;
  try { oldFp = JSON.parse(readFileSync(oldPath, 'utf8')); } catch (e) { fail(`bad fingerprints: ${e.message}`); }
  try { newGraph = JSON.parse(readFileSync(newGraphPath, 'utf8')); } catch (e) { fail(`bad graph: ${e.message}`); }

  const oldFiles = oldFp.files || {};
  const newFiles = perFileFingerprints(newGraph);

  const structural = []; // present in both, hash differs
  const added = [];      // in new, not in baseline
  const removed = [];     // in baseline, not in new
  const unchanged = [];

  for (const [f, h] of Object.entries(newFiles)) {
    if (!(f in oldFiles)) added.push(f);
    else if (oldFiles[f] !== h) structural.push(f);
    else unchanged.push(f);
  }
  for (const f of Object.keys(oldFiles)) if (!(f in newFiles)) removed.push(f);

  const out = {
    version: '1.0.0',
    baselineCommit: oldFp.commit || null,
    structural: structural.sort(),
    added: added.sort(),
    removed: removed.sort(),
    unchanged: unchanged.sort(),
    rederiveCount: structural.length + added.length,
  };
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  process.stderr.write(
    `classify-graph-diff: structural ${structural.length}, added ${added.length}, removed ${removed.length}, unchanged ${unchanged.length}\n`);
}

try { main(); } catch (e) { fail(e.stack || e.message); }
