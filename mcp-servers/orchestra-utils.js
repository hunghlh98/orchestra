#!/usr/bin/env node
// mcp-servers/orchestra-utils.js
// MCP server: orchestra utilities. Eight tools.
//
//   tree                          read-only directory listing
//   write_system_yaml             closed-allowlist write to <ctx>/.orchestra/system.yaml
//   upsert_local_yaml             closed-allowlist create+patch to <ctx>/.orchestra/<svc>/local.yaml
//   upsert_features_yaml          closed-allowlist upsert to <ctx>/.orchestra/<svc>/features.yaml with DAG enforcement
//   claude_md                     idempotent splice of orchestra section into <ctx>/CLAUDE.md
//   docs_readme                   idempotent author of <ctx>/docs/README.md provenance marker
//   amend_locked_artifact         flip locked → revision_requested; append `unlocked` changelog row (Path-A)
//   relock_artifact               flip revision_requested → locked; append `re-locked` changelog row (Path-A)
//
// Intentional pre-write-check bypass: pre-write-check.js is registered only on
// Write|Edit|MultiEdit matchers (hooks/hooks.json). MCP tools/call events fire
// the mcp__orchestra-utils__* matcher group instead. The bypass is correct —
// .orchestra/** files are outside src/** (Gate-D chain-cite scan) and docs/**
// (Gate-D-inverse portability scan), schema validation on closed allowlists is
// stricter than the hook's regex set, and the CLAUDE.md splice body is a
// vendored template, not untrusted user input.
//
// yaml-mini caveat: hooks/lib/yaml-mini.js strips comments on parse. Consumer
// hand-edited comments inside .orchestra/<svc>/local.yaml are lost on first
// upsert. Same behavior as the prior free-form Write pattern.

import { readdirSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { resolve, relative, basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parse as parseYaml, serialize as serializeYaml } from "../hooks/lib/yaml-mini.js";
import { safeRead, safeWrite } from "../hooks/lib/safe-fs.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PLUGIN_ROOT = resolve(__dirname, "..");
const TEMPLATE_PATH = join(PLUGIN_ROOT, "hooks", "references", "consumer-claude-md.template.md");
const DOCS_README_TEMPLATE_PATH = join(PLUGIN_ROOT, "hooks", "references", "docs-readme.template.md");

const DOCS_README_FRONTMATTER = [
  "---",
  "id: docs-readme",
  "type: README",
  "generated_by: orchestra",
  "status: locked",
  "---",
  "",
].join("\n");

const CLAUDE_MD_START = "<!-- orchestra:start -->";
const CLAUDE_MD_END = "<!-- orchestra:end -->";

const RESERVED_SERVICE_NAMES = new Set(["system", "metrics", "inventory"]);

const LOCAL_FIELDS = [
  "service_name", "source_path", "scope_level", "auto_mode", "run_plan_status",
  "status", "primary_language", "framework", "primary_database", "migration_tool",
  "spawn_mode", "autonomy",
];

const ALLOWED_WRITE_SYSTEM_ARGS = new Set(["context_path", "workspace_kind", "status"]);
const ALLOWED_UPSERT_LOCAL_ARGS = new Set(["context_path", ...LOCAL_FIELDS]);
const ALLOWED_UPSERT_FEATURES_ARGS = new Set(["context_path", "service_name", "feature"]);
const ALLOWED_AMEND_ARGS = new Set(["context_path", "target_path", "revision_notes"]);
const ALLOWED_RELOCK_ARGS = new Set(["context_path", "target_path", "amendment_summary"]);

const FEATURE_ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*-[0-9]{3}-[a-z0-9]+(-[a-z0-9]+)*$/;
const VALID_FEATURE_STATUSES = ["active", "deprecated"];
const VALID_ARTIFACTS = ["PRD", "FRS", "TDD", "openapi", "asyncapi", "TSR"];
const FEATURE_FIELDS = new Set(["id", "status", "depends_on", "supersedes", "artifacts"]);

function rejectUnknownArgs(args, allowed, toolName) {
  for (const k of Object.keys(args)) {
    if (!allowed.has(k)) {
      throw new Error(`${toolName}: unknown field '${k}' (not in tool's inputSchema allowlist)`);
    }
  }
}

// === Schema validators (inline; mirror scripts/validate.js:224-272) ===
// Inline rather than imported because validate.js has a top-level main-walk
// + stdout report that runs on import and would pollute this MCP server's
// stdout (JSON-RPC channel). The schemas are the single source of truth;
// both this file and scripts/validate.js project them identically and CI
// would catch drift via the existing mutation suite at validate.js:741-900.

const VALID_AUTONOMY_LEVELS = [
  "EXECUTION_ONLY", "JOINT_PROCESSING", "OPTION_SYNTHESIS",
  "DRAFT_AND_GATE", "FULL_AUTONOMY",
];
const VALID_RUN_PLAN_STATUS = ["drafted", "approved", "revision_requested"];
const VALID_WORKSPACE_KINDS = ["single-repo", "multi-repo"];

function loadAllowlist(schemaRelPath) {
  try {
    const schema = JSON.parse(readFileSync(join(PLUGIN_ROOT, schemaRelPath), "utf8"));
    return new Set(Object.keys(schema.properties || {}).filter(k => k !== "$schema"));
  } catch {
    return new Set();
  }
}

const LOCAL_ALLOWLIST = loadAllowlist("schemas/local.schema.json");
const SYSTEM_ALLOWLIST = loadAllowlist("schemas/system.schema.json");

function validateLocalYamlContent(relPath, raw) {
  const errs = [];
  let parsed;
  try { parsed = parseYaml(raw); }
  catch (e) { errs.push(`${relPath}: parse error: ${e.message}`); return errs; }
  if (!parsed || typeof parsed !== "object") return errs;
  if (LOCAL_ALLOWLIST.size > 0) {
    for (const k of Object.keys(parsed)) {
      if (!LOCAL_ALLOWLIST.has(k)) {
        errs.push(`${relPath}: unknown top-level field '${k}' (not in schemas/local.schema.json allowlist)`);
      }
    }
  }
  if (parsed.autonomy && parsed.autonomy.level &&
      !VALID_AUTONOMY_LEVELS.includes(parsed.autonomy.level)) {
    errs.push(`${relPath}: autonomy.level '${parsed.autonomy.level}' not in ${VALID_AUTONOMY_LEVELS.join("|")}`);
  }
  if (parsed.run_plan_status !== undefined && !VALID_RUN_PLAN_STATUS.includes(parsed.run_plan_status)) {
    errs.push(`${relPath}: run_plan_status '${parsed.run_plan_status}' not in ${VALID_RUN_PLAN_STATUS.join("|")}`);
  }
  if (parsed.auto_mode === true && parsed.run_plan_status !== "approved") {
    errs.push(`${relPath}: auto_mode:true requires run_plan_status:approved (got ${JSON.stringify(parsed.run_plan_status)})`);
  }
  return errs;
}

function validateFeatureShape(f) {
  // yaml-mini drops empty arrays as null on serialize; tolerate null as empty for depends_on / supersedes.
  const errs = [];
  if (!f || typeof f !== "object" || Array.isArray(f)) { errs.push("feature must be an object"); return errs; }
  for (const k of Object.keys(f)) {
    if (!FEATURE_FIELDS.has(k)) errs.push(`unknown field '${k}'`);
  }
  if (typeof f.id !== "string" || !FEATURE_ID_PATTERN.test(f.id)) {
    errs.push(`id '${f.id}' does not match pattern ^<service>-<NNN>-<slug>$`);
  }
  if (!VALID_FEATURE_STATUSES.includes(f.status)) {
    errs.push(`status '${f.status}' not in ${VALID_FEATURE_STATUSES.join("|")}`);
  }
  if (f.depends_on === null) {
    // round-trip artifact: ok
  } else if (!Array.isArray(f.depends_on)) {
    errs.push("depends_on must be an array");
  } else {
    for (const id of f.depends_on) {
      if (typeof id !== "string" || !FEATURE_ID_PATTERN.test(id)) errs.push(`depends_on contains malformed id '${id}'`);
    }
  }
  if (f.supersedes !== undefined && f.supersedes !== null) {
    if (!Array.isArray(f.supersedes)) errs.push("supersedes must be an array");
    else for (const id of f.supersedes) {
      if (typeof id !== "string" || !FEATURE_ID_PATTERN.test(id)) errs.push(`supersedes contains malformed id '${id}'`);
    }
  }
  if (!Array.isArray(f.artifacts)) errs.push("artifacts must be an array");
  else for (const a of f.artifacts) {
    if (!VALID_ARTIFACTS.includes(a)) errs.push(`artifacts contains invalid value '${a}' (allowed: ${VALID_ARTIFACTS.join("|")})`);
  }
  return errs;
}

function validateFeaturesFileContent(relPath, raw) {
  const errs = [];
  let parsed;
  try { parsed = parseYaml(raw); }
  catch (e) { errs.push(`${relPath}: parse error: ${e.message}`); return errs; }
  if (!parsed || typeof parsed !== "object") return errs;
  for (const k of Object.keys(parsed)) {
    if (k !== "features") errs.push(`${relPath}: unknown top-level field '${k}'`);
  }
  if (parsed.features === undefined) return errs;
  if (!Array.isArray(parsed.features)) {
    errs.push(`${relPath}: features must be an array`);
    return errs;
  }
  const seen = new Set();
  for (let i = 0; i < parsed.features.length; i++) {
    const f = parsed.features[i];
    const featErrs = validateFeatureShape(f);
    for (const e of featErrs) errs.push(`${relPath}: features[${i}]: ${e}`);
    if (f && typeof f.id === "string") {
      if (seen.has(f.id)) errs.push(`${relPath}: duplicate id '${f.id}'`);
      seen.add(f.id);
    }
  }
  return errs;
}

function detectFeaturesCycle(features) {
  const adj = new Map();
  for (const f of features) adj.set(f.id, Array.isArray(f.depends_on) ? f.depends_on : []);
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map([...adj.keys()].map(k => [k, WHITE]));

  function dfs(node, path) {
    color.set(node, GRAY);
    path.push(node);
    for (const next of adj.get(node) || []) {
      if (!adj.has(next)) continue;
      const c = color.get(next);
      if (c === GRAY) {
        const startIdx = path.indexOf(next);
        return path.slice(startIdx).concat([next]);
      }
      if (c === WHITE) {
        const found = dfs(next, path);
        if (found) return found;
      }
    }
    path.pop();
    color.set(node, BLACK);
    return null;
  }

  for (const node of adj.keys()) {
    if (color.get(node) === WHITE) {
      const found = dfs(node, []);
      if (found) return found;
    }
  }
  return null;
}

function validateSystemYamlContent(relPath, raw) {
  const errs = [];
  let parsed;
  try { parsed = parseYaml(raw); }
  catch (e) { errs.push(`${relPath}: parse error: ${e.message}`); return errs; }
  if (!parsed || typeof parsed !== "object") return errs;
  if (SYSTEM_ALLOWLIST.size > 0) {
    for (const k of Object.keys(parsed)) {
      if (!SYSTEM_ALLOWLIST.has(k)) {
        errs.push(`${relPath}: unknown top-level field '${k}' (not in schemas/system.schema.json allowlist)`);
      }
    }
  }
  if (parsed.workspace_kind !== undefined && !VALID_WORKSPACE_KINDS.includes(parsed.workspace_kind)) {
    errs.push(`${relPath}: workspace_kind '${parsed.workspace_kind}' not in ${VALID_WORKSPACE_KINDS.join("|")}`);
  }
  return errs;
}

// === Tool schemas ===

export const TOOLS = [
  {
    name: "tree",
    description: "Recursively list directory contents in a tree-like format. Wraps a stdlib fs walker as a named, trackable MCP tool so exploration is auditable.",
    inputSchema: {
      type: "object",
      required: ["path"],
      properties: {
        path: { type: "string", description: "Directory to walk (relative to cwd; '..' escape rejected)." },
        depth: { type: "integer", default: 3, minimum: 1, maximum: 8 },
        ignore_globs: {
          type: "array",
          items: { type: "string" },
          default: ["node_modules", ".git", ".venv"],
        },
      },
    },
  },
  {
    name: "write_system_yaml",
    description: "Create or overwrite <context_path>/.orchestra/system.yaml against the closed allowlist in schemas/system.schema.json. Rejects unknown fields and invalid enum values server-side.",
    inputSchema: {
      type: "object",
      required: ["context_path", "workspace_kind"],
      additionalProperties: false,
      properties: {
        context_path: { type: "string", minLength: 1, description: "Directory under cwd (or '.' for cwd). '..' escape rejected." },
        workspace_kind: { enum: ["single-repo", "multi-repo"] },
        status: { enum: ["draft", "locked"] },
      },
    },
  },
  {
    name: "upsert_local_yaml",
    description: "Create or deep-merge into <context_path>/.orchestra/<service_name>/local.yaml against the closed allowlist in schemas/local.schema.json. workspace_kind is intentionally NOT accepted — it lives in system.yaml. autonomy is recursively merged (incoming.level preserves existing resolved_by and vice versa).",
    inputSchema: {
      type: "object",
      required: ["context_path", "service_name"],
      additionalProperties: false,
      properties: {
        context_path: { type: "string", minLength: 1 },
        service_name: { type: "string", minLength: 1 },
        source_path: { type: "string", minLength: 1 },
        scope_level: { enum: ["system-wide", "per-service"] },
        auto_mode: { type: "boolean" },
        run_plan_status: { enum: ["drafted", "approved", "revision_requested"] },
        status: { enum: ["draft", "locked"] },
        primary_language: { type: "string", minLength: 1 },
        framework: { type: "string", minLength: 1 },
        primary_database: { type: "string", minLength: 1 },
        migration_tool: { enum: ["flyway", "liquibase", "none"] },
        spawn_mode: { enum: ["subagent", "teams"] },
        autonomy: {
          type: "object",
          additionalProperties: false,
          properties: {
            level: { enum: ["EXECUTION_ONLY", "JOINT_PROCESSING", "OPTION_SYNTHESIS", "DRAFT_AND_GATE", "FULL_AUTONOMY"] },
            resolved_by: { enum: ["cli_flag", "local_yaml", "diagnostic", "default"] },
          },
        },
      },
    },
  },
  {
    name: "upsert_features_yaml",
    description: "Insert or update one feature entry in <context_path>/.orchestra/<service_name>/features.yaml against the closed allowlist in schemas/features.schema.json. Enforces DAG acyclicity, edge existence, self-edge prohibition, and id uniqueness imperatively. Append-only graph — features never deleted; status transitions are user-controlled.",
    inputSchema: {
      type: "object",
      required: ["context_path", "service_name", "feature"],
      additionalProperties: false,
      properties: {
        context_path: { type: "string", minLength: 1 },
        service_name: { type: "string", minLength: 1 },
        feature: {
          type: "object",
          additionalProperties: false,
          required: ["id", "status", "depends_on", "artifacts"],
          properties: {
            id:         { type: "string", pattern: "^[a-z0-9]+(-[a-z0-9]+)*-[0-9]{3}-[a-z0-9]+(-[a-z0-9]+)*$" },
            status:     { enum: ["active", "deprecated"] },
            depends_on: { type: "array", items: { type: "string", pattern: "^[a-z0-9]+(-[a-z0-9]+)*-[0-9]{3}-[a-z0-9]+(-[a-z0-9]+)*$" } },
            supersedes: { type: "array", items: { type: "string", pattern: "^[a-z0-9]+(-[a-z0-9]+)*-[0-9]{3}-[a-z0-9]+(-[a-z0-9]+)*$" } },
            artifacts:  { type: "array", items: { enum: ["PRD", "FRS", "TDD", "openapi", "asyncapi", "TSR"] } },
          },
        },
      },
    },
  },
  {
    name: "claude_md",
    description: "Idempotently splice the <!-- orchestra:start --> ... <!-- orchestra:end --> section into <context_path>/CLAUDE.md. Body comes from hooks/references/consumer-claude-md.template.md. Refuses on symlinked target.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        context_path: { type: "string", minLength: 1, description: "Defaults to cwd when omitted." },
      },
    },
  },
  {
    name: "docs_readme",
    description: "Idempotently author <context_path>/docs/README.md provenance marker. Frontmatter is pinned (id: docs-readme, type: README, generated_by: orchestra, status: locked); body comes from hooks/references/docs-readme.template.md. Skips when an existing file already carries generated_by: orchestra. Refuses on symlinked target.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        context_path: { type: "string", minLength: 1, description: "Defaults to cwd when omitted." },
      },
    },
  },
  {
    name: "amend_locked_artifact",
    description: "Path-A: unlock a docs/**/*.{md,yaml,yml} artifact for verification-phase amendment. Flips frontmatter status:locked → revision_requested AND appends an `unlocked by dispatcher` row to the artifact's mandatory ## Changelog block in the SAME write. Closed allowlist: target_path must be under <context_path>/docs/ and end with .md/.yaml/.yml. Re-spawn the authoring agent with task: path-a-amend; agent emits the `path-a-amend` row; then call relock_artifact.",
    inputSchema: {
      type: "object",
      required: ["context_path", "target_path", "revision_notes"],
      additionalProperties: false,
      properties: {
        context_path: { type: "string", minLength: 1 },
        target_path: { type: "string", minLength: 1, description: "Path relative to context_path, must start with docs/ and end with .md/.yaml/.yml." },
        revision_notes: { type: "string", minLength: 1, description: "Reviewer-facing reason for the unlock; truncated to 100 chars in the changelog row." },
      },
    },
  },
  {
    name: "relock_artifact",
    description: "Path-A: re-lock a docs/**/*.{md,yaml,yml} artifact after architect's path-a-amend write. Verifies last changelog row is `path-a-amend` (sanity check). Flips frontmatter revision_requested → locked AND appends a `re-locked by dispatcher` row in the SAME write. Closed allowlist matches amend_locked_artifact.",
    inputSchema: {
      type: "object",
      required: ["context_path", "target_path", "amendment_summary"],
      additionalProperties: false,
      properties: {
        context_path: { type: "string", minLength: 1 },
        target_path: { type: "string", minLength: 1, description: "Path relative to context_path, must start with docs/ and end with .md/.yaml/.yml." },
        amendment_summary: { type: "string", minLength: 1, description: "One-line summary of what the amendment changed; truncated to 100 chars in the changelog row." },
      },
    },
  },
];

