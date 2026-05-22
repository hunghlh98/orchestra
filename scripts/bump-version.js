#!/usr/bin/env node
// scripts/bump-version.js
// Atomic version bump for orchestra. Single arg = new semver. Updates
// VERSION + package.json + .claude-plugin/plugin.json +
// .claude-plugin/marketplace.json in one shot.
//
// Usage: node scripts/bump-version.js <semver>
// Example: node scripts/bump-version.js 2.0.0
//
// Why a script instead of manual edits: validate.js enforces
// `VERSION === plugin.json.version` (and the test chain runs validate.js).
// Hand-editing the files in sequence yields a window where the values
// disagree → CI red. This script reads all four first (parse-checks JSON),
// then writes all four. JSON edits are surgical (regex on the `"version":`
// line) so other formatting + key order is preserved.
//
// marketplace.json carries an additional field — `plugins[0].source.ref` —
// pinning the consumer install to a release tag (`v<semver>`). Bumping
// version without rolling the ref forward leaves a rolling-master install
// path that contradicts the pinned-version intent. This script keeps both
// in lockstep.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// SemVer 2.0.0: MAJOR.MINOR.PATCH with optional -prerelease and +build.
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?(?:\+[a-zA-Z0-9.-]+)?$/;

// Surgical regex over a JSON file's top-level `"version"` field.
// Matches the indent so the replacement preserves it.
const VERSION_FIELD_RE = /^(\s*)"version":\s*"[^"]+"/m;

// First `"version"` field inside marketplace.json (plugin entry under
// plugins[0]; the file has no top-level version, so a leading match is
// guaranteed to land on the plugin entry).
const MKT_VERSION_RE = /("version":\s*)"[^"]+"/;
// The single `"ref"` field under plugins[0].source. Unique per file.
const MKT_REF_RE = /("ref":\s*)"v[^"]+"/;

const TARGETS = [
  { path: resolve(ROOT, "VERSION"), kind: "plain" },
  { path: resolve(ROOT, "package.json"), kind: "json" },
  { path: resolve(ROOT, ".claude-plugin/plugin.json"), kind: "json" },
  { path: resolve(ROOT, ".claude-plugin/marketplace.json"), kind: "marketplace" },
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
  } else if (t.kind === "marketplace") {
    let parsed;
    try { parsed = JSON.parse(content); }
    catch (e) { fail(`parse failed (${t.path}): ${e.message}`); }
    if (parsed.version !== undefined) {
      fail(`${t.path}: unexpected top-level "version" field — surgical regex assumes plugin-entry-only`);
    }
    if (!parsed?.plugins?.[0]?.version) {
      fail(`${t.path}: missing plugins[0].version`);
    }
    if (!parsed?.plugins?.[0]?.source?.ref) {
      fail(`${t.path}: missing plugins[0].source.ref`);
    }
    if (!MKT_VERSION_RE.test(content)) {
      fail(`${t.path}: surgical version regex did not match`);
    }
    if (!MKT_REF_RE.test(content)) {
      fail(`${t.path}: surgical ref regex did not match`);
    }
  }
  reads.push({ ...t, content });
}

// Phase 2: write all (filesystem has no transaction; this is best-effort).
for (const r of reads) {
  let next;
  if (r.kind === "plain") {
    next = newVersion + (r.content.endsWith("\n") ? "\n" : "");
  } else if (r.kind === "json") {
    next = r.content.replace(VERSION_FIELD_RE, `$1"version": "${newVersion}"`);
  } else if (r.kind === "marketplace") {
    next = r.content
      .replace(MKT_VERSION_RE, `$1"${newVersion}"`)
      .replace(MKT_REF_RE, `$1"v${newVersion}"`);
  }
  writeFileSync(r.path, next);
  console.log(`  ${r.path.slice(ROOT.length + 1)} → ${newVersion}`);
}

// Phase 3: re-read every written file and verify the new version is present.
// Catches partial writes (disk full), races (another process editing),
// or surgical-regex misses (unexpected JSON shape).
const mismatches = [];
for (const t of TARGETS) {
  const fresh = readFileSync(t.path, "utf8");
  if (t.kind === "plain") {
    if (fresh.trim() !== newVersion) {
      mismatches.push(`${t.path}: VERSION file content "${fresh.trim()}" != "${newVersion}"`);
    }
  } else if (t.kind === "json") {
    let parsed;
    try { parsed = JSON.parse(fresh); }
    catch (e) { mismatches.push(`${t.path}: post-write JSON parse failed: ${e.message}`); continue; }
    if (parsed.version !== newVersion) {
      mismatches.push(`${t.path}: post-write version field "${parsed.version}" != "${newVersion}"`);
    }
  } else if (t.kind === "marketplace") {
    let parsed;
    try { parsed = JSON.parse(fresh); }
    catch (e) { mismatches.push(`${t.path}: post-write JSON parse failed: ${e.message}`); continue; }
    const v = parsed?.plugins?.[0]?.version;
    const ref = parsed?.plugins?.[0]?.source?.ref;
    if (v !== newVersion) {
      mismatches.push(`${t.path}: post-write plugins[0].version "${v}" != "${newVersion}"`);
    }
    if (ref !== `v${newVersion}`) {
      mismatches.push(`${t.path}: post-write plugins[0].source.ref "${ref}" != "v${newVersion}"`);
    }
  }
}
if (mismatches.length) {
  process.stderr.write(`bump-version: post-write verification FAILED\n`);
  for (const m of mismatches) process.stderr.write(`  - ${m}\n`);
  process.exit(1);
}
console.log(`bump-version: OK (${TARGETS.length} files updated to ${newVersion}; verified)`);
