#!/usr/bin/env node
// scripts/tests/bash-strip.test.js
// Implementer Bash-strip enforcement.
// Hard-coded set: agents named in IMPLEMENTER_AGENTS MUST deny Bash. Their
// authority stops at the source diff; Bash escalation goes through @test-runner
// (suite execution) or @reviewer (read-only static analysis).
//
// Frontmatter shape: declare `tools` allowlist without Bash. `disallowedTools`
// denylists are forbidden per plugin-authoring.md R2. Mutation test verifies
// the validator fails red when an implementer gains Bash.

import { readdirSync, existsSync, readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseAgentFrontmatter, normalizeToolList } from "./agents.test.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const agentsDir = resolve(root, "agents");

const IMPLEMENTER_AGENTS = new Set(["backend", "frontend"]);

let passes = 0;
let failures = 0;

function check(cond, msg) {
  if (cond) { passes++; }
  else { failures++; console.error(`  FAIL: ${msg}`); }
}

export function assertNoBashIfImplementer(name, fm) {
  if (!IMPLEMENTER_AGENTS.has(name)) return null;
  const tools = normalizeToolList(fm.tools);
  if (tools === null) {
    return `implementer agent '${name}' must declare tools allowlist (missing)`;
  }
  if (tools.includes("Bash")) {
    return `implementer agent '${name}' must deny Bash: found Bash in tools allowlist (${JSON.stringify(tools)})`;
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

// === Mutation test: implementer agent with Bash MUST be flagged ===
console.log("Mutation test (validator must fail red when implementer gains Bash):");
{
  // Implementer with Bash in tools allowlist → violation
  const mutatedTools = ["Read", "Grep", "Glob", "Write", "Edit", "MultiEdit", "Bash"];
  const violation = assertNoBashIfImplementer("backend", { tools: mutatedTools });
  check(violation !== null && /must deny Bash.*Bash in tools allowlist/.test(violation),
    `mutation: backend with Bash in tools is flagged`);

  // Implementer with no tools allowlist at all → violation
  const missingTools = assertNoBashIfImplementer("backend", {});
  check(missingTools !== null && /must declare tools allowlist/.test(missingTools),
    `mutation: backend with no tools allowlist is flagged`);

  // Inverse: a non-implementer (e.g., reviewer) with Bash is FINE
  const reviewerOk = assertNoBashIfImplementer("reviewer", {
    tools: ["Read", "Grep", "Glob", "Bash", "Write"],
  });
  check(reviewerOk === null, `inverse: reviewer (non-implementer) with Bash is allowed`);

  // Inverse: implementer with tools allowlist excluding Bash is FINE
  const backendAllowlistOk = assertNoBashIfImplementer("backend", {
    tools: ["Read", "Write", "Edit", "MultiEdit", "Glob", "Grep", "Skill"],
  });
  check(backendAllowlistOk === null, `inverse: backend with Bash absent from tools allowlist is allowed`);
}

if (failures > 0) {
  console.error(`test-bash-strip.js: FAIL (${passes} passed, ${failures} failed)`);
  process.exit(1);
}
console.log(
  `test-bash-strip.js: OK (${implementerCount} implementer-tier agents checked, ${passes} assertions passed)`
);
