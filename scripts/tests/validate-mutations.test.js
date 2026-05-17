#!/usr/bin/env node
// scripts/tests/validate-mutations.test.js
// Mutation suite for scripts/lib/validate-*.js pure functions. Previously
// inlined at the foot of scripts/validate.js; moved here so the dispatcher
// stays focused on orchestration.

import {
  validateRuleContent, validateCommandContent,
} from "../lib/validate-frontmatter.js";
import {
  validateLocalYamlContent, validateSystemYamlContent,
  VALID_AUTONOMY_LEVELS, VALID_WORKSPACE_KINDS,
} from "../lib/validate-schemas.js";
import {
  findLeakyCites, findVersionStamps, findPhaseTagCompliance,
} from "../lib/validate-cite.js";
import { findHookManifestParity } from "../lib/validate-hooks.js";

const errors = [];
function check(cond, msg) { if (!cond) errors.push(msg); }

// === Rule frontmatter ===
{
  const fortyOne = "x\n".repeat(41);
  const bad = `---\npaths:\n  - "**/*.foo"\n---\n${fortyOne}`;
  const errs = validateRuleContent("rules/fixture/over-cap.md", bad);
  check(errs.some(e => /> 40 cap/.test(e)), "rule body >40 lines should fail red");
}
{
  const bad = `---\nname: oops\n---\n# body\n`;
  const errs = validateRuleContent("rules/fixture/missing-paths.md", bad);
  check(errs.some(e => /missing 'paths' array/.test(e)), "rule missing paths should fail red");
}
{
  const bad = `---\npaths: null\n---\n# body\n`;
  const errs = validateRuleContent("rules/fixture/null-paths.md", bad);
  check(errs.some(e => /missing 'paths' array/.test(e)), "rule with non-array paths should fail red");
}
{
  const ok = `---\npaths:\n  - "**/*.foo"\n---\n# Foo coding-style\n\n## Rules\n\n- one rule.\n`;
  const errs = validateRuleContent("rules/fixture/clean.md", ok);
  check(errs.length === 0, `inverse sanity: clean rule fixture should pass, got: ${errs.join(", ")}`);
}

// === Command frontmatter ===
{
  const bad = `---\ndescription: x\n---\nbody\n`;
  const errs = validateCommandContent("commands/fixture/missing-name.md", bad);
  check(errs.some(e => /missing frontmatter key 'name'/.test(e)), "command missing name should fail red");
}
{
  const bad = `---\nname: x\n---\nbody\n`;
  const errs = validateCommandContent("commands/fixture/missing-desc.md", bad);
  check(errs.some(e => /missing frontmatter key 'description'/.test(e)), "command missing description should fail red");
}
{
  const ok = `---\nname: foo\ndescription: A foo command.\n---\n# /foo\n`;
  const errs = validateCommandContent("commands/fixture/clean.md", ok);
  check(errs.length === 0, `inverse sanity: clean command fixture should pass, got: ${errs.join(", ")}`);
}

// === Autonomy enum ===
{
  const bad = `service_name: order\nautonomy:\n  level: BOGUS\n`;
  const errs = validateLocalYamlContent("local.yaml", bad);
  check(errs.some(e => /autonomy\.level 'BOGUS'/.test(e)), "autonomy.level=BOGUS should fail red");
}
for (const tag of VALID_AUTONOMY_LEVELS) {
  const ok = `service_name: order\nautonomy:\n  level: ${tag}\n`;
  const errs = validateLocalYamlContent("local.yaml", ok);
  check(errs.length === 0, `inverse sanity: autonomy.level=${tag} should pass, got: ${errs.join(", ")}`);
}
{
  const ok = `service_name: order\n`;
  const errs = validateLocalYamlContent("local.yaml", ok);
  check(errs.length === 0, `inverse sanity: missing autonomy block should pass, got: ${errs.join(", ")}`);
}

// === Closed allowlists (require allowlist opts to drive the unknown-field check) ===
const LOCAL_ALLOWLIST = new Set([
  "service_name", "scope_level", "primary_language", "framework",
  "spawn_mode", "status", "autonomy", "auto_mode", "run_plan_status", "source_path",
]);
const SYSTEM_ALLOWLIST = new Set(["workspace_kind", "context_path"]);

