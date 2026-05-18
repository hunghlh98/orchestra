#!/usr/bin/env node
// scripts/mcp-servers/orchestra-utils.js
// MCP server: orchestra utilities. Five tools.
//
//   tree                          read-only directory listing
//   write_system_yaml             closed-allowlist write to <ctx>/.orchestra/system.yaml
//   upsert_local_yaml             closed-allowlist create+patch to <ctx>/.orchestra/<svc>/local.yaml
//   claude_md                     idempotent splice of orchestra section into <ctx>/CLAUDE.md
//   docs_readme                   idempotent author of <ctx>/docs/README.md provenance marker
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

import { parse as parseYaml, serialize as serializeYaml } from "../../hooks/lib/yaml-mini.js";
import { safeRead, safeWrite } from "../../hooks/lib/safe-fs.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PLUGIN_ROOT = resolve(__dirname, "..", "..");
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
    safeWrite(target, content);
    return { path: target, action: "overwritten" };
  }

  mkdirSync(dirname(target), { recursive: true });
  safeWrite(target, content);
  return { path: target, action: "created" };
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
      else if (name === "claude_md") out = claudeMdImpl(args);
      else if (name === "docs_readme") out = docsReadmeImpl(args);
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