// === Shared helpers ===

function assertSafeContextPath(contextPath) {
  if (typeof contextPath !== "string" || contextPath === "") {
    throw new Error("context_path is required and must be a non-empty string");
  }
  const cwd = process.cwd();
  const resolved = resolve(cwd, contextPath);
  const rel = relative(cwd, resolved);
  if (rel.startsWith("..") || resolved.split("/").includes("..")) {
    throw new Error(`context_path escapes cwd: ${contextPath}`);
  }
  return resolved;
}

function assertSafeServiceName(name) {
  if (typeof name !== "string" || name === "") {
    throw new Error("service_name is required and must be a non-empty string");
  }
  if (/[\/\\\s]/.test(name) || name.includes("..")) {
    throw new Error(`service_name contains forbidden characters: ${JSON.stringify(name)}`);
  }
  if (RESERVED_SERVICE_NAMES.has(name)) {
    throw new Error(`service_name '${name}' is reserved (one of: ${[...RESERVED_SERVICE_NAMES].join(", ")})`);
  }
}

function pickDefined(obj, keys) {
  const out = {};
  for (const k of keys) {
    if (obj[k] !== undefined) out[k] = obj[k];
  }
  return out;
}

// === tree impl ===

export function treeImpl({ path, depth = 3, ignore_globs = ["node_modules", ".git", ".venv"] } = {}) {
  if (typeof path !== "string" || path === "") throw new Error("tree: path is required");
  const cwd = process.cwd();
  const resolved = resolve(cwd, path);
  const rel = relative(cwd, resolved);
  if (rel.startsWith("..") || resolved.split("/").includes("..")) {
    throw new Error(`tree: path escapes cwd: ${path}`);
  }
  const lines = [basename(resolved) + "/"];
  walkTree(resolved, "", depth, new Set(ignore_globs), lines);
  return lines.join("\n");
}

