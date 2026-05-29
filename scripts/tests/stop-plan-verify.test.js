#!/usr/bin/env node
// scripts/tests/stop-plan-verify.test.js
// Hook contract tests for hooks/scripts/stop-plan-verify.js.
//
// Verifies the silent-approval detection pattern: an ExitPlanMode tool_use
// followed by a Task/Agent tool_use in the SAME assistant turn (the dangerous
// shape from anthropics/claude-code#50110). Detection returns
// decision:"block" via stdout JSON; absence returns nothing (exit 0).

import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = resolve(root, "hooks/scripts/stop-plan-verify.js");

let failures = 0, passes = 0;
const check = (cond, msg) => cond ? passes++ : (failures++, console.error(`  FAIL: ${msg}`));

function setupSandbox(label) {
  const tmp = mkdtempSync(join(tmpdir(), `orchestra-stop-plan-verify-${label}-`));
  const cwdDir = join(tmp, "project");
  mkdirSync(cwdDir, { recursive: true });
  return { tmp, cwdDir };
}

// Seed .orchestra/system.yaml so cold-start gate passes.
function seedOrchestra(cwd) {
  const path = join(cwd, ".orchestra", "system.yaml");
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, "workspace_kind: single-repo\ncontext_path: .\n");
}

// Build a transcript JSONL with:
//   - one initial user message (prior turn boundary)
//   - one assistant message containing N tool_use blocks
//   - optionally a second user message + assistant turn (cross-turn cases)
function writeTranscript(transcriptPath, turns) {
  const lines = [];
  for (const turn of turns) {
    lines.push(JSON.stringify({ type: "user", message: { content: turn.userText || "(prompt)" } }));
    const blocks = (turn.toolNames || []).map((name, i) => ({
      type: "tool_use",
      id: `toolu_${name}_${i}`,
      name,
      input: {},
    }));
    if (blocks.length > 0) {
      lines.push(JSON.stringify({
        type: "assistant",
        message: { content: blocks },
      }));
    }
  }
  mkdirSync(dirname(transcriptPath), { recursive: true });
  writeFileSync(transcriptPath, lines.join("\n") + "\n");
}

