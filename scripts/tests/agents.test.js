#!/usr/bin/env node
// scripts/tests/agents.test.js
// Full agent-frontmatter validation.
// 7 checks: frontmatter shape, name in valid set, description ≤30 words,
// per-role tools/denylist surface, model id known, context_mode supported,
// ≥1 <example>. Plus mutation-test fixtures: missing model fails red;
// forbidden tool in role allowlist fails red; over-restrictive denylist
// fails red.

import { readdirSync, existsSync, readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const agentsDir = resolve(root, "agents");

const VALID_NAMES = new Set([
  "product", "analyst", "architect", "lead", "backend", "frontend",
  "test-author", "test-runner", "evaluator", "reviewer",
]);

// Per-role forbidden tools. Every agent declares either a `tools` allowlist
// or a `disallowedTools` denylist: orchestra policy is exactly-one-of.
// Forbidden tools = tools that MUST NOT appear in `tools` allowlist (or MUST
// appear in `disallowedTools` denylist when that form is chosen).
//
// @test-author has no Bash by design — spec-bound test authoring, suite
// execution belongs to @test-runner. The src/main/** read-block is honor-
// system (frontmatter `tools:` only blocks tool kinds, not paths).
// @test-runner gets Bash for project test-harness invocation.
export const FORBIDDEN_TOOLS_PER_AGENT = {
  product:     ["Bash", "Edit", "MultiEdit"],
  architect:   ["Bash", "Edit", "MultiEdit"],
  lead:        ["Bash", "Edit", "MultiEdit"],
  evaluator:   ["Bash", "Edit", "MultiEdit"],
  reviewer:    ["Edit", "MultiEdit"],
  backend:     ["Bash"],
  frontend:    ["Bash"],
  "test-author": ["Bash"],
  "test-runner": [],
};

const REQUIRED_KEYS = ["name", "description", "model", "context_mode", "color"];

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

// Normalize a tools/disallowedTools field value to a string[]. Accepts:
//   - native array (already parsed from JSON flow-sequence form `["A","B"]`)
//   - comma-separated string (`"A, B"`) — the form shown in official docs
// Returns null on invalid input.
export function normalizeToolList(val) {
  if (Array.isArray(val)) return val.map(String);
  if (typeof val === "string") {
    const trimmed = val.trim();
    if (trimmed === "") return [];
    return trimmed.split(",").map(s => s.trim()).filter(Boolean);
  }
  return null;
}

// Lightweight agent-frontmatter parser. Agent frontmatter is Claude Code's
// flow-style format (e.g., `tools: ["Read", "Write"]`), distinct from
// artifact yaml-mini grammar (block-style only).
export function parseAgentFrontmatter(fmText) {
  const out = {};
  for (const line of fmText.split("\n")) {
    const m = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
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

  // Check 4: per-role tool surface — exactly one of `tools` (allowlist) or
  // `disallowedTools` (denylist) is set per agent. Orchestra-local policy;
  // not required by official Claude Code docs.
  const forbidden = FORBIDDEN_TOOLS_PER_AGENT[fm.name];
  if (forbidden === undefined) {
    // name already flagged by Check 2; skip
  } else {
    const hasTools = fm.tools !== undefined;
    const hasDisallowed = fm.disallowedTools !== undefined;
    if (hasTools && hasDisallowed) {
      errors.push(`exactly one of tools/disallowedTools allowed per orchestra policy (both set)`);
    } else if (!hasTools && !hasDisallowed) {
      errors.push(`exactly one of tools/disallowedTools required per orchestra policy (neither set)`);
    } else if (hasTools) {
      const list = normalizeToolList(fm.tools);
      if (list === null) {
        errors.push(`tools must be a JSON array or comma-separated string`);
      } else {
        const violations = forbidden.filter(t => list.includes(t));
        if (violations.length > 0) {
          errors.push(`tools includes forbidden tool(s) for role '${fm.name}': ${violations.join(", ")}`);
        }
      }
    } else if (hasDisallowed) {
      const list = normalizeToolList(fm.disallowedTools);
      if (list === null) {
        errors.push(`disallowedTools must be a JSON array or comma-separated string`);
      } else {
        const sorted = [...list].sort();
        const expected = [...forbidden].sort();
        const matches = sorted.length === expected.length &&
                        sorted.every((t, i) => t === expected[i]);
        if (!matches) {
          errors.push(`disallowedTools ${JSON.stringify(sorted)} ≠ forbidden list for '${fm.name}' (${JSON.stringify(expected)})`);
        }
      }
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

// Fixture 2a: @product with Bash in tools allowlist — must flag forbidden tool
{
  const bad = {
    fm: {
      name: "product", description: "ok",
      tools: ["Read", "Grep", "Glob", "Write", "Bash"],
      model: "opus", context_mode: "1m", color: "purple",
    },
    body: "<example>x</example>",
  };
  const errs = validateAgent("product", bad);
  check(errs.some(e => /forbidden tool.*product.*Bash/.test(e)),
    `mutation: @product with Bash in tools flagged`);
}

// Fixture 2b: @reviewer with over-restrictive disallowedTools (denies Bash) —
// reviewer is allowed Bash for static analysis; denying it violates the role.
{
  const bad = {
    fm: {
      name: "reviewer", description: "ok",
      disallowedTools: ["Bash", "Edit", "MultiEdit"],
      model: "sonnet", context_mode: "default", color: "red",
    },
    body: "<example>x</example>",
  };
  const errs = validateAgent("reviewer", bad);
  check(errs.some(e => /disallowedTools.*forbidden list/.test(e)),
    `mutation: @reviewer over-restrictive disallowedTools flagged`);
}

// Fixture 2c: @test-author with Bash in tools allowlist — must flag (Bash is
// the structural deny for the spec-bound role)
{
  const bad = {
    fm: {
      name: "test-author", description: "ok",
      tools: ["Read", "Write", "Edit", "MultiEdit", "Glob", "Grep", "Skill", "Bash"],
      model: "sonnet", context_mode: "default", color: "yellow",
    },
    body: "<example>x</example>",
  };
  const errs = validateAgent("test-author", bad);
  check(errs.some(e => /forbidden tool.*test-author.*Bash/.test(e)),
    `mutation: @test-author with Bash in tools flagged`);
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
      model: "sonnet", // sonnet only supports "default"
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
      model: "opus", context_mode: "1m", color: "purple",
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
      model: "opus", context_mode: "1m", color: "purple",
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
      model: "opus", context_mode: "1m", color: "purple",
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
      model: "opus", context_mode: "1m", color: "purple",
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
