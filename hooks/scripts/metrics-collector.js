#!/usr/bin/env node
// hooks/scripts/metrics-collector.js
// Observer hook (multi-event): appends one JSONL line per hook trigger to
// <cwd>/.claude/.orchestra/metrics/events.jsonl. Rotates at 50MB
// (configurable via ORCHESTRA_METRICS_ROTATE_BYTES for tests).
// Subscribed events: UserPromptSubmit, PreToolUse(Task),
// PreToolUse(mcp__orchestra-*), SubagentStop, Stop.
// See DESIGN-001-infra §3.6 / PRD §9.9.

import {
  existsSync, mkdirSync, appendFileSync, statSync, readFileSync, writeFileSync,
  readdirSync, rmSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { gzipSync } from "node:zlib";

const NAME = "ORCHESTRA_HOOK_METRICS_COLLECTOR";

if (process.env[NAME] === "off") {
  emitHookOutputIfPreToolUse();
  process.exit(0);
}

main();

async function main() {
  let stdin = "";
  try {
    process.stdin.setEncoding("utf8");
    for await (const chunk of process.stdin) stdin += chunk;
    const input = JSON.parse(stdin);

    const event = classify(input);
    if (event) {
      const cwd = input.cwd || process.cwd();
      const dir = join(cwd, ".claude/.orchestra/metrics");
      const path = join(dir, "events.jsonl");
      try {
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        appendFileSync(path, JSON.stringify(event) + "\n");
        rotateIfNeeded(path, dir);
      } catch (e) {
        // best-effort; never blocks
        process.stderr.write(`metrics-collector append failed: ${e.message}\n`);
      }
    }

    if (input.hook_event_name === "PreToolUse") {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow" },
      }));
    }
    process.exit(0);
  } catch (err) {
    process.stderr.write(`metrics-collector crashed: ${err.message}\n`);
    emitHookOutputIfPreToolUse(stdin);
    process.exit(0);
  }
}

function classify(input) {
  const ts = new Date().toISOString();
  const run_id = input.session_id || "unknown";
  const hookEvent = input.hook_event_name;
  const toolName = input.tool_name;

  if (hookEvent === "UserPromptSubmit") {
    const prompt = input.prompt || "";
    return {
      ts, event: "prompt.submitted",
      matched_orchestra: typeof prompt === "string" && prompt.trimStart().startsWith("/orchestra"),
      run_id,
    };
  }
  if (hookEvent === "PreToolUse" && toolName === "Task") {
    return {
      ts, event: "task.subagent.invoked",
      subagent_type: input?.tool_input?.subagent_type || "unknown",
      run_id,
    };
  }
  if (hookEvent === "PreToolUse" && typeof toolName === "string" && toolName.startsWith("mcp__orchestra-")) {
    return { ts, event: "mcp.tool.called", tool: toolName, run_id };
  }
  if (hookEvent === "SubagentStop") {
    return { ts, event: "subagent.stopped", run_id };
  }
  if (hookEvent === "Stop") {
    return { ts, event: "session.stopped", run_id };
  }
  return null;
}

function rotateIfNeeded(path, dir) {
  const rotateBytes = parseInt(process.env.ORCHESTRA_METRICS_ROTATE_BYTES || "50000000", 10);
  let size;
  try { size = statSync(path).size; }
  catch { return; }
  if (size <= rotateBytes) return;

  const tsName = new Date().toISOString().replace(/[:.]/g, "-");
  const archivePath = join(dir, `events-${tsName}.jsonl.gz`);
  try {
    const data = readFileSync(path);
    writeFileSync(archivePath, gzipSync(data));
    writeFileSync(path, ""); // truncate
  } catch (e) {
    process.stderr.write(`metrics-collector rotation failed: ${e.message}\n`);
    return;
  }

  // Retain last 5 archives; sorted by name (ISO timestamps sort lexicographically).
  try {
    const archives = readdirSync(dir)
      .filter(f => /^events-.+\.jsonl\.gz$/.test(f))
      .sort();
    while (archives.length > 5) {
      const oldest = archives.shift();
      rmSync(join(dir, oldest), { force: true });
    }
  } catch {
    // best-effort
  }
}

function emitHookOutputIfPreToolUse(stdin) {
  // Best-effort emission for opt-out / crash paths. We don't always know the
  // event type without parsing stdin, so emit the safe allow envelope only
  // when we can infer it; otherwise stay silent.
  try {
    if (stdin) {
      const input = JSON.parse(stdin);
      if (input.hook_event_name === "PreToolUse") {
        process.stdout.write(JSON.stringify({
          hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow" },
        }));
      }
    }
  } catch {
    // silent
  }
}
