#!/usr/bin/env node
// Partition a Java file list into import-neighborhood batches so cross-batch edges are
// minimized and each batch fits a bounded size. Dependency-free: package/import lines are
// line-regex-trivial in Java, so this runs without the native tree-sitter binding.
//
// Usage: node compute-graph-batches.mjs <input.json> <output.json> [maxBatch]
//   input.json:  { "projectRoot": "<abs>", "files": [{ "path": "<rel .java>" }] }
//   output.json: { "maxBatch", "batches": [{ "index", "files": [path], "neighbors": [{fqcn, batch}] }] }
//
// Each batch's neighbors list names project FQCNs it imports that another batch declares —
// the cross-batch resolution hint the merge step consumes.

import { readFileSync, writeFileSync } from 'node:fs';
import { isAbsolute, resolve, basename } from 'node:path';

function fail(m) { process.stderr.write(`compute-graph-batches: ${m}\n`); process.exit(1); }

const PKG_RE = /^\s*package\s+([\w.]+)\s*;/m;
const IMPORT_RE = /^\s*import\s+(?:static\s+)?([\w.]+)\s*;/gm;

function lightScan(abs, rel) {
  let src;
  try { src = readFileSync(abs, 'utf8'); } catch { return null; }
  const pkg = (src.match(PKG_RE) || [])[1] || '';
  const typeName = basename(rel).replace(/\.java$/, '');
  const fqcn = pkg ? `${pkg}.${typeName}` : typeName;
  const imports = [];
  let m;
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(src)) !== null) imports.push(m[1]);
  return { path: rel, fqcn, pkg, imports };
}

// union-find
function makeUF(n) {
  const p = Array.from({ length: n }, (_, i) => i);
  const find = (x) => { while (p[x] !== x) { p[x] = p[p[x]]; x = p[x]; } return x; };
  const union = (a, b) => { p[find(a)] = find(b); };
  return { find, union };
}

function main() {
  const [, , inPath, outPath, maxArg] = process.argv;
  if (!inPath || !outPath) fail('usage: compute-graph-batches.mjs <input.json> <output.json> [maxBatch]');
  const maxBatch = Math.max(1, parseInt(maxArg || '40', 10));

  let input;
  try { input = JSON.parse(readFileSync(inPath, 'utf8')); } catch (e) { fail(`bad input: ${e.message}`); }
  const projectRoot = input.projectRoot || process.cwd();
  const fileEntries = (Array.isArray(input.files) ? input.files : []);
  if (fileEntries.length === 0) fail('no files in input');

  const scans = [];
  for (const f of fileEntries) {
    const abs = isAbsolute(f.path) ? f.path : resolve(projectRoot, f.path);
    const s = lightScan(abs, f.path);
    if (s) scans.push(s);
  }

  // map declared fqcn -> scan index (for resolving imports to project files)
  const fqcnToIdx = {};
  scans.forEach((s, i) => { fqcnToIdx[s.fqcn] = i; });

  // union files connected by a project-internal import
  const uf = makeUF(scans.length);
  scans.forEach((s, i) => {
    for (const imp of s.imports) {
      const j = fqcnToIdx[imp];
      if (j !== undefined && j !== i) uf.union(i, j);
    }
    // same-package cohesion: union files sharing a package
  });
  // same-package cohesion in a second pass (keeps a package together even with no explicit import)
  const byPkg = {};
  scans.forEach((s, i) => { (byPkg[s.pkg] = byPkg[s.pkg] || []).push(i); });
  for (const idxs of Object.values(byPkg)) for (let k = 1; k < idxs.length; k++) uf.union(idxs[0], idxs[k]);

  // group by component root
  const comps = {};
  scans.forEach((_, i) => { (comps[uf.find(i)] = comps[uf.find(i)] || []).push(i); });

  // pack components into batches <= maxBatch; split oversized components by chunking
  const batches = [];
  let cur = [];
  const flush = () => { if (cur.length) { batches.push(cur); cur = []; } };
  for (const comp of Object.values(comps)) {
    if (comp.length >= maxBatch) {
      flush();
      for (let k = 0; k < comp.length; k += maxBatch) batches.push(comp.slice(k, k + maxBatch));
      continue;
    }
    if (cur.length + comp.length > maxBatch) flush();
    cur.push(...comp);
  }
  flush();
  if (batches.length === 0) batches.push(scans.map((_, i) => i));

  // file index -> batch index
  const fileBatch = {};
  batches.forEach((b, bi) => b.forEach((fi) => { fileBatch[fi] = bi; }));

  // neighborMap: per batch, project FQCNs imported from OTHER batches
  const out = {
    version: '1.0.0',
    maxBatch,
    projectRoot,
    batches: batches.map((b, bi) => {
      const files = b.map((fi) => scans[fi].path);
      const neighbors = [];
      const seen = new Set();
      for (const fi of b) {
        for (const imp of scans[fi].imports) {
          const j = fqcnToIdx[imp];
          if (j === undefined) continue;          // external import
          const nb = fileBatch[j];
          if (nb === bi) continue;                 // same batch
          if (seen.has(imp)) continue;
          seen.add(imp);
          neighbors.push({ fqcn: imp, batch: nb });
        }
      }
      return { index: bi, files, neighbors };
    }),
  };
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  process.stderr.write(`compute-graph-batches: ${scans.length} files -> ${batches.length} batches (maxBatch ${maxBatch})\n`);
}

try { main(); } catch (e) { fail(e.stack || e.message); }
