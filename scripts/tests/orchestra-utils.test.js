#!/usr/bin/env node
// scripts/tests/orchestra-utils.test.js
// orchestra-utils MCP contract tests:
//   tree path-escape + walker output
//   write_system_yaml schema gates
//   upsert_local_yaml create + patch + deep-merge + cross-field invariants
//   upsert_features_yaml create + update + DAG enforcement + uniqueness + warnings
//   claude_md create / append / splice / no-op / symlink reject
//   docs_readme create / no-op when marker present / overwrite when absent / symlink reject
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
  upsertFeaturesYamlImpl,
  relockArtifactImpl,
  claudeMdImpl,
  docsReadmeImpl,
  TOOLS,
} from "../../mcp-servers/orchestra-utils.js";
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

  // Re-write overwrites cleanly with new workspace_kind
  const out2 = writeSystemYamlImpl({ context_path: ".", workspace_kind: "multi-repo" });
  const body2 = readFileSync(out2.path, "utf8");
  check(/workspace_kind: multi-repo/.test(body2), `overwrite: new workspace_kind`);
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
  });
  // Patch only auto_mode + run_plan_status. autonomy should be preserved.
  const out = upsertLocalYamlImpl({
    context_path: ".",
    service_name: "order",
    auto_mode: true,
    run_plan_status: "approved",
  });
  check(out.mode === "patched", `mode='patched' on second write (got ${out.mode})`);
  const body = readFileSync(out.path, "utf8");
  check(/auto_mode: true/.test(body), "patch added auto_mode");
  check(/run_plan_status: approved/.test(body), "patch added run_plan_status");
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
  try { upsertLocalYamlImpl({ context_path: ".", service_name: "order", scope_level: "per-service" }); }
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