{
  const bad = `service_name: order\nadapter_notes: "freeform prose"\n`;
  const errs = validateLocalYamlContent("local.yaml", bad, { allowlist: LOCAL_ALLOWLIST });
  check(errs.some(e => /unknown top-level field 'adapter_notes'/.test(e)), "unknown 'adapter_notes' should be rejected");
}
{
  const bad = `template_deliverable_path: project-poc/services/order/order-regen-spec.md\n`;
  const errs = validateLocalYamlContent("local.yaml", bad, { allowlist: LOCAL_ALLOWLIST });
  check(errs.some(e => /unknown top-level field 'template_deliverable_path'/.test(e)), "unknown 'template_deliverable_path' should be rejected");
}
{
  const localOk = [
    "service_name: order",
    "scope_level: per-service",
    "primary_language: java",
    "framework: spring-boot",
    "spawn_mode: subagent",
    "status: locked",
    "autonomy:",
    "  level: DRAFT_AND_GATE",
    "  resolved_by: default",
    "",
  ].join("\n");
  const errs = validateLocalYamlContent("local.yaml", localOk, { allowlist: LOCAL_ALLOWLIST });
  check(errs.length === 0, `inverse sanity: strict-allowlist local.yaml should pass, got: ${errs.join(", ")}`);
  const systemOk = `workspace_kind: multi-repo\ncontext_path: /tmp/ws\n`;
  const sysErrs = validateSystemYamlContent("system.yaml", systemOk, { allowlist: SYSTEM_ALLOWLIST });
  check(sysErrs.length === 0, `inverse sanity: strict-allowlist system.yaml should pass, got: ${sysErrs.join(", ")}`);
}
{
  const bad = `service_name: order\nworkspace_kind: multi-repo\n`;
  const errs = validateLocalYamlContent("local.yaml", bad, { allowlist: LOCAL_ALLOWLIST });
  check(errs.some(e => /unknown top-level field 'workspace_kind'/.test(e)), "workspace_kind in local.yaml should be rejected");
}
for (const f of ["pipeline_id", "tsr_gate_mode", "test_depth", "chain_rigor", "mode", "depth", "bootstrap", "source_lock", "scope_path"]) {
  const bad = `service_name: order\n${f}: x\n`;
  const errs = validateLocalYamlContent("local.yaml", bad, { allowlist: LOCAL_ALLOWLIST });
  check(errs.some(e => new RegExp(`unknown top-level field '${f}'`).test(e)), `dropped field '${f}' must be rejected`);
}
for (const bad of ["monorepo", "multi-service"]) {
  const fixture = `workspace_kind: ${bad}\ncontext_path: /tmp/ws\n`;
  const errs = validateSystemYamlContent("system.yaml", fixture, { allowlist: SYSTEM_ALLOWLIST });
  check(errs.some(e => new RegExp(`workspace_kind '${bad}'`).test(e)), `workspace_kind '${bad}' should be rejected`);
}
{
  const bad = `workspace_kind: single-repo\ncontext_path: /tmp/ws\nfreeform_notes: "nope"\n`;
  const errs = validateSystemYamlContent("system.yaml", bad, { allowlist: SYSTEM_ALLOWLIST });
  check(errs.some(e => /unknown top-level field 'freeform_notes'/.test(e)), "unknown field in system.yaml should be rejected");
}
for (const wk of VALID_WORKSPACE_KINDS) {
  const ok = `workspace_kind: ${wk}\ncontext_path: /tmp/ws\n`;
  const errs = validateSystemYamlContent("system.yaml", ok, { allowlist: SYSTEM_ALLOWLIST });
  check(errs.length === 0, `inverse sanity: workspace_kind=${wk} should pass, got: ${errs.join(", ")}`);
}

