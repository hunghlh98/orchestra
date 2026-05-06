#!/usr/bin/env node
// scripts/bump-version.js
// Atomic version bump for orchestra. Single arg = new semver. Updates
// VERSION + package.json + .claude-plugin/plugin.json in one shot.
//
// Usage: node scripts/bump-version.js <semver>
// Example: node scripts/bump-version.js 2.0.0
//
// Why a script instead of manual edits: validate.js enforces
// `VERSION === plugin.json.version` (and the test chain runs validate.js).
// Hand-editing the three files in sequence yields a window where the values
// disagree → CI red. This script reads all three first (parse-checks JSON),
// then writes all three. JSON edits are surgical (regex on the `"version":`
// line) so other formatting + key order is preserved.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// SemVer 2.0.0: MAJOR.MINOR.PATCH with optional -prerelease and +build.
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?$/;

// Surgical regex over a JSON file's top-level `"version"` field.
// Matches the indent so the replacement preserves it.
const VERSION_FIELD_RE = /^(\s*)"version":\s*"[^"]+"/m;

const TARGETS = [
  { path: resolve(ROOT, "VERSION"), kind: "plain" },
  { path: resolve(ROOT, "package.json"), kind: "json" },
  { path: resolve(ROOT, ".claude-plugin/plugin.json"), kind: "json" },
];

function fail(msg) {
  process.stderr.write(`bump-version: ${msg}\n`);
  process.exit(1);
}

const newVersion = process.argv[2];
if (!newVersion) fail("usage: bump-version <semver>");
if (!SEMVER_RE.test(newVersion)) fail(`invalid semver: "${newVersion}"`);

// Phase 1: read + parse-check every file. Bail on any failure before any write.
const reads = [];
for (const t of TARGETS) {
  if (!existsSync(t.path)) fail(`missing target: ${t.path}`);
  const content = readFileSync(t.path, "utf8");
  if (t.kind === "json") {
    try { JSON.parse(content); }
    catch (e) { fail(`parse failed (${t.path}): ${e.message}`); }
    if (!VERSION_FIELD_RE.test(content)) {
      fail(`no top-level "version" field found in ${t.path}`);
    }
  }
  reads.push({ ...t, content });
}

// Phase 2: write all (filesystem has no transaction; this is best-effort).
for (const r of reads) {
  let next;
  if (r.kind === "plain") {
    next = newVersion + (r.content.endsWith("\n") ? "\n" : "");
  } else {
    next = r.content.replace(VERSION_FIELD_RE, `$1"version": "${newVersion}"`);
  }
  writeFileSync(r.path, next);
  console.log(`  ${r.path.slice(ROOT.length + 1)} → ${newVersion}`);
}
console.log(`bump-version: OK (${TARGETS.length} files updated to ${newVersion})`);
