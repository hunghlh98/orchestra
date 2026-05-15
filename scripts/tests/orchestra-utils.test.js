#!/usr/bin/env node
// scripts/tests/orchestra-utils.test.js
// orchestra-utils MCP contract tests:
//   tree path-escape + walker output
//   write_system_yaml schema gates
//   upsert_local_yaml create + patch + deep-merge + cross-field invariants
//   claude_md create / append / splice / no-op / symlink reject
//   MCP JSON-RPC smoke (initialize, tools/list, unknown tool)
//   env-var opt-out (ORCHESTRA_MCP_ORCHESTRA_UTILS=off)

import {
  mkdtempSync, writeFileSync, readFileSync, rmSync, symlinkSync, existsSync, mkdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import {
  treeImpl,
  writeSystemYamlImpl,
  upsertLocalYamlImpl,
  claudeMdImpl,
  TOOLS,
} from "../mcp-servers/orchestra-utils.js";
import { parse as parseYaml } from "../../hooks/lib/yaml-mini.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
let passes = 0, failures = 0;

function check(cond, msg) {
  if (cond) passes++;
  else { failures++; console.error(`  FAIL: ${msg}`); }
}

function withTmp(fn) {
  const tmp = mkdtempSync(join(tmpdir(), "orchestra-utils-"));
  const origCwd = process.cwd();
  process.chdir(tmp);
  try { return fn(tmp); }
  finally {
    process.chdir(origCwd);
    rmSync(tmp, { recursive: true, force: true });
  }
}

// ---------- tree ----------
console.log("tree:");
{
  let escaped = false;
  try { treeImpl({ path: "../etc" }); }
  catch (e) { escaped = /escapes cwd/.test(e.message); }
  check(escaped, "tree: '..' escape rejected");

  process.chdir(root);
  const out = treeImpl({ path: "scripts", depth: 1 });
  check(typeof out === "string" && out.length > 0, "tree('scripts', depth=1) returns text");
  check(out.includes("validate.js"), "tree('scripts') includes validate.js");
}

// ---------- write_system_yaml ----------
console.log("write_system_yaml:");
withTmp(tmp => {
  const out = writeSystemYamlImpl({ context_path: ".", workspace_kind: "single-repo" });
  check(out.mode === "written", `mode='written' (got ${out.mode})`);
  const body = readFileSync(join(tmp, ".orchestra", "system.yaml"), "utf8");
  check(/workspace_kind: single-repo/.test(body), `body contains workspace_kind`);
  check(/context_path: \./.test(body), `body contains context_path`);
  check(!/status:/.test(body), `unset status omitted from body`);

  let rejected = false;
  try { writeSystemYamlImpl({ context_path: ".", workspace_kind: "BOGUS" }); }
  catch (e) { rejected = /workspace_kind/.test(e.message); }
  check(rejected, "rejects workspace_kind not in enum");

  let pathEsc = false;
  try { writeSystemYamlImpl({ context_path: "../etc", workspace_kind: "single-repo" }); }
  catch (e) { pathEsc = /escapes cwd/.test(e.message); }
  check(pathEsc, "rejects context_path '..' escape");

  // Re-write overwrites cleanly with new status
  const out2 = writeSystemYamlImpl({ context_path: ".", workspace_kind: "multi-repo", status: "locked" });
  const body2 = readFileSync(out2.path, "utf8");
  check(/workspace_kind: multi-repo/.test(body2), `overwrite: new workspace_kind`);
  check(/status: locked/.test(body2), `overwrite: status persisted`);
});

// ---------- write_system_yaml: symlink reject ----------
console.log("write_system_yaml symlink reject:");
withTmp(tmp => {
  mkdirSync(join(tmp, ".orchestra"));
  symlinkSync("/tmp/decoy-target", join(tmp, ".orchestra", "system.yaml"));
  let rejected = false;
  try { writeSystemYamlImpl({ context_path: ".", workspace_kind: "single-repo" }); }
  catch (e) { rejected = /symlink/i.test(e.message) || /safe-fs/.test(e.message); }
  check(rejected, "refuses to write through a symlink");
});

// ---------- upsert_local_yaml: create ----------
console.log("upsert_local_yaml create:");
withTmp(tmp => {
  const out = upsertLocalYamlImpl({
    context_path: ".",
    service_name: "order",
    scope_level: "per-service",
    primary_language: "java",
    framework: "spring-boot",
    autonomy: { level: "DRAFT_AND_GATE", resolved_by: "default" },
    spawn_mode: "subagent",
    status: "draft",
  });
  check(out.mode === "created", `mode='created' on fresh write (got ${out.mode})`);
  const body = readFileSync(join(tmp, ".orchestra", "order", "local.yaml"), "utf8");
  check(/service_name: order/.test(body), "body has service_name");
  check(/scope_level: per-service/.test(body), "body has scope_level");
  check(/level: DRAFT_AND_GATE/.test(body), "body has autonomy.level");
  check(/resolved_by: default/.test(body), "body has autonomy.resolved_by");
});

// ---------- upsert_local_yaml: patch + deep-merge ----------
console.log("upsert_local_yaml patch+merge:");
withTmp(tmp => {
  upsertLocalYamlImpl({
    context_path: ".",
    service_name: "order",
    scope_level: "per-service",
    autonomy: { level: "DRAFT_AND_GATE", resolved_by: "default" },
    status: "draft",
  });
  // Patch only auto_mode + run_plan_status. autonomy should be preserved.
  const out = upsertLocalYamlImpl({
    context_path: ".",
    service_name: "order",
    auto_mode: true,
    run_plan_status: "approved",
    status: "locked",
  });
  check(out.mode === "patched", `mode='patched' on second write (got ${out.mode})`);
  const body = readFileSync(out.path, "utf8");
  check(/auto_mode: true/.test(body), "patch added auto_mode");
  check(/run_plan_status: approved/.test(body), "patch added run_plan_status");
  check(/status: locked/.test(body), "patch flipped status to locked");
  check(/scope_level: per-service/.test(body), "patch preserved scope_level");
  check(/level: DRAFT_AND_GATE/.test(body), "patch preserved autonomy.level");
  check(/resolved_by: default/.test(body), "patch preserved autonomy.resolved_by");
});

// ---------- upsert_local_yaml: autonomy subobject preserves siblings ----------
console.log("upsert_local_yaml autonomy subobject merge:");
withTmp(tmp => {
  upsertLocalYamlImpl({
    context_path: ".",
    service_name: "order",
    autonomy: { level: "DRAFT_AND_GATE", resolved_by: "default" },
  });
  // Send only autonomy.level — resolved_by should survive.
  const out = upsertLocalYamlImpl({
    context_path: ".",
    service_name: "order",
    autonomy: { level: "FULL_AUTONOMY" },
  });
  const body = readFileSync(out.path, "utf8");
  check(/level: FULL_AUTONOMY/.test(body), "autonomy.level overwritten");
  check(/resolved_by: default/.test(body), "autonomy.resolved_by preserved across partial autonomy patch");
});

// ---------- upsert_local_yaml: schema gates ----------
console.log("upsert_local_yaml schema gates:");
withTmp(tmp => {
  let rejected = false;
  try {
    upsertLocalYamlImpl({
      context_path: ".",
      service_name: "order",
      // @ts-expect-error intentional schema violation
      workspace_kind: "single-repo",
    });
  } catch (e) { rejected = /workspace_kind|unknown top-level/.test(e.message); }
  check(rejected, "rejects workspace_kind (lives in system.yaml, not local.yaml)");

  let badLevel = false;
  try {
    upsertLocalYamlImpl({
      context_path: ".",
      service_name: "order",
      autonomy: { level: "BOGUS" },
    });
  } catch (e) { badLevel = /autonomy\.level/.test(e.message); }
  check(badLevel, "rejects autonomy.level='BOGUS'");

  let badAuto = false;
  try {
    upsertLocalYamlImpl({
      context_path: ".",
      service_name: "order",
      auto_mode: true,
      run_plan_status: "drafted",
    });
  } catch (e) { badAuto = /auto_mode/.test(e.message); }
  check(badAuto, "rejects auto_mode:true with run_plan_status:'drafted' (cross-field invariant)");

  let badService = false;
  try { upsertLocalYamlImpl({ context_path: ".", service_name: ".." }); }
  catch (e) { badService = /forbidden characters/.test(e.message); }
  check(badService, "rejects service_name='..'");

  let reservedService = false;
  try { upsertLocalYamlImpl({ context_path: ".", service_name: "system" }); }
  catch (e) { reservedService = /reserved/.test(e.message); }
  check(reservedService, "rejects service_name='system' (reserved)");
});

// ---------- upsert_local_yaml: malformed existing file ----------
console.log("upsert_local_yaml malformed-existing reject:");
withTmp(tmp => {
  mkdirSync(join(tmp, ".orchestra", "order"), { recursive: true });
  writeFileSync(join(tmp, ".orchestra", "order", "local.yaml"), "!!not-a-valid-yaml-key-line\n");
  let rejected = false;
  try { upsertLocalYamlImpl({ context_path: ".", service_name: "order", status: "draft" }); }
  catch (e) { rejected = /malformed|refusing to overwrite/.test(e.message); }
  check(rejected, "refuses to overwrite malformed existing local.yaml");
});

// ---------- claude_md ----------
console.log("claude_md:");
withTmp(tmp => {
  // Fresh create
  const a = claudeMdImpl({ context_path: "." });
  check(a.action === "created", `fresh: action='created' (got ${a.action})`);
  const created = readFileSync(join(tmp, "CLAUDE.md"), "utf8");
  check(/^# CLAUDE\.md/.test(created), "fresh: starts with # CLAUDE.md");
  check(/<!-- orchestra:start -->/.test(created), "fresh: contains start marker");
  check(/<!-- orchestra:end -->/.test(created), "fresh: contains end marker");

  // No-op on re-run
  const b = claudeMdImpl({ context_path: "." });
  check(b.action === "unchanged", `re-run: action='unchanged' (got ${b.action})`);

  // Splice into pre-existing CLAUDE.md without markers
  writeFileSync(join(tmp, "CLAUDE.md"), "# Existing\n\nuser content\n");
  const c = claudeMdImpl({ context_path: "." });
  check(c.action === "appended", `append: action='appended' (got ${c.action})`);
  const appended = readFileSync(join(tmp, "CLAUDE.md"), "utf8");
  check(/^# Existing/.test(appended), "append: preserves pre-existing header");
  check(/user content/.test(appended), "append: preserves pre-existing body");
  check(/<!-- orchestra:start -->/.test(appended), "append: adds start marker");

  // Splice in place when markers already exist (template drift)
  writeFileSync(
    join(tmp, "CLAUDE.md"),
    "# Existing\n\nuser content\n\n<!-- orchestra:start -->\nstale body\n<!-- orchestra:end -->\n",
  );
  const d = claudeMdImpl({ context_path: "." });
  check(d.action === "updated", `splice: action='updated' (got ${d.action})`);
  const updated = readFileSync(join(tmp, "CLAUDE.md"), "utf8");
  check(!/stale body/.test(updated), "splice: stale body replaced");
  check(/user content/.test(updated), "splice: pre-existing content preserved");
});

// ---------- claude_md: symlink reject ----------
console.log("claude_md symlink reject:");
withTmp(tmp => {
  symlinkSync("/tmp/decoy-claude-md", join(tmp, "CLAUDE.md"));
  let rejected = false;
  try { claudeMdImpl({ context_path: "." }); }
  catch (e) { rejected = /symlink|refusing/.test(e.message); }
  check(rejected, "refuses to operate on symlinked CLAUDE.md");
});

// ---------- claude_md: default context_path ----------
console.log("claude_md default context_path:");
withTmp(tmp => {
  const out = claudeMdImpl({});
  check(out.action === "created", `defaulted: action='created' (got ${out.action})`);
  check(existsSync(join(tmp, "CLAUDE.md")), "defaulted: writes to cwd");
});

// ---------- MCP JSON-RPC smoke ----------
console.log("MCP JSON-RPC smoke:");
{
  const server = resolve(root, "scripts/mcp-servers/orchestra-utils.js");

  // tools/list
  const r1 = spawnSync("node", [server], {
    input: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }) + "\n",
    encoding: "utf8",
    timeout: 3000,
  });
  const r1lines = (r1.stdout || "").split("\n").filter(Boolean);
  let toolsParsed;
  try { toolsParsed = JSON.parse(r1lines[0] || "{}"); }
  catch { toolsParsed = {}; }
  check(Array.isArray(toolsParsed?.result?.tools), "tools/list returns array");
  check(toolsParsed?.result?.tools?.length === 4, `tools/list returns 4 tools (got ${toolsParsed?.result?.tools?.length})`);
  const names = (toolsParsed?.result?.tools || []).map(t => t.name);
  check(names.includes("tree"), "tools/list includes tree");
  check(names.includes("write_system_yaml"), "tools/list includes write_system_yaml");
  check(names.includes("upsert_local_yaml"), "tools/list includes upsert_local_yaml");
  check(names.includes("claude_md"), "tools/list includes claude_md");

  // initialize
  const r2 = spawnSync("node", [server], {
    input: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize" }) + "\n",
    encoding: "utf8",
    timeout: 3000,
  });
  let initParsed;
  try { initParsed = JSON.parse((r2.stdout || "").split("\n").filter(Boolean)[0] || "{}"); }
  catch { initParsed = {}; }
  check(initParsed?.result?.serverInfo?.name === "orchestra-utils", `initialize: serverInfo.name='orchestra-utils' (got ${initParsed?.result?.serverInfo?.name})`);

  // unknown tool → isError
  const r3 = spawnSync("node", [server], {
    input: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "nonexistent", arguments: {} } }) + "\n",
    encoding: "utf8",
    timeout: 3000,
  });
  let callParsed;
  try { callParsed = JSON.parse((r3.stdout || "").split("\n").filter(Boolean)[0] || "{}"); }
  catch { callParsed = {}; }
  check(callParsed?.result?.isError === true, "unknown tool returns isError");
}

// ---------- env-var opt-out ----------
console.log("MCP env-var opt-out:");
{
  const r = spawnSync("node", [resolve(root, "scripts/mcp-servers/orchestra-utils.js")], {
    encoding: "utf8",
    env: { ...process.env, ORCHESTRA_MCP_ORCHESTRA_UTILS: "off" },
    timeout: 1000,
  });
  check(r.status === 0, `opt-out: exits 0 (got ${r.status})`);
}

if (failures > 0) {
  console.error(`orchestra-utils.test.js: FAIL (${passes} passed, ${failures} failed)`);
  process.exit(1);
}
console.log(`orchestra-utils.test.js: OK (${passes} assertions passed)`);