// === Run-plan pairing ===
{
  const bad = `service_name: order\nauto_mode: true\n`;
  const errs = validateLocalYamlContent("local.yaml", bad);
  check(errs.some(e => /auto_mode:true requires run_plan_status:approved/.test(e)), "auto_mode:true without run_plan_status should fail red");
}
{
  const bad = `service_name: order\nauto_mode: true\nrun_plan_status: drafted\n`;
  const errs = validateLocalYamlContent("local.yaml", bad);
  check(errs.some(e => /auto_mode:true requires run_plan_status:approved/.test(e)), "auto_mode:true with drafted should fail red");
}
{
  const bad = `service_name: order\nrun_plan_status: bogus\n`;
  const errs = validateLocalYamlContent("local.yaml", bad);
  check(errs.some(e => /run_plan_status 'bogus' not in/.test(e)), "run_plan_status='bogus' should fail enum check");
}
{
  const ok = `service_name: order\nauto_mode: true\nrun_plan_status: approved\n`;
  const errs = validateLocalYamlContent("local.yaml", ok);
  check(errs.length === 0, `inverse sanity: auto_mode:true + approved should pass, got: ${errs.join(", ")}`);
}
{
  const ok = `service_name: order\nrun_plan_status: drafted\n`;
  const errs = validateLocalYamlContent("local.yaml", ok);
  check(errs.length === 0, `inverse sanity: run_plan_status:drafted (no auto_mode) should pass, got: ${errs.join(", ")}`);
}

// === Leaky-cite ===
{
  const bad = `# header\n\nrun this per PRD §8.11.\n`;
  const errs = findLeakyCites("agents/fixture.md", bad);
  check(errs.some(e => /leaky '§' cite/.test(e)), "leaky '§' cite should fail red");
}
{
  const bad = `escalate per §9.5 whitelist.\n`;
  const errs = findLeakyCites("agents/fixture.md", bad);
  check(errs.some(e => /leaky '§' cite/.test(e)), "bare '§' should fail red");
}
{
  const ok = `Author PRD-NNN.md and FRS-NNN.md per the routing taxonomy.\nClassify intent: docs / template / hotfix / feature.\n`;
  const errs = findLeakyCites("agents/fixture.md", ok);
  check(errs.length === 0, `inverse sanity: clean body should pass, got: ${errs.join(", ")}`);
}

// === Version-stamp ===
{
  const bad = `# /orchestra dispatcher (v4.0)\n\nbody\n`;
  const errs = findVersionStamps("agents/fixture.md", bad);
  check(errs.some(e => /\[parenthetical\]/.test(e)), "parenthetical '(v4.0)' should fail red");
}
{
  const bad = `pre-v4.1 carryover fields still load at runtime.\n`;
  const errs = findVersionStamps("agents/fixture.md", bad);
  check(errs.some(e => /\[pre-version\]/.test(e)), "'pre-v4.1' prefix should fail red");
}
{
  const bad = `Service-level SAD is GONE in v4.2.\n`;
  const errs = findVersionStamps("agents/fixture.md", bad);
  check(errs.some(e => /\[migration-verb\]/.test(e)), "'GONE in v4.2' should fail red");
}
{
  const bad = `In v4.0 the contract IS authoritative.\n`;
  const errs = findVersionStamps("agents/fixture.md", bad);
  check(errs.some(e => /\[in-version-rule\]/.test(e)), "'In v4.0 …' should fail red");
}
{
  const bad = `the v4.2 two-field set lives at schemas/system.schema.json.\n`;
  const errs = findVersionStamps("agents/fixture.md", bad);
  check(errs.some(e => /\[the-version-descr\]/.test(e)), "'the v4.2 two-field' should fail red");
}
{
  const ok = `origin: SpillwaveSolutions/plantuml@MIT (cloned for orchestra v2.0.0; examples/ trimmed)\n`;
  const errs = findVersionStamps("skills/plantuml/SKILL.md", ok);
  check(errs.length === 0, `inverse sanity: 'origin:' attribution should pass, got: ${errs.join(", ")}`);
}
{
  const ok = `Author PRD-NNN.md per the routing taxonomy. Lock via status: locked.\n`;
  const errs = findVersionStamps("agents/fixture.md", ok);
  check(errs.length === 0, `inverse sanity: clean prose should pass, got: ${errs.join(", ")}`);
}
{
  const bad = `v1.0.0: suggestion-only — the diagnostic never changes the resolved level.\n`;
  const errs = findVersionStamps("agents/fixture.md", bad);
  check(errs.some(e => /\[standalone-3segment\]/.test(e)), "standalone 'v1.0.0' should fail red");
}
{
  const bad = `Deferred to v1.1+ for a follow-up release.\n`;
  const errs = findVersionStamps("agents/fixture.md", bad);
  check(errs.some(e => /\[future-open\]/.test(e)), "'v1.1+' future-version stamp should fail red");
}
{
  const bad = `Per-service feature lists (formerly S-REGEN-PLAN-001) live here.\n`;
  const errs = findVersionStamps("agents/fixture.md", bad);
  check(errs.some(e => /\[migration-narration\]/.test(e)), "'formerly' migration narration should fail red");
}
{
  const bad = `Lightweight in v1.0.0 (no profiling).\n`;
  const errs = findVersionStamps("agents/fixture.md", bad);
  check(errs.some(e => /\[(in-version-rule|standalone-3segment)\]/.test(e)), "lowercase 'in v1.0.0' should fail red");
}
{
  const ok = `Download from https://github.com/plantuml/plantuml/releases/download/v1.2025.0/plantuml.jar\n`;
  const errs = findVersionStamps("docs/fixture.md", ok);
  check(errs.length === 0, `inverse sanity: URL-embedded /v1.2025.0/ should pass, got: ${errs.join(", ")}`);
}
{
  const ok = `cache key: plantuml-jar-v1.2025.0\n`;
  const errs = findVersionStamps("docs/fixture.md", ok);
  check(errs.length === 0, `inverse sanity: 'plantuml-jar-v1.2025.0' filename should pass, got: ${errs.join(", ")}`);
}
for (const exemptPath of [
  "skills/plantuml/references/troubleshooting/installation_setup_guide.md",
  "skills/plantuml/LICENSE",
  "skills/clean-architecture/SKILL.md",
  "skills/commit-message/SKILL.md",
]) {
  const bad = `pre-v4.1 carryover (v4.0) the v4.2 two-field set v1.0.0 in v1.0.0 formerly known\n`;
  const errs = findVersionStamps(exemptPath, bad);
  check(errs.length === 0, `inverse sanity: exempt file ${exemptPath} should return [], got: ${errs.join(", ")}`);
}

