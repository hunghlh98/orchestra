// scripts/lib/validate-schemas.js
// JSON manifest + YAML schema validation. Loaded by scripts/validate.js.
//
// loadJSON     — read + parse a JSON file relative to repo root; returns null
//                on miss and pushes error to the errs array.
// runBootstrapChecks — validates manifests/install-modules.json, runtime-toggles.json,
//                known-models.json, .claude-plugin/plugin.json, VERSION, CHANGELOG.md.
// validateLocalYamlContent / validateSystemYamlContent — content validators for
//                consumer-side local.yaml + system.yaml. Pure (testable in
//                isolation; consumed by scripts/tests/validate-mutations.test.js).

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { parse as parseYaml } from "../../hooks/lib/yaml-mini.js";

export const VALID_AUTONOMY_LEVELS = [
  "EXECUTION_ONLY", "JOINT_PROCESSING", "OPTION_SYNTHESIS",
  "DRAFT_AND_GATE", "FULL_AUTONOMY",
];

export const VALID_RUN_PLAN_STATUS = ["drafted", "approved", "revision_requested"];
export const VALID_WORKSPACE_KINDS = ["single-repo", "multi-repo"];

export function loadJSON(root, rel, errs) {
  const path = resolve(root, rel);
  if (!existsSync(path)) { errs.push(`missing file: ${rel}`); return null; }
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch (e) { errs.push(`invalid JSON in ${rel}: ${e.message}`); return null; }
}

export function runBootstrapChecks(root, errs) {
  const installModules = loadJSON(root, "manifests/install-modules.json", errs);
  const runtimeToggles = loadJSON(root, "manifests/runtime-toggles.json", errs);
  const knownModels   = loadJSON(root, "manifests/known-models.json", errs);
  const plugin        = loadJSON(root, ".claude-plugin/plugin.json", errs);
  const localSchema   = loadJSON(root, "schemas/local.schema.json", errs);
  const systemSchema  = loadJSON(root, "schemas/system.schema.json", errs);

  const LOCAL_ALLOWLIST = localSchema?.properties
    ? new Set(Object.keys(localSchema.properties).filter(k => k !== "$schema"))
    : new Set();
  const SYSTEM_ALLOWLIST = systemSchema?.properties
    ? new Set(Object.keys(systemSchema.properties).filter(k => k !== "$schema"))
    : new Set();

  if (installModules && !Array.isArray(installModules.modules)) {
    errs.push("install-modules.json: 'modules' must be an array");
  }
  if (runtimeToggles && !Array.isArray(runtimeToggles.toggles)) {
    errs.push("runtime-toggles.json: 'toggles' must be an array");
  }
  if (knownModels) {
    if (!Array.isArray(knownModels.models) || knownModels.models.length === 0) {
      errs.push("known-models.json: 'models' must be a non-empty array");
    } else {
      const defaults = knownModels.models.filter(m => m.default === true);
      if (defaults.length !== 1) {
        errs.push(`known-models.json: expected exactly 1 default model, found ${defaults.length}`);
      }
      for (const m of knownModels.models) {
        if (!["opus", "sonnet", "haiku"].includes(m.id)) {
          errs.push(`known-models.json: model has invalid id '${m.id}' (must be opus|sonnet|haiku)`);
        }
        if (!m.model_id || typeof m.model_id !== "string") {
          errs.push(`known-models.json: model '${m.id}' missing 'model_id'`);
        }
      }
    }
  }

  if (plugin) {
    for (const k of ["name", "version", "description", "author", "license"]) {
      if (!plugin[k]) errs.push(`plugin.json: missing required key '${k}'`);
    }
    if (plugin.name !== "orchestra") {
      errs.push(`plugin.json: name must be 'orchestra', got '${plugin.name}'`);
    }
  }

  const versionPath = resolve(root, "VERSION");
  let versionFile = null;
  if (!existsSync(versionPath)) {
    errs.push("missing file: VERSION");
  } else {
    versionFile = readFileSync(versionPath, "utf8").trim();
    if (plugin && plugin.version !== versionFile) {
      errs.push(`VERSION (${versionFile}) ≠ plugin.json.version (${plugin.version})`);
    }
  }

  const changelogPath = resolve(root, "CHANGELOG.md");
  if (!existsSync(changelogPath)) {
    errs.push("missing file: CHANGELOG.md");
  } else if (versionFile) {
    const changelog = readFileSync(changelogPath, "utf8");
    const hasUnreleased = /^## \[Unreleased\]/m.test(changelog);
    const hasVersion = changelog.includes(`## [${versionFile}]`);
    if (!hasVersion && !hasUnreleased) {
      errs.push(`CHANGELOG.md: missing '## [${versionFile}]' or '## [Unreleased]' section`);
    }
  }

  return { installModules, runtimeToggles, knownModels, plugin, LOCAL_ALLOWLIST, SYSTEM_ALLOWLIST, versionFile };
}

export function validateLocalYamlContent(relPath, raw, opts = {}) {
  const errs = [];
  let parsed;
  try { parsed = parseYaml(raw); }
  catch (e) { errs.push(`${relPath}: parse error: ${e.message}`); return errs; }
  if (!parsed || typeof parsed !== "object") return errs;
  const allowlist = opts.allowlist;
  if (allowlist && allowlist.size > 0) {
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

export function validateSystemYamlContent(relPath, raw, opts = {}) {
  const errs = [];
  let parsed;
  try { parsed = parseYaml(raw); }
  catch (e) { errs.push(`${relPath}: parse error: ${e.message}`); return errs; }
  if (!parsed || typeof parsed !== "object") return errs;
  const allowlist = opts.allowlist;
  if (allowlist && allowlist.size > 0) {
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
