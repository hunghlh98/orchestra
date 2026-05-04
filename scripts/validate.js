#!/usr/bin/env node
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "../hooks/lib/yaml-mini.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

function loadJSON(rel) {
  const path = resolve(root, rel);
  if (!existsSync(path)) { errors.push(`missing file: ${rel}`); return null; }
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch (e) { errors.push(`invalid JSON in ${rel}: ${e.message}`); return null; }
}

const installModules = loadJSON("manifests/install-modules.json");
const runtimeToggles = loadJSON("manifests/runtime-toggles.json");
const knownModels   = loadJSON("manifests/known-models.json");
const plugin        = loadJSON(".claude-plugin/plugin.json");

if (installModules && !Array.isArray(installModules.modules)) {
  errors.push("install-modules.json: 'modules' must be an array");
}
if (runtimeToggles && !Array.isArray(runtimeToggles.toggles)) {
  errors.push("runtime-toggles.json: 'toggles' must be an array");
}
if (knownModels) {
  if (!Array.isArray(knownModels.models) || knownModels.models.length === 0) {
    errors.push("known-models.json: 'models' must be a non-empty array");
  } else {
    const defaults = knownModels.models.filter(m => m.default === true);
    if (defaults.length !== 1) {
      errors.push(`known-models.json: expected exactly 1 default model, found ${defaults.length}`);
    }
    for (const m of knownModels.models) {
      if (!m.id || typeof m.id !== "string") errors.push(`known-models.json: model missing 'id'`);
      if (!["opus","sonnet","haiku"].includes(m.tier)) errors.push(`known-models.json: model '${m.id}' has invalid tier '${m.tier}'`);
      if (!Array.isArray(m.supportsContextMode) || m.supportsContextMode.length === 0) {
        errors.push(`known-models.json: model '${m.id}' missing 'supportsContextMode'`);
      }
    }
  }
}

if (plugin) {
  for (const k of ["name", "version", "description", "author", "license"]) {
    if (!plugin[k]) errors.push(`plugin.json: missing required key '${k}'`);
  }
  if (plugin.name !== "orchestra") {
    errors.push(`plugin.json: name must be 'orchestra', got '${plugin.name}'`);
  }
}

const versionPath = resolve(root, "VERSION");
let versionFile = null;
if (!existsSync(versionPath)) {
  errors.push("missing file: VERSION");
} else {
  versionFile = readFileSync(versionPath, "utf8").trim();
  if (plugin && plugin.version !== versionFile) {
    errors.push(`VERSION (${versionFile}) ≠ plugin.json.version (${plugin.version})`);
  }
}

const changelogPath = resolve(root, "CHANGELOG.md");
if (!existsSync(changelogPath)) {
  errors.push("missing file: CHANGELOG.md");
} else if (versionFile) {
  const changelog = readFileSync(changelogPath, "utf8");
  const hasUnreleased = /^## \[Unreleased\]/m.test(changelog);
  const hasVersion = changelog.includes(`## [${versionFile}]`);
  if (!hasVersion && !hasUnreleased) {
    errors.push(`CHANGELOG.md: missing '## [${versionFile}]' or '## [Unreleased]' section`);
  }
}