// === Phase-tag emission ===
{
  const bad = `## Some other header\n\nbody without the phase-tag subsection\n`;
  const errs = findPhaseTagCompliance(bad);
  check(errs.some(e => /missing '### Phase-tag emission' subsection/.test(e)), "missing subsection should fail red");
}
{
  const bad = `### Phase-tag emission\n\nPhases: discovery, spec-draft, verification, gate.\n\n## next section\n`;
  const errs = findPhaseTagCompliance(bad);
  check(errs.some(e => /missing canonical phase value 'gap-resolution'/.test(e)), "subsection missing 'gap-resolution' should fail red");
}
{
  const ok = `### Phase-tag emission\n\nThe five values: discovery, spec-draft, verification, gap-resolution, gate.\n\n## next\n`;
  const errs = findPhaseTagCompliance(ok);
  check(errs.length === 0, `inverse sanity: complete phase-tag subsection should pass, got: ${errs.join(", ")}`);
}

// === Hook ↔ manifest parity ===
{
  const scripts = ["pre-write-check.js", "rogue-hook.js"];
  const entries = [{ name: "hook.pre-write-check", kind: "hook", path: "hooks/scripts/pre-write-check.js" }];
  const errs = findHookManifestParity(scripts, entries);
  check(errs.some(e => /rogue-hook\.js: not registered/.test(e)), "unregistered hook script should fail red");
}
{
  const scripts = ["pre-write-check.js"];
  const entries = [
    { name: "hook.pre-write-check", kind: "hook", path: "hooks/scripts/pre-write-check.js" },
    { name: "hook.phantom", kind: "hook", path: "hooks/scripts/phantom.js" },
  ];
  const errs = findHookManifestParity(scripts, entries);
  check(errs.some(e => /registered hook 'phantom\.js' has no corresponding/.test(e)), "registered hook with no script should fail red");
}
{
  const scripts = ["pre-write-check.js", "agent-plan-sync.js"];
  const entries = [
    { name: "hook.pre-write-check", kind: "hook", path: "hooks/scripts/pre-write-check.js" },
    { name: "hook.agent-plan-sync", kind: "hook", path: "hooks/scripts/agent-plan-sync.js" },
    { name: "skill.foo", kind: "skill", path: "skills/foo/SKILL.md" },
  ];
  const errs = findHookManifestParity(scripts, entries);
  check(errs.length === 0, `inverse sanity: matched hook+manifest sets should pass, got: ${errs.join(", ")}`);
}

if (errors.length) {
  console.error("validate-mutations.test.js: FAIL");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log(`validate-mutations.test.js: OK`);
