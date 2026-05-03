#!/usr/bin/env node
// scripts/test-bootstrap.js
// Contract tests for bootstrap-local.js: classification matrix + render shape.
// Imports the module's exports directly (no subprocess) so we can assert on
// the structured `decision` object instead of parsing JSON stdout.

import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const mod = await import(join(root, "scripts/bootstrap-local.js"));
const { inspect, classify, render } = mod;

let passes = 0, failures = 0;
function check(cond, msg) {
  if (cond) passes++;
  else { failures++; console.error(`  FAIL: ${msg}`); }
}

function git(cwd, ...args) {
  const r = spawnSync(
    "git",
    ["-c", "user.email=t@t", "-c", "user.name=t", "-c", "commit.gpgsign=false", ...args],
    { cwd, stdio: "ignore" },
  );
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} exited ${r.status}`);
}

// --- 1. Empty dir → greenfield/HIGH ---
console.log("bootstrap-local empty dir:");
{
  const tmp = mkdtempSync(join(tmpdir(), "boot-empty-"));
  try {
    const d = classify(inspect(tmp));
    check(d.mode === "greenfield", `mode=greenfield (got ${d.mode})`);
    check(d.confidence === "HIGH", `confidence=HIGH (got ${d.confidence})`);
    check(d.has_source === false, `has_source=false (got ${d.has_source})`);
    check(d.has_commits === false, `has_commits=false (got ${d.has_commits})`);
    check(d.primary_language === "none", `primary_language=none (got ${d.primary_language})`);
    check(d.framework === "none", `framework=none (got ${d.framework})`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

// --- 2. Source files but no commits → brownfield/MEDIUM ---
console.log("bootstrap-local src, no commits:");
{
  const tmp = mkdtempSync(join(tmpdir(), "boot-src-nocommit-"));
  try {
    writeFileSync(join(tmp, "main.ts"), "export const x = 1;\n");
    writeFileSync(join(tmp, "helper.ts"), "export const y = 2;\n");
    writeFileSync(join(tmp, "package.json"), `{"name":"t","version":"0.0.0"}\n`);
    const d = classify(inspect(tmp));
    check(d.mode === "brownfield", `mode=brownfield (got ${d.mode})`);
    check(d.confidence === "MEDIUM", `confidence=MEDIUM (got ${d.confidence})`);
    check(d.has_source === true, `has_source=true (got ${d.has_source})`);
    check(d.has_commits === false, `has_commits=false (got ${d.has_commits})`);
    check(d.primary_language === "typescript", `primary_language=typescript (got ${d.primary_language})`);
    check(d.framework === "node", `framework=node (got ${d.framework})`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

// --- 3. Source + commits → brownfield/HIGH ---
console.log("bootstrap-local src + commits:");
{
  const tmp = mkdtempSync(join(tmpdir(), "boot-src-commit-"));
  try {
    writeFileSync(join(tmp, "main.py"), "x = 1\n");
    writeFileSync(join(tmp, "lib.py"), "y = 2\n");
    writeFileSync(join(tmp, "pyproject.toml"), "[project]\nname = \"t\"\n");
    git(tmp, "init", "-q", "-b", "main");
    git(tmp, "add", "-A");
    git(tmp, "commit", "-q", "-m", "init");
    const d = classify(inspect(tmp));
    check(d.mode === "brownfield", `mode=brownfield (got ${d.mode})`);
    check(d.confidence === "HIGH", `confidence=HIGH (got ${d.confidence})`);
    check(d.has_source === true, `has_source=true (got ${d.has_source})`);
    check(d.has_commits === true, `has_commits=true (got ${d.has_commits})`);
    check(d.primary_language === "python", `primary_language=python (got ${d.primary_language})`);
    check(d.framework === "python-poetry", `framework=python-poetry (got ${d.framework})`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

// --- 4. Commits but no source → greenfield/LOW ---
console.log("bootstrap-local commits, no source:");
{
  const tmp = mkdtempSync(join(tmpdir(), "boot-commit-nosrc-"));
  try {
    writeFileSync(join(tmp, "README.md"), "# notes\n");
    writeFileSync(join(tmp, "NOTES.txt"), "scratch\n");
    git(tmp, "init", "-q", "-b", "main");
    git(tmp, "add", "-A");
    git(tmp, "commit", "-q", "-m", "init");
    const d = classify(inspect(tmp));
    check(d.mode === "greenfield", `mode=greenfield (got ${d.mode})`);
    check(d.confidence === "LOW", `confidence=LOW (got ${d.confidence})`);
    check(d.has_source === false, `has_source=false (got ${d.has_source})`);
    check(d.has_commits === true, `has_commits=true (got ${d.has_commits})`);
  } finally { rmSync(tmp, { recursive: true, force: true }); }
}

// --- 5. Render shape ---
console.log("bootstrap-local render shape:");
{
  const yaml = render({
    mode: "greenfield",
    has_source: false,
    primary_language: "none",
    framework: "none",
    has_commits: false,
    confidence: "HIGH",
  });
  const requiredKeys = [
    "mode:", "has_source:", "primary_language:", "framework:",
    "scope_hints:", "bootstrapped_at:", "bootstrapped_by:",
    "method: script", "confidence:", "inferred:",
  ];
  for (const key of requiredKeys) {
    check(yaml.includes(key), `render output contains "${key}"`);
  }
  check(yaml.endsWith("\n"), `render output ends with newline`);
  check(yaml.includes("mode: greenfield"), `mode line interpolated`);
  check(yaml.includes("confidence: HIGH"), `confidence line interpolated`);
}

if (failures > 0) {
  console.error(`test-bootstrap.js: FAIL (${passes} passed, ${failures} failed)`);
  process.exit(1);
}
console.log(`test-bootstrap.js: OK (${passes} assertions passed)`);
