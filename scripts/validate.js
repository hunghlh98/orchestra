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

if (errors.length) {
  console.error("validate.js: FAIL");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("validate.js: OK");
