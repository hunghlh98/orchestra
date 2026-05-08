#!/usr/bin/env node
// scripts/tests/metrics.test.js
// metrics-collector contract tests: append safety + rotation behavior.

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, readdirSync, statSync, realpathSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { computeUsd, RATES_USD_PER_MTOK } from "../../hooks/lib/rate-card.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
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
    const events = join(tmp, ".orchestra/metrics/events.jsonl");
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
    const dir = join(tmp, ".orchestra/metrics");
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
    const dir = join(tmp, ".orchestra/metrics");
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
  const metricsDir = join(tmp, ".orchestra/metrics");
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
            file_path: `${tmp}/.orchestra/local.yaml`,
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
            file_path: `${tmp}/.orchestra/pipeline/001-hello-world/PRD-001.md`,
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
            file_path: `${tmp}/.orchestra/pipeline/001-hello-world/CODE-REVIEW-001-hello-world.md`,
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
            file_path: `${tmp}/.orchestra/pipeline/001-hello-world/intent.yaml`,
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
      // TeamDelete observability — emits team.shutdown at run-end. Zero-param
      // primitive (verified via ToolSearch 2026-05-05); no tool_input fields
      // to lift. team_name + terminal_state are recoverable by joining
      // run_id against the immediately-preceding artifact.written:SUMMARY.
      {
        in: {
          session_id: "s1", cwd: tmp,
          hook_event_name: "PreToolUse", tool_name: "TeamDelete",
          tool_input: {},
        },
        expectEvent: "team.shutdown",
        expectExtra: {},
      },
      // SUMMARY-*.md closure receipt — verifies (a) inferArtifactType captures
      // "SUMMARY" from the feature-dir-root exception filename (regression
      // anchor for the new schema entry); (b) artifact.written is enriched
      // with team_name / terminal_state / duration_seconds via
      // extractSummaryFields (mirror of intent.yaml enrichment pattern).
      {
        in: {
          session_id: "s1", cwd: tmp,
          hook_event_name: "PreToolUse", tool_name: "Write",
          tool_input: {
            file_path: `${tmp}/.orchestra/pipeline/001-hello-world/SUMMARY-001-hello-world.md`,
            content: "---\nteam_name: orchestra-001-hello-world\nstarted_at: 2026-05-05T10:00:00Z\nended_at: 2026-05-05T10:05:30Z\nduration_seconds: 330\nterminal_state: success\nartifact_count: 12\n---\nClosure receipt.\n",
          },
        },
        expectEvent: "artifact.written",
        expectExtra: {
          feature_id: "001-hello-world",
          artifact_type: "SUMMARY",
          file_name: "SUMMARY-001-hello-world.md",
          tool: "Write",
          team_name: "orchestra-001-hello-world",
          terminal_state: "success",
          duration_seconds: "330",
        },
      },
    ];
    for (const c of cases) runHook(c.in);

    const events = readFileSync(join(tmp, ".orchestra/metrics/events.jsonl"), "utf8")
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
    const manifestPath = join(tmp, ".orchestra/metrics/manifest.json");
    check(existsSync(manifestPath), `manifest.json auto-created on first emission`);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    check(manifest.redact_prompts === true, `default redact_prompts is true`);
    check(manifest.telemetry_optin === "explicit", `default telemetry_optin is "explicit"`);
    check(manifest.schema_version === 1, `schema_version is 1`);

    // 4b.2: prompt_summary redacted by default.
    const events = readFileSync(join(tmp, ".orchestra/metrics/events.jsonl"), "utf8")
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
    const events2 = readFileSync(join(tmp, ".orchestra/metrics/events.jsonl"), "utf8")
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
    const events3 = readFileSync(join(tmp, ".orchestra/metrics/events.jsonl"), "utf8")
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

    const insightsPath = join(realProj, ".orchestra/metrics/insights.jsonl");
    const tokensPath = join(realProj, ".orchestra/metrics/tokens.jsonl");
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
      check(rows[0].text === insightBody1, `text captured by default (capture_insight_text:true)`);
      check(rows[0].line_count === 3, `line_count=3 for first insight (got ${rows[0].line_count})`);
      check(rows[0].char_count === insightBody1.length, `char_count matches body length`);

      // Flip capture_insight_text:false and re-trigger; new rows redact text.
      const manifestPath = join(realProj, ".orchestra/metrics/manifest.json");
      const m = JSON.parse(readFileSync(manifestPath, "utf8"));
      m.capture_insight_text = false;
      writeFileSync(manifestPath, JSON.stringify(m, null, 2));

      runHook(
        { hook_event_name: "SubagentStop", session_id: parentSid, cwd: realProj },
        { HOME: homeBase },
      );
      const rows2 = readFileSync(insightsPath, "utf8").split("\n").filter(Boolean).map(JSON.parse);
      check(rows2.length === 4, `2 more insight rows emitted on second hook (total ${rows2.length})`);
      check(rows2[2].text === null, `text redacted when capture_insight_text:false`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// --- 4c-bis. v4 sibling-dir subagent layout: tokens.jsonl + agent_role from .meta.json + dedup ---
console.log("metrics-collector v4 sibling-dir layout:");
{
  const tmp = mkdtempSync(join(tmpdir(), "orchestra-v4layout-"));
  const homeBase = join(tmp, "home");
  const project = join(tmp, "proj");
  mkdirSync(project, { recursive: true });
  const realProj = realpathSync(project);
  const encoded = realProj.replace(/\//g, "-");
  const parentSid = "parent-v4-layout";

  // v4 layout: ~/.claude/projects/<encoded>/<parentSid>/subagents/agent-*.jsonl
  // paired with agent-*.meta.json carrying {agentType: "orchestra:<role>"}.
  const subDir = join(homeBase, ".claude/projects", encoded, parentSid, "subagents");
  mkdirSync(subDir, { recursive: true });

  const subAgentId = "agent-abc123def456";
  const subPath = join(subDir, `${subAgentId}.jsonl`);
  const metaPath = join(subDir, `${subAgentId}.meta.json`);

  // Synthesize 3 streamed assistant turns, two with the same message.id
  // (streaming dupe — should count once after dedup).
  const usage = { input_tokens: 10, output_tokens: 100, cache_read_input_tokens: 1000, cache_creation_input_tokens: 50 };
  const lines = [
    JSON.stringify({ type: "user", message: { role: "user", content: "go" }}),
    JSON.stringify({ type: "assistant", message: { id: "msg_001", role: "assistant", content: [{ type: "text", text: "first" }], usage }}),
    JSON.stringify({ type: "assistant", message: { id: "msg_001", role: "assistant", content: [{ type: "text", text: "first (streamed dupe)" }], usage }}),
    JSON.stringify({ type: "assistant", message: { id: "msg_002", role: "assistant", content: [{ type: "text", text: "second" }], usage }}),
  ];
  writeFileSync(subPath, lines.join("\n") + "\n");
  writeFileSync(metaPath, JSON.stringify({ agentType: "orchestra:product", description: "@product authors PRD" }));

  try {
    const r = runHook(
      { hook_event_name: "SubagentStop", session_id: parentSid, cwd: realProj },
      { HOME: homeBase },
    );
    check(r.status === 0, `hook exited 0 (status=${r.status} stderr=${r.stderr})`);

    const tokensPath = join(realProj, ".orchestra/metrics/tokens.jsonl");
    check(existsSync(tokensPath), `tokens.jsonl created (stderr=${r.stderr})`);
    if (existsSync(tokensPath)) {
      const rows = readFileSync(tokensPath, "utf8").split("\n").filter(Boolean).map(JSON.parse);
      check(rows.length === 1, `1 tokens row emitted (got ${rows.length})`);
      check(rows[0].event === "subagent.tokens", `event field = subagent.tokens`);
      check(rows[0].run_id === parentSid, `run_id = parent's session_id`);
      check(rows[0].subagent_session_id === subAgentId, `subagent_session_id = agent-id from filename (got ${rows[0].subagent_session_id})`);
      check(rows[0].agent_role === "product", `agent_role lifted from .meta.json's agentType (got ${rows[0].agent_role})`);
      // Dedup by message.id: 3 usage rows in input, but msg_001 dupes — should count 2 unique turns.
      check(rows[0].tokens.input === 20, `dedup: input_tokens = 2 turns × 10 = 20 (got ${rows[0].tokens.input})`);
      check(rows[0].tokens.output === 200, `dedup: output_tokens = 2 turns × 100 = 200 (got ${rows[0].tokens.output})`);
      check(rows[0].tokens.cache_read === 2000, `dedup: cache_read = 2 turns × 1000 = 2000 (got ${rows[0].tokens.cache_read})`);
      check(rows[0].usd > 0, `usd computed`);
    }

    // insight extraction should also pick the v4 path (zero insights here — body has no ★ Insight blocks)
    const insightsPath = join(realProj, ".orchestra/metrics/insights.jsonl");
    if (existsSync(insightsPath)) {
      const irows = readFileSync(insightsPath, "utf8").split("\n").filter(Boolean).map(JSON.parse);
      check(irows.length === 0, `no insights emitted when subagent body has no ★ Insight blocks (got ${irows.length})`);
    } else {
      check(true, `insights.jsonl absent (zero blocks → no file) — acceptable`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// --- 4c-ter. agents_spawned aggregation uses agent_role (not agent_name which is null) ---
console.log("metrics-collector agents_spawned uses agent_role:");
{
  const tmp = mkdtempSync(join(tmpdir(), "orchestra-spawned-"));
  try {
    const sid = "spawn-1";
    runHook({ session_id: sid, cwd: tmp, hook_event_name: "UserPromptSubmit", prompt: "/orchestra build x" });
    // Three task.subagent.invoked events with subagent_type but no name —
    // agent_role is populated by deriveAgentRole, agent_name stays null.
    for (const role of ["orchestra:lead", "orchestra:product", "orchestra:lead"]) {
      runHook({
        session_id: sid, cwd: tmp,
        hook_event_name: "PreToolUse", tool_name: "Agent",
        tool_input: { subagent_type: role, prompt: "..." },
      });
    }
    runHook({
      session_id: sid, cwd: tmp,
      hook_event_name: "PreToolUse", tool_name: "Write",
      tool_input: {
        file_path: `${tmp}/.orchestra/pipeline/001-x/intent.yaml`,
        content: "feature_id: 001-x\nintent: feature\nconfidence: HIGH\n",
      },
    });
    runHook({ session_id: sid, cwd: tmp, hook_event_name: "Stop" });

    const summaryPath = join(tmp, `.orchestra/metrics/runs/${sid}.json`);
    check(existsSync(summaryPath), `run summary written`);
    if (existsSync(summaryPath)) {
      const s = JSON.parse(readFileSync(summaryPath, "utf8"));
      check(Array.isArray(s.agents_spawned), `agents_spawned is an array`);
      check(s.agents_spawned.includes("lead"), `agents_spawned includes "lead" (got ${JSON.stringify(s.agents_spawned)})`);
      check(s.agents_spawned.includes("product"), `agents_spawned includes "product"`);
      check(s.agents_spawned.length === 2, `agents_spawned dedupes (2 unique from 3 invocations, got ${s.agents_spawned.length})`);
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
        file_path: `${tmp}/.orchestra/pipeline/001-x/intent.yaml`,
        content: "feature_id: 001-x\nintent: feature\nconfidence: HIGH\npattern: Pattern A\nautonomy_level: FULL_AUTONOMY\n",
      },
    });
    runHook({ session_id: sid, cwd: tmp, hook_event_name: "Stop" });

    const runPath = join(tmp, ".orchestra/metrics/runs", `${sid}.json`);
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
        file_path: `${tmp}/.orchestra/pipeline/002-y/intent.yaml`,
        content: "feature_id: 002-y\nintent: docs\nconfidence: HIGH\npattern: Pattern A\n",
      },
    });
    runHook({ session_id: sid2, cwd: tmp, hook_event_name: "Stop" });
    const runPath2 = join(tmp, ".orchestra/metrics/runs", `${sid2}.json`);
    if (existsSync(runPath2)) {
      const summary2 = JSON.parse(readFileSync(runPath2, "utf8"));
      check(summary2.autonomy_level === null, `autonomy_level=null when YAML omits it (got ${summary2.autonomy_level})`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// --- 4e. Rate card + cost_usd persistence (T-04-38; theme γ) ---
console.log("metrics-collector cost_usd persistence:");
{
  // Unit: rate-card pure function. 1M input under Opus 4.7 = $15 exactly.
  check(computeUsd({ input: 1_000_000 }) === 15.0, `1M input = $15`);
  check(computeUsd({ output: 1_000_000 }) === 75.0, `1M output = $75`);
  check(computeUsd({}) === 0, `empty tokens = $0`);
  check(computeUsd(null) === 0, `null tokens = $0 (no throw)`);
  // Mixed: 100K input + 50K output = (0.1 × $15) + (0.05 × $75) = $1.50 + $3.75 = $5.25
  check(computeUsd({ input: 100_000, output: 50_000 }) === 5.25, `100K input + 50K output = $5.25`);
  check(typeof RATES_USD_PER_MTOK.input === "number" && RATES_USD_PER_MTOK.input > 0,
    `RATES_USD_PER_MTOK.input is exported and positive`);

  // Integration: run summary contains cost_usd field.
  const tmp = mkdtempSync(join(tmpdir(), "orchestra-cost-"));
  try {
    const sid = "cost-1";
    runHook({ session_id: sid, cwd: tmp, hook_event_name: "UserPromptSubmit", prompt: "/orchestra build z" });
    runHook({ session_id: sid, cwd: tmp, hook_event_name: "Stop" });
    const runPath = join(tmp, ".orchestra/metrics/runs", `${sid}.json`);
    check(existsSync(runPath), `runs/${sid}.json created`);
    if (existsSync(runPath)) {
      const summary = JSON.parse(readFileSync(runPath, "utf8"));
      check("cost_usd" in summary, `cost_usd present in run summary (got keys: ${Object.keys(summary).join(",")})`);
      check(typeof summary.cost_usd === "number", `cost_usd is a number (got ${typeof summary.cost_usd})`);
      check(summary.cost_usd >= 0, `cost_usd >= 0 (got ${summary.cost_usd})`);
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// --- 4f. Stream 7 enrichments — phase, agent_role, artifact_id, status ---
console.log("metrics-collector Stream 7 enrichments:");
{
  const tmp = mkdtempSync(join(tmpdir(), "orchestra-stream7-"));
  const metricsDir = join(tmp, ".orchestra/metrics");
  mkdirSync(metricsDir, { recursive: true });
  writeFileSync(
    join(metricsDir, "manifest.json"),
    JSON.stringify({ schema_version: 1, redact_prompts: false, telemetry_optin: "explicit" }, null, 2),
  );
  try {
    // 4f.1: agent_role + phase on task.subagent.invoked
    runHook({
      session_id: "s7", cwd: tmp,
      hook_event_name: "PreToolUse", tool_name: "Agent",
      tool_input: {
        subagent_type: "orchestra:lead",
        name: "@lead",
        prompt: "phase: component\nRoute through Component layer.",
      },
    });
    // 4f.2: agent_role-only fallback when subagent_type is bare
    runHook({
      session_id: "s7", cwd: tmp,
      hook_event_name: "PreToolUse", tool_name: "Agent",
      tool_input: { subagent_type: "evaluator", prompt: "no phase here" },
    });
    // 4f.3: artifact_id on artifact.written
    runHook({
      session_id: "s7", cwd: tmp,
      hook_event_name: "PreToolUse", tool_name: "Write",
      tool_input: {
        file_path: `${tmp}/.orchestra/pipeline/001-x/PRD-001.md`,
        content: "---\nid: PRD-001\n---\n",
      },
    });

    const events = readFileSync(join(metricsDir, "events.jsonl"), "utf8")
      .split("\n").filter(Boolean).map(l => JSON.parse(l));
    const inv1 = events.find(e => e.event === "task.subagent.invoked" && e.subagent_type === "orchestra:lead");
    check(inv1?.agent_role === "lead", `agent_role strips orchestra: prefix (got ${inv1?.agent_role})`);
    check(inv1?.phase === "component", `phase parsed from prompt body (got ${inv1?.phase})`);
    const inv2 = events.find(e => e.event === "task.subagent.invoked" && e.subagent_type === "evaluator");
    check(inv2?.agent_role === "evaluator", `agent_role passes through bare subagent_type (got ${inv2?.agent_role})`);
    check(inv2?.phase === null, `phase is null when prompt has no marker (got ${inv2?.phase})`);
    const aw = events.find(e => e.event === "artifact.written" && e.file_name === "PRD-001.md");
    check(aw?.artifact_id === "PRD-001", `artifact_id derived from filename (got ${aw?.artifact_id})`);

    // 4f.4: status field in run summary — completed path (no DEADLOCK, no ESCALATE)
    const sidOk = "s7-ok";
    runHook({ session_id: sidOk, cwd: tmp, hook_event_name: "UserPromptSubmit", prompt: "/orchestra build" });
    runHook({ session_id: sidOk, cwd: tmp, hook_event_name: "Stop" });
    const okRun = JSON.parse(readFileSync(join(metricsDir, "runs", `${sidOk}.json`), "utf8"));
    check(okRun.status === "completed", `status=completed when no failure markers (got ${okRun.status})`);

    // 4f.5: status field — deadlocked path
    const sidDl = "s7-dl";
    runHook({ session_id: sidDl, cwd: tmp, hook_event_name: "UserPromptSubmit", prompt: "/orchestra build" });
    runHook({
      session_id: sidDl, cwd: tmp,
      hook_event_name: "PreToolUse", tool_name: "Write",
      tool_input: {
        file_path: `${tmp}/.orchestra/pipeline/002-dl/DEADLOCK-002-dl.md`,
        content: "deadlock: spec_gap",
      },
    });
    runHook({ session_id: sidDl, cwd: tmp, hook_event_name: "Stop" });
    const dlRun = JSON.parse(readFileSync(join(metricsDir, "runs", `${sidDl}.json`), "utf8"));
    check(dlRun.status === "deadlocked", `status=deadlocked when DEADLOCK artifact written (got ${dlRun.status})`);
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
    const events = join(tmp, ".orchestra/metrics/events.jsonl");
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
