#!/usr/bin/env node
// Skeleton for PR #1. Full agent-frontmatter validation lands in PR #5
// when agents/ is populated (8 agents per PRD §9.2).
import { readdirSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const agentsDir = resolve(root, "agents");

if (!existsSync(agentsDir)) {
  console.log("test-agents.js: OK (no agents/ directory yet — full check deferred to PR #5)");
  process.exit(0);
}

const agents = readdirSync(agentsDir).filter(f => f.endsWith(".md"));
console.log(`test-agents.js: OK (${agents.length} agents found — full check deferred to PR #5)`);