// ---------- docs_readme ----------
console.log("docs_readme:");
withTmp(tmp => {
  // Fresh create
  const a = docsReadmeImpl({ context_path: "." });
  check(a.action === "created", `fresh: action='created' (got ${a.action})`);
  const created = readFileSync(join(tmp, "docs", "README.md"), "utf8");
  check(/^---\n/.test(created), "fresh: starts with frontmatter delimiter");
  check(/^id:\s*docs-readme$/m.test(created), "fresh: id pinned to docs-readme");
  check(/^type:\s*README$/m.test(created), "fresh: type pinned to README");
  check(/^generated_by:\s*orchestra$/m.test(created), "fresh: generated_by pinned");
  check(/^status:\s*locked$/m.test(created), "fresh: status pinned to locked");
  check(/# `docs\/` — Orchestra-generated/.test(created), "fresh: body H1 from template");

  // No-op on re-run when marker already present
  const b = docsReadmeImpl({ context_path: "." });
  check(b.action === "unchanged", `re-run: action='unchanged' (got ${b.action})`);

  // Overwrite when existing file lacks the marker frontmatter
  writeFileSync(join(tmp, "docs", "README.md"), "# Existing\n\nuser content without marker\n");
  const c = docsReadmeImpl({ context_path: "." });
  check(c.action === "overwritten", `non-marker: action='overwritten' (got ${c.action})`);
  const overwritten = readFileSync(join(tmp, "docs", "README.md"), "utf8");
  check(/^generated_by:\s*orchestra$/m.test(overwritten), "non-marker: pinned frontmatter present after overwrite");
  check(!/user content without marker/.test(overwritten), "non-marker: pre-existing body replaced");
});

// ---------- docs_readme: symlink reject ----------
console.log("docs_readme symlink reject:");
withTmp(tmp => {
  mkdirSync(join(tmp, "docs"));
  symlinkSync("/tmp/decoy-docs-readme", join(tmp, "docs", "README.md"));
  let rejected = false;
  try { docsReadmeImpl({ context_path: "." }); }
  catch (e) { rejected = /symlink|refusing/.test(e.message); }
  check(rejected, "refuses to operate on symlinked docs/README.md");
});

// ---------- docs_readme: default context_path ----------
console.log("docs_readme default context_path:");
withTmp(tmp => {
  const out = docsReadmeImpl({});
  check(out.action === "created", `defaulted: action='created' (got ${out.action})`);
  check(existsSync(join(tmp, "docs", "README.md")), "defaulted: writes to cwd/docs/");
});

// ---------- upsert_features_yaml: create + update ----------
console.log("upsert_features_yaml: create + update:");
withTmp(tmp => {
  const f1 = { id: "auth-001-login", status: "active", depends_on: [], artifacts: ["PRD", "FRS"] };
  const out1 = upsertFeaturesYamlImpl({ context_path: ".", service_name: "auth", feature: f1 });
  check(out1.mode === "created", `first call mode='created' (got ${out1.mode})`);
  check(out1.id === "auth-001-login", `first call id echo`);
  const body1 = readFileSync(join(tmp, ".orchestra", "auth", "features.yaml"), "utf8");
  check(/id: auth-001-login/.test(body1), "body contains id");
  check(/status: active/.test(body1), "body contains status");

  const f1updated = { id: "auth-001-login", status: "active", depends_on: [], artifacts: ["PRD", "FRS", "TDD"] };
  const out2 = upsertFeaturesYamlImpl({ context_path: ".", service_name: "auth", feature: f1updated });
  check(out2.mode === "patched", `second call mode='patched' (got ${out2.mode})`);
  const parsed = parseYaml(readFileSync(out2.path, "utf8"));
  check(parsed.features.length === 1, "still one entry after update");
  check(parsed.features[0].artifacts.includes("TDD"), "update persisted");

  const f2 = { id: "auth-002-logout", status: "active", depends_on: ["auth-001-login"], artifacts: ["PRD"] };
  upsertFeaturesYamlImpl({ context_path: ".", service_name: "auth", feature: f2 });
  const parsed2 = parseYaml(readFileSync(out2.path, "utf8"));
  check(parsed2.features.length === 2, "second feature appended");
  check(parsed2.features[1].depends_on[0] === "auth-001-login", "edge persisted");
  check(parsed2.features[1].id === "auth-002-logout", "second feature id");
});

// ---------- upsert_features_yaml: schema gates ----------
console.log("upsert_features_yaml: schema gates:");
withTmp(_ => {
  let err = null;
  try { upsertFeaturesYamlImpl({ context_path: ".", service_name: "svc", feature: { id: "bad-id", status: "active", depends_on: [], artifacts: ["PRD"] } }); }
  catch (e) { err = e.message; }
  check(err && /SCHEMA_VIOLATION/.test(err) && /pattern/.test(err), "bad id pattern -> SCHEMA_VIOLATION");

  err = null;
  try { upsertFeaturesYamlImpl({ context_path: ".", service_name: "svc", feature: { id: "svc-001-x", status: "BOGUS", depends_on: [], artifacts: ["PRD"] } }); }
  catch (e) { err = e.message; }
  check(err && /SCHEMA_VIOLATION/.test(err) && /status/.test(err), "bad status -> SCHEMA_VIOLATION");

  err = null;
  try { upsertFeaturesYamlImpl({ context_path: ".", service_name: "svc", feature: { id: "svc-001-x", status: "active", depends_on: [], artifacts: ["XML"] } }); }
  catch (e) { err = e.message; }
  check(err && /SCHEMA_VIOLATION/.test(err) && /artifacts/.test(err), "bad artifact enum -> SCHEMA_VIOLATION");

  err = null;
  try { upsertFeaturesYamlImpl({ context_path: ".", service_name: "svc", feature: { id: "svc-001-x", status: "active", depends_on: [], artifacts: ["PRD"], extra: "nope" } }); }
  catch (e) { err = e.message; }
  check(err && /unknown field/.test(err), "unknown feature field rejected");

  err = null;
  try { upsertFeaturesYamlImpl({ context_path: ".", service_name: "svc", feature: { id: "svc-001-x", status: "active", depends_on: ["malformed"], artifacts: ["PRD"] } }); }
  catch (e) { err = e.message; }
  check(err && /SCHEMA_VIOLATION/.test(err) && /depends_on/.test(err), "malformed depends_on id -> SCHEMA_VIOLATION");
});

// ---------- upsert_features_yaml: DAG gates ----------
console.log("upsert_features_yaml: DAG gates:");
withTmp(_ => {
  let err = null;
  try { upsertFeaturesYamlImpl({ context_path: ".", service_name: "svc", feature: { id: "svc-001-x", status: "active", depends_on: ["svc-999-ghost"], artifacts: ["PRD"] } }); }
  catch (e) { err = e.message; }
  check(err && /UNKNOWN_REF/.test(err) && /999-ghost/.test(err), "depends_on missing id -> UNKNOWN_REF");

  err = null;
  try { upsertFeaturesYamlImpl({ context_path: ".", service_name: "svc", feature: { id: "svc-001-x", status: "active", depends_on: [], supersedes: ["svc-999-ghost"], artifacts: ["PRD"] } }); }
  catch (e) { err = e.message; }
  check(err && /UNKNOWN_REF/.test(err), "supersedes missing id -> UNKNOWN_REF");

  err = null;
  try { upsertFeaturesYamlImpl({ context_path: ".", service_name: "svc", feature: { id: "svc-001-x", status: "active", depends_on: ["svc-001-x"], artifacts: ["PRD"] } }); }
  catch (e) { err = e.message; }
  check(err && /SELF_EDGE/.test(err), "self-edge in depends_on -> SELF_EDGE");

  err = null;
  try { upsertFeaturesYamlImpl({ context_path: ".", service_name: "svc", feature: { id: "svc-001-x", status: "active", depends_on: [], supersedes: ["svc-001-x"], artifacts: ["PRD"] } }); }
  catch (e) { err = e.message; }
  check(err && /SELF_EDGE/.test(err), "self-edge in supersedes -> SELF_EDGE");
});

// ---------- upsert_features_yaml: cycle detection ----------
console.log("upsert_features_yaml: cycle detection:");
withTmp(_ => {
  upsertFeaturesYamlImpl({ context_path: ".", service_name: "svc", feature: { id: "svc-001-a", status: "active", depends_on: [], artifacts: ["PRD"] } });
  upsertFeaturesYamlImpl({ context_path: ".", service_name: "svc", feature: { id: "svc-002-b", status: "active", depends_on: ["svc-001-a"], artifacts: ["PRD"] } });
  let err = null;
  try { upsertFeaturesYamlImpl({ context_path: ".", service_name: "svc", feature: { id: "svc-001-a", status: "active", depends_on: ["svc-002-b"], artifacts: ["PRD"] } }); }
  catch (e) { err = e.message; }
  check(err && /CYCLE/.test(err), "A->B then B->A -> CYCLE");
  check(err && /001-a/.test(err) && /002-b/.test(err), "cycle error names both nodes");
});

// ---------- upsert_features_yaml: existing-file validation on load ----------
console.log("upsert_features_yaml: existing-file validation on load:");
withTmp(tmp => {
  const dir = join(tmp, ".orchestra", "svc");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "features.yaml"),
    "features:\n  - id: svc-001-x\n    status: active\n    depends_on: []\n    artifacts:\n      - PRD\n  - id: svc-001-x\n    status: active\n    depends_on: []\n    artifacts:\n      - PRD\n");
  let err = null;
  try { upsertFeaturesYamlImpl({ context_path: ".", service_name: "svc", feature: { id: "svc-002-y", status: "active", depends_on: [], artifacts: ["PRD"] } }); }
  catch (e) { err = e.message; }
  check(err && /EXISTING_FILE_INVALID/.test(err), "duplicate ids in existing file -> EXISTING_FILE_INVALID");
  check(err && /duplicate id/.test(err), "EXISTING_FILE_INVALID error names the duplicate-id cause");
});

