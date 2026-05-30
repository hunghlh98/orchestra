#!/usr/bin/env node
// hooks/scripts/metrics-collector.js
// Observer hook (multi-event): appends one JSONL line per hook trigger to
// <cwd>/.orchestra/metrics/events.jsonl, rotates at 50MB
// (ORCHESTRA_METRICS_ROTATE_BYTES overrides for tests), and on SubagentStop /
// parent Stop emits derived artifacts via hooks/lib/metrics-aggregators.js.
//
// Subscribed: UserPromptSubmit, PreToolUse(Task|Agent|Workflow|TeamCreate|
// TeamDelete|Skill|TaskCreate|TaskUpdate|mcp__orchestra-*|Write|Edit|MultiEdit),
// SubagentStop, Stop. Write/Edit/MultiEdit is filtered to local.yaml + pipeline
// artifacts — the dispatcher uses Write to place computed YAML, this hook
// observes-and-emits. On Stop, Workflow-path swarm-agent tokens are harvested
// from subagents/workflows/. Agents do NOT emit events.

import { existsSync, mkdirSync, statSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import { safeAppend, safeRead, safeWrite } from "../lib/safe-fs.js";
import { classify } from "../lib/event-shapers.js";
import { matchField } from "../lib/field-extract.js";
import { ensureManifest, applyRedaction } from "../lib/redaction.js";
import {
  readActivePhase, findJustStoppedSubagent, getProjectSessionsDir,
  isDuplicateSubagentStop,
} from "../lib/jsonl-emit.js";
import {
  emitSubagentTokens, emitWorkflowSwarmTokens, emitInsightsForSession,
  emitRunSummary, emitCostByPhase,
} from "../lib/metrics-aggregators.js";
import { readBoundedStdin } from "../lib/stdin-bounded.js";

const NAME = "ORCHESTRA_HOOK_METRICS_COLLECTOR";

if (process.env[NAME] === "off") {
  emitHookOutputIfPreToolUse();
  process.exit(0);
}

main();

async function main() {
  let stdin = "";
  try {
    const r = await readBoundedStdin();
    if (r.overflow) {
      process.stderr.write(`metrics-collector: stdin exceeded 1 MiB cap (${r.bytes} bytes) — skipping\n`);
      process.exit(0);
    }
    stdin = r.text;
    const input = JSON.parse(stdin);

    // Cold-start gate: no orchestra session has materialized in this project
    // until .orchestra/system.yaml exists (written by mcp__orchestra-utils__write_system_yaml
    // on first /orchestra invocation). Until then, no-op so this hook never
    // creates .orchestra/ unsolicited in projects that only have the plugin installed.
    {
      const cwdGuess = input.cwd || process.cwd();
      if (!existsSync(join(cwdGuess, ".orchestra/system.yaml"))) {
        if (input.hook_event_name === "PreToolUse") {
          process.stdout.write(JSON.stringify({
            hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow" },
          }));
        }
        process.exit(0);
      }
    }

    // Pre-resolve subagent identity before classify() so classify stays pure.
    // Dedupe: the SubagentStop hook may fire twice per real subagent stop
    // (observed in the wild — same sid in tokens.jsonl with identical totals).
    // Skip the entire emission path if a prior subagent.stopped row already
    // exists for this run_id + sid pair.
    if (input.hook_event_name === "SubagentStop") {
      const sub = findJustStoppedSubagent(input);
      if (sub) {
        const eventsPath = join(input.cwd || process.cwd(), ".orchestra/metrics/events.jsonl");
        if (isDuplicateSubagentStop(eventsPath, input.session_id || "", sub.sid)) {
          process.exit(0);
        }
      }
      input._sub = sub;
    }

    const event = classify(input);
    if (event) {
      const cwd = input.cwd || process.cwd();
      const dir = join(cwd, ".orchestra/metrics");
      const path = join(dir, "events.jsonl");
      try {
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        const manifest = ensureManifest(dir);
        if (manifest.redact_prompts) applyRedaction(event);

        // Auto-emit pipeline.phase.start/end on spawn-phase transitions.
        // A spawn with phase=X following an open phase=Y closes Y and opens X.
        if (event.event === "task.subagent.invoked" && event.phase) {
          const active = readActivePhase(path);
          if (active !== event.phase) {
            if (active) {
              safeAppend(path, JSON.stringify({
                ts: event.ts, event: "pipeline.phase.end",
                phase: active, run_id: event.run_id || null,
              }));
            }
            safeAppend(path, JSON.stringify({
              ts: event.ts, event: "pipeline.phase.start",
              phase: event.phase, run_id: event.run_id || null,
            }));
          }
        }

        safeAppend(path, JSON.stringify(event));
        rotateIfNeeded(path, dir);
      } catch (e) {
        process.stderr.write(`metrics-collector append failed: ${e.message}\n`);
      }
    }

    // SubagentStop: tokens.jsonl row + insights.jsonl scan. Token emission and
    // insight emission are independent — insights captured even when token
    // count is zero.
    if (input.hook_event_name === "SubagentStop") {
      try {
        const sub = input._sub;
        if (sub) {
          emitSubagentTokens(input, sub);
          emitInsightsForSession(input, sub.path, sub.sid, sub.role);
        }
      } catch (e) {
        process.stderr.write(`metrics-collector tokens/insights emit failed: ${e.message}\n`);
      }
    }

    // Parent dispatcher Stop: parent insights first (so emitRunSummary's
    // insights_count tally includes them), then runs/<run-id>.json +
    // cost-by-phase.json. emitRunSummary internally checks for
    // matched_orchestra:true prompt.submitted, so subagent stops short-circuit
    // harmlessly.
    if (input.hook_event_name === "Stop") {
      try {
        const cwd = input.cwd || process.cwd();
        const sid = input.session_id || "";
        if (sid) {
          const parentPath = join(getProjectSessionsDir(cwd), `${sid}.jsonl`);
          if (existsSync(parentPath)) emitInsightsForSession(input, parentPath, sid, "dispatcher");
        }
        // Harvest Workflow-path swarm agent tokens BEFORE the aggregators so
        // emitRunSummary totals + emitCostByPhase attribution see them.
        emitWorkflowSwarmTokens(input);
        emitRunSummary(input);
        emitCostByPhase(input);
      } catch (e) {
        process.stderr.write(`metrics-collector run summary failed: ${e.message}\n`);
      }
    }

    if (input.hook_event_name === "PreToolUse") {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow" },
      }));
    }

    // Per-turn state reinforcement: re-inject pipeline phase + round_trip into
    // model context on every prompt. Suppressed when local.yaml is absent
    // (greenfield pre-bootstrap stays silent). Best-effort: never blocks.
    if (input.hook_event_name === "UserPromptSubmit") {
      try {
        const ctx = composeOrchestraContext(input.cwd || process.cwd());
        if (ctx) {
          process.stdout.write(JSON.stringify({
            hookSpecificOutput: {
              hookEventName: "UserPromptSubmit",
              additionalContext: ctx,
            },
          }));
        }
      } catch (e) {
        process.stderr.write(`metrics-collector context inject failed: ${e.message}\n`);
      }
    }
    process.exit(0);
  } catch (err) {
    process.stderr.write(`metrics-collector crashed: ${err.message}\n`);
    emitHookOutputIfPreToolUse(stdin);
    process.exit(0);
  }
}