// === Skill validation (PRD §10.2 / §8.8) ===
// Walks skills/*/SKILL.md and enforces:
//   - frontmatter has `name`, `description`, `origin`
//   - frontmatter `name` === parent folder name
//   - description ≤200 chars
//   - body (post-frontmatter) ≤400 lines
const skillsDir = resolve(root, "skills");
if (existsSync(skillsDir)) {
  const folders = readdirSync(skillsDir).filter(name => {
    try { return statSync(join(skillsDir, name)).isDirectory(); }
    catch { return false; }
  });
  for (const folder of folders) {
    const skillPath = join(skillsDir, folder, "SKILL.md");
    if (!existsSync(skillPath)) {
      errors.push(`skills/${folder}/: missing SKILL.md`);
      continue;
    }
    const raw = readFileSync(skillPath, "utf8");
    const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!fmMatch) {
      errors.push(`skills/${folder}/SKILL.md: missing or malformed frontmatter`);
      continue;
    }
    let fm;
    try { fm = parseYaml(fmMatch[1]); }
    catch (e) { errors.push(`skills/${folder}/SKILL.md: frontmatter parse error: ${e.message}`); continue; }
    for (const k of ["name", "description", "origin"]) {
      if (!fm || !fm[k]) errors.push(`skills/${folder}/SKILL.md: missing frontmatter key '${k}'`);
    }
    if (fm?.name && fm.name !== folder) {
      errors.push(`skills/${folder}/SKILL.md: frontmatter name '${fm.name}' ≠ folder '${folder}'`);
    }
    if (typeof fm?.description === "string" && fm.description.length > 200) {
      errors.push(`skills/${folder}/SKILL.md: description ${fm.description.length} chars > 200 cap`);
    }
    const body = fmMatch[2];
    const bodyLines = body.split("\n").length;
    if (bodyLines > 400) {
      errors.push(`skills/${folder}/SKILL.md: body ${bodyLines} lines > 400 cap`);
    }
  }
}

// === Rule validation (PRD §10.3 / §8.8) ===
// Walks rules/**/*.md and enforces:
//   - frontmatter present and parseable
//   - frontmatter has `paths` — non-empty array of strings
//   - body (post-frontmatter) ≤40 lines
// Exported as a pure function so mutation tests can exercise it.
export function validateRuleContent(relPath, raw) {
  const errs = [];
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) {
    errs.push(`${relPath}: missing or malformed frontmatter`);
    return errs;
  }
  let fm;
  try { fm = parseYaml(fmMatch[1]); }
  catch (e) { errs.push(`${relPath}: frontmatter parse error: ${e.message}`); return errs; }
  if (!fm || !Array.isArray(fm.paths)) {
    errs.push(`${relPath}: frontmatter missing 'paths' array`);
  } else {
    if (fm.paths.length === 0) errs.push(`${relPath}: 'paths' array is empty`);
    for (const p of fm.paths) {
      if (typeof p !== "string" || p.length === 0) {
        errs.push(`${relPath}: 'paths' entry must be non-empty string, got ${JSON.stringify(p)}`);
      }
    }
  }
  const body = fmMatch[2];
  const bodyLines = body.split("\n").length;
  if (bodyLines > 40) {
    errs.push(`${relPath}: body ${bodyLines} lines > 40 cap`);
  }
  return errs;
}

const rulesDir = resolve(root, "rules");
function walkRules(dir, rel = "rules") {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const relPath = `${rel}/${entry}`;
    const st = statSync(full);
    if (st.isDirectory()) walkRules(full, relPath);
    else if (st.isFile() && entry.endsWith(".md")) {
      const raw = readFileSync(full, "utf8");
      for (const e of validateRuleContent(relPath, raw)) errors.push(e);
    }
  }
}
walkRules(rulesDir);

// === Command validation (PRD §10.4) ===
// Walks commands/*.md and enforces frontmatter `name` + `description`.
export function validateCommandContent(relPath, raw) {
  const errs = [];
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) {
    errs.push(`${relPath}: missing or malformed frontmatter`);
    return errs;
  }
  let fm;
  try { fm = parseYaml(fmMatch[1]); }
  catch (e) { errs.push(`${relPath}: frontmatter parse error: ${e.message}`); return errs; }
  for (const k of ["name", "description"]) {
    if (!fm || !fm[k] || typeof fm[k] !== "string") {
      errs.push(`${relPath}: missing frontmatter key '${k}'`);
    }
  }
  return errs;
}

const commandsDir = resolve(root, "commands");
if (existsSync(commandsDir)) {
  for (const entry of readdirSync(commandsDir)) {
    if (!entry.endsWith(".md")) continue;
    const full = join(commandsDir, entry);
    const relPath = `commands/${entry}`;
    const raw = readFileSync(full, "utf8");
    for (const e of validateCommandContent(relPath, raw)) errors.push(e);
  }
}

