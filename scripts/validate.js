#!/usr/bin/env node
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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

if (errors.length) {
  console.error("validate.js: FAIL");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("validate.js: OK");