function rotateIfNeeded(path, dir) {
  const rotateBytes = parseInt(process.env.ORCHESTRA_METRICS_ROTATE_BYTES || "50000000", 10);
  let size;
  try { size = statSync(path).size; } catch { return; }
  if (size <= rotateBytes) return;

  const tsName = new Date().toISOString().replace(/[:.]/g, "-");
  const archivePath = join(dir, `events-${tsName}.jsonl.gz`);
  try {
    const data = readFileSync(path);
    safeWrite(archivePath, gzipSync(data));
    safeWrite(path, "");
  } catch (e) {
    process.stderr.write(`metrics-collector rotation failed: ${e.message}\n`);
    return;
  }

  // Retain last 5 archives; ISO timestamps sort lexicographically.
  try {
    const archives = readdirSync(dir)
      .filter(f => /^events-.+\.jsonl\.gz$/.test(f))
      .sort();
    while (archives.length > 5) {
      const oldest = archives.shift();
      rmSync(join(dir, oldest), { force: true });
    }
  } catch {}
}

function composeOrchestraContext(cwd) {
  const localPath = join(cwd, ".orchestra/local.yaml");
  const buf = safeRead(localPath, 65536);
  if (!buf) return null;
  const text = buf.toString("utf8");
  const phase = readActivePhase(join(cwd, ".orchestra/metrics/events.jsonl")) || "—";
  const roundTrip = matchField(text, /^round_trip:\s*([A-Z_]+)/m) || "—";
  return `[orchestra] phase: ${phase} | round_trip: ${roundTrip}`;
}

function emitHookOutputIfPreToolUse(stdin) {
  try {
    if (stdin) {
      const input = JSON.parse(stdin);
      if (input.hook_event_name === "PreToolUse") {
        process.stdout.write(JSON.stringify({
          hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow" },
        }));
      }
    }
  } catch {}
}
