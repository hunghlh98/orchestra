// scripts/lib/validate-schemas.js
// JSON manifest + YAML schema validation. Loaded by scripts/validate.js.
//
// loadJSON     — read + parse a JSON file relative to repo root; returns null
//                on miss and pushes error to the errs array.
// runBootstrapChecks — validates manifests/install-modules.json, runtime-toggles.json,
//                known-models.json, .claude-plugin/plugin.json, VERSION, CHANGELOG.md.
//
// YAML content validators (VALID_* constants + validateLocalYamlContent /
// validateSystemYamlContent) are re-exported from hooks/lib/validate-yaml.js
// — that module is the single source of truth, shared with mcp-servers/.

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export {
  VALID_AUTONOMY_LEVELS,
  VALID_RUN_PLAN_STATUS,
  VALID_WORKSPACE_KINDS,
  validateLocalYamlContent,
  validateSystemYamlContent,
} from "../../hooks/lib/validate-yaml.js";

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

