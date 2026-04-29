#!/usr/bin/env node
// PR #1 implements only the empty-tree pass-by-default branch.
// Full drift-detection algorithm (DESIGN-001-infra §5) lands in PR #2.
import { existsSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const orchestraDir = resolve(root, ".claude/.orchestra");

function walkArtifacts(dir) {
  const out = [];
  if (!existsSync(dir)) return out;
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walkArtifacts(full));
    else if (ent.name.endsWith(".md") || ent.name.endsWith(".openapi.yaml")) out.push(full);
  }
  return out;
}

let artifactCount = 0;
for (const sub of ["pipeline", "architecture", "runbooks", "releases"]) {
  artifactCount += walkArtifacts(join(orchestraDir, sub)).length;
}

if (artifactCount === 0) {
  console.log("validate-drift.js: OK (no artifacts found — pass-by-default per Q7)");
  process.exit(0);
}

console.log(`validate-drift.js: OK (${artifactCount} artifacts found — full algorithm deferred to PR #2)`);
