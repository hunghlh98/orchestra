#!/usr/bin/env node
// scripts/tests/mcp-shipping.test.js
// Regression: every server declared in .claude-plugin/.mcp.json must
// resolve to an existing file AND must not be excluded by .gitignore.
// Catches allow-list drift before a fresh clone silently drops a
// shipped MCP server.

import { readFileSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const mcpPath = resolve(repoRoot, ".claude-plugin/.mcp.json");

let failures = 0;
let passes = 0;
function check(cond, msg) {
  if (cond) passes++;
  else { failures++; console.error(`  FAIL: ${msg}`); }
}

console.log("mcp-shipping:");

const raw = readFileSync(mcpPath, "utf8");
const mcp = JSON.parse(raw);
const servers = mcp.mcpServers || {};
const names = Object.keys(servers);
check(names.length > 0, `mcpServers declared (got ${names.length})`);

const ROOT_TOKEN = "${CLAUDE_PLUGIN_ROOT}/";

for (const name of names) {
  const entry = servers[name] || {};
  const { command, args } = entry;
  check(command === "node", `${name}: command is "node" (got ${JSON.stringify(command)})`);
  check(Array.isArray(args) && args.length > 0, `${name}: args[] present`);

  const first = (args && args[0]) || "";
  check(first.startsWith(ROOT_TOKEN), `${name}: args[0] uses ${ROOT_TOKEN} prefix`);
  const rel = first.replace(ROOT_TOKEN, "");
  const abs = resolve(repoRoot, rel);
  check(existsSync(abs), `${name}: ${rel} resolves on disk`);

  const r = spawnSync("git", ["-C", repoRoot, "check-ignore", "-q", "--", rel], { stdio: "ignore" });
  // exit 0 = path is ignored, exit 1 = not ignored, exit 128 = error
  check(r.status !== 0, `${name}: ${rel} is NOT git-ignored`);
}

console.log(`  ${passes} passed, ${failures} failed`);
process.exit(failures === 0 ? 0 : 1);