function runHook(input, env = {}) {
  return spawnSync("node", [SCRIPT], {
    input: JSON.stringify(input),
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

// ---------- Opt-out ----------
console.log("stop-plan-verify — opt-out exits silently:");
{
  const r = runHook(
    { hook_event_name: "Stop", session_id: "x", cwd: "/tmp", transcript_path: "/tmp/nope" },
    { ORCHESTRA_HOOK_STOP_PLAN_VERIFY: "off" },
  );
  check(r.status === 0, `opt-out exits 0`);
  check(r.stdout === "", `opt-out emits no stdout`);
}

// ---------- Non-Stop event ignored ----------
console.log("stop-plan-verify — non-Stop event ignored:");
{
  const sb = setupSandbox("non-stop");
  try {
    seedOrchestra(sb.cwdDir);
    const r = runHook({ hook_event_name: "SubagentStop", session_id: "x", cwd: sb.cwdDir });
    check(r.status === 0, `SubagentStop exits 0`);
    check(r.stdout === "", `SubagentStop emits no stdout`);
  } finally { rmSync(sb.tmp, { recursive: true, force: true }); }
}

// ---------- Cold-start gate ----------
console.log("stop-plan-verify — cold-start (no .orchestra/system.yaml) no-ops:");
{
  const sb = setupSandbox("cold-start");
  try {
    const transcriptPath = join(sb.tmp, "transcript.jsonl");
    writeTranscript(transcriptPath, [{ toolNames: ["ExitPlanMode", "Task"] }]);
    const r = runHook({
      hook_event_name: "Stop",
      session_id: "x",
      cwd: sb.cwdDir,
      transcript_path: transcriptPath,
    });
    check(r.status === 0, `cold-start exits 0`);
    check(r.stdout === "", `cold-start emits no stdout — no orchestra workspace, hook stays out`);
  } finally { rmSync(sb.tmp, { recursive: true, force: true }); }
}

// ---------- Missing transcript_path tolerated ----------
console.log("stop-plan-verify — missing transcript_path tolerated:");
{
  const sb = setupSandbox("no-transcript");
  try {
    seedOrchestra(sb.cwdDir);
    const r = runHook({ hook_event_name: "Stop", session_id: "x", cwd: sb.cwdDir });
    check(r.status === 0, `missing transcript_path exits 0`);
    check(r.stdout === "", `no stdout when transcript missing`);
  } finally { rmSync(sb.tmp, { recursive: true, force: true }); }
}

// ---------- No ExitPlanMode in turn → no block ----------
console.log("stop-plan-verify — no ExitPlanMode in turn → no block:");
{
  const sb = setupSandbox("no-exitplan");
  try {
    seedOrchestra(sb.cwdDir);
    const transcriptPath = join(sb.tmp, "transcript.jsonl");
    writeTranscript(transcriptPath, [{
      toolNames: ["Read", "Grep", "Glob", "Read"],
    }]);
    const r = runHook({
      hook_event_name: "Stop",
      session_id: "x",
      cwd: sb.cwdDir,
      transcript_path: transcriptPath,
    });
    check(r.status === 0, `no-ExitPlanMode exits 0`);
    check(r.stdout === "", `no-ExitPlanMode emits no stdout`);
  } finally { rmSync(sb.tmp, { recursive: true, force: true }); }
}

// ---------- Normal flow: ExitPlanMode last in turn → no block ----------
console.log("stop-plan-verify — ExitPlanMode as last tool_use → no block (normal):");
{
  const sb = setupSandbox("normal");
  try {
    seedOrchestra(sb.cwdDir);
    const transcriptPath = join(sb.tmp, "transcript.jsonl");
    writeTranscript(transcriptPath, [{
      toolNames: ["Read", "Grep", "ExitPlanMode"],
    }]);
    const r = runHook({
      hook_event_name: "Stop",
      session_id: "x",
      cwd: sb.cwdDir,
      transcript_path: transcriptPath,
    });
    check(r.status === 0, `normal-flow exits 0`);
    check(r.stdout === "", `normal-flow emits no stdout — ExitPlanMode ended turn correctly`);
  } finally { rmSync(sb.tmp, { recursive: true, force: true }); }
}

// ---------- DANGER: ExitPlanMode → Task in same turn → BLOCK ----------
console.log("stop-plan-verify — ExitPlanMode + Task same turn → block:");
{
  const sb = setupSandbox("silent-task");
  try {
    seedOrchestra(sb.cwdDir);
    const transcriptPath = join(sb.tmp, "transcript.jsonl");
    writeTranscript(transcriptPath, [{
      toolNames: ["Read", "ExitPlanMode", "Task"],
    }]);
    const r = runHook({
      hook_event_name: "Stop",
      session_id: "x",
      cwd: sb.cwdDir,
      transcript_path: transcriptPath,
    });
    check(r.status === 0, `block-path still exits 0 (hook signals via stdout)`);
    let payload;
    try { payload = JSON.parse(r.stdout); } catch { payload = null; }
    check(payload && payload.decision === "block", `decision:"block" emitted on stdout`);
    check(
      payload && /#50110/.test(payload.reason || ""),
      `reason cites anthropics/claude-code#50110`,
    );
    check(
      payload && /ORCHESTRA_HOOK_STOP_PLAN_VERIFY=off/.test(payload.reason || ""),
      `reason names the opt-out env var`,
    );
  } finally { rmSync(sb.tmp, { recursive: true, force: true }); }
}

// ---------- DANGER: ExitPlanMode → Agent (alias) → BLOCK ----------
console.log("stop-plan-verify — ExitPlanMode + Agent same turn → block:");
{
  const sb = setupSandbox("silent-agent");
  try {
    seedOrchestra(sb.cwdDir);
    const transcriptPath = join(sb.tmp, "transcript.jsonl");
    writeTranscript(transcriptPath, [{
      toolNames: ["ExitPlanMode", "Agent"],
    }]);
    const r = runHook({
      hook_event_name: "Stop",
      session_id: "x",
      cwd: sb.cwdDir,
      transcript_path: transcriptPath,
    });
    let payload;
    try { payload = JSON.parse(r.stdout); } catch { payload = null; }
    check(payload && payload.decision === "block", `Agent-spawn after ExitPlanMode also triggers block`);
  } finally { rmSync(sb.tmp, { recursive: true, force: true }); }
}

// ---------- DANGER: ExitPlanMode → Workflow (swarm dispatch) → BLOCK ----------
// Mechanism-A: the Phase 3 swarm dispatches as ONE Workflow call when native
// workflows are available. A Workflow launched in the SAME turn as ExitPlanMode
// is the same silent-approval exposure as a Task spawn and must block.
console.log("stop-plan-verify — ExitPlanMode + Workflow same turn → block:");
{
  const sb = setupSandbox("silent-workflow");
  try {
    seedOrchestra(sb.cwdDir);
    const transcriptPath = join(sb.tmp, "transcript.jsonl");
    writeTranscript(transcriptPath, [{
      toolNames: ["ExitPlanMode", "Workflow"],
    }]);
    const r = runHook({
      hook_event_name: "Stop",
      session_id: "x",
      cwd: sb.cwdDir,
      transcript_path: transcriptPath,
    });
    let payload;
    try { payload = JSON.parse(r.stdout); } catch { payload = null; }
    check(payload && payload.decision === "block", `Workflow swarm-dispatch after ExitPlanMode triggers block`);
    check(payload && /Workflow/.test(payload.reason || ""), `reason names the offending Workflow spawn`);
  } finally { rmSync(sb.tmp, { recursive: true, force: true }); }
}

// ---------- Cross-turn safe: ExitPlanMode prior turn, Task this turn → no block ----------
// "Current turn" = tail from most recent type:user line. A Task in this turn
// when ExitPlanMode lived in a prior turn (approved between turns) is the
// legitimate flow and must NOT block.
console.log("stop-plan-verify — ExitPlanMode prior turn + Task current turn → no block:");
{
  const sb = setupSandbox("cross-turn");
  try {
    seedOrchestra(sb.cwdDir);
    const transcriptPath = join(sb.tmp, "transcript.jsonl");
    writeTranscript(transcriptPath, [
      { userText: "/orchestra spec-to-code", toolNames: ["Read", "ExitPlanMode"] },
      { userText: "(approval signal)", toolNames: ["Write", "Task"] },
    ]);
    const r = runHook({
      hook_event_name: "Stop",
      session_id: "x",
      cwd: sb.cwdDir,
      transcript_path: transcriptPath,
    });
    check(r.status === 0, `cross-turn exits 0`);
    check(r.stdout === "", `cross-turn emits no stdout — Task in new turn after approval is legitimate`);
  } finally { rmSync(sb.tmp, { recursive: true, force: true }); }
}

// ---------- ExitPlanMode only, no later Task → no block ----------
console.log("stop-plan-verify — ExitPlanMode followed by non-Task tool → no block:");
{
  const sb = setupSandbox("benign-tail");
  try {
    seedOrchestra(sb.cwdDir);
    const transcriptPath = join(sb.tmp, "transcript.jsonl");
    writeTranscript(transcriptPath, [{
      toolNames: ["ExitPlanMode", "Read"],
    }]);
    const r = runHook({
      hook_event_name: "Stop",
      session_id: "x",
      cwd: sb.cwdDir,
      transcript_path: transcriptPath,
    });
    check(r.status === 0, `benign tail exits 0`);
    check(r.stdout === "", `Read after ExitPlanMode is harmless — no block`);
  } finally { rmSync(sb.tmp, { recursive: true, force: true }); }
}

if (failures > 0) {
  console.error(`stop-plan-verify.test.js: FAIL (${passes} passed, ${failures} failed)`);
  process.exit(1);
}
console.log(`stop-plan-verify.test.js: OK (${passes} assertions passed)`);
