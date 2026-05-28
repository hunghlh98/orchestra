// hooks/lib/gate-graph.js
// Pure gate matcher. Lock-time completeness + staleness check for openapi
// against a persisted Java code-graph baseline.
//
// graph-backing-reject — fires when status: locked openapi diverges from the
// graph at .orchestra/<service>/code-graph/graph.json. Two failure modes:
//   1. staleness — meta.commit != HEAD
//   2. completeness — graph endpoint absent from artifact AND not declared
//      in frontmatter `inferred_paths:`
//
// `inferred_paths` entries accept either "METHOD /route" (excludes one
// operation) or bare "/route" (excludes ALL methods on that route — e.g.
// `/internal/health` rarely needs per-verb granularity). Lax-by-design.
//
// TDD scope: not covered. TDD has no enumerated component list in its
// schema (only narrative body + service_singletons_touched array); a
// graph<->TDD completeness check would require introducing C-N component
// tagging discipline first, which is out of scope for this gate.
//
// Skips silently when:
//   - artifact not an openapi file
//   - frontmatter does not declare status: locked
//   - graph baseline absent (greenfield, non-Java service)
//   - git unavailable or workspace not a repo
//   - any internal error (defense-in-depth; pre-write-check is not the
//     single line of defense)

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { parse as parseYaml } from "./yaml-mini.js";

const OPENAPI_FILE_RE = /(^|\/)docs\/.+\/[^/]+-openapi\.yaml$/;
const HTTP_METHOD_RE = /^(\s+)(get|post|put|patch|delete|options|head|trace):\s*$/;
const ORCHESTRA_BLOCK_RE = /^#\s*orchestra:\s*\r?\n((?:#[^\n]*\r?\n)+)/;
const GIT_TIMEOUT_MS = 2000;

export function checkGraphBacking(filePath, content, cwd) {
  if (!filePath) return null;
  if (!OPENAPI_FILE_RE.test(filePath)) return null;

  const frontmatter = parseOrchestraBlock(content);
  const status = typeof frontmatter?.status === "string" ? frontmatter.status.toLowerCase() : null;
  if (status !== "locked") return null;

  const workspaceRoot = workspaceRootFromFilePath(filePath, cwd);
  if (!workspaceRoot) return null;
  const serviceName = serviceNameFromOpenapiPath(filePath, workspaceRoot);
  if (!serviceName) return null;

  const graphDir = join(workspaceRoot, ".orchestra", serviceName, "code-graph");
  const graphPath = join(graphDir, "graph.json");
  const metaPath = join(graphDir, "meta.json");
  if (!existsSync(graphPath)) return null;

  const meta = safeReadJson(metaPath);
  const head = gitHead(workspaceRoot);
  if (meta && head && meta.commit && meta.commit !== head) {
    return {
      gate: "graph-backing-reject",
      message:
        `pre-write-check: graph-backing-reject — locking ${filePath} blocked: ` +
        `code-graph baseline at .orchestra/${serviceName}/code-graph/ was built at commit ` +
        `${meta.commit.slice(0, 8)} but HEAD is ${head.slice(0, 8)}. ` +
        `Refresh the graph (re-run /orchestra code-to-spec or classify-graph-diff.mjs) before locking, ` +
        `or pass ORCHESTRA_HOOK_PRE_WRITE_CHECK=off if you accept the drift.\n`,
    };
  }

  const graph = safeReadJson(graphPath);
  if (!graph || !Array.isArray(graph.nodes)) return null;

  const graphEndpoints = collectGraphEndpoints(graph);
  if (graphEndpoints.length === 0) return null;

  const artifactPaths = extractOpenapiOperations(content);
  const inferred = inferredPathsFromFrontmatter(frontmatter);

  const missing = [];
  for (const ep of graphEndpoints) {
    const key = `${ep.method} ${ep.route}`;
    if (artifactPaths.has(key)) continue;
    if (inferred.has(key) || inferred.has(ep.route)) continue;
    missing.push(ep);
  }
  if (missing.length === 0) return null;

  const sample = missing.slice(0, 3).map((m) => `${m.method} ${m.route}`).join(", ");
  const more = missing.length > 3 ? ` (+${missing.length - 3} more)` : "";
  return {
    gate: "graph-backing-reject",
    message:
      `pre-write-check: graph-backing-reject — locking ${filePath} blocked: ` +
      `${missing.length} endpoint(s) present in code-graph baseline but absent from artifact: ` +
      `${sample}${more}. ` +
      `Either add the operation(s) to paths: OR declare them in frontmatter \`inferred_paths:\` ` +
      `(routes deliberately omitted from the locked surface, e.g. internal-only endpoints). ` +
      `Override via ORCHESTRA_HOOK_PRE_WRITE_CHECK=off.\n`,
  };
}

