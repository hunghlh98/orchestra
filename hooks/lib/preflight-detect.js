// hooks/lib/preflight-detect.js
// Detection helpers + block builder for orchestra-preflight hook.
// One exported function (buildPreflightBlock) returns the YAML block string;
// the rest are detection primitives kept module-private for clarity.
//
// Output shape consumed by commands/orchestra.md dispatcher:
//   <orchestra-preflight>
//     mode: greenfield | brownfield
//     workspace_kind: single-repo | multi-repo | null
//     service_name: <string> | null
//     scope_level: system-wide | per-service | null
//     cached_fields:
//       autonomy.level / spawn_mode / primary_language / framework / source_path
//       primary_database / migration_tool
//     missing_fields: [<field>, ...]
//     docs_provenance: orchestra-generated | unknown
//   </orchestra-preflight>

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "./yaml-mini.js";

export function buildPreflightBlock(cwd, sourceFromPrompt, perServiceFromPrompt) {
  const mode = detectMode(cwd);
  const systemYaml = loadYaml(join(cwd, ".orchestra/system.yaml"));
  const serviceName = systemYaml?.context_path
    ? lastSegment(systemYaml.context_path)
    : detectFirstLocalServiceName(cwd);
  const localYaml = serviceName
    ? loadYaml(join(cwd, ".orchestra", serviceName, "local.yaml"))
    : null;

  const workspaceKind = systemYaml?.workspace_kind || detectWorkspaceKind(cwd);
  const scopeLevel = localYaml?.scope_level || deriveScopeLevel(workspaceKind);

  const cached = {
    "autonomy.level": localYaml?.autonomy?.level || null,
    "spawn_mode": localYaml?.spawn_mode || null,
    "primary_language": localYaml?.primary_language || null,
    "framework": localYaml?.framework || null,
    "source_path": sourceFromPrompt || localYaml?.source_path || null,
    "primary_database": localYaml?.primary_database || null,
    "migration_tool": localYaml?.migration_tool || null,
  };

  const missing = detectMissingFields({
    mode, workspaceKind, serviceName, scopeLevel, cached, perServiceFromPrompt,
  });
  const docsProvenance = detectDocsProvenance(cwd) ? "orchestra-generated" : "unknown";

  return renderBlock({ mode, workspaceKind, serviceName, scopeLevel, cached, missing, docsProvenance });
}

export function parseSourceFlag(prompt) {
  const m = prompt.match(/--source=(\S+)/);
  return m ? m[1].replace(/^@/, "") : null;
}

// Blank cwd → greenfield. .git/.claude/.DS_Store/node_modules don't count
// as user content.
function detectMode(cwd) {
  const IGNORE = new Set([".git", ".claude", ".DS_Store", "node_modules"]);
  try {
    for (const e of readdirSync(cwd)) {
      if (e.startsWith(".")) continue;
      if (IGNORE.has(e)) continue;
      return "brownfield";
    }
  } catch { return "greenfield"; }
  return "greenfield";
}

function detectWorkspaceKind(cwd) {
  const ROOT_MANIFESTS = ["package.json", "pom.xml", "go.mod", "Cargo.toml", "build.gradle", "build.gradle.kts"];
  let rootCount = 0;
  let subdirHits = 0;
  try {
    const entries = readdirSync(cwd);
    for (const e of entries) {
      if (ROOT_MANIFESTS.includes(e)) rootCount += 1;
    }
    if (rootCount >= 1) return "single-repo";
    for (const e of entries) {
      if (e.startsWith(".")) continue;
      const sub = join(cwd, e);
      try {
        if (!statSync(sub).isDirectory()) continue;
        for (const inner of readdirSync(sub)) {
          if (ROOT_MANIFESTS.includes(inner)) { subdirHits += 1; break; }
        }
      } catch {}
      if (subdirHits >= 2) return "multi-repo";
    }
  } catch { return null; }
  return null;
}

function deriveScopeLevel(workspaceKind) {
  return workspaceKind === "single-repo" ? "per-service" : null;
}

function detectDocsProvenance(cwd) {
  const readme = join(cwd, "docs", "README.md");
  if (!existsSync(readme)) return false;
  try {
    const text = readFileSync(readme, "utf8");
    const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (!m) return false;
    const fm = safeParse(m[1]);
    return fm?.generated_by === "orchestra";
  } catch { return false; }
}

function detectFirstLocalServiceName(cwd) {
  const root = join(cwd, ".orchestra");
  if (!existsSync(root)) return null;
  try {
    for (const e of readdirSync(root)) {
      if (e.startsWith(".")) continue;
      const cand = join(root, e, "local.yaml");
      if (existsSync(cand)) return e;
    }
  } catch {}
  return null;
}

function detectMissingFields({ mode, workspaceKind, serviceName, scopeLevel, cached, perServiceFromPrompt }) {
  const missing = [];
  if (!workspaceKind) missing.push("workspace_kind");
  if (!serviceName) missing.push("service_name");
  if (workspaceKind === "multi-repo" && !scopeLevel) missing.push("scope_level");
  if (!cached["autonomy.level"]) missing.push("autonomy.level");
  if (!cached["spawn_mode"]) missing.push("spawn_mode");
  if (mode === "greenfield") {
    if (!cached["primary_language"]) missing.push("primary_language");
    if (!cached["framework"]) missing.push("framework");
    if (!cached["migration_tool"]) missing.push("migration_tool");
    if (!cached["primary_database"] && cached["migration_tool"] !== "none") {
      missing.push("primary_database");
    }
  }
  const perServiceScope = scopeLevel === "per-service" || perServiceFromPrompt;
  if (mode === "brownfield" && perServiceScope && !cached["source_path"]) {
    missing.push("source_path");
  }
  return missing;
}

function renderBlock(s) {
  return [
    "<orchestra-preflight>",
    `  mode: ${s.mode}`,
    `  workspace_kind: ${s.workspaceKind || "null"}`,
    `  service_name: ${s.serviceName || "null"}`,
    `  scope_level: ${s.scopeLevel || "null"}`,
    `  cached_fields:`,
    `    autonomy.level: ${s.cached["autonomy.level"] || "null"}`,
    `    spawn_mode: ${s.cached["spawn_mode"] || "null"}`,
    `    primary_language: ${s.cached["primary_language"] || "null"}`,
    `    framework: ${s.cached["framework"] || "null"}`,
    `    source_path: ${s.cached["source_path"] || "null"}`,
    `    primary_database: ${s.cached["primary_database"] || "null"}`,
    `    migration_tool: ${s.cached["migration_tool"] || "null"}`,
    `  missing_fields: [${s.missing.join(", ")}]`,
    `  docs_provenance: ${s.docsProvenance}`,
    "</orchestra-preflight>",
    "",
  ].join("\n");
}

function loadYaml(path) {
  if (!existsSync(path)) return null;
  try { return safeParse(readFileSync(path, "utf8")); } catch { return null; }
}

function safeParse(text) {
  try { return parseYaml(text); } catch { return null; }
}

function lastSegment(p) {
  const parts = p.split("/").filter(Boolean);
  return parts[parts.length - 1] || null;
}
