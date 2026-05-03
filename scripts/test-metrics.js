#!/usr/bin/env node
// scripts/test-metrics.js
// metrics-collector contract tests: append safety + rotation behavior.

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const collector = resolve(root, "hooks/scripts/metrics-collector.js");
let passes = 0, failures = 0;

function check(cond, msg) {
  if (cond) passes++;
  else { failures++; console.error(`  FAIL: ${msg}`); }
}

function runHook(stdinObj, env = {}) {
  return spawnSync("node", [collector], {
    input: JSON.stringify(stdinObj),
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

// --- 1. Sequential-append safety ---
console.log("metrics-collector append safety:");
{
  const tmp = mkdtempSync(join(tmpdir(), "orchestra-metrics-"));
  try {
    const N = 100;
    for (let i = 0; i < N; i++) {
      const r = runHook({
        session_id: `s-${i}`,
        cwd: tmp,
        hook_event_name: "Stop",
      });
      if (r.status !== 0) {
        check(false, `append #${i} exit code (got ${r.status}; stderr: ${r.stderr})`);
        break;
      }
    }
    const events = join(tmp, ".claude/.orchestra/metrics/events.jsonl");
    check(existsSync(events), `events.jsonl created`);
    if (existsSync(events)) {
      const lines = readFileSync(events, "utf8").split("\n").filter(Boolean);
      check(lines.length === N, `${N} lines appended (got ${lines.length})`);
      let allParse = true;
      for (const line of lines) {
        try { JSON.parse(line); }
        catch { allParse = false; break; }
      }
      check(allParse, `every line is valid JSON (no torn writes)`);
      const allHaveEvent = lines.every(l => JSON.parse(l).event === "session.stopped");
      check(allHaveEvent, `every line has event=session.stopped`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// --- 2. Rotation: writes triggering > threshold create archive ---
console.log("metrics-collector rotation:");
{
  const tmp = mkdtempSync(join(tmpdir(), "orchestra-rotate-"));
  try {
    // Threshold: 200 bytes — small enough that ~3 events trigger rotation.
    const env = { ORCHESTRA_METRICS_ROTATE_BYTES: "200" };
    for (let i = 0; i < 5; i++) {
      runHook({ session_id: `s-${i}`, cwd: tmp, hook_event_name: "Stop" }, env);
    }
    const dir = join(tmp, ".claude/.orchestra/metrics");
    const archives = readdirSync(dir).filter(f => /^events-.+\.jsonl\.gz$/.test(f));
    check(archives.length >= 1, `rotation produced at least one .jsonl.gz archive (got ${archives.length})`);
    const events = join(dir, "events.jsonl");
    check(existsSync(events), `events.jsonl still present after rotation`);
    if (archives.length >= 1) {
      const archivePath = join(dir, archives[0]);
      const archiveSize = statSync(archivePath).size;
      check(archiveSize > 0, `archive file is non-empty (gzipped)`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// --- 3. Retention: only last 5 archives kept ---
console.log("metrics-collector retention:");
{
  const tmp = mkdtempSync(join(tmpdir(), "orchestra-retain-"));
  try {
    const env = { ORCHESTRA_METRICS_ROTATE_BYTES: "100" };
    // Force 8 rotations by writing many events.
    for (let i = 0; i < 30; i++) {
      runHook({ session_id: `s-${i}`, cwd: tmp, hook_event_name: "Stop" }, env);
    }
    const dir = join(tmp, ".claude/.orchestra/metrics");
    const archives = readdirSync(dir).filter(f => /^events-.+\.jsonl\.gz$/.test(f));
    check(archives.length <= 5, `retention prunes to <= 5 archives (got ${archives.length})`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// --- 4. Event classification by hook_event_name ---
console.log("metrics-collector event classification:");
{
  const tmp = mkdtempSync(join(tmpdir(), "orchestra-classify-"));
  try {
    const cases = [
      {
        in: { session_id: "s1", cwd: tmp, hook_event_name: "UserPromptSubmit", prompt: "/orchestra fix the bug" },
        expectEvent: "prompt.submitted",
        expectExtra: { matched_orchestra: true },
      },
      {
        in: { session_id: "s1", cwd: tmp, hook_event_name: "UserPromptSubmit", prompt: "regular chat message" },
        expectEvent: "prompt.submitted",
        expectExtra: { matched_orchestra: false },
      },
      {
        in: { session_id: "s1", cwd: tmp, hook_event_name: "PreToolUse", tool_name: "Task", tool_input: { subagent_type: "evaluator" } },
        expectEvent: "task.subagent.invoked",
        expectExtra: { subagent_type: "evaluator", tool: "Task" },
      },
      // Canonical "Agent" invocation with full team/name fields populated.
      // Verifies the event is enriched with agent_name, team_name, prompt_summary
      // so events.jsonl alone can reconstruct the orchestration trace.
      {
        in: {
          session_id: "s1", cwd: tmp,
          hook_event_name: "PreToolUse", tool_name: "Agent",
          tool_input: {
            subagent_type: "orchestra:lead",
            name: "@lead",
            team_name: "orchestra-001-hello-world",
            prompt: "Classify the user intent for this run and write intent.yaml",
          },
        },
        expectEvent: "task.subagent.invoked",
        expectExtra: {
          subagent_type: "orchestra:lead",
          agent_name: "@lead",
          team_name: "orchestra-001-hello-world",
          tool: "Agent",
        },
      },
      // TeamCreate observability — surfaces the team boundary in events.jsonl
      // so smoke runs can be replayed without reading Claude Code's session jsonl.
      {
        in: {
          session_id: "s1", cwd: tmp,
          hook_event_name: "PreToolUse", tool_name: "TeamCreate",
          tool_input: {
            team_name: "orchestra-001-hello-world",
            agent_type: "orchestra-coordinator",
            description: "Orchestra v1 run for adding a hello-world README",
          },
        },
        expectEvent: "team.created",
        expectExtra: {
          team_name: "orchestra-001-hello-world",
          agent_type: "orchestra-coordinator",
        },
      },
      {
        in: { session_id: "s1", cwd: tmp, hook_event_name: "PreToolUse", tool_name: "mcp__orchestra-probe", tool_input: {} },
        expectEvent: "mcp.tool.called",
        expectExtra: { tool: "mcp__orchestra-probe" },
      },
      {
        in: { session_id: "s1", cwd: tmp, hook_event_name: "SubagentStop" },
        expectEvent: "subagent.stopped",
        expectExtra: {},
      },
      {
        in: { session_id: "s1", cwd: tmp, hook_event_name: "Stop" },
        expectEvent: "session.stopped",
        expectExtra: {},
      },
      {
        in: {
          session_id: "s1", cwd: tmp,
          hook_event_name: "PreToolUse", tool_name: "Write",
          tool_input: {
            file_path: `${tmp}/.claude/.orchestra/local.yaml`,
            content: "mode: greenfield\nhas_source: false\nprimary_language: none\nframework: none\n",
          },
        },
        expectEvent: "local.bootstrapped",
        expectExtra: { mode: "greenfield", primary_language: "none", framework: "none" },
      },
      // Pipeline artifact: PRD-001.md (single-segment artifact type)
      {
        in: {
          session_id: "s1", cwd: tmp,
          hook_event_name: "PreToolUse", tool_name: "Write",
          tool_input: {
            file_path: `${tmp}/.claude/.orchestra/pipeline/001-hello-world/PRD-001.md`,
            content: "---\nid: PRD-001\n---\n",
          },
        },
        expectEvent: "artifact.written",
        expectExtra: {
          feature_id: "001-hello-world",
          artifact_type: "PRD",
          file_name: "PRD-001.md",
          tool: "Write",
        },
      },
      // Pipeline artifact: CODE-REVIEW-... (multi-segment artifact type) via Edit
      {
        in: {
          session_id: "s1", cwd: tmp,
          hook_event_name: "PreToolUse", tool_name: "Edit",
          tool_input: {
            file_path: `${tmp}/.claude/.orchestra/pipeline/001-hello-world/CODE-REVIEW-001-hello-world.md`,
            old_string: "verdict: pending",
            new_string: "verdict: APPROVE",
          },
        },
        expectEvent: "artifact.written",
        expectExtra: {
          feature_id: "001-hello-world",
          artifact_type: "CODE-REVIEW",
          file_name: "CODE-REVIEW-001-hello-world.md",
          tool: "Edit",
        },
      },
      // Pipeline artifact: intent.yaml (lowercase singleton)
      {
        in: {
          session_id: "s1", cwd: tmp,
          hook_event_name: "PreToolUse", tool_name: "Write",
          tool_input: {
            file_path: `${tmp}/.claude/.orchestra/pipeline/001-hello-world/intent.yaml`,
            content: "intent: docs\n",
          },
        },
        expectEvent: "artifact.written",
        expectExtra: {
          feature_id: "001-hello-world",
          artifact_type: "intent",
          file_name: "intent.yaml",
          tool: "Write",
        },
      },
    ];
    for (const c of cases) runHook(c.in);

    const events = readFileSync(join(tmp, ".claude/.orchestra/metrics/events.jsonl"), "utf8")
      .split("\n").filter(Boolean).map(l => JSON.parse(l));
    check(events.length === cases.length, `${cases.length} events emitted (got ${events.length})`);
    for (let i = 0; i < cases.length; i++) {
      const got = events[i];
      const expectedEvent = cases[i].expectEvent;
      check(got?.event === expectedEvent, `event[${i}] is ${expectedEvent} (got ${got?.event})`);
      for (const [k, v] of Object.entries(cases[i].expectExtra)) {
        check(got?.[k] === v, `event[${i}].${k} === ${JSON.stringify(v)} (got ${JSON.stringify(got?.[k])})`);
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// --- 5. Env-var opt-out ---
console.log("metrics-collector opt-out:");
{
  const tmp = mkdtempSync(join(tmpdir(), "orchestra-optout-"));
  try {
    const r = runHook(
      { session_id: "s", cwd: tmp, hook_event_name: "Stop" },
      { ORCHESTRA_HOOK_METRICS_COLLECTOR: "off" }
    );
    check(r.status === 0, `opt-out: exits 0`);
    const events = join(tmp, ".claude/.orchestra/metrics/events.jsonl");
    check(!existsSync(events), `opt-out: no events file created`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

if (failures > 0) {
  console.error(`test-metrics.js: FAIL (${passes} passed, ${failures} failed)`);
  process.exit(1);
}
console.log(`test-metrics.js: OK (${passes} assertions passed)`);
