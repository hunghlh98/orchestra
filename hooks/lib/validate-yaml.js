// hooks/lib/validate-yaml.js
// Pure YAML content validators for orchestra runtime config files.
// Single source of truth shared by mcp-servers/orchestra-utils.js and
// scripts/lib/validate-schemas.js. No filesystem IO — callers pass the
// raw text and (optionally) an allowlist Set from their own schema-load
// logic; this module just walks the parsed shape.

import { parse as parseYaml } from "./yaml-mini.js";

export const VALID_AUTONOMY_LEVELS = [
  "EXECUTION_ONLY", "JOINT_PROCESSING", "OPTION_SYNTHESIS",
  "DRAFT_AND_GATE", "FULL_AUTONOMY",
];
export const VALID_RUN_PLAN_STATUS = ["drafted", "approved", "revision_requested"];
export const VALID_WORKSPACE_KINDS = ["single-repo", "multi-repo"];

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