// === Local YAML validation (PRD §8.14 + §9.12) ===
// Pure function exposed for mutation tests. Consumer-side `local.yaml` lives
// at <cwd>/.claude/.orchestra/local.yaml and is gitignored on the plugin side,
// so there is no walk here — the function is callable for mutation testing
// and by downstream tooling that needs a sanity check on consumer files.
// Missing autonomy block is allowed (runtime defaults to DRAFT_AND_GATE).
export const VALID_AUTONOMY_LEVELS = [
  "EXECUTION_ONLY", "JOINT_PROCESSING", "OPTION_SYNTHESIS",
  "DRAFT_AND_GATE", "FULL_AUTONOMY",
];

export function validateLocalYamlContent(relPath, raw) {
  const errs = [];
  let parsed;
  try { parsed = parseYaml(raw); }
  catch (e) { errs.push(`${relPath}: parse error: ${e.message}`); return errs; }
  if (parsed && parsed.autonomy && parsed.autonomy.level) {
    if (!VALID_AUTONOMY_LEVELS.includes(parsed.autonomy.level)) {
      errs.push(`${relPath}: autonomy.level '${parsed.autonomy.level}' not in ${VALID_AUTONOMY_LEVELS.join("|")}`);
    }
  }
  return errs;
}

// === Leaky-cite check (project CLAUDE.md: dev/consumer separation) ===
// Forbids '§' in agents/, commands/, skills/ bodies. The '§' character in the
// consumer surface invariably points at Orchestra's internal dev docs
// (docs/PRD-001.md, DESIGN-NNN-*.md, WORKFLOW-NNN-*.md).
// Consumers don't need those docs to operate the plugin — every cite of theirs
// is either a phantom anchor or an inefficient deferred Read. The fix shape:
// inline the rule, drop the cite. Pure function so mutation tests can drive it.
export function findLeakyCites(relPath, raw) {
  const errs = [];
  const lines = raw.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (/§/.test(lines[i])) {
      const snippet = lines[i].trim().slice(0, 80);
      errs.push(`${relPath}:${i + 1}: leaky '§' cite to dev-surface doc — '${snippet}'`);
    }
  }
  return errs;
}

function walkLeakyCites(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walkLeakyCites(full);
    else if (st.isFile() && entry.endsWith(".md")) {
      const relPath = full.slice(root.length + 1);
      const raw = readFileSync(full, "utf8");
      for (const e of findLeakyCites(relPath, raw)) errors.push(e);
    }
  }
}
walkLeakyCites(resolve(root, "agents"));
walkLeakyCites(resolve(root, "commands"));
walkLeakyCites(resolve(root, "skills"));

