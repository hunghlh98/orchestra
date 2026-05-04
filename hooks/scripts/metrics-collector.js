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
  readdirSync, rmSync, realpathSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
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

    // SubagentStop also emits a tokens.jsonl row with measured token usage
    // for the subagent session that just ended. See emitSubagentTokens.
    if (input.hook_event_name === "SubagentStop") {
      try { emitSubagentTokens(input); }
      catch (e) { process.stderr.write(`metrics-collector tokens emit failed: ${e.message}\n`); }
    }

    // Stop on the parent dispatcher session also writes a per-run summary to
    // metrics/runs/<run-id>.json. Only fires for the parent (not subagent
    // sessions) — detected by matching prompt.submitted in events.jsonl.
    if (input.hook_event_name === "Stop") {
      try { emitRunSummary(input); }
      catch (e) { process.stderr.write(`metrics-collector run summary failed: ${e.message}\n`); }
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
  if (hookEvent === "PreToolUse" && toolName === "Skill") {
    // Skills are where the actual reasoning happens for orchestra agents
    // (task-breakdown, write-contract, qa-test-planner, code-review, ...).
    // Without this branch, a feature-intent run's most decision-laden
    // moments are invisible to events.jsonl.
    const ti = input?.tool_input || {};
    return {
      ts, event: "skill.invoked", run_id,
      skill: typeof ti.skill === "string" ? ti.skill : "unknown",
      args_summary: typeof ti.args === "string" ? ti.args.slice(0, 200) : "",
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
      const fileName = pipelineMatch[2];
      const artifactType = inferArtifactType(fileName);
      const event = {
        ts, event: "artifact.written", run_id,
        feature_id: pipelineMatch[1],
        artifact_type: artifactType,
        file_name: fileName,
        tool: toolName,
      };
      // Insight-tracker: semantic enrichment for intent.yaml writes — extract
      // the routing decision into the event itself so events.jsonl carries
      // the decision, not just the fact-of-write. Mirrors local.bootstrapped's
      // mode/primary_language/framework extraction. Future artifacts can be
      // enriched the same way (e.g., CODE-REVIEW verdict, VERDICT pass/fail).
      if (fileName === "intent.yaml") {
        const fields = extractIntentFields(input?.tool_input);
        if (fields.intent) event.intent = fields.intent;
        if (fields.confidence) event.confidence = fields.confidence;
        if (fields.pattern) event.pattern = fields.pattern;
      }
      return event;
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

// Best-effort extraction of routing-decision fields from intent.yaml proposed
// content. Same line-match-without-full-YAML-parser approach as
// extractBootstrapFields. `pattern:` value can be quoted ("Pattern A") or
// bare (Pattern A); the regex tolerates both.
function extractIntentFields(toolInput) {
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
    intent: matchField(text, /^intent:\s*"?([a-z-]+)"?/m),
    confidence: matchField(text, /^confidence:\s*"?([A-Z]+)"?/m),
    pattern: matchField(text, /^pattern:\s*"?([A-Za-z0-9 _-]+?)"?\s*$/m),
  };
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

// === Token emission on SubagentStop ===
// On SubagentStop, find the just-stopped subagent's session jsonl in
// ~/.claude/projects/<encoded-cwd>/, sum its tokens, and append one row to
// <cwd>/.claude/.orchestra/metrics/tokens.jsonl. Heuristic: the most recently
// modified jsonl that is NOT the parent's session_id is the one that stopped.
// Orchestra's filesystem-coupled handoff means subagents don't run concurrently
// per parent run, so the heuristic is reliable in practice.
function emitSubagentTokens(input) {
  const cwd = input.cwd || process.cwd();
  const parentId = input.session_id || "";
  const sessionsDir = getProjectSessionsDir(cwd);

  let entries;
  try { entries = readdirSync(sessionsDir).filter(f => f.endsWith(".jsonl")); }
  catch { return; }

  let mostRecent = null;
  let mostRecentMtime = 0;
  for (const f of entries) {
    const sid = f.replace(/\.jsonl$/, "");
    if (sid === parentId) continue;
    const path = join(sessionsDir, f);
    let mtime;
    try { mtime = statSync(path).mtimeMs; } catch { continue; }
    if (mtime > mostRecentMtime) {
      mostRecentMtime = mtime;
      mostRecent = { sid, path };
    }
  }
  if (!mostRecent) return;

  const tokens = sumTokensInJsonl(mostRecent.path);
  if (tokens.turns === 0) return;

  const agent = identifyAgent(mostRecent.path);
  const row = {
    ts: new Date().toISOString(),
    event: "subagent.tokens",
    run_id: parentId,
    subagent_session_id: mostRecent.sid,
    agent_role: agent.role,
    agent_turn: agent.ord,
    tokens,
  };

  const dir = join(cwd, ".claude/.orchestra/metrics");
  const path = join(dir, "tokens.jsonl");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  appendFileSync(path, JSON.stringify(row) + "\n");
}

function getProjectSessionsDir(cwd) {
  let resolved;
  try { resolved = realpathSync(cwd); } catch { resolved = cwd; }
  const encoded = resolved.replace(/\//g, "-");
  return join(homedir(), ".claude", "projects", encoded);
}

function sumTokensInJsonl(jsonlPath) {
  const result = { input: 0, output: 0, cache_read: 0, cache_create: 0, turns: 0 };
  let content;
  try { content = readFileSync(jsonlPath, "utf8"); } catch { return result; }
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      const d = JSON.parse(line);
      const u = d?.message?.usage;
      if (!u) continue;
      result.input += u.input_tokens || 0;
      result.output += u.output_tokens || 0;
      result.cache_read += u.cache_read_input_tokens || 0;
      result.cache_create += u.cache_creation_input_tokens || 0;
      result.turns += 1;
    } catch {}
  }
  return result;
}

function identifyAgent(jsonlPath) {
  let content;
  try { content = readFileSync(jsonlPath, "utf8"); } catch { return { role: "unknown", ord: null }; }
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      const d = JSON.parse(line);
      if (d?.type !== "user") continue;
      let text = d.message?.content;
      if (Array.isArray(text)) {
        text = text.map(c => (c && typeof c.text === "string") ? c.text : "").join(" ");
      }
      if (typeof text !== "string") continue;
      if (text.includes("<local-command-caveat>")) return { role: "dispatcher", ord: null };
      const m = text.match(/You are @(\w+) in the orchestra pipeline/);
      if (m) {
        const ordM = text.match(/\((\w+) turn\)/);
        return { role: m[1], ord: ordM ? ordM[1] : null };
      }
    } catch {}
  }
  return { role: "unknown", ord: null };
}