// non-duplicate validation error in existing file also surfaces (previously silently dropped)
withTmp(tmp => {
  const dir = join(tmp, ".orchestra", "svc");
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "features.yaml"),
    "features:\n  - id: svc-001-x\n    status: active\n    depends_on: []\n    artifacts:\n      - PRD\nstray_top_level: oops\n");
  let err = null;
  try { upsertFeaturesYamlImpl({ context_path: ".", service_name: "svc", feature: { id: "svc-002-y", status: "active", depends_on: [], artifacts: ["PRD"] } }); }
  catch (e) { err = e.message; }
  check(err && /EXISTING_FILE_INVALID/.test(err), "non-duplicate validation error -> EXISTING_FILE_INVALID (no silent drop)");
  check(err && /unknown top-level field 'stray_top_level'/.test(err), "EXISTING_FILE_INVALID surfaces the underlying validation reason");
});

// ---------- upsert_features_yaml: deprecation warning ----------
console.log("upsert_features_yaml: deprecation warning:");
withTmp(_ => {
  upsertFeaturesYamlImpl({ context_path: ".", service_name: "svc", feature: { id: "svc-001-old", status: "deprecated", depends_on: [], artifacts: ["PRD"] } });
  const out = upsertFeaturesYamlImpl({ context_path: ".", service_name: "svc", feature: { id: "svc-002-new", status: "active", depends_on: ["svc-001-old"], artifacts: ["PRD"] } });
  check(Array.isArray(out.warnings) && out.warnings.some(w => /deprecated/.test(w)), "edge to deprecated emits warning (not block)");
});

