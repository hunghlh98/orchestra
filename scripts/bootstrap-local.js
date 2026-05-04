#!/usr/bin/env node
// scripts/bootstrap-local.js
//
// Auto-detect greenfield/brownfield + language/framework on first /orchestra
// run. Outputs JSON to stdout; does NOT write any files. The /orchestra
// dispatcher uses Claude Code's Write tool to put `yaml_content` at `yaml_path`,
// which triggers `metrics-collector` to emit the `local.bootstrapped` event.
// Per PRD §9.9 invariant: events.jsonl is hook-only territory; scripts compute,
// the model writes via Claude Code's Write tool, the hook observes and emits.
//
// Usage: node scripts/bootstrap-local.js [cwd]
// Output: { status: "ready"|"ambiguous"|"exists", yaml_content?, yaml_path, decision? }

import { readdirSync, statSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const IGNORE = new Set([
  ".git", "node_modules", ".claude", ".venv", "venv",
  "dist", "build", "target", ".idea", ".vscode", "__pycache__",
]);

const SOURCE_EXT_RE = /\.(js|jsx|ts|tsx|py|java|kt|kts|go|rs|rb|php|c|h|cpp|hpp|cs|swift)$/;

const FRAMEWORK_FILES = {
  "package.json":     "node",
  "pom.xml":          "maven",
  "build.gradle":     "gradle",
  "build.gradle.kts": "gradle",
  "requirements.txt": "python-pip",
  "pyproject.toml":   "python-poetry",
  "Cargo.toml":       "cargo",
  "go.mod":           "go-mod",
  "Gemfile":          "bundler",
  "composer.json":    "composer",
  "tsconfig.json":    "node",
};

const LANG_MAP = {
  js: "javascript", jsx: "javascript",
  ts: "typescript", tsx: "typescript",
  py: "python",
  java: "java",
  kt: "kotlin", kts: "kotlin",
  go: "go", rs: "rust", rb: "ruby", php: "php",
  c: "c", h: "c", cpp: "cpp", hpp: "cpp",
  cs: "csharp", swift: "swift",
};

export function listFiles(root, depth = 6) {
  if (depth <= 0) return [];
  let out = [];
  let entries;
  try { entries = readdirSync(root); } catch { return []; }
  for (const e of entries) {
    if (IGNORE.has(e)) continue;
    const full = join(root, e);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) out.push(...listFiles(full, depth - 1));
    else if (st.isFile()) out.push(full);
  }
  return out;
}

export function inspect(root) {
  const files = listFiles(root);
  const has_source = files.some(f => SOURCE_EXT_RE.test(f));
  const langCounts = {};
  for (const f of files) {
    const m = f.match(SOURCE_EXT_RE);
    if (m) langCounts[m[1]] = (langCounts[m[1]] || 0) + 1;
  }
  const primary_language = pickLanguage(langCounts);
  const framework = detectFramework(files);
  let has_commits = false;
  try {
    execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, stdio: "ignore" });
    has_commits = true;
  } catch { /* not a git repo or no commits yet */ }
  return { has_source, primary_language, framework, has_commits };
}

export function classify(recon) {
  const { has_source, has_commits } = recon;
  let mode, confidence;
  if (!has_source && !has_commits) {
    mode = "greenfield";
    confidence = "HIGH";
  } else if (has_source && has_commits) {
    mode = "brownfield";
    confidence = "HIGH";
  } else if (has_source && !has_commits) {
    // Mid-init: source files exist but no commits yet. Treat as brownfield with
    // a hedge — likely the user is converting a folder into a project.
    mode = "brownfield";
    confidence = "MEDIUM";
  } else {
    // Commits but no source: rare (deleted code? non-source repo?). Ambiguous.
    mode = "greenfield";
    confidence = "LOW";
  }
  return { mode, ...recon, confidence };
}

export function pickLanguage(extCounts) {
  const langCounts = {};
  for (const [ext, n] of Object.entries(extCounts)) {
    const lang = LANG_MAP[ext];
    if (lang) langCounts[lang] = (langCounts[lang] || 0) + n;
  }
  const sorted = Object.entries(langCounts).sort((a, b) => b[1] - a[1]);
  return sorted.length ? sorted[0][0] : "none";
}

export function detectFramework(files) {
  for (const f of files) {
    const base = f.split("/").pop();
    if (FRAMEWORK_FILES[base]) return FRAMEWORK_FILES[base];
  }
  return "none";
}

export function render(d) {
  const now = new Date().toISOString();
  return [
    `mode: ${d.mode}`,
    `has_source: ${d.has_source}`,
    `primary_language: ${d.primary_language}`,
    `framework: ${d.framework}`,
    `scope_hints: []`,
    `bootstrapped_at: ${now}`,
    `bootstrapped_by:`,
    `  method: script`,
    `  script: scripts/bootstrap-local.js`,
    `  has_commits: ${d.has_commits}`,
    `  confidence: ${d.confidence}`,
    `inferred: true`,
    `autonomy:`,
    `  level: DRAFT_AND_GATE`,
    `notes: |`,
    `  Auto-bootstrapped from filesystem inspection at ${now}.`,
    `  Confidence: ${d.confidence}.`,
    `  Edit this file if classification is wrong; flip \`inferred: true\` to`,
    `  \`confirmed: true\` after manual review.`,
    ``,
  ].join("\n");
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const cwd = resolve(process.argv[2] || process.cwd());
  const yaml_path = join(cwd, ".claude", ".orchestra", "local.yaml");

  if (existsSync(yaml_path)) {
    process.stdout.write(JSON.stringify({
      status: "exists",
      yaml_path,
      message: "local.yaml already present; bootstrap not needed",
    }));
    process.exit(0);
  }

  const recon = inspect(cwd);
  const decision = classify(recon);
  const yaml_content = render(decision);

  process.stdout.write(JSON.stringify({
    status: decision.confidence === "LOW" ? "ambiguous" : "ready",
    yaml_content,
    yaml_path,
    decision,
  }));
  process.exit(0);
}
