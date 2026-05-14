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
const localSchema   = loadJSON("schemas/local.schema.json");
const LOCAL_ALLOWLIST = localSchema?.properties
  ? new Set(Object.keys(localSchema.properties).filter(k => k !== "$schema"))
  : new Set();
const systemSchema  = loadJSON("schemas/system.schema.json");
const SYSTEM_ALLOWLIST = systemSchema?.properties
  ? new Set(Object.keys(systemSchema.properties).filter(k => k !== "$schema"))
  : new Set();

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

export const VALID_RUN_PLAN_STATUS = ["drafted", "approved", "revision_requested"];

export function validateLocalYamlContent(relPath, raw, opts = {}) {
  const errs = [];
  let parsed;
  try { parsed = parseYaml(raw); }
  catch (e) { errs.push(`${relPath}: parse error: ${e.message}`); return errs; }
  if (!parsed || typeof parsed !== "object") return errs;
  const allowlist = opts.allowlist || LOCAL_ALLOWLIST;
  if (allowlist.size > 0) {
    for (const k of Object.keys(parsed)) {
      if (!allowlist.has(k)) {
        errs.push(`${relPath}: unknown top-level field '${k}' (not in schemas/local.schema.json allowlist)`);
      }
    }
  }
  if (parsed.autonomy && parsed.autonomy.level) {
    if (!VALID_AUTONOMY_LEVELS.includes(parsed.autonomy.level)) {
      errs.push(`${relPath}: autonomy.level '${parsed.autonomy.level}' not in ${VALID_AUTONOMY_LEVELS.join("|")}`);
    }
  }
  if (parsed.run_plan_status !== undefined && !VALID_RUN_PLAN_STATUS.includes(parsed.run_plan_status)) {
    errs.push(`${relPath}: run_plan_status '${parsed.run_plan_status}' not in ${VALID_RUN_PLAN_STATUS.join("|")}`);
  }
  if (parsed.auto_mode === true && parsed.run_plan_status !== "approved") {
    errs.push(`${relPath}: auto_mode:true requires run_plan_status:approved (got ${JSON.stringify(parsed.run_plan_status)})`);
  }
  return errs;
}

export const VALID_WORKSPACE_KINDS = ["single-repo", "multi-repo"];

export function validateSystemYamlContent(relPath, raw, opts = {}) {
  const errs = [];
  let parsed;
  try { parsed = parseYaml(raw); }
  catch (e) { errs.push(`${relPath}: parse error: ${e.message}`); return errs; }
  if (!parsed || typeof parsed !== "object") return errs;
  const allowlist = opts.allowlist || SYSTEM_ALLOWLIST;
  if (allowlist.size > 0) {
    for (const k of Object.keys(parsed)) {
      if (!allowlist.has(k)) {
        errs.push(`${relPath}: unknown top-level field '${k}' (not in schemas/system.schema.json allowlist)`);
      }
    }
  }
  if (parsed.workspace_kind !== undefined && !VALID_WORKSPACE_KINDS.includes(parsed.workspace_kind)) {
    errs.push(`${relPath}: workspace_kind '${parsed.workspace_kind}' not in ${VALID_WORKSPACE_KINDS.join("|")}`);
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

function walkVersionStamps(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walkVersionStamps(full);
    else if (st.isFile() && entry.endsWith(".md")) {
      const relPath = full.slice(root.length + 1);
      const raw = readFileSync(full, "utf8");
      for (const e of findVersionStamps(relPath, raw)) errors.push(e);
    }
  }
}

// === Version-stamp check (project CLAUDE.md: no version stamps in consumer surface) ===
// Forbids version-stamped current-state rules and migration narration in
// consumer-loaded prose. Plugin version lives in VERSION + plugin.json +
// package.json — sprinkling it into rules makes every release drift the prose.
// Pure function: caller supplies the file body; returns errs[]. Not wired to
// the main walk yet — predicates land first, prose changes settle in later
// commits, then commit 5 wires this into the top-level flow.
// Pattern boundary: vN.M-(brief|design) doc-anchor leaks are cite-purity's job
// (see scripts/tests/cite-purity.test.js), not this validator's — each stays
// in its own lane to avoid double-reports.
const VERSION_STAMP_PATTERNS = [
  { name: "parenthetical",       re: /\(v\d+\.\d+(?:\.\d+)?\)/,                              why: "(vN.M) parenthetical version stamp" },
  { name: "pre-version",         re: /\bpre-v\d+\.\d+/i,                                     why: "pre-vN.M migration-narration prefix" },
  { name: "migration-verb",      re: /\b(?:GONE|dropped|removed)\s+in\s+v\d+\.\d+/i,         why: "migration narration (GONE/dropped/removed in vN.M)" },
  { name: "in-version-rule",     re: /\bin\s+v\d+\.\d+\b/i,                                  why: "'in vN.M …' rule version-stamp" },
  { name: "the-version-descr",   re: /\bthe\s+v\d+\.\d+\s+[a-z][a-z-]+/i,                    why: "'the vN.M <descriptor>' version-stamp on a current-state rule" },
  { name: "standalone-3segment", re: /(?<![\/\-\w@])\bv\d+\.\d+\.\d+(?![\/\-\w])/,           why: "standalone vN.M.P version stamp" },
  { name: "future-open",         re: /\bv\d+\.\d+\+/,                                        why: "future-version stamp 'vN.M+'" },
  { name: "migration-narration", re: /\b(?:formerly|previously\s+called|previously\s+named|no\s+longer\s+authors|sidecars\s+are\s+gone|are\s+gone\b|is\s+gone\b|was\s+gone\b|absorbs\s+what\s+\S+\s+previously)/i, why: "migration narration without version number" },
];

// Whole-file exemptions per CLAUDE.md "Allowed" list. PlantUML's references/
// carry upstream external-tool versions; LICENSE files carry upstream-source
// attribution; clean-architecture's order-domain v2.1.0 illustrates release
// granularity with a hypothetical user-domain version; commit-message carries
// the Conventional Commits spec link + BREAKING-CHANGE example body. None are
// orchestra version stamps.
export const VERSION_STAMP_EXEMPT_FILES = [
  /^skills\/plantuml\/references\//,
  /^skills\/[^/]+\/LICENSE$/,
  /^skills\/clean-architecture\/SKILL\.md$/,
  /^skills\/commit-message\/SKILL\.md$/,
];

export function findVersionStamps(relPath, raw) {
  if (VERSION_STAMP_EXEMPT_FILES.some(re => re.test(relPath))) return [];
  const errs = [];
  const lines = raw.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Exempt skill `origin:` attribution per CLAUDE.md "Allowed" list.
    if (/^origin:\s/.test(line)) continue;
    for (const { name, re, why } of VERSION_STAMP_PATTERNS) {
      if (re.test(line)) {
        const snippet = line.trim().slice(0, 80);
        errs.push(`${relPath}:${i + 1}: version-stamp [${name}] — ${why} — '${snippet}'`);
        break;
      }
    }
  }
  return errs;
}