// ---------- upsert_features_yaml: supersedes optional ----------
console.log("upsert_features_yaml: supersedes optional:");
withTmp(_ => {
  upsertFeaturesYamlImpl({ context_path: ".", service_name: "svc", feature: { id: "svc-001-base", status: "active", depends_on: [], artifacts: ["PRD"] } });
  const out = upsertFeaturesYamlImpl({ context_path: ".", service_name: "svc", feature: { id: "svc-002-v2", status: "active", depends_on: [], supersedes: ["svc-001-base"], artifacts: ["PRD"] } });
  check(out.id === "svc-002-v2", "supersedes-only entry returns its id");
  const parsed = parseYaml(readFileSync(out.path, "utf8"));
  check(parsed.features.length === 2, "supersedes-only entry appended");
  const base = parsed.features.find(f => f.id === "svc-001-base");
  check(base.status === "active", "predecessor status not auto-flipped");
  const v2 = parsed.features.find(f => f.id === "svc-002-v2");
  check(Array.isArray(v2.supersedes) && v2.supersedes[0] === "svc-001-base", "supersedes round-trips");
});

// ---------- upsert_features_yaml: path + service safety ----------
console.log("upsert_features_yaml: path + service safety:");
withTmp(_ => {
  let err = null;
  try { upsertFeaturesYamlImpl({ context_path: "../etc", service_name: "svc", feature: { id: "svc-001-x", status: "active", depends_on: [], artifacts: ["PRD"] } }); }
  catch (e) { err = e.message; }
  check(err && /escapes cwd/.test(err), "context_path '..' escape rejected");

  err = null;
  try { upsertFeaturesYamlImpl({ context_path: ".", service_name: "bad/name", feature: { id: "svc-001-x", status: "active", depends_on: [], artifacts: ["PRD"] } }); }
  catch (e) { err = e.message; }
  check(err && /forbidden characters/.test(err), "service_name with '/' rejected");

  err = null;
  try { upsertFeaturesYamlImpl({ context_path: ".", service_name: "system", feature: { id: "svc-001-x", status: "active", depends_on: [], artifacts: ["PRD"] } }); }
  catch (e) { err = e.message; }
  check(err && /reserved/.test(err), "reserved service_name 'system' rejected");
});

// ---------- upsert_features_yaml: symlink reject ----------
console.log("upsert_features_yaml: symlink reject:");
withTmp(tmp => {
  const dir = join(tmp, ".orchestra", "svc");
  mkdirSync(dir, { recursive: true });
  symlinkSync("/tmp/decoy-features", join(dir, "features.yaml"));
  let err = null;
  try { upsertFeaturesYamlImpl({ context_path: ".", service_name: "svc", feature: { id: "svc-001-x", status: "active", depends_on: [], artifacts: ["PRD"] } }); }
  catch (e) { err = e.message; }
  check(err && (/symlink/i.test(err) || /safe-fs/i.test(err) || /non-file/i.test(err)), "refuses to read through symlink");
});