// === Inline mutation tests for the rule + command validators (PR #7 T-716) ===
// Run only when invoked directly (not when imported).
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (isMain) {
  const mutationErrors = [];

  // Mutation 1: rule with body >40 lines fails red
  {
    const fortyOne = "x\n".repeat(41); // 41 lines after split
    const bad = `---\npaths:\n  - "**/*.foo"\n---\n${fortyOne}`;
    const errs = validateRuleContent("rules/fixture/over-cap.md", bad);
    if (!errs.some(e => /> 40 cap/.test(e))) {
      mutationErrors.push("mutation: rule body >40 lines should fail red");
    }
  }

  // Mutation 2: rule missing `paths:` fails red
  {
    const bad = `---\nname: oops\n---\n# body\n`;
    const errs = validateRuleContent("rules/fixture/missing-paths.md", bad);
    if (!errs.some(e => /missing 'paths' array/.test(e))) {
      mutationErrors.push("mutation: rule missing paths should fail red");
    }
  }

  // Mutation 3: rule with empty paths array fails red
  {
    const bad = `---\npaths: null\n---\n# body\n`;
    const errs = validateRuleContent("rules/fixture/null-paths.md", bad);
    if (!errs.some(e => /missing 'paths' array/.test(e))) {
      mutationErrors.push("mutation: rule with non-array paths should fail red");
    }
  }

  // Mutation 4: command missing `name` fails red
  {
    const bad = `---\ndescription: x\n---\nbody\n`;
    const errs = validateCommandContent("commands/fixture/missing-name.md", bad);
    if (!errs.some(e => /missing frontmatter key 'name'/.test(e))) {
      mutationErrors.push("mutation: command missing name should fail red");
    }
  }

  // Mutation 5: command missing `description` fails red
  {
    const bad = `---\nname: x\n---\nbody\n`;
    const errs = validateCommandContent("commands/fixture/missing-desc.md", bad);
    if (!errs.some(e => /missing frontmatter key 'description'/.test(e))) {
      mutationErrors.push("mutation: command missing description should fail red");
    }
  }

  // Inverse sanity: a clean rule fixture passes
  {
    const ok = `---\npaths:\n  - "**/*.foo"\n---\n# Foo coding-style\n\n## Rules\n\n- one rule.\n`;
    const errs = validateRuleContent("rules/fixture/clean.md", ok);
    if (errs.length !== 0) {
      mutationErrors.push(`inverse sanity: clean rule fixture should pass, got: ${errs.join(", ")}`);
    }
  }

  // Inverse sanity: a clean command fixture passes
  {
    const ok = `---\nname: foo\ndescription: A foo command.\n---\n# /foo\n`;
    const errs = validateCommandContent("commands/fixture/clean.md", ok);
    if (errs.length !== 0) {
      mutationErrors.push(`inverse sanity: clean command fixture should pass, got: ${errs.join(", ")}`);
    }
  }

  // === Autonomy enum mutation tests (T-802) ===
  // Mutation 6: autonomy.level=BOGUS fails red
  {
    const bad = `mode: greenfield\nautonomy:\n  level: BOGUS\n`;
    const errs = validateLocalYamlContent("local.yaml", bad);
    if (!errs.some(e => /autonomy\.level 'BOGUS'/.test(e))) {
      mutationErrors.push("mutation: autonomy.level=BOGUS should fail red");
    }
  }

  // Mutation 7: each of the 5 valid tags passes
  {
    for (const tag of VALID_AUTONOMY_LEVELS) {
      const ok = `mode: greenfield\nautonomy:\n  level: ${tag}\n`;
      const errs = validateLocalYamlContent("local.yaml", ok);
      if (errs.length !== 0) {
        mutationErrors.push(`inverse sanity: autonomy.level=${tag} should pass, got: ${errs.join(", ")}`);
      }
    }
  }

  // Mutation 8: missing autonomy block passes (default DRAFT_AND_GATE applies at runtime)
  {
    const ok = `mode: greenfield\nhas_source: false\n`;
    const errs = validateLocalYamlContent("local.yaml", ok);
    if (errs.length !== 0) {
      mutationErrors.push(`inverse sanity: missing autonomy block should pass, got: ${errs.join(", ")}`);
    }
  }

  // === Leaky-cite mutation tests (project CLAUDE.md: dev/consumer separation) ===
  // Mutation 9: '§' in body fails red
  {
    const bad = `# header\n\nrun this per PRD §8.11.\n`;
    const errs = findLeakyCites("agents/fixture.md", bad);
    if (!errs.some(e => /leaky '§' cite/.test(e))) {
      mutationErrors.push("mutation: leaky '§' cite should fail red");
    }
  }

  // Mutation 10: bare '§' (no PRD prefix) also fails red — the canary is the symbol itself
  {
    const bad = `escalate per §9.5 whitelist.\n`;
    const errs = findLeakyCites("agents/fixture.md", bad);
    if (!errs.some(e => /leaky '§' cite/.test(e))) {
      mutationErrors.push("mutation: bare '§' (no doc prefix) should fail red");
    }
  }

  // Inverse sanity: clean body (domain nouns only) passes
  {
    const ok = `Author PRD-NNN.md and FRS-NNN.md per the routing taxonomy.\nClassify intent: docs / template / hotfix / feature.\n`;
    const errs = findLeakyCites("agents/fixture.md", ok);
    if (errs.length !== 0) {
      mutationErrors.push(`inverse sanity: clean body (no §) should pass, got: ${errs.join(", ")}`);
    }
  }

  for (const e of mutationErrors) errors.push(e);
}

if (errors.length) {
  console.error("validate.js: FAIL");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("validate.js: OK");