function walkTree(dir, prefix, depth, ignore, lines) {
  if (depth <= 0) return;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); }
  catch { return; }
  const filtered = entries.filter(e => !ignore.has(e.name)).sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  for (let i = 0; i < filtered.length; i++) {
    const entry = filtered[i];
    const isLast = i === filtered.length - 1;
    const branch = isLast ? "└── " : "├── ";
    const subPrefix = isLast ? "    " : "│   ";
    if (entry.isDirectory()) {
      lines.push(prefix + branch + entry.name + "/");
      walkTree(resolve(dir, entry.name), prefix + subPrefix, depth - 1, ignore, lines);
    } else {
      lines.push(prefix + branch + entry.name);
    }
  }
}

// === write_system_yaml impl ===

export function writeSystemYamlImpl(args = {}) {
  rejectUnknownArgs(args, ALLOWED_WRITE_SYSTEM_ARGS, "write_system_yaml");
  const { context_path, workspace_kind, status } = args;
  const resolvedDir = assertSafeContextPath(context_path);
  if (!workspace_kind) throw new Error("workspace_kind is required");

  const body = { workspace_kind, context_path };
  if (status !== undefined) body.status = status;

  const yamlText = serializeYaml(body) + "\n";
  const target = join(resolvedDir, ".orchestra", "system.yaml");
  const relPath = relative(process.cwd(), target) || "system.yaml";

  const errs = validateSystemYamlContent(relPath, yamlText);
  if (errs.length > 0) {
    throw new Error("write_system_yaml: schema validation failed: " + errs.join("; "));
  }

  mkdirSync(dirname(target), { recursive: true });
  safeWrite(target, yamlText);

  return { path: target, mode: "written", fields: Object.keys(body) };
}

