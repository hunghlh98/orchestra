#!/usr/bin/env node
// scripts/validate.js
// Dispatcher for orchestra-internal validators. Per-surface predicates live
// under scripts/lib/validate-*.js; this file orchestrates the sequence and
// reports aggregated errors. Mutation tests for the predicates live at
// scripts/tests/validate-mutations.test.js (broken out from this file —
// previously inlined at the foot of validate.js).
//
// Re-exports the named functions tests depend on so external imports
// (scripts/tests/validate-extensions.test.js) still resolve at this path.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  runBootstrapChecks, validateLocalYamlContent, validateSystemYamlContent,
  VALID_AUTONOMY_LEVELS, VALID_RUN_PLAN_STATUS, VALID_WORKSPACE_KINDS,
} from "./lib/validate-schemas.js";
import {
  validateRuleContent, validateCommandContent,
  walkRules, walkCommands,
} from "./lib/validate-frontmatter.js";
import { walkSkills } from "./lib/validate-skills.js";
import {
  findLeakyCites, findVersionStamps, findPhaseTagCompliance,
  VERSION_STAMP_PATTERNS, VERSION_STAMP_EXEMPT_FILES, PHASE_VALUES,
  runConsumerSurfaceChecks,
} from "./lib/validate-cite.js";
import {
  findHookManifestParity, runHookManifestCheck,
} from "./lib/validate-hooks.js";
import {
  REQUIRED_ANCHORS, SOFT_CAPS, ORPHAN_PATTERNS, FOLD_REQUIREMENTS,
  validateStructuralDiff, validateOrphanTypes, validateFoldCorrectness,
  validateTsrEvalCoverage, validateSoftCap, typeFromFilename,
} from "./lib/validate-artifacts.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

// Per-surface validators write into the shared errors[] array.
const { installModules, LOCAL_ALLOWLIST, SYSTEM_ALLOWLIST } = runBootstrapChecks(root, errors);

walkSkills(root, errors);
walkRules(resolve(root, "rules"), errors);
walkCommands(resolve(root, "commands"), errors);

runConsumerSurfaceChecks(root, errors);
runHookManifestCheck(root, installModules, errors);

// Re-exports for test imports. Wrap local/system YAML validators so callers
// don't need to thread the bootstrap-discovered allowlists.
export {
  validateRuleContent, validateCommandContent,
  VALID_AUTONOMY_LEVELS, VALID_RUN_PLAN_STATUS, VALID_WORKSPACE_KINDS,
  findLeakyCites, findVersionStamps, findPhaseTagCompliance,
  VERSION_STAMP_PATTERNS, VERSION_STAMP_EXEMPT_FILES, PHASE_VALUES,
  findHookManifestParity,
  REQUIRED_ANCHORS, SOFT_CAPS, ORPHAN_PATTERNS, FOLD_REQUIREMENTS,
  validateStructuralDiff, validateOrphanTypes, validateFoldCorrectness,
  validateTsrEvalCoverage, validateSoftCap, typeFromFilename,
};

// Wrap the bare validators so back-compat callers don't thread allowlists.
const validateLocalYamlContentWrapped = (relPath, raw, opts = {}) =>
  validateLocalYamlContent(relPath, raw, { allowlist: LOCAL_ALLOWLIST, ...opts });
const validateSystemYamlContentWrapped = (relPath, raw, opts = {}) =>
  validateSystemYamlContent(relPath, raw, { allowlist: SYSTEM_ALLOWLIST, ...opts });
export {
  validateLocalYamlContentWrapped as validateLocalYamlContent,
  validateSystemYamlContentWrapped as validateSystemYamlContent,
};

if (errors.length) {
  console.error("validate.js: FAIL");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("validate.js: OK");
