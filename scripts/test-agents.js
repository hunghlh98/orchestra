#!/usr/bin/env node
// scripts/test-agents.js
// Full agent-frontmatter validation per DESIGN-002-leaves §2.3 (PR #6).
// 7 checks: frontmatter shape, name in valid set, description ≤30 words,
// tools tier match, model id known, context_mode supported, ≥1 <example>.
// Plus mutation-test fixtures: missing model fails red; bad tools fails red.

import { readdirSync, existsSync, readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const agentsDir = resolve(root, "agents");

const VALID_NAMES = new Set([
  "product", "lead", "backend", "frontend", "test", "evaluator", "reviewer", "ship",
]);

// Three valid tools-tier sets per DESIGN-002 §2.1. Sorted for stable comparison.
const TIER_TOOLS = {
  "T-A": ["Bash", "Glob", "Grep", "Read", "Write"].sort(),
  "T-B": ["Glob", "Grep", "Read", "Write"].sort(),
  "T-C": ["Edit", "Glob", "Grep", "MultiEdit", "Read", "Write"].sort(),
};

const REQUIRED_KEYS = ["name", "description", "tools", "model", "context_mode", "color"];

const knownModels = JSON.parse(
  readFileSync(resolve(root, "manifests/known-models.json"), "utf8")
);
const MODEL_BY_ID = new Map(knownModels.models.map(m => [m.id, m]));

let passes = 0;
let failures = 0;

function check(cond, msg) {
  if (cond) { passes++; }
  else { failures++; console.error(`  FAIL: ${msg}`); }
}

// Lightweight agent-frontmatter parser. Agent frontmatter is Claude Code's
// flow-style format (e.g., `tools: ["Read", "Write"]`), distinct from
// artifact yaml-mini grammar (block-style only).
export function parseAgentFrontmatter(fmText) {
  const out = {};
  for (const line of fmText.split("\n")) {
    const m = line.match(/^([a-z_]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if (val.startsWith("[")) {
      try { val = JSON.parse(val); } catch { /* leave as raw string */ }
    } else if (val.startsWith('"') && val.endsWith('"')) {
      try { val = JSON.parse(val); } catch { /* leave as raw string */ }
    }
    out[key] = val;
  }
  return out;
}

function readAgentFile(path) {
  const raw = readFileSync(path, "utf8");
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) return { error: "missing or malformed frontmatter" };
  const fm = parseAgentFrontmatter(fmMatch[1]);
  const body = fmMatch[2];
  return { fm, body };
}

// === Validation: 7 checks per agent ===

export function validateAgent(name, parsed) {
  const errors = [];
  if (parsed.error) {
    errors.push(parsed.error);
    return errors;
  }
  const { fm, body } = parsed;

  // Check 1: required keys present
  for (const k of REQUIRED_KEYS) {
    if (fm[k] === undefined) errors.push(`missing frontmatter key '${k}'`);
  }
  if (errors.length) return errors;

  // Check 2: name in valid set + matches filename
  if (!VALID_NAMES.has(fm.name)) {
    errors.push(`name '${fm.name}' not in valid set ${[...VALID_NAMES].join(",")}`);
  }
  if (fm.name !== name) {
    errors.push(`name '${fm.name}' ≠ filename '${name}'`);
  }

  // Check 3: description ≤30 words
  const wordCount = String(fm.description).trim().split(/\s+/).filter(Boolean).length;
  if (wordCount > 30) {
    errors.push(`description ${wordCount} words > 30 cap`);
  }

  // Check 4: tools array matches one of three tier sets
  if (!Array.isArray(fm.tools)) {
    errors.push(`tools must be an array (got ${typeof fm.tools})`);
  } else {
    const sorted = [...fm.tools].sort();
    const matched = Object.values(TIER_TOOLS).some(
      tier => tier.length === sorted.length && tier.every((t, i) => t === sorted[i])
    );
    if (!matched) {
      errors.push(`tools ${JSON.stringify(sorted)} matches no tier set (T-A/T-B/T-C)`);
    }
  }

  // Check 5: model id known
  if (!MODEL_BY_ID.has(fm.model)) {
    errors.push(`model '${fm.model}' not in manifests/known-models.json`);
  }

  // Check 6: context_mode supported by the model
  const modelDef = MODEL_BY_ID.get(fm.model);
  if (modelDef && !modelDef.supportsContextMode.includes(fm.context_mode)) {
    errors.push(
      `context_mode '${fm.context_mode}' not in ${fm.model}.supportsContextMode (${modelDef.supportsContextMode.join(",")})`
    );
  }

  // Check 7: body has ≥1 <example>...</example> block
  if (!/<example>[\s\S]*?<\/example>/.test(body)) {
    errors.push("body has no <example>...</example> block");
  }

  return errors;
}

// === Run only when invoked directly (not when imported by test-bash-strip.js) ===

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  runMain();
}

function runMain() {

if (!existsSync(agentsDir)) {
  console.log("test-agents.js: OK (no agents/ directory yet — full check deferred to PR #6)");
  process.exit(0);
}

const files = readdirSync(agentsDir).filter(f => f.endsWith(".md")).sort();
console.log(`Validating ${files.length} agent file(s):`);

for (const file of files) {
  const name = file.replace(/\.md$/, "");
  const parsed = readAgentFile(join(agentsDir, file));
  const errs = validateAgent(name, parsed);
  if (errs.length === 0) {
    check(true, `agents/${file}: 7 checks passed`);
  } else {
    for (const e of errs) check(false, `agents/${file}: ${e}`);
  }
}

// === Mutation-test fixtures ===
console.log("Mutation tests (validator must fail red on bad input):");

// Fixture 1: missing model → must produce errors
{
  const bad = {
    fm: {
      name: "product", description: "ok", tools: ["Read", "Grep", "Glob", "Write"],
      context_mode: "1m", color: "purple",
      // model intentionally missing
    },
    body: "<example>x</example>",
  };
  const errs = validateAgent("product", bad);
  check(errs.some(e => /missing frontmatter key 'model'/.test(e)),
    `mutation: missing model field flagged`);
}

// Fixture 2: tools-tier mismatch (extra non-tier tool added to T-C)
{
  const bad = {
    fm: {
      name: "backend", description: "ok",
      tools: ["Read", "Grep", "Glob", "Write", "Edit", "MultiEdit", "WebSearch"], // T-C + WebSearch → 7 elems, no tier
      model: "claude-opus-4-7", context_mode: "1m", color: "green",
    },
    body: "<example>x</example>",
  };
  const errs = validateAgent("backend", bad);
  check(errs.some(e => /matches no tier set/.test(e)),
    `mutation: tools-tier mismatch flagged`);
}

// Fixture 3: unknown model id
{
  const bad = {
    fm: {
      name: "lead", description: "ok", tools: ["Read", "Grep", "Glob", "Write"],
      model: "claude-fictional-9000", context_mode: "1m", color: "blue",
    },
    body: "<example>x</example>",
  };
  const errs = validateAgent("lead", bad);
  check(errs.some(e => /not in manifests\/known-models/.test(e)),
    `mutation: unknown model id flagged`);
}

// Fixture 4: context_mode not in model's supportsContextMode
{
  const bad = {
    fm: {
      name: "lead", description: "ok", tools: ["Read", "Grep", "Glob", "Write"],
      model: "claude-sonnet-4-6", // sonnet only supports "default"
      context_mode: "1m",
      color: "blue",
    },
    body: "<example>x</example>",
  };
  const errs = validateAgent("lead", bad);
  check(errs.some(e => /supportsContextMode/.test(e)),
    `mutation: context_mode mismatch flagged`);
}

// Fixture 5: missing <example> block
{
  const bad = {
    fm: {
      name: "product", description: "ok", tools: ["Read", "Grep", "Glob", "Write"],
      model: "claude-opus-4-7", context_mode: "1m", color: "purple",
    },
    body: "no example block here, just prose.",
  };
  const errs = validateAgent("product", bad);
  check(errs.some(e => /no <example>/.test(e)),
    `mutation: missing <example> block flagged`);
}

// Fixture 6: description >30 words
{
  const longDesc = Array.from({ length: 35 }, (_, i) => `word${i}`).join(" ");
  const bad = {
    fm: {
      name: "product", description: longDesc,
      tools: ["Read", "Grep", "Glob", "Write"],
      model: "claude-opus-4-7", context_mode: "1m", color: "purple",
    },
    body: "<example>x</example>",
  };
  const errs = validateAgent("product", bad);
  check(errs.some(e => /> 30 cap/.test(e)),
    `mutation: description >30 words flagged`);
}

// Fixture 7: name not in valid set
{
  const bad = {
    fm: {
      name: "wizard", description: "ok", tools: ["Read", "Grep", "Glob", "Write"],
      model: "claude-opus-4-7", context_mode: "1m", color: "purple",
    },
    body: "<example>x</example>",
  };
  const errs = validateAgent("wizard", bad);
  check(errs.some(e => /not in valid set/.test(e)),
    `mutation: invalid name flagged`);
}

// === Inverse sanity: a clean fixture must pass ===
{
  const ok = {
    fm: {
      name: "product", description: "fine and short",
      tools: ["Read", "Grep", "Glob", "Write"],
      model: "claude-opus-4-7", context_mode: "1m", color: "purple",
    },
    body: "<example>Context: x. User invokes: y. Action: z.</example>",
  };
  const errs = validateAgent("product", ok);
  check(errs.length === 0, `inverse sanity: clean fixture passes 7 checks`);
}

if (failures > 0) {
  console.error(`test-agents.js: FAIL (${passes} passed, ${failures} failed)`);
  process.exit(1);
}
console.log(`test-agents.js: OK (${files.length} agents validated, ${passes} assertions passed)`);

}  // end runMain