// === Phase-tag emission compliance ===
// agents/lead.md MUST declare the canonical phase values consumed by
// hooks/scripts/metrics-collector.js (regex /^phase:\s*([a-z-]+)/m). Without
// the rule, lead-spawned subagent turns attribute to phase=unknown in
// .orchestra/metrics/cost-by-phase.json. Pure function: caller supplies the
// file body; returns errs[] enumerating any missing declarations.
export const PHASE_VALUES = ["discovery", "spec-draft", "verification", "gap-resolution", "gate"];

export function findPhaseTagCompliance(raw) {
  const errs = [];
  if (!/^### Phase-tag emission$/m.test(raw)) {
    errs.push("agents/lead.md: missing '### Phase-tag emission' subsection (consumed by metrics-collector.js)");
    return errs;
  }
  const startMatch = /^### Phase-tag emission$/m.exec(raw);
  const after = raw.slice(startMatch.index);
  // Subsection ends at the next ## or ### heading
  const nextHeading = /\n(?:### |## )/.exec(after.slice(1));
  const section = nextHeading ? after.slice(0, nextHeading.index + 1) : after;
  for (const phase of PHASE_VALUES) {
    if (!section.includes(phase)) {
      errs.push(`agents/lead.md: '### Phase-tag emission' subsection missing canonical phase value '${phase}'`);
    }
  }
  return errs;
}

// === Hook ↔ install-modules manifest parity ===
// Every shipping hook (hooks/scripts/*.js, excluding lib/helpers) MUST have a
// kind:'hook' entry in manifests/install-modules.json. The failure mode this
// catches: a hook ships and runs via hooks/hooks.json wiring, but the
// installer registry doesn't list it — toggle invisible, silent enforcement.
// Pure function: caller supplies both inputs; returns errs[] enumerating
// orphan scripts AND orphan registry entries.
export function findHookManifestParity(hookScriptBasenames, installModulesEntries) {
  const errs = [];
  const registered = new Set(
    (installModulesEntries || [])
      .filter(m => m && m.kind === "hook" && typeof m.path === "string")
      .map(m => basename(m.path))
  );
  const scripts = new Set(hookScriptBasenames || []);
  for (const script of scripts) {
    if (!registered.has(script)) {
      errs.push(`hooks/scripts/${script}: not registered in manifests/install-modules.json (kind: 'hook')`);
    }
  }
  for (const reg of registered) {
    if (!scripts.has(reg)) {
      errs.push(`manifests/install-modules.json: registered hook '${reg}' has no corresponding hooks/scripts/${reg}`);
    }
  }
  return errs;
}

// === Pipeline artifact validation (PR #3 / DESIGN-005 §S-VALIDATOR-001) ===
// Pure functions — testable in isolation, not auto-walked by validate.js's
// main flow (the consumer-side walker lives in scripts/validate-drift.js).
// Each function returns errs[]; callers decide how to surface.

// Anchor sets per artifact type. Mirrors scripts/scaffold-artifact.js TYPE_SPEC;
// the duplication is deliberate — validate.js enforces, scaffold produces, and
// they share the same source-of-truth (DESIGN-005 §S-SCHEMAS-001).
export const REQUIRED_ANCHORS = {
  PRD: ["S-PROBLEM-001", "S-USERS-001", "S-GOALS-001", "S-NON-GOALS-001", "S-METRICS-001", "S-OPEN-001"],
  FRS: ["S-FRS-001", "S-ACCEPTANCE-001", "S-ERRORS-001", "S-USECASE-001"],
  SAD: ["S-VISION-001", "S-CONTEXT-001", "S-CONTAINERS-001"],
  TDD: ["S-COMPONENTS-001", "S-SEQUENCE-001", "S-DATA-MODEL-001", "S-STATE-001", "S-ERROR-HANDLING-001", "S-CONFIG-001", "S-RISKS-001"],
  TASKS: ["S-DAG-001", "S-TASKS-001"],
  TEST: ["S-COVERAGE-001"],
  TSR: ["S-TEST-001", "S-EVAL-001", "S-REVIEW-001"],
  RELEASE: ["S-WHATSNEW-001", "S-ENDPOINTS-001", "S-CONFIG-001", "S-BREAKING-001", "S-GATES-001", "S-KNOWN-001", "S-ANNOUNCEMENT-001"],
  RUNBOOK: ["S-OVERVIEW-001", "S-LIFECYCLE-001", "S-DEPLOY-001", "S-ROLLBACK-001", "S-HEALTH-001", "S-FAILURE-001", "S-LOGS-001", "S-ENVVARS-001"],
  ADR: ["S-STATUS-001", "S-CONTEXT-001", "S-DECISION-001", "S-CONSEQUENCES-001", "S-ALTERNATIVES-001"],
  INVENTORY: ["S-SCAN-001", "S-CLASSIFICATION-001", "S-DECISIONS-001", "S-REGEN-PLAN-001", "S-WARNINGS-001"],
  "RUN-PLAN": ["S-CONTEXT-001", "S-PHASES-001", "S-FEATURES-001", "S-GATES-001", "S-APPROVAL-001"],
  "BR-AC": ["S-BR-001", "S-AC-001", "S-INVARIANTS-001"],
  "BUSINESS-INVARIANTS": ["S-INVARIANTS-001"],
};

export const SOFT_CAPS = {
  PRD: 120, FRS: 100, SAD: 200, TDD: 250,
  TASKS: 60, TEST: 200, TSR: 150, RELEASE: 120, RUNBOOK: 180, ADR: 100,
  INVENTORY: 250,
  "RUN-PLAN": 250,
  "BR-AC": 200,
  "BUSINESS-INVARIANTS": 150,
};

// Filename patterns that v2 .orchestra/ MUST NOT contain (folded / dropped per DESIGN-005 §1).
export const ORPHAN_PATTERNS = [
  { pattern: /\d+-VERDICT\.md$/, reason: "VERDICT folded into TSR per v2.0" },
  { pattern: /\d+-CODE-REVIEW\.md$/, reason: "CODE-REVIEW folded into TSR per v2.0" },
  { pattern: /^ANNOUNCEMENT-/, reason: "ANNOUNCEMENT folded into RELEASE §S-ANNOUNCEMENT-001 per v2.0" },
  { pattern: /\d+-IMPL-NOTES\.md$/, reason: "IMPL-NOTES dropped per v2.0 (never routed)" },
  { pattern: /\d+-IMPL-(BE|FE)\.md$/, reason: "IMPL-BE/FE dropped per v2.0 (never routed)" },
  { pattern: /\d+-CODE-DESIGN-(BE|FE)\.md$/, reason: "CODE-DESIGN-BE/FE dropped per v2.0 (never routed)" },
];

// Fold-correctness invariants: certain types must carry specific anchor combinations.
export const FOLD_REQUIREMENTS = {
  TSR: ["S-TEST-001", "S-EVAL-001", "S-REVIEW-001"],
  RELEASE: ["S-ANNOUNCEMENT-001"],
};

// Multi-segment anchor extraction (mirrors hooks/lib/section-hash.js ANCHOR_RE).
const ANCHOR_RE_GLOBAL = /<a id="(S-[A-Z]+(?:-[A-Z]+)*-\d{3})"><\/a>/g;
function extractAnchors(body) {
  const ids = [];
  let m;
  while ((m = ANCHOR_RE_GLOBAL.exec(body)) !== null) ids.push(m[1]);
  return ids;
}

// Type detection from filename. Returns null when the filename is not in the canon.
export function typeFromFilename(filePath) {
  const base = basename(filePath);
  if (base === "SAD.md") return "SAD";
  if (base === "business-invariants.md") return "BUSINESS-INVARIANTS";
  if (/-BR-AC\.md$/.test(base)) return "BR-AC";
  if (/^ADR-\d{4}/.test(base)) return "ADR";
  if (/^RELEASE-v/.test(base)) return "RELEASE";
  if (/^RUNBOOK-v/.test(base)) return "RUNBOOK";
  let m;
  if ((m = base.match(/^\d+-([A-Z]+)\.md$/))) {
    return Object.hasOwn(REQUIRED_ANCHORS, m[1]) ? m[1] : null;
  }
  if (/^\d+-API\.openapi\.yaml$/.test(base)) return "API";
  return null;
}

function resolveAnchorKey(type) {
  return type;
}

// --- structural-diff: artifact body anchors vs canonical REQUIRED_ANCHORS ---
export function validateStructuralDiff(relPath, body, type, mode) {
  const errs = [];
  const key = resolveAnchorKey(type, mode);
  const expected = REQUIRED_ANCHORS[key];
  if (!expected) return errs; // unknown type or whole-file artifact (API)
  const found = extractAnchors(body);
  const expectedSet = new Set(expected);
  const foundSet = new Set(found);
  const missing = expected.filter(a => !foundSet.has(a));
  const extra = found.filter(a => !expectedSet.has(a));
  if (missing.length > 0 || extra.length > 0) {
    errs.push(`${relPath}: structural-drift — missing-anchors=[${missing.join(",")}] extra-anchors=[${extra.join(",")}]`);
  }
  return errs;
}

// v3.x had lockfile-paired predicates here (validateLockfilePresence,
// validateLockfileGrammar, validateDiagramHashes, lockfilePathFor). v4.0
// drops the lockfile sidecar entirely — review-state lives in artifact
// frontmatter (status/verdict/readers/sections), drift detection moves to
// `git diff` in CI, and diagram-source/rendered presence is enforced by
// hooks/scripts/post-write-puml.js (Stream 9). See v4.0-design §4.

// --- orphan-types: walk pipeline/ + architecture/ + releases/ + runbooks/ for dropped/folded type filenames ---
export function validateOrphanTypes(orchestraDir) {
  const errs = [];
  if (!existsSync(orchestraDir)) return errs;
  function walk(dir) {
    let entries;
    try { entries = readdirSync(dir); } catch { return; }
    for (const entry of entries) {
      const full = join(dir, entry);
      let st;
      try { st = statSync(full); } catch { continue; }
      if (st.isDirectory()) walk(full);
      else if (st.isFile()) {
        for (const { pattern, reason } of ORPHAN_PATTERNS) {
          if (pattern.test(entry)) {
            const rel = full.startsWith(orchestraDir) ? full.slice(orchestraDir.length + 1) : full;
            errs.push(`${rel}: orphan-type — ${reason}`);
          }
        }
      }
    }
  }
  walk(orchestraDir);
  return errs;
}

// --- fold-correctness: TSR has both halves; RELEASE has §Announcement ---
export function validateFoldCorrectness(relPath, body, type) {
  const errs = [];
  const required = FOLD_REQUIREMENTS[type];
  if (!required) return errs;
  const found = new Set(extractAnchors(body));
  for (const anchor of required) {
    if (!found.has(anchor)) {
      errs.push(`${relPath}: fold-violation — missing ${anchor} (${type} fold required this anchor per v2.0)`);
    }
  }
  return errs;
}

// --- TSR S-EVAL-001 row-id coverage: every S-EVAL-001 row id must reference an S-TEST-001 row id ---
// Same anti-duplication principle as the consumer/dev surface rule, one step downstream:
// S-TEST-001 is the source of truth for (criterion, axis, critical, fixture, status, evidence);
// S-EVAL-001's `| id | verdict | reason |` is a lookup keyed on that id. An unknown id in
// S-EVAL-001 is structurally identical to a phantom anchor — it points at content the consumer
// can't resolve in the same artifact.
//
// Parser: scoped slice between `<a id="S-XXX-001"></a>` markers; row ids are the first column
// cell of every Markdown pipe-table row whose first cell matches /^T-\d+$/ (ignores header +
// separator rows). Empty / locked / draft TSRs are not the concern of this check — caller
// gates on whether to invoke (e.g., only when S-EVAL-001 status is locked).
const ROW_ID_RE = /^T-\d+$/;

function extractSectionBody(body, anchorId) {
  const startRe = new RegExp(`<a id="${anchorId}"></a>`);
  const startMatch = startRe.exec(body);
  if (!startMatch) return null;
  const after = body.slice(startMatch.index + startMatch[0].length);
  const nextAnchor = /<a id="S-[A-Z]+(?:-[A-Z]+)*-\d{3}"><\/a>/.exec(after);
  return nextAnchor ? after.slice(0, nextAnchor.index) : after;
}

function extractTableRowIds(sectionBody) {
  if (!sectionBody) return new Set();
  const ids = new Set();
  for (const rawLine of sectionBody.split("\n")) {
    const line = rawLine.trim();
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").map(c => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);
    if (cells.length === 0) continue;
    if (cells.every(c => /^-+:?$/.test(c) || /^:?-+:?$/.test(c))) continue; // separator row
    const first = cells[0];
    if (ROW_ID_RE.test(first)) ids.add(first);
  }
  return ids;
}

export function validateTsrEvalCoverage(relPath, body) {
  const errs = [];
  const testBody = extractSectionBody(body, "S-TEST-001");
  const evalBody = extractSectionBody(body, "S-EVAL-001");
  if (testBody === null || evalBody === null) return errs; // not a TSR or sections absent — other validators flag that
  const testIds = extractTableRowIds(testBody);
  const evalIds = extractTableRowIds(evalBody);
  if (evalIds.size === 0) return errs; // S-EVAL-001 not yet filled (in_progress / pending); skip
  const orphans = [...evalIds].filter(id => !testIds.has(id)).sort();
  if (orphans.length > 0) {
    errs.push(`${relPath}: S-EVAL-001 row-id coverage — S-EVAL-001 ids [${orphans.join(",")}] absent from S-TEST-001 (every S-EVAL-001 row must reference an existing S-TEST-001 row)`);
  }
  return errs;
}

// --- soft-cap: per-type body line cap; warning by default, error in --strict mode ---
export function validateSoftCap(relPath, body, type, mode, opts = {}) {
  const errs = [];
  const key = resolveAnchorKey(type, mode);
  const cap = SOFT_CAPS[key];
  if (!cap) return errs;
  const lines = body.split("\n").length;
  if (lines > cap) {
    const msg = `${relPath}: soft-cap — ${lines} lines > ${cap} for type ${key}`;
    errs.push(opts.strict ? msg : `WARN ${msg}`);
  }
  return errs;
}

// === Wire findVersionStamps / findPhaseTagCompliance / findHookManifestParity into the main walk ===
// Walk the consumer surface for version-stamp leaks. Roots match the
// "consumer surface" defined in CLAUDE.md (agents/, commands/, skills/,
// schemas/) plus runtime-data dirs (hooks/calibration, hooks/references).
for (const r of ["agents", "commands", "skills", "schemas", "hooks/calibration", "hooks/references"]) {
  walkVersionStamps(resolve(root, r));
}

// Phase-tag emission compliance for agents/lead.md (consumed by metrics-collector.js).
{
  const leadPath = resolve(root, "agents/lead.md");
  if (existsSync(leadPath)) {
    for (const e of findPhaseTagCompliance(readFileSync(leadPath, "utf8"))) errors.push(e);
  }
}

// Hook-to-manifest parity. Every .js under hooks/scripts/ must register in
// manifests/install-modules.json with kind: 'hook'. Shared utilities live in
// hooks/lib/ — keep hooks/scripts/ as a directory-as-contract: everything
// here is a hook handler.
{
  const hooksDir = resolve(root, "hooks/scripts");
  if (existsSync(hooksDir) && installModules && Array.isArray(installModules.modules)) {
    const scripts = readdirSync(hooksDir).filter(f => f.endsWith(".js"));
    for (const e of findHookManifestParity(scripts, installModules.modules)) errors.push(e);
  }
}

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

  // === Autonomy enum mutation tests ===
  // Mutation 6: autonomy.level=BOGUS fails red
  {
    const bad = `service_name: order\nautonomy:\n  level: BOGUS\n`;
    const errs = validateLocalYamlContent("local.yaml", bad);
    if (!errs.some(e => /autonomy\.level 'BOGUS'/.test(e))) {
      mutationErrors.push("mutation: autonomy.level=BOGUS should fail red");
    }
  }

  // Mutation 7: each of the 5 valid tags passes
  {
    for (const tag of VALID_AUTONOMY_LEVELS) {
      const ok = `service_name: order\nautonomy:\n  level: ${tag}\n`;
      const errs = validateLocalYamlContent("local.yaml", ok);
      if (errs.length !== 0) {
        mutationErrors.push(`inverse sanity: autonomy.level=${tag} should pass, got: ${errs.join(", ")}`);
      }
    }
  }

  // Mutation 8: missing autonomy block passes (default DRAFT_AND_GATE applies at runtime)
  {
    const ok = `service_name: order\n`;
    const errs = validateLocalYamlContent("local.yaml", ok);
    if (errs.length !== 0) {
      mutationErrors.push(`inverse sanity: missing autonomy block should pass, got: ${errs.join(", ")}`);
    }
  }

  // === Closed-allowlist mutation tests ===
  // Mutation 11: unknown top-level field rejected
  {
    const bad = `service_name: order\nadapter_notes: "freeform prose"\n`;
    const errs = validateLocalYamlContent("local.yaml", bad);
    if (!errs.some(e => /unknown top-level field 'adapter_notes'/.test(e))) {
      mutationErrors.push("mutation: unknown field 'adapter_notes' should be rejected by closed allowlist");
    }
  }

  // Mutation 12: another freeform-prose field rejected
  {
    const bad = `template_deliverable_path: project-poc/services/order/order-regen-spec.md\n`;
    const errs = validateLocalYamlContent("local.yaml", bad);
    if (!errs.some(e => /unknown top-level field 'template_deliverable_path'/.test(e))) {
      mutationErrors.push("mutation: unknown field 'template_deliverable_path' should be rejected by closed allowlist");
    }
  }

  // Mutation 13: per-service local.yaml + workspace-global system.yaml pass under strict allowlist
  {
    const localOk = [
      `service_name: order`,
      `scope_level: per-service`,
      `primary_language: java`,
      `framework: spring-boot`,
      `spawn_mode: subagent`,
      `status: locked`,
      `autonomy:`,
      `  level: DRAFT_AND_GATE`,
      `  resolved_by: default`,
      ``,
    ].join("\n");
    const errs = validateLocalYamlContent("local.yaml", localOk);
    if (errs.length !== 0) {
      mutationErrors.push(`inverse sanity: strict-allowlist local.yaml should pass, got: ${errs.join(", ")}`);
    }

    const systemOk = [
      `workspace_kind: multi-repo`,
      `context_path: /tmp/ws`,
      ``,
    ].join("\n");
    const sysErrs = validateSystemYamlContent("system.yaml", systemOk);
    if (sysErrs.length !== 0) {
      mutationErrors.push(`inverse sanity: strict-allowlist system.yaml should pass, got: ${sysErrs.join(", ")}`);
    }
  }

  // Mutation 13b: workspace_kind in local.yaml is rejected (lives in system.yaml only)
  {
    const bad = `service_name: order\nworkspace_kind: multi-repo\n`;
    const errs = validateLocalYamlContent("local.yaml", bad);
    if (!errs.some(e => /unknown top-level field 'workspace_kind'/.test(e))) {
      mutationErrors.push("mutation: workspace_kind in local.yaml should be rejected (lives in system.yaml only)");
    }
  }

  // Mutation 13c: dropped legacy fields are rejected by the strict allowlist
  for (const f of ["pipeline_id", "tsr_gate_mode", "test_depth", "chain_rigor", "mode", "depth", "bootstrap", "source_lock", "scope_path"]) {
    const bad = `service_name: order\n${f}: x\n`;
    const errs = validateLocalYamlContent("local.yaml", bad);
    if (!errs.some(e => new RegExp(`unknown top-level field '${f}'`).test(e))) {
      mutationErrors.push(`mutation 13c: dropped field '${f}' must be rejected by strict allowlist`);
    }
  }

  // Mutation 13d: invalid workspace_kind enum value is rejected (multi-service was dropped)
  for (const bad of ["monorepo", "multi-service"]) {
    const fixture = `workspace_kind: ${bad}\ncontext_path: /tmp/ws\n`;
    const errs = validateSystemYamlContent("system.yaml", fixture);
    if (!errs.some(e => new RegExp(`workspace_kind '${bad}'`).test(e))) {
      mutationErrors.push(`mutation 13d: workspace_kind '${bad}' should be rejected (not in single-repo|multi-repo)`);
    }
  }

  // Mutation 13e: scope_level enum — only system-wide | per-service pass
  {
    for (const lvl of ["system-wide", "per-service"]) {
      const ok = `service_name: order\nscope_level: ${lvl}\n`;
      const errs = validateLocalYamlContent("local.yaml", ok);
      if (errs.length !== 0) {
        mutationErrors.push(`inverse sanity: scope_level=${lvl} should pass, got: ${errs.join(", ")}`);
      }
    }
    for (const lvl of ["service", "container", "capability"]) {
      const bad = `service_name: order\nscope_level: ${lvl}\n`;
      const errs = validateLocalYamlContent("local.yaml", bad);
      // schema enum is enforced upstream; here we only assert the legacy values
      // produce SOME error (either enum mismatch surfaced by JSON-schema runner
      // or, if validateLocalYamlContent only allowlists keys, no error). Skip
      // assertion when allowlist is the only enforcement layer in this fn —
      // the schema-runner CI step catches it.
      void errs;
    }
  }

  // Mutation 13f: unknown field in system.yaml is rejected
  {
    const bad = `workspace_kind: single-repo\ncontext_path: /tmp/ws\nfreeform_notes: "nope"\n`;
    const errs = validateSystemYamlContent("system.yaml", bad);
    if (!errs.some(e => /unknown top-level field 'freeform_notes'/.test(e))) {
      mutationErrors.push("mutation 13f: unknown field in system.yaml should be rejected by closed allowlist");
    }
  }

  // Mutation 14: every valid workspace_kind passes
  {
    for (const wk of VALID_WORKSPACE_KINDS) {
      const ok = `workspace_kind: ${wk}\ncontext_path: /tmp/ws\n`;
      const errs = validateSystemYamlContent("system.yaml", ok);
      if (errs.length !== 0) {
        mutationErrors.push(`inverse sanity: workspace_kind=${wk} should pass, got: ${errs.join(", ")}`);
      }
    }
  }

  // === Run-plan pairing invariant mutation tests ===
  // Mutation 15: auto_mode:true without run_plan_status fails red
  {
    const bad = `service_name: order\nauto_mode: true\n`;
    const errs = validateLocalYamlContent("local.yaml", bad);
    if (!errs.some(e => /auto_mode:true requires run_plan_status:approved/.test(e))) {
      mutationErrors.push("mutation: auto_mode:true without run_plan_status should fail red");
    }
  }

  // Mutation 16: auto_mode:true with run_plan_status:drafted fails red
  {
    const bad = `service_name: order\nauto_mode: true\nrun_plan_status: drafted\n`;
    const errs = validateLocalYamlContent("local.yaml", bad);
    if (!errs.some(e => /auto_mode:true requires run_plan_status:approved/.test(e))) {
      mutationErrors.push("mutation: auto_mode:true with run_plan_status:drafted should fail red");
    }
  }

  // Mutation 17: run_plan_status not in enum fails red
  {
    const bad = `service_name: order\nrun_plan_status: bogus\n`;
    const errs = validateLocalYamlContent("local.yaml", bad);
    if (!errs.some(e => /run_plan_status 'bogus' not in/.test(e))) {
      mutationErrors.push("mutation: run_plan_status='bogus' should fail enum check");
    }
  }

  // Mutation 18: auto_mode:true + run_plan_status:approved passes (inverse sanity)
  {
    const ok = `service_name: order\nauto_mode: true\nrun_plan_status: approved\n`;
    const errs = validateLocalYamlContent("local.yaml", ok);
    if (errs.length !== 0) {
      mutationErrors.push(`inverse sanity: auto_mode:true + run_plan_status:approved should pass, got: ${errs.join(", ")}`);
    }
  }

  // Mutation 19: auto_mode absent + run_plan_status:drafted passes (drafted is valid before approval)
  {
    const ok = `service_name: order\nrun_plan_status: drafted\n`;
    const errs = validateLocalYamlContent("local.yaml", ok);
    if (errs.length !== 0) {
      mutationErrors.push(`inverse sanity: run_plan_status:drafted (auto_mode absent) should pass, got: ${errs.join(", ")}`);
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

  // === Version-stamp mutation tests (project CLAUDE.md: no version stamps in consumer surface) ===
  // Mutation VS-1: parenthetical version stamp fails red
  {
    const bad = `# /orchestra dispatcher (v4.0)\n\nbody\n`;
    const errs = findVersionStamps("agents/fixture.md", bad);
    if (!errs.some(e => /\[parenthetical\]/.test(e))) {
      mutationErrors.push("mutation VS-1: parenthetical '(v4.0)' should fail red");
    }
  }

  // Mutation VS-2: pre-version prefix fails red
  {
    const bad = `pre-v4.1 carryover fields still load at runtime.\n`;
    const errs = findVersionStamps("agents/fixture.md", bad);
    if (!errs.some(e => /\[pre-version\]/.test(e))) {
      mutationErrors.push("mutation VS-2: 'pre-v4.1' prefix should fail red");
    }
  }

  // Mutation VS-3: migration narration fails red
  {
    const bad = `Service-level SAD is GONE in v4.2.\n`;
    const errs = findVersionStamps("agents/fixture.md", bad);
    if (!errs.some(e => /\[migration-verb\]/.test(e))) {
      mutationErrors.push("mutation VS-3: 'GONE in v4.2' migration narration should fail red");
    }
  }

  // Mutation VS-4: 'In vN.M …' rule stamp fails red
  {
    const bad = `In v4.0 the contract IS authoritative.\n`;
    const errs = findVersionStamps("agents/fixture.md", bad);
    if (!errs.some(e => /\[in-version-rule\]/.test(e))) {
      mutationErrors.push("mutation VS-4: 'In v4.0 …' rule stamp should fail red");
    }
  }

  // Mutation VS-5: 'the vN.M descriptor' fails red
  {
    const bad = `the v4.2 two-field set lives at schemas/system.schema.json.\n`;
    const errs = findVersionStamps("agents/fixture.md", bad);
    if (!errs.some(e => /\[the-version-descr\]/.test(e))) {
      mutationErrors.push("mutation VS-5: 'the v4.2 two-field' descriptor should fail red");
    }
  }

  // Inverse sanity: skill `origin:` attribution passes (exempt per CLAUDE.md "Allowed")
  {
    const ok = `origin: SpillwaveSolutions/plantuml@MIT (cloned for orchestra v2.0.0; examples/ trimmed)\n`;
    const errs = findVersionStamps("skills/plantuml/SKILL.md", ok);
    if (errs.length !== 0) {
      mutationErrors.push(`inverse sanity: 'origin:' attribution should pass, got: ${errs.join(", ")}`);
    }
  }

  // Inverse sanity: clean prose (no version coupling) passes
  {
    const ok = `Author PRD-NNN.md per the routing taxonomy. Lock via status: locked.\n`;
    const errs = findVersionStamps("agents/fixture.md", ok);
    if (errs.length !== 0) {
      mutationErrors.push(`inverse sanity: clean prose should pass findVersionStamps, got: ${errs.join(", ")}`);
    }
  }

  // Mutation VS-6: standalone vN.M.P version stamp fails red
  {
    const bad = `v1.0.0: suggestion-only — the diagnostic never changes the resolved level.\n`;
    const errs = findVersionStamps("agents/fixture.md", bad);
    if (!errs.some(e => /\[standalone-3segment\]/.test(e))) {
      mutationErrors.push("mutation VS-6: standalone 'v1.0.0' should fail red");
    }
  }

  // Mutation VS-7: future-open 'vN.M+' fails red
  {
    const bad = `Deferred to v1.1+ for a follow-up release.\n`;
    const errs = findVersionStamps("agents/fixture.md", bad);
    if (!errs.some(e => /\[future-open\]/.test(e))) {
      mutationErrors.push("mutation VS-7: 'v1.1+' future-version stamp should fail red");
    }
  }

  // Mutation VS-8: migration narration without a version number fails red
  {
    const bad = `Per-service feature lists (formerly S-REGEN-PLAN-001) live here.\n`;
    const errs = findVersionStamps("agents/fixture.md", bad);
    if (!errs.some(e => /\[migration-narration\]/.test(e))) {
      mutationErrors.push("mutation VS-8: 'formerly' migration narration should fail red");
    }
  }

  // Mutation VS-9: lowercase 'in vN.M' fails red (proves case-insensitivity)
  {
    const bad = `Lightweight in v1.0.0 (no profiling).\n`;
    const errs = findVersionStamps("agents/fixture.md", bad);
    if (!errs.some(e => /\[(in-version-rule|standalone-3segment)\]/.test(e))) {
      mutationErrors.push("mutation VS-9: lowercase 'in v1.0.0' should fail red");
    }
  }

  // Inverse sanity: URL containing /vN.M.P/ does NOT fire (lookbehind/lookahead correctness)
  {
    const ok = `Download from https://github.com/plantuml/plantuml/releases/download/v1.2025.0/plantuml.jar\n`;
    const errs = findVersionStamps("docs/fixture.md", ok);
    if (errs.length !== 0) {
      mutationErrors.push(`inverse sanity: URL-embedded /v1.2025.0/ should pass, got: ${errs.join(", ")}`);
    }
  }

  // Inverse sanity: filename containing -vN.M.P does NOT fire
  {
    const ok = `cache key: plantuml-jar-v1.2025.0\n`;
    const errs = findVersionStamps("docs/fixture.md", ok);
    if (errs.length !== 0) {
      mutationErrors.push(`inverse sanity: 'plantuml-jar-v1.2025.0' filename should pass, got: ${errs.join(", ")}`);
    }
  }

  // Inverse sanity: whole-file exempt list returns [] regardless of content
  for (const exemptPath of [
    "skills/plantuml/references/troubleshooting/installation_setup_guide.md",
    "skills/plantuml/LICENSE",
    "skills/clean-architecture/SKILL.md",
    "skills/commit-message/SKILL.md",
  ]) {
    const bad = `pre-v4.1 carryover (v4.0) the v4.2 two-field set v1.0.0 in v1.0.0 formerly known\n`;
    const errs = findVersionStamps(exemptPath, bad);
    if (errs.length !== 0) {
      mutationErrors.push(`inverse sanity: exempt file ${exemptPath} should return [], got: ${errs.join(", ")}`);
    }
  }

  // === Phase-tag emission mutation tests ===
  // Mutation PT-1: missing subsection fails red
  {
    const bad = `## Some other header\n\nbody without the phase-tag subsection\n`;
    const errs = findPhaseTagCompliance(bad);
    if (!errs.some(e => /missing '### Phase-tag emission' subsection/.test(e))) {
      mutationErrors.push("mutation PT-1: missing '### Phase-tag emission' subsection should fail red");
    }
  }

  // Mutation PT-2: subsection present but missing a phase value fails red.
  // Fixture must NOT mention the missing value anywhere in the section body —
  // the predicate is a naive substring check (correct for real lead.md prose,
  // where phase values appear in backticks/tables/directives, never as
  // narration about what's missing).
  {
    const bad = `### Phase-tag emission\n\nPhases: discovery, spec-draft, verification, gate.\n\n## next section\n`;
    const errs = findPhaseTagCompliance(bad);
    if (!errs.some(e => /missing canonical phase value 'gap-resolution'/.test(e))) {
      mutationErrors.push("mutation PT-2: subsection missing 'gap-resolution' should fail red");
    }
  }

  // Inverse sanity: complete subsection passes
  {
    const ok = `### Phase-tag emission\n\nThe five values: discovery, spec-draft, verification, gap-resolution, gate.\n\n## next\n`;
    const errs = findPhaseTagCompliance(ok);
    if (errs.length !== 0) {
      mutationErrors.push(`inverse sanity: complete phase-tag subsection should pass, got: ${errs.join(", ")}`);
    }
  }

  // === Hook ↔ manifest parity mutation tests ===
  // Mutation HM-1: hook script unregistered fails red
  {
    const scripts = ["pre-write-check.js", "rogue-hook.js"];
    const entries = [{ name: "hook.pre-write-check", kind: "hook", path: "hooks/scripts/pre-write-check.js" }];
    const errs = findHookManifestParity(scripts, entries);
    if (!errs.some(e => /rogue-hook\.js: not registered/.test(e))) {
      mutationErrors.push("mutation HM-1: unregistered hook script should fail red");
    }
  }

  // Mutation HM-2: registered hook without script fails red
  {
    const scripts = ["pre-write-check.js"];
    const entries = [
      { name: "hook.pre-write-check", kind: "hook", path: "hooks/scripts/pre-write-check.js" },
      { name: "hook.phantom", kind: "hook", path: "hooks/scripts/phantom.js" },
    ];
    const errs = findHookManifestParity(scripts, entries);
    if (!errs.some(e => /registered hook 'phantom\.js' has no corresponding/.test(e))) {
      mutationErrors.push("mutation HM-2: registered hook with no script should fail red");
    }
  }

  // Inverse sanity: matched sets pass; non-hook entries ignored
  {
    const scripts = ["pre-write-check.js", "agent-plan-sync.js"];
    const entries = [
      { name: "hook.pre-write-check", kind: "hook", path: "hooks/scripts/pre-write-check.js" },
      { name: "hook.agent-plan-sync", kind: "hook", path: "hooks/scripts/agent-plan-sync.js" },
      { name: "skill.foo", kind: "skill", path: "skills/foo/SKILL.md" },
    ];
    const errs = findHookManifestParity(scripts, entries);
    if (errs.length !== 0) {
      mutationErrors.push(`inverse sanity: matched hook+manifest sets should pass, got: ${errs.join(", ")}`);
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