// === upsert_local_yaml impl ===

function deepMergeLocal(existing, incoming) {
  const out = { ...existing };
  for (const [k, v] of Object.entries(incoming)) {
    if (
      k === "autonomy" &&
      v && typeof v === "object" && !Array.isArray(v) &&
      existing.autonomy && typeof existing.autonomy === "object" && !Array.isArray(existing.autonomy)
    ) {
      out.autonomy = { ...existing.autonomy, ...v };
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function upsertLocalYamlImpl(args = {}) {
  rejectUnknownArgs(args, ALLOWED_UPSERT_LOCAL_ARGS, "upsert_local_yaml");
  const { context_path, service_name } = args;
  const resolvedDir = assertSafeContextPath(context_path);
  assertSafeServiceName(service_name);

  const target = join(resolvedDir, ".orchestra", service_name, "local.yaml");
  let existing = {};
  let mode = "created";

  if (existsSync(target)) {
    const buf = safeRead(target);
    if (buf === null) {
      throw new Error(`upsert_local_yaml: cannot read ${target} (symlink or non-file)`);
    }
    try {
      const parsed = parseYaml(buf.toString("utf8"));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        existing = parsed;
        mode = "patched";
      }
    } catch (e) {
      throw new Error(
        `upsert_local_yaml: existing ${relative(process.cwd(), target)} is malformed ` +
        `(${e.message}); refusing to overwrite`
      );
    }
  }

  const incoming = pickDefined(args, LOCAL_FIELDS);
  incoming.service_name = service_name;

  const merged = deepMergeLocal(existing, incoming);

  const yamlText = serializeYaml(merged) + "\n";
  const relPath = relative(process.cwd(), target) || "local.yaml";
  const errs = validateLocalYamlContent(relPath, yamlText);
  if (errs.length > 0) {
    throw new Error("upsert_local_yaml: schema validation failed: " + errs.join("; "));
  }

  mkdirSync(dirname(target), { recursive: true });
  safeWrite(target, yamlText);

  return { path: target, mode, fields: Object.keys(merged) };
}

// === upsert_features_yaml impl ===

export function upsertFeaturesYamlImpl(args = {}) {
  rejectUnknownArgs(args, ALLOWED_UPSERT_FEATURES_ARGS, "upsert_features_yaml");
  const { context_path, service_name, feature } = args;
  const resolvedDir = assertSafeContextPath(context_path);
  assertSafeServiceName(service_name);

  const shapeErrs = validateFeatureShape(feature);
  if (shapeErrs.length > 0) {
    throw new Error(`upsert_features_yaml: SCHEMA_VIOLATION: ${shapeErrs.join("; ")}`);
  }

  const target = join(resolvedDir, ".orchestra", service_name, "features.yaml");
  let existing = { features: [] };
  let mode = "created";

  if (existsSync(target)) {
    const buf = safeRead(target);
    if (buf === null) {
      throw new Error(`upsert_features_yaml: cannot read ${target} (symlink or non-file)`);
    }
    const raw = buf.toString("utf8");
    try {
      const parsed = parseYaml(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        existing = parsed;
        mode = "patched";
      }
    } catch (e) {
      throw new Error(
        `upsert_features_yaml: existing ${relative(process.cwd(), target)} is malformed ` +
        `(${e.message}); refusing to overwrite`
      );
    }
    const relPath = relative(process.cwd(), target) || "features.yaml";
    const loadErrs = validateFeaturesFileContent(relPath, raw);
    const dupErrs = loadErrs.filter(e => /duplicate id/.test(e));
    if (dupErrs.length > 0) {
      throw new Error(`upsert_features_yaml: UNIQUENESS_VIOLATION: ${dupErrs.join("; ")}`);
    }
  }

  if (!Array.isArray(existing.features)) existing.features = [];

  const idx = existing.features.findIndex(f => f && f.id === feature.id);
  const featureCopy = pickDefined(feature, ["id", "status", "depends_on", "supersedes", "artifacts"]);
  if (idx >= 0) existing.features[idx] = featureCopy;
  else existing.features.push(featureCopy);

  const allIds = new Set(existing.features.map(f => f.id));
  for (const ref of feature.depends_on) {
    if (!allIds.has(ref)) {
      throw new Error(`upsert_features_yaml: UNKNOWN_REF: depends_on references missing id '${ref}'`);
    }
  }
  for (const ref of (feature.supersedes || [])) {
    if (!allIds.has(ref)) {
      throw new Error(`upsert_features_yaml: UNKNOWN_REF: supersedes references missing id '${ref}'`);
    }
  }
  if (feature.depends_on.includes(feature.id) || (feature.supersedes || []).includes(feature.id)) {
    throw new Error(`upsert_features_yaml: SELF_EDGE: id '${feature.id}' appears in its own depends_on or supersedes`);
  }
  const cycle = detectFeaturesCycle(existing.features);
  if (cycle) {
    throw new Error(`upsert_features_yaml: CYCLE: ${cycle.join(" -> ")}`);
  }

  const warnings = [];
  for (const ref of feature.depends_on) {
    const tgt = existing.features.find(f => f.id === ref);
    if (tgt && tgt.status === "deprecated" && tgt.id !== feature.id) {
      warnings.push(`depends_on references deprecated feature '${ref}'`);
    }
  }

  const yamlText = serializeYaml(existing) + "\n";
  const relPath = relative(process.cwd(), target) || "features.yaml";
  const finalErrs = validateFeaturesFileContent(relPath, yamlText);
  if (finalErrs.length > 0) {
    throw new Error(`upsert_features_yaml: SCHEMA_VIOLATION: ${finalErrs.join("; ")}`);
  }

  try {
    mkdirSync(dirname(target), { recursive: true });
    safeWrite(target, yamlText);
  } catch (e) {
    throw new Error(`upsert_features_yaml: WRITE_FAILED: ${e.message}`);
  }

  const result = { path: target, mode, id: feature.id };
  if (warnings.length > 0) result.warnings = warnings;
  return result;
}

// === claude_md impl ===

function section(body) {
  return `${CLAUDE_MD_START}\n${body.trim()}\n${CLAUDE_MD_END}\n`;
}

function freshClaudeMd(body) {
  return `# CLAUDE.md\n\n${section(body)}`;
}

function spliceClaudeMd(existing, body) {
  const s = existing.indexOf(CLAUDE_MD_START);
  const e = existing.indexOf(CLAUDE_MD_END);
  if (s === -1 || e === -1 || e < s) {
    const sep = existing.endsWith("\n") ? "\n" : "\n\n";
    return existing + sep + section(body);
  }
  const before = existing.slice(0, s);
  let after = existing.slice(e + CLAUDE_MD_END.length);
  if (after.startsWith("\n")) after = after.slice(1);
  return `${before}${section(body)}${after}`;
}

export function claudeMdImpl(args = {}) {
  const context_path = args.context_path || ".";
  const resolvedDir = assertSafeContextPath(context_path);
  const target = join(resolvedDir, "CLAUDE.md");
  const body = readFileSync(TEMPLATE_PATH, "utf8");

  if (!existsSync(target)) {
    safeWrite(target, freshClaudeMd(body));
    return { path: target, action: "created" };
  }

  const buf = safeRead(target);
  if (buf === null) {
    throw new Error(`claude_md: refusing to operate on ${target} (symlink or non-file)`);
  }
  const existing = buf.toString("utf8");
  const next = spliceClaudeMd(existing, body);
  if (next === existing) {
    return { path: target, action: "unchanged" };
  }
  safeWrite(target, next);
  const action = existing.includes(CLAUDE_MD_START) ? "updated" : "appended";
  return { path: target, action };
}

// === docs_readme impl ===

export function docsReadmeImpl(args = {}) {
  const context_path = args.context_path || ".";
  const resolvedDir = assertSafeContextPath(context_path);
  const target = join(resolvedDir, "docs", "README.md");
  const body = readFileSync(DOCS_README_TEMPLATE_PATH, "utf8");
  const content = DOCS_README_FRONTMATTER + body;

  if (existsSync(target)) {
    const buf = safeRead(target);
    if (buf === null) {
      throw new Error(`docs_readme: refusing to operate on ${target} (symlink or non-file)`);
    }
    const existing = buf.toString("utf8");
    if (/^generated_by:\s*orchestra\s*$/m.test(existing)) {
      return { path: target, action: "unchanged" };
    }
    mkdirSync(dirname(target), { recursive: true });
    safeWrite(target, content, 0o644);
    return { path: target, action: "overwritten" };
  }

  mkdirSync(dirname(target), { recursive: true });
  safeWrite(target, content, 0o644);
  return { path: target, action: "created" };
}

// === amend_locked_artifact / relock_artifact helpers (Path-A) ===

function assertSafeArtifactPath(resolvedCtxDir, targetPath) {
  if (typeof targetPath !== "string" || targetPath === "") {
    throw new Error("target_path is required and must be a non-empty string");
  }
  if (targetPath.includes("..")) {
    throw new Error(`target_path contains forbidden '..' segment: ${targetPath}`);
  }
  const resolved = resolve(resolvedCtxDir, targetPath);
  const relFromCtx = relative(resolvedCtxDir, resolved);
  if (relFromCtx.startsWith("..") || resolved.split("/").includes("..")) {
    throw new Error(`target_path escapes context_path: ${targetPath}`);
  }
  if (!relFromCtx.startsWith("docs/") && relFromCtx !== "docs") {
    throw new Error(`target_path must be under docs/: ${targetPath}`);
  }
  if (/(^|\/)(src|services|\.orchestra|node_modules|\.git)\//.test("/" + relFromCtx)) {
    throw new Error(`target_path forbidden directory segment: ${targetPath}`);
  }
  if (!/\.(md|yaml|yml)$/.test(resolved)) {
    throw new Error(`target_path must end with .md, .yaml, or .yml: ${targetPath}`);
  }
  return resolved;
}

function splitFrontmatter(content) {
  const m = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (m) return { kind: "md", frontmatter: m[1], body: m[2] };
  return { kind: "yaml", frontmatter: null, body: content };
}

function rebuildContent(parts, newFrontmatter, newBody) {
  if (parts.kind === "md") return `---\n${newFrontmatter}\n---\n${newBody}`;
  return newBody;
}

function flipFrontmatterStatus(frontmatter, from, to) {
  const re = new RegExp(`^status:\\s*${from}\\s*$`, "m");
  if (!re.test(frontmatter)) {
    throw new Error(`expected frontmatter 'status: ${from}', did not find it`);
  }
  return frontmatter.replace(re, `status: ${to}`);
}

function isoTimestamp() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

function buildChangelogRow(action, author, reason) {
  const trimmed = String(reason || "").replace(/[\r\n]+/g, " ").trim().slice(0, 100);
  return `- ${isoTimestamp()} | ${action} by ${author} | ${trimmed}`;
}

function locateChangelogBlock(body, kind) {
  const lines = body.split("\n");
  const headerRe = kind === "md" ? /^##\s+Changelog\s*$/ : /^#\s+Changelog:\s*$/;
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (headerRe.test(lines[i])) { start = i; break; }
  }
  if (start === -1) return null;
  let end = lines.length;
  for (let j = start + 1; j < lines.length; j++) {
    if (kind === "md") {
      if (/^##\s+/.test(lines[j])) { end = j; break; }
    } else {
      if (!/^#/.test(lines[j]) && lines[j].trim() !== "") { end = j; break; }
    }
  }
  return { start, end, lines };
}

function lastChangelogRow(block, kind) {
  const rowPrefix = kind === "md" ? /^-\s+/ : /^#\s+-\s+/;
  let last = null;
  for (let k = block.start + 1; k < block.end; k++) {
    if (!rowPrefix.test(block.lines[k])) continue;
    const stripped = block.lines[k].replace(rowPrefix, "");
    const m = stripped.match(/^(\S+)\s*\|\s*(\S+)\s+by\s+([^|]+?)\s*\|\s*(.*)$/);
    if (m) last = { ts: m[1], action: m[2], author: m[3], reason: m[4] };
  }
  return last;
}

function appendChangelogRow(body, kind, row) {
  const block = locateChangelogBlock(body, kind);
  if (!block) {
    throw new Error(
      kind === "md"
        ? "missing mandatory `## Changelog` block in artifact body"
        : "missing mandatory `# Changelog:` comment block at top of yaml artifact"
    );
  }
  const formatted = kind === "md" ? row : `# ${row}`;
  let insertAt = block.end;
  for (let k = block.end - 1; k > block.start; k--) {
    if (block.lines[k].trim() !== "") { insertAt = k + 1; break; }
  }
  block.lines.splice(insertAt, 0, formatted);
  return block.lines.join("\n");
}

// === amend_locked_artifact impl ===

export function amendLockedArtifactImpl(args = {}) {
  rejectUnknownArgs(args, ALLOWED_AMEND_ARGS, "amend_locked_artifact");
  const { context_path, target_path, revision_notes } = args;
  if (typeof revision_notes !== "string" || revision_notes.trim() === "") {
    throw new Error("amend_locked_artifact: revision_notes is required and must be a non-empty string");
  }
  const resolvedDir = assertSafeContextPath(context_path);
  const target = assertSafeArtifactPath(resolvedDir, target_path);
  if (!existsSync(target)) {
    throw new Error(`amend_locked_artifact: target does not exist: ${target_path}`);
  }
  const buf = safeRead(target);
  if (buf === null) {
    throw new Error(`amend_locked_artifact: cannot read ${target_path} (symlink or non-file)`);
  }
  const content = buf.toString("utf8");
  const parts = splitFrontmatter(content);
  if (parts.kind === "md") {
    if (!/^status:\s*locked\s*$/m.test(parts.frontmatter)) {
      throw new Error(`amend_locked_artifact: ${target_path} is not status: locked; nothing to amend`);
    }
  } else {
    if (!/^status:\s*locked\s*$/m.test(parts.body)) {
      throw new Error(`amend_locked_artifact: ${target_path} is not status: locked; nothing to amend`);
    }
  }
  const row = buildChangelogRow("unlocked", "dispatcher", revision_notes);
  const newBody = appendChangelogRow(parts.body, parts.kind, row);
  let newFrontmatter = parts.frontmatter;
  let finalBody = newBody;
  if (parts.kind === "md") {
    newFrontmatter = flipFrontmatterStatus(parts.frontmatter, "locked", "revision_requested");
  } else {
    finalBody = flipFrontmatterStatus(newBody, "locked", "revision_requested");
  }
  const next = rebuildContent(parts, newFrontmatter, finalBody);
  safeWrite(target, next, 0o644);
  return {
    path: target,
    new_status: "revision_requested",
    changelog_row_appended: true,
    next_step: "re-spawn authoring agent with task: path-a-amend; agent appends path-a-amend changelog row; then call relock_artifact",
  };
}

// === relock_artifact impl ===

export function relockArtifactImpl(args = {}) {
  rejectUnknownArgs(args, ALLOWED_RELOCK_ARGS, "relock_artifact");
  const { context_path, target_path, amendment_summary } = args;
  if (typeof amendment_summary !== "string" || amendment_summary.trim() === "") {
    throw new Error("relock_artifact: amendment_summary is required and must be a non-empty string");
  }
  const resolvedDir = assertSafeContextPath(context_path);
  const target = assertSafeArtifactPath(resolvedDir, target_path);
  if (!existsSync(target)) {
    throw new Error(`relock_artifact: target does not exist: ${target_path}`);
  }
  const buf = safeRead(target);
  if (buf === null) {
    throw new Error(`relock_artifact: cannot read ${target_path} (symlink or non-file)`);
  }
  const content = buf.toString("utf8");
  const parts = splitFrontmatter(content);
  if (parts.kind === "md") {
    if (!/^status:\s*revision_requested\s*$/m.test(parts.frontmatter)) {
      throw new Error(`relock_artifact: ${target_path} is not status: revision_requested; nothing to re-lock`);
    }
  } else {
    if (!/^status:\s*revision_requested\s*$/m.test(parts.body)) {
      throw new Error(`relock_artifact: ${target_path} is not status: revision_requested; nothing to re-lock`);
    }
  }
  const block = locateChangelogBlock(parts.body, parts.kind);
  const last = block ? lastChangelogRow(block, parts.kind) : null;
  if (!last || last.action !== "path-a-amend") {
    const got = last ? last.action : "<missing>";
    throw new Error(
      `relock_artifact: ${target_path} last changelog row action='${got}', expected 'path-a-amend' ` +
      `(the authoring agent must append the path-a-amend row before dispatcher re-locks)`
    );
  }
  const row = buildChangelogRow("re-locked", "dispatcher", amendment_summary);
  const newBody = appendChangelogRow(parts.body, parts.kind, row);
  let newFrontmatter = parts.frontmatter;
  let finalBody = newBody;
  if (parts.kind === "md") {
    newFrontmatter = flipFrontmatterStatus(parts.frontmatter, "revision_requested", "locked");
  } else {
    finalBody = flipFrontmatterStatus(newBody, "revision_requested", "locked");
  }
  const next = rebuildContent(parts, newFrontmatter, finalBody);
  safeWrite(target, next, 0o644);
  return {
    path: target,
    new_status: "locked",
    changelog_row_appended: true,
  };
}

// === MCP server (run only when this file is the entry point) ===

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  startServer();
}

function startServer() {
  if (process.env.ORCHESTRA_MCP_ORCHESTRA_UTILS === "off") {
    process.exit(0);
  }
  let buf = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", chunk => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (line) handleMessage(line);
    }
  });
}

