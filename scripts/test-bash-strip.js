#!/usr/bin/env node
// scripts/test-bash-strip.js
// Implementer-tier Bash strip enforcement per DESIGN-002-leaves §2.3 (PR #6).
// Hard-coded set: agents named in IMPLEMENTER_AGENTS MUST NOT have `Bash`
// in their `tools` array. Mutation test verifies the validator fails red
// when a T-C agent gains Bash.
//
// Why hard-coded names: v1.0.0 ships exactly 3 implementer-tier agents.
// A name-based check is structurally simple and catches every regression
// in CI. v1.1+ may switch to a `tier:` frontmatter field (PRD §10.1
// amendment) and have this validator read tier from frontmatter instead.

import { readdirSync, existsSync, readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAgentFrontmatter } from "./test-agents.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const agentsDir = resolve(root, "agents");

const IMPLEMENTER_AGENTS = new Set(["backend", "frontend", "test"]);

let passes = 0;
let failures = 0;

function check(cond, msg) {
  if (cond) { passes++; }
  else { failures++; console.error(`  FAIL: ${msg}`); }
}

export function hasBash(toolsArray) {
  return Array.isArray(toolsArray) && toolsArray.includes("Bash");
}

export function assertNoBashIfImplementer(name, fm) {
  if (!IMPLEMENTER_AGENTS.has(name)) return null;
  if (hasBash(fm.tools)) {
    return `agent '${name}' is in implementer tier (T-C); Bash MUST NOT appear in tools (got ${JSON.stringify(fm.tools)})`;
  }
  return null;
}

if (!existsSync(agentsDir)) {
  console.log("test-bash-strip.js: OK (no agents/ directory yet — full check deferred to PR #6)");
  process.exit(0);
}

const files = readdirSync(agentsDir).filter(f => f.endsWith(".md")).sort();
let implementerCount = 0;

for (const file of files) {
  const name = file.replace(/\.md$/, "");
  if (!IMPLEMENTER_AGENTS.has(name)) continue;
  implementerCount++;

  const raw = readFileSync(join(agentsDir, file), "utf8");
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fmMatch) {
    check(false, `agents/${file}: missing frontmatter`);
    continue;
  }
  const fm = parseAgentFrontmatter(fmMatch[1]);
  const violation = assertNoBashIfImplementer(name, fm);
  check(violation === null, violation || `agents/${file}: Bash absent ✓`);
}

// === Mutation test: T-C agent with Bash MUST be flagged ===
console.log("Mutation test (validator must fail red when implementer gains Bash):");
{
  const mutatedTools = ["Read", "Grep", "Glob", "Write", "Edit", "MultiEdit", "Bash"];
  const violation = assertNoBashIfImplementer("backend", { tools: mutatedTools });
  check(violation !== null && /Bash MUST NOT appear/.test(violation),
    `mutation: backend with Bash in tools is flagged`);

  // Inverse: a T-A agent (evaluator/reviewer) with Bash is FINE
  const evaluatorOk = assertNoBashIfImplementer("evaluator", {
    tools: ["Read", "Grep", "Glob", "Bash", "Write"],
  });
  check(evaluatorOk === null, `inverse: evaluator (T-A) with Bash is allowed`);

  // Inverse: a T-B agent (product/lead/ship) with no Bash is FINE
  const productOk = assertNoBashIfImplementer("product", {
    tools: ["Read", "Grep", "Glob", "Write"],
  });
  check(productOk === null, `inverse: product (T-B) without Bash is allowed`);
}

if (failures > 0) {
  console.error(`test-bash-strip.js: FAIL (${passes} passed, ${failures} failed)`);
  process.exit(1);
}
console.log(
  `test-bash-strip.js: OK (${implementerCount} implementer-tier agents checked, ${passes} assertions passed)`
);