// ---------- upsert_features_yaml: unknown arg rejected ----------
console.log("upsert_features_yaml: unknown arg:");
withTmp(_ => {
  let err = null;
  try { upsertFeaturesYamlImpl({ context_path: ".", service_name: "svc", feature: { id: "svc-001-x", status: "active", depends_on: [], artifacts: ["PRD"] }, extra: "x" }); }
  catch (e) { err = e.message; }
  check(err && /unknown field 'extra'/.test(err), "unknown top-level arg rejected");
});

// ---------- relock_artifact: action-name contract ----------
console.log("relock_artifact: action-name contract:");
withTmp(tmp => {
  mkdirSync("docs", { recursive: true });
  const fixture = (lastAction) =>
    "---\n" +
    "phase: 1\n" +
    "status: revision_requested\n" +
    "---\n" +
    "## Changelog\n" +
    "- 2026-05-23T12:00:00Z | created by @architect | initial draft\n" +
    "- 2026-05-23T12:30:00Z | unlocked by dispatcher | reviewer flagged ambiguity\n" +
    `- 2026-05-23T13:00:00Z | ${lastAction} by @architect | clarified BR-3 wording\n`;

  // Happy path: last changelog row action='ratify-spec-amend' → relock succeeds
  writeFileSync("docs/happy-PRD.md", fixture("ratify-spec-amend"));
  const out = relockArtifactImpl({ context_path: ".", target_path: "docs/happy-PRD.md", amendment_summary: "BR-3 clarified" });
  check(out && out.new_status === "locked", "ratify-spec-amend last row → relock returns new_status=locked");
  const after = readFileSync("docs/happy-PRD.md", "utf8");
  check(/^status:\s*locked\s*$/m.test(after), "ratify-spec-amend last row → frontmatter flipped to status: locked");
  check(/re-locked by dispatcher \| BR-3 clarified/.test(after), "ratify-spec-amend last row → re-locked changelog row appended");

  // Reject path: last changelog row action='path-a-amend' (stale name) → relock throws
  writeFileSync("docs/stale-PRD.md", fixture("path-a-amend"));
  let err = null;
  try { relockArtifactImpl({ context_path: ".", target_path: "docs/stale-PRD.md", amendment_summary: "x" }); }
  catch (e) { err = e.message; }
  check(err && /expected 'ratify-spec-amend'/.test(err), "path-a-amend last row → relock rejects with ratify-spec-amend expected message");
  check(err && /path-a-amend/.test(err), "rejection error names the actual stale action seen");
});

// ---------- MCP JSON-RPC smoke ----------
console.log("MCP JSON-RPC smoke:");
{
  const server = resolve(root, "mcp-servers/orchestra-utils.js");

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
  check(toolsParsed?.result?.tools?.length === 9, `tools/list returns 9 tools (got ${toolsParsed?.result?.tools?.length})`);
  const names = (toolsParsed?.result?.tools || []).map(t => t.name);
  check(names.includes("tree"), "tools/list includes tree");
  check(names.includes("write_system_yaml"), "tools/list includes write_system_yaml");
  check(names.includes("upsert_local_yaml"), "tools/list includes upsert_local_yaml");
  check(names.includes("upsert_features_yaml"), "tools/list includes upsert_features_yaml");
  check(names.includes("upsert_cross_features_yaml"), "tools/list includes upsert_cross_features_yaml");
  check(names.includes("claude_md"), "tools/list includes claude_md");
  check(names.includes("docs_readme"), "tools/list includes docs_readme");
  check(names.includes("amend_locked_artifact"), "tools/list includes amend_locked_artifact");
  check(names.includes("relock_artifact"), "tools/list includes relock_artifact");

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
  const r = spawnSync("node", [resolve(root, "mcp-servers/orchestra-utils.js")], {
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