function parseOrchestraBlock(content) {
  const m = content.match(ORCHESTRA_BLOCK_RE);
  if (!m) return null;
  const stripped = m[1]
    .split(/\r?\n/)
    .map((l) => l.replace(/^#\s?/, ""))
    .join("\n");
  try { return parseYaml(stripped); } catch { return null; }
}

function safeReadJson(path) {
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}

function gitHead(cwd) {
  try {
    const r = spawnSync("git", ["-C", cwd, "rev-parse", "HEAD"], {
      encoding: "utf8", timeout: GIT_TIMEOUT_MS,
    });
    if (r.status === 0) return r.stdout.trim();
  } catch { /* git missing or timed out */ }
  return null;
}

function workspaceRootFromFilePath(filePath, cwd) {
  // fail-closed: when /docs/ is missing or root-anchored, return null and let
  // caller skip the gate rather than guess a workspace from cwd.
  const idx = filePath.lastIndexOf("/docs/");
  if (idx > 0) return filePath.slice(0, idx);
  return cwd || null;
}

function serviceNameFromOpenapiPath(filePath, workspaceRoot) {
  // Service is the first segment under the workspace's own docs/. Resolving
  // against workspaceRoot (rather than first-/docs/-match) handles nested
  // workspaces like /home/user/docs/orchestra/docs/order/... correctly.
  const prefix = `${workspaceRoot}/docs/`;
  if (filePath.startsWith(prefix)) {
    const rest = filePath.slice(prefix.length);
    const slash = rest.indexOf("/");
    return slash > 0 ? rest.slice(0, slash) : null;
  }
  // Fallback for relative paths (filePath does not include workspaceRoot prefix).
  const m = filePath.match(/(?:^|\/)docs\/([^/]+)\//);
  return m ? m[1] : null;
}

function collectGraphEndpoints(graph) {
  const out = [];
  for (const n of graph.nodes) {
    if (n.kind !== "endpoint") continue;
    if (!n.httpMethod || !n.route) continue;
    out.push({ method: n.httpMethod.toUpperCase(), route: n.route });
  }
  return out;
}

function extractOpenapiOperations(content) {
  const lines = content.split(/\r?\n/);
  const ops = new Set();
  let inPaths = false;
  let currentPath = null;
  let currentPathIndent = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^paths:\s*$/.test(line)) { inPaths = true; continue; }
    if (!inPaths) continue;
    if (/^\S/.test(line)) { inPaths = false; continue; }
    const pm = line.match(/^(\s+)(\/[^\s:]*):\s*$/);
    if (pm) {
      currentPathIndent = pm[1].length;
      currentPath = pm[2];
      continue;
    }
    const mm = line.match(HTTP_METHOD_RE);
    if (mm && currentPath && mm[1].length > currentPathIndent) {
      ops.add(`${mm[2].toUpperCase()} ${currentPath}`);
    }
  }
  return ops;
}

function inferredPathsFromFrontmatter(frontmatter) {
  const set = new Set();
  if (!frontmatter || !Array.isArray(frontmatter.inferred_paths)) return set;
  for (const entry of frontmatter.inferred_paths) {
    if (typeof entry === "string") set.add(entry.trim());
  }
  return set;
}
