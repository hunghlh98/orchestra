#!/usr/bin/env node
// scripts/tests/pre-write-check.test.js
// Regression: Edit/MultiEdit payloads must surface both old_string AND
// new_string to the chain-cite-reject gate. Pre-fix, only new_string was
// scanned — a malicious Edit could leak a chain cite via new_string while
// keeping old_string clean (or vice versa for retention scans).

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = resolve(root, "hooks/scripts/pre-write-check.js");

let failures = 0, passes = 0;
const check = (cond, msg) => cond ? passes++ : (failures++, console.error(`  FAIL: ${msg}`));

function setupSandbox(label) {
  const tmp = mkdtempSync(join(tmpdir(), `orchestra-pre-write-check-${label}-`));
  const cwdDir = join(tmp, "project");
  mkdirSync(cwdDir, { recursive: true });
  mkdirSync(join(cwdDir, ".orchestra"), { recursive: true });
  writeFileSync(join(cwdDir, ".orchestra", "system.yaml"), "workspace_kind: single-repo\ncontext_path: .\n");
  mkdirSync(join(cwdDir, "src", "main"), { recursive: true });
  return { tmp, cwdDir };
}

function runHook(input) {
  return spawnSync("node", [SCRIPT], {
    input: JSON.stringify(input),
    encoding: "utf8",
    env: process.env,
  });
}

// ---------- Opt-out ----------
console.log("pre-write-check — opt-out exits silently:");
{
  const r = spawnSync("node", [SCRIPT], {
    input: JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Edit", tool_input: {} }),
    encoding: "utf8",
    env: { ...process.env, ORCHESTRA_HOOK_PRE_WRITE_CHECK: "off" },
  });
  check(r.status === 0, `opt-out exits 0`);
  check(r.stdout === "" || !/deny|block/i.test(r.stdout), `opt-out emits no block`);
}

// ---------- Edit gate scans new_string ----------
console.log("pre-write-check — Edit new_string with chain cite under src/** → block:");
{
  const sb = setupSandbox("edit-new");
  try {
    const target = join(sb.cwdDir, "src", "main", "Service.java");
    writeFileSync(target, "public class Service {}\n");
    const r = runHook({
      hook_event_name: "PreToolUse",
      tool_name: "Edit",
      cwd: sb.cwdDir,
      tool_input: {
        file_path: target,
        old_string: "public class Service {}",
        new_string: "// implements FR-3 from PRD §4.1\npublic class Service {}",
      },
    });
    const blocked = /deny|block|FR-3|chain-cite/i.test(r.stdout + r.stderr) || r.status !== 0;
    check(blocked, `chain cite in new_string is detected`);
  } finally { rmSync(sb.tmp, { recursive: true, force: true }); }
}

// ---------- Edit gate scans old_string ----------
console.log("pre-write-check — Edit old_string with chain cite under src/** → block:");
{
  const sb = setupSandbox("edit-old");
  try {
    const target = join(sb.cwdDir, "src", "main", "Service.java");
    writeFileSync(target, "// implements FR-3\npublic class Service {}\n");
    const r = runHook({
      hook_event_name: "PreToolUse",
      tool_name: "Edit",
      cwd: sb.cwdDir,
      tool_input: {
        file_path: target,
        old_string: "// implements FR-3\npublic class Service {}",
        new_string: "public class Service {}",
      },
    });
    const blocked = /deny|block|FR-3|chain-cite/i.test(r.stdout + r.stderr) || r.status !== 0;
    check(blocked, `chain cite in old_string is detected (retention scan)`);
  } finally { rmSync(sb.tmp, { recursive: true, force: true }); }
}

// ---------- MultiEdit covers per-edit pairs ----------
console.log("pre-write-check — MultiEdit cite in any edit-pair → block:");
{
  const sb = setupSandbox("multi-edit");
  try {
    const target = join(sb.cwdDir, "src", "main", "Service.java");
    writeFileSync(target, "public class Service {}\n");
    const r = runHook({
      hook_event_name: "PreToolUse",
      tool_name: "MultiEdit",
      cwd: sb.cwdDir,
      tool_input: {
        file_path: target,
        edits: [
          { old_string: "public class Service {}", new_string: "public class Service {\n  // AC-5\n}" },
        ],
      },
    });
    const blocked = /deny|block|AC-5|chain-cite/i.test(r.stdout + r.stderr) || r.status !== 0;
    check(blocked, `MultiEdit cite in new_string is detected`);
  } finally { rmSync(sb.tmp, { recursive: true, force: true }); }
}

if (failures > 0) {
  console.error(`pre-write-check.test.js: FAIL (${passes} passed, ${failures} failed)`);
  process.exit(1);
}
console.log(`pre-write-check.test.js: OK (${passes} assertions passed)`);