function handleMessage(line) {
  let msg;
  try { msg = JSON.parse(line); }
  catch { return reply(null, { error: { code: -32700, message: "Parse error" } }); }
  const { id, method, params } = msg;
  if (method === "initialize") {
    reply(id, {
      result: {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "orchestra-utils", version: "1.0.0" },
      },
    });
  } else if (method === "tools/list") {
    reply(id, { result: { tools: TOOLS } });
  } else if (method === "tools/call") {
    try {
      const name = params?.name;
      const args = params?.arguments || {};
      let out;
      if (name === "tree") out = treeImpl(args);
      else if (name === "write_system_yaml") out = writeSystemYamlImpl(args);
      else if (name === "upsert_local_yaml") out = upsertLocalYamlImpl(args);
      else if (name === "upsert_features_yaml") out = upsertFeaturesYamlImpl(args);
      else if (name === "claude_md") out = claudeMdImpl(args);
      else if (name === "docs_readme") out = docsReadmeImpl(args);
      else if (name === "amend_locked_artifact") out = amendLockedArtifactImpl(args);
      else if (name === "relock_artifact") out = relockArtifactImpl(args);
      else throw new Error(`Unknown tool: ${name}`);
      const text = typeof out === "string" ? out : JSON.stringify(out);
      reply(id, { result: { content: [{ type: "text", text }] } });
    } catch (err) {
      reply(id, { result: { isError: true, content: [{ type: "text", text: String(err.message || err) }] } });
    }
  } else if (method === "notifications/initialized") {
    // no-op
  } else {
    reply(id, { error: { code: -32601, message: `Method not found: ${method}` } });
  }
}

function reply(id, payload) {
  const msg = { jsonrpc: "2.0", id, ...payload };
  process.stdout.write(JSON.stringify(msg) + "\n");
}
