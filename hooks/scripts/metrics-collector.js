#!/usr/bin/env node
// hooks/scripts/metrics-collector.js
// Observer hook (multi-event): appends one JSONL line per hook trigger to
// <cwd>/.claude/.orchestra/metrics/events.jsonl. Rotates at 50MB
// (configurable via ORCHESTRA_METRICS_ROTATE_BYTES for tests).
// Subscribed events: UserPromptSubmit, PreToolUse(Task),
// PreToolUse(mcp__orchestra-*), PreToolUse(Write|Edit|MultiEdit),
// SubagentStop, Stop.
// See DESIGN-001-infra §3.6 / PRD §9.9.
//
// PreToolUse(Write|Edit|MultiEdit) is filtered to local.yaml writes only —
// when something writes <cwd>/.claude/.orchestra/local.yaml, this hook parses
// the proposed YAML content and emits `local.bootstrapped`. Per the PRD §9.9
// hook-only invariant: events.jsonl is hook territory; the bootstrap script
// computes the YAML, the dispatcher uses Claude Code's Write tool to put it
// in place, and this hook observes-and-emits. Agents do NOT emit events.

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
  if (hookEvent === "PreToolUse" && (toolName === "Task" || toolName === "Agent")) {
    const ti = input?.tool_input || {};
    return {
      ts, event: "task.subagent.invoked",
      subagent_type: ti.subagent_type || "unknown",
      agent_name: ti.name || null,                       // e.g. "@lead" — present when invoked via TeamCreate flow
      team_name: ti.team_name || null,                   // present when joined to a team
      tool: toolName,                                    // distinguishes legacy Task from canonical Agent
      prompt_summary: typeof ti.prompt === "string" ? ti.prompt.slice(0, 200) : "",
      run_id,
    };
  }
  if (hookEvent === "PreToolUse" && toolName === "TeamCreate") {
    const ti = input?.tool_input || {};
    return {
      ts, event: "team.created", run_id,
      team_name: ti.team_name || "unknown",
      agent_type: ti.agent_type || "unknown",
      description: typeof ti.description === "string" ? ti.description.slice(0, 200) : "",
    };
  }
  if (hookEvent === "PreToolUse" && typeof toolName === "string" && toolName.startsWith("mcp__orchestra-")) {
    return { ts, event: "mcp.tool.called", tool: toolName, run_id };
  }
  if (hookEvent === "PreToolUse" && (toolName === "Write" || toolName === "Edit" || toolName === "MultiEdit")) {
    const filePath = input?.tool_input?.file_path || "";
    if (typeof filePath !== "string") return null;
    if (filePath.endsWith("/.claude/.orchestra/local.yaml")) {
      const fields = extractBootstrapFields(input?.tool_input);
      return {
        ts, event: "local.bootstrapped", run_id,
        mode: fields.mode || "unknown",
        project_mode: fields.mode || "unknown",
        primary_language: fields.primary_language || "unknown",
        framework: fields.framework || "unknown",
      };
    }
    // Pipeline-artifact observability: any write under
    // <cwd>/.claude/.orchestra/pipeline/<feature-id>/<file> emits an
    // `artifact.written` event so events.jsonl alone reconstructs the artifact
    // tree without needing Claude Code's session jsonl.
    const pipelineMatch = filePath.match(/\/\.claude\/\.orchestra\/pipeline\/([^/]+)\/([^/]+)$/);
    if (pipelineMatch) {
      return {
        ts, event: "artifact.written", run_id,
        feature_id: pipelineMatch[1],
        artifact_type: inferArtifactType(pipelineMatch[2]),
        file_name: pipelineMatch[2],
        tool: toolName,
      };
    }
    return null; // other Write/Edit calls aren't logged here (no behavioral capture)
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

// Best-effort extraction of bootstrap fields from local.yaml proposed content.
// Scans for `mode:`, `primary_language:`, `framework:` lines without invoking a
// full YAML parser (keeps the hook stdlib-only and crash-resistant).
// For Write: tool_input.content is the full proposed file. For Edit: we extract
// from new_string when the change is creating or replacing the relevant lines.
function extractBootstrapFields(toolInput) {
  if (!toolInput) return {};
  const candidates = [];
  if (typeof toolInput.content === "string") candidates.push(toolInput.content);
  if (typeof toolInput.new_string === "string") candidates.push(toolInput.new_string);
  if (Array.isArray(toolInput.edits)) {
    for (const e of toolInput.edits) {
      if (typeof e?.new_string === "string") candidates.push(e.new_string);
    }
  }
  const text = candidates.join("\n");
  return {
    mode: matchField(text, /^mode:\s*([a-z]+)/m),
    primary_language: matchField(text, /^primary_language:\s*([a-z0-9_-]+)/m),
    framework: matchField(text, /^framework:\s*([a-z0-9_-]+)/m),
  };
}

function matchField(text, re) {
  const m = text.match(re);
  return m ? m[1] : undefined;
}

// Infer artifact type from filename. Two patterns:
//   1. UPPERCASE-NNN... → captures everything before "-<digit>".
//      PRD-001.md → "PRD"; CODE-REVIEW-001-hello-world.md → "CODE-REVIEW";
//      API-001.openapi.yaml → "API"; ESCALATE-001.md → "ESCALATE".
//   2. Known lowercase singletons (e.g. intent.yaml).
// Falls back to "unknown" so the event is still emitted (run_id + file_name
// preserve traceability even when we can't classify).
function inferArtifactType(fileName) {
  const m = fileName.match(/^([A-Z][A-Z0-9-]*?)-\d/);
  if (m) return m[1];
  if (fileName === "intent.yaml") return "intent";
  return "unknown";
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
