#!/usr/bin/env node
// Skeleton for PR #1. Hash-equality + blocker/observer/rewriter contract
// assertions land in PR #2 (hash-stamper) and PR #3 (the other 4 hooks).
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const hooksDir = resolve(root, "hooks/scripts");

if (!existsSync(hooksDir)) {
  console.log("test-hooks.js: OK (no hooks/scripts/ directory yet — full check deferred to PR #2/PR #3)");
  process.exit(0);
}

console.log("test-hooks.js: OK (full check deferred to PR #2/PR #3)");