// === Run summary on Stop (parent dispatcher only) ===
// On Stop, if the just-stopped session is the parent /orchestra dispatcher
// (detected by matching prompt.submitted with matched_orchestra:true), aggregate
// events.jsonl + tokens.jsonl + the parent's own session jsonl into a single
// runs/<run-id>.json summary. This is the harvest unit consumers ship to the
// plugin author for stats aggregation. See aggregate-metrics.py (Task 18).
function emitRunSummary(input) {
  const cwd = input.cwd || process.cwd();
  const sessionId = input.session_id || "";
  if (!sessionId) return;

  const metricsDir = join(cwd, ".claude/.orchestra/metrics");
  const eventsPath = join(metricsDir, "events.jsonl");
  if (!existsSync(eventsPath)) return;

  const events = readJsonl(eventsPath);

  // Confirm this is a parent /orchestra dispatcher Stop (not a subagent stop).
  const promptStart = events.find(e =>
    e.event === "prompt.submitted" &&
    e.run_id === sessionId &&
    e.matched_orchestra === true
  );
  if (!promptStart) return;

  // Bracket the run by parent's start ts and now.
  const startedAt = promptStart.ts;
  const endedAt = new Date().toISOString();
  const durationSeconds = Math.round(
    (Date.parse(endedAt) - Date.parse(startedAt)) / 1000
  );

  // All events temporally inside the run window (covers parent + subagent run_ids).
  const runEvents = events.filter(e =>
    e.ts >= startedAt && e.ts <= endedAt
  );

  // Derive intent / confidence / pattern from the intent.yaml artifact.written enrichment.
  const intentEvent = runEvents.find(e =>
    e.event === "artifact.written" && e.file_name === "intent.yaml"
  );
  const intent = intentEvent?.intent || null;
  const confidence = intentEvent?.confidence || null;
  const pattern = intentEvent?.pattern || null;
  const featureId = intentEvent?.feature_id || null;

  // Agents spawned: unique agent_names from task.subagent.invoked events.
  const agentsSpawned = [...new Set(
    runEvents
      .filter(e => e.event === "task.subagent.invoked" && e.agent_name)
      .map(e => e.agent_name)
  )];

  // Artifacts produced: unique file names from artifact.written.
  const artifactsProduced = [...new Set(
    runEvents
      .filter(e => e.event === "artifact.written" && e.file_name)
      .map(e => e.file_name)
  )];

  // Gates (best-effort from artifact existence; verdict content not yet parsed).
  const verdictWritten = artifactsProduced.some(n => /^VERDICT-/.test(n));
  const codeReviewWritten = artifactsProduced.some(n => /^CODE-REVIEW-/.test(n));
  const deadlocked = artifactsProduced.some(n => /^DEADLOCK/.test(n));
  const gates = {
    verdict: verdictWritten ? "produced" : "pending",
    code_review: codeReviewWritten ? "produced" : "pending",
    passing_score: null, // requires reading the artifact; left for richer enrichment later
  };

  // Aggregate tokens: parent session jsonl + sum of tokens.jsonl rows for this run.
  const tokens = { input: 0, output: 0, cache_read: 0, cache_create: 0 };
  const parentJsonl = join(getProjectSessionsDir(cwd), `${sessionId}.jsonl`);
  if (existsSync(parentJsonl)) {
    const t = sumTokensInJsonl(parentJsonl);
    tokens.input += t.input;
    tokens.output += t.output;
    tokens.cache_read += t.cache_read;
    tokens.cache_create += t.cache_create;
  }
  const tokensJsonl = join(metricsDir, "tokens.jsonl");
  if (existsSync(tokensJsonl)) {
    for (const row of readJsonl(tokensJsonl)) {
      if (row.run_id !== sessionId) continue;
      tokens.input += row.tokens?.input || 0;
      tokens.output += row.tokens?.output || 0;
      tokens.cache_read += row.tokens?.cache_read || 0;
      tokens.cache_create += row.tokens?.cache_create || 0;
    }
  }

  const summary = {
    run_id: sessionId,
    started_at: startedAt,
    ended_at: endedAt,
    duration_seconds: durationSeconds,
    intent,
    confidence,
    pattern,
    feature_id: featureId,
    agents_spawned: agentsSpawned,
    artifacts_produced: artifactsProduced,
    gates,
    tokens,
    deadlocked,
    plugin_version: readPluginVersion(),
  };

  const runsDir = join(metricsDir, "runs");
  if (!existsSync(runsDir)) mkdirSync(runsDir, { recursive: true });
  writeFileSync(join(runsDir, `${sessionId}.json`), JSON.stringify(summary, null, 2) + "\n");
}

function readJsonl(path) {
  const result = [];
  let content;
  try { content = readFileSync(path, "utf8"); } catch { return result; }
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try { result.push(JSON.parse(line)); } catch {}
  }
  return result;
}

function readPluginVersion() {
  try {
    const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || join(dirname(import.meta.url.replace("file://","")), "..", "..");
    const pkgPath = join(pluginRoot, "package.json");
    if (existsSync(pkgPath)) {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
      return pkg.version || "unknown";
    }
  } catch {}
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
