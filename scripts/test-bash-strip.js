#!/usr/bin/env node
// Skeleton for PR #1. Full check (no implementer-tier agent has Bash in tools)
// lands in PR #5 when @backend, @frontend, @test agents arrive.
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const agentsDir = resolve(root, "agents");

if (!existsSync(agentsDir)) {
  console.log("test-bash-strip.js: OK (no agents/ directory yet — full check deferred to PR #5)");
  process.exit(0);
}

console.log("test-bash-strip.js: OK (full check deferred to PR #5)");
