#!/usr/bin/env node
// scripts/test-metrics.js
// metrics-collector contract tests: append safety + rotation behavior.

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync, statSync, realpathSync, utimesSync } from "node:fs";
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
  // Pre-seed manifest with redact_prompts:false so this test can verify the
  // underlying classification (prompt_summary, description, args_summary)
  // without redaction interference. Redaction has dedicated coverage below.
  const metricsDir = join(tmp, ".claude/.orchestra/metrics");
  mkdirSync(metricsDir, { recursive: true });
  writeFileSync(
    join(metricsDir, "manifest.json"),
    JSON.stringify({ schema_version: 1, redact_prompts: false, telemetry_optin: "explicit" }, null, 2),
  );
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
      // Pipeline artifact: intent.yaml — verifies the lowercase singleton
      // path AND insight-tracker semantic enrichment (intent/confidence/pattern
      // extracted from YAML content into the event itself).
      {
        in: {
          session_id: "s1", cwd: tmp,
          hook_event_name: "PreToolUse", tool_name: "Write",
          tool_input: {
            file_path: `${tmp}/.claude/.orchestra/pipeline/001-hello-world/intent.yaml`,
            content: "feature_id: 001-hello-world\nintent: docs\nconfidence: HIGH\npattern: Pattern A\nautonomy_level: DRAFT_AND_GATE\n",
          },
        },
        expectEvent: "artifact.written",
        expectExtra: {
          feature_id: "001-hello-world",
          artifact_type: "intent",
          file_name: "intent.yaml",
          tool: "Write",
          intent: "docs",
          confidence: "HIGH",
          pattern: "Pattern A",
          autonomy_level: "DRAFT_AND_GATE",
        },
      },
      // Skill tool invocation — emits skill.invoked. Most decision-laden
      // moments of a feature run go through skills (task-breakdown,
      // write-contract, qa-test-planner, code-review).
      {
        in: {
          session_id: "s1", cwd: tmp,
          hook_event_name: "PreToolUse", tool_name: "Skill",
          tool_input: {
            skill: "write-contract",
            args: "feature 001 transfer endpoint",
          },
        },
        expectEvent: "skill.invoked",
        expectExtra: {
          skill: "write-contract",
          args_summary: "feature 001 transfer endpoint",
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

// --- 4b. Manifest + redaction policy ---
console.log("metrics-collector manifest + redaction:");
{
  // 4b.1: First emission creates manifest with privacy-first defaults.
  const tmp = mkdtempSync(join(tmpdir(), "orchestra-redact-"));
  try {
    runHook({
      session_id: "s1", cwd: tmp,
      hook_event_name: "PreToolUse", tool_name: "Task",
      tool_input: { subagent_type: "orchestra:lead", name: "@lead", prompt: "build me a tiny URL shortener" },
    });
    const manifestPath = join(tmp, ".claude/.orchestra/metrics/manifest.json");
    check(existsSync(manifestPath), `manifest.json auto-created on first emission`);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    check(manifest.redact_prompts === true, `default redact_prompts is true`);
    check(manifest.telemetry_optin === "explicit", `default telemetry_optin is "explicit"`);
    check(manifest.schema_version === 1, `schema_version is 1`);

    // 4b.2: prompt_summary redacted by default.
    const events = readFileSync(join(tmp, ".claude/.orchestra/metrics/events.jsonl"), "utf8")
      .split("\n").filter(Boolean).map(l => JSON.parse(l));
    const e = events[0];
    check(/^<redacted, len=\d+>$/.test(e.prompt_summary), `prompt_summary redacted by default (got ${JSON.stringify(e.prompt_summary)})`);

    // 4b.3: Flip redact_prompts:false and emit again — content visible.
    const m2 = { ...manifest, redact_prompts: false };
    writeFileSync(manifestPath, JSON.stringify(m2, null, 2));
    runHook({
      session_id: "s2", cwd: tmp,
      hook_event_name: "PreToolUse", tool_name: "Task",
      tool_input: { subagent_type: "orchestra:lead", name: "@lead", prompt: "VERBATIM USER TEXT" },
    });
    const events2 = readFileSync(join(tmp, ".claude/.orchestra/metrics/events.jsonl"), "utf8")
      .split("\n").filter(Boolean).map(l => JSON.parse(l));
    const e2 = events2[1];
    check(e2.prompt_summary === "VERBATIM USER TEXT", `prompt_summary visible when redact_prompts:false`);

    // 4b.4: team.created.description and skill.invoked.args_summary also redacted by default.
    // Re-flip to redact_prompts:true.
    writeFileSync(manifestPath, JSON.stringify({ ...m2, redact_prompts: true }, null, 2));
    runHook({
      session_id: "s3", cwd: tmp,
      hook_event_name: "PreToolUse", tool_name: "TeamCreate",
      tool_input: { team_name: "orchestra-x", agent_type: "orchestra-coordinator", description: "user-supplied team description" },
    });
    runHook({
      session_id: "s3", cwd: tmp,
      hook_event_name: "PreToolUse", tool_name: "Skill",
      tool_input: { skill: "write-contract", args: "user-supplied skill args" },
    });
    const events3 = readFileSync(join(tmp, ".claude/.orchestra/metrics/events.jsonl"), "utf8")
      .split("\n").filter(Boolean).map(l => JSON.parse(l));
    const teamEvent = events3.find(x => x.event === "team.created");
    const skillEvent = events3.find(x => x.event === "skill.invoked");
    check(/^<redacted, len=\d+>$/.test(teamEvent.description), `team.created.description redacted`);
    check(/^<redacted, len=\d+>$/.test(skillEvent.args_summary), `skill.invoked.args_summary redacted`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// --- 4c. Insight extraction (Explanatory Output style) ---
console.log("metrics-collector insight extraction:");
{
  // Build a synthetic session jsonl with two ★ Insight blocks in
  // assistant messages, then trigger SubagentStop and verify
  // insights.jsonl is populated correctly.
  const tmp = mkdtempSync(join(tmpdir(), "orchestra-insights-"));
  const homeBase = join(tmp, "home");
  const project = join(tmp, "proj");
  mkdirSync(project, { recursive: true });
  // Encoded cwd = realpath of project, with / -> -. Use realpath because
  // macOS /tmp -> /private/tmp via symlink.
  const realProj = realpathSync(project);
  const encoded = realProj.replace(/\//g, "-");
  const sessDir = join(homeBase, ".claude/projects", encoded);
  mkdirSync(sessDir, { recursive: true });

  // Two assistant messages each containing one ★ Insight block.
  const insightBody1 = "- bullet alpha\n- bullet beta\n- bullet gamma";
  const insightBody2 = "- single line";
  const horizon = "─".repeat(40);
  const star = "★";
  // Canonical Explanatory Output style: backticks around both bracket lines.
  const text1 = "Some text before.\n\n`" + star + " Insight " + horizon + "`\n" + insightBody1 + "\n`" + horizon + "`\n\nMore text after.";
  const text2 = "`" + star + " Insight " + horizon + "`\n" + insightBody2 + "\n`" + horizon + "`";

  const subSid = "subagent-with-insights";
  const subPath = join(sessDir, `${subSid}.jsonl`);
  const lines = [
    JSON.stringify({ type: "user", message: { role: "user", content: "You are @lead in the orchestra pipeline. Do work." }}),
    JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: text1 }] }}),
    JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: text2 }] }}),
  ];
  writeFileSync(subPath, lines.join("\n") + "\n");

  // Also write a parent session jsonl (older mtime) so the heuristic
  // picks up the subagent as the most recent non-parent.
  const parentSid = "parent-no-insights";
  const parentPath = join(sessDir, `${parentSid}.jsonl`);
  writeFileSync(parentPath, JSON.stringify({ type: "user", message: { role: "user", content: "/orchestra hi" }}) + "\n");
  const oldTime = Date.now() / 1000 - 100;
  utimesSync(parentPath, oldTime, oldTime);

  try {
    const r = runHook(
      { hook_event_name: "SubagentStop", session_id: parentSid, cwd: realProj },
      { HOME: homeBase },
    );
    check(r.status === 0, `hook exited 0 (status=${r.status} stderr=${r.stderr})`);

    const insightsPath = join(realProj, ".claude/.orchestra/metrics/insights.jsonl");
    const tokensPath = join(realProj, ".claude/.orchestra/metrics/tokens.jsonl");
    check(existsSync(insightsPath), `insights.jsonl created (tokens.jsonl exists=${existsSync(tokensPath)}; stderr=${r.stderr})`);
    if (!existsSync(insightsPath)) {
      // skip subsequent assertions to avoid noisy crash
    } else {
      const rows = readFileSync(insightsPath, "utf8").split("\n").filter(Boolean).map(JSON.parse);
      check(rows.length === 2, `2 insight rows emitted (got ${rows.length})`);
      check(rows[0].event === "insight.emitted", `event field = insight.emitted`);
      check(rows[0].run_id === parentSid, `run_id = parent's session_id`);
      check(rows[0].session_id === subSid, `session_id = subagent's id`);
      check(rows[0].agent_role === "lead", `agent_role identified from "You are @lead"`);
      check(rows[0].insight_index === 1, `first row insight_index=1`);
      check(rows[1].insight_index === 2, `insight_index increments sequentially per-session`);
      check(rows[0].text === null, `text null by default (capture_insight_text:false)`);
      check(rows[0].line_count === 3, `line_count=3 for first insight (got ${rows[0].line_count})`);
      check(rows[0].char_count === insightBody1.length, `char_count matches body length`);

      // Flip capture_insight_text:true and re-trigger; new rows carry text.
      const manifestPath = join(realProj, ".claude/.orchestra/metrics/manifest.json");
      const m = JSON.parse(readFileSync(manifestPath, "utf8"));
      m.capture_insight_text = true;
      writeFileSync(manifestPath, JSON.stringify(m, null, 2));

      runHook(
        { hook_event_name: "SubagentStop", session_id: parentSid, cwd: realProj },
        { HOME: homeBase },
      );
      const rows2 = readFileSync(insightsPath, "utf8").split("\n").filter(Boolean).map(JSON.parse);
      check(rows2.length === 4, `2 more insight rows emitted on second hook (total ${rows2.length})`);
      check(rows2[2].text === insightBody1, `text captured when capture_insight_text:true`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// --- 4d. Autonomy_level propagation into run summary (T-806/T-807) ---
console.log("metrics-collector autonomy_level in run summary:");
{
  const tmp = mkdtempSync(join(tmpdir(), "orchestra-autonomy-"));
  try {
    const sid = "auton-1";
    // emitRunSummary gates on a matching prompt.submitted with
    // matched_orchestra:true, so prime the run with UserPromptSubmit first.
    // Then: intent.yaml write → Stop. extractIntentFields plucks autonomy_level
    // and propagates onto the artifact.written event; emitRunSummary reads
    // events.jsonl, finds the intent.yaml event, copies the autonomy_level
    // field onto runs/<sid>.json.
    runHook({ session_id: sid, cwd: tmp, hook_event_name: "UserPromptSubmit", prompt: "/orchestra build x" });
    runHook({
      session_id: sid, cwd: tmp,
      hook_event_name: "PreToolUse", tool_name: "Write",
      tool_input: {
        file_path: `${tmp}/.claude/.orchestra/pipeline/001-x/intent.yaml`,
        content: "feature_id: 001-x\nintent: feature\nconfidence: HIGH\npattern: Pattern A\nautonomy_level: FULL_AUTONOMY\n",
      },
    });
    runHook({ session_id: sid, cwd: tmp, hook_event_name: "Stop" });

    const runPath = join(tmp, ".claude/.orchestra/metrics/runs", `${sid}.json`);
    check(existsSync(runPath), `runs/${sid}.json created`);
    if (existsSync(runPath)) {
      const summary = JSON.parse(readFileSync(runPath, "utf8"));
      check(summary.autonomy_level === "FULL_AUTONOMY", `autonomy_level=FULL_AUTONOMY in run summary (got ${summary.autonomy_level})`);
      check(summary.intent === "feature", `intent still propagates (got ${summary.intent})`);
    }

    // Inverse: missing autonomy_level in YAML → null in summary (default precedence kicks in at runtime, not at telemetry layer).
    const sid2 = "auton-2";
    runHook({ session_id: sid2, cwd: tmp, hook_event_name: "UserPromptSubmit", prompt: "/orchestra build y" });
    runHook({
      session_id: sid2, cwd: tmp,
      hook_event_name: "PreToolUse", tool_name: "Write",
      tool_input: {
        file_path: `${tmp}/.claude/.orchestra/pipeline/002-y/intent.yaml`,
        content: "feature_id: 002-y\nintent: docs\nconfidence: HIGH\npattern: Pattern A\n",
      },
    });
    runHook({ session_id: sid2, cwd: tmp, hook_event_name: "Stop" });
    const runPath2 = join(tmp, ".claude/.orchestra/metrics/runs", `${sid2}.json`);
    if (existsSync(runPath2)) {
      const summary2 = JSON.parse(readFileSync(runPath2, "utf8"));
      check(summary2.autonomy_level === null, `autonomy_level=null when YAML omits it (got ${summary2.autonomy_level})`);
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
