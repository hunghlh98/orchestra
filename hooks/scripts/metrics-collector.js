#!/usr/bin/env node
// hooks/scripts/metrics-collector.js
// Observer hook (multi-event): appends one JSONL line per hook trigger to
// <cwd>/.orchestra/metrics/events.jsonl. Rotates at 50MB
// (configurable via ORCHESTRA_METRICS_ROTATE_BYTES for tests).
// Subscribed events: UserPromptSubmit, PreToolUse(Task),
// PreToolUse(mcp__orchestra-*), PreToolUse(Write|Edit|MultiEdit),
// SubagentStop, Stop.
//
// PreToolUse(Write|Edit|MultiEdit) is filtered to local.yaml writes only —
// when something writes <cwd>/.orchestra/local.yaml, this hook parses
// the proposed YAML content and emits `local.bootstrapped`. events.jsonl
// is hook territory: the bootstrap script
// computes the YAML, the dispatcher uses Claude Code's Write tool to put it
// in place, and this hook observes-and-emits. Agents do NOT emit events.

import {
  existsSync, mkdirSync, appendFileSync, statSync, readFileSync, writeFileSync,
  readdirSync, rmSync, realpathSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { gzipSync } from "node:zlib";
import { computeUsd } from "../lib/rate-card.js";

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
      const dir = join(cwd, ".orchestra/metrics");
      const path = join(dir, "events.jsonl");
      try {
        if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
        const manifest = ensureManifest(dir);
        if (manifest.redact_prompts) applyRedaction(event);
        appendFileSync(path, JSON.stringify(event) + "\n");
        rotateIfNeeded(path, dir);
      } catch (e) {
        // best-effort; never blocks
        process.stderr.write(`metrics-collector append failed: ${e.message}\n`);
      }
    }

    // SubagentStop emits a tokens.jsonl row + scans for ★ Insight blocks in
    // the subagent's session jsonl, appending any to insights.jsonl. Token
    // emission and insight emission are independent: insights are captured
    // even when the subagent has no measurable token usage.
    if (input.hook_event_name === "SubagentStop") {
      try {
        const sub = findJustStoppedSubagent(input);
        if (sub) {
          emitSubagentTokens(input, sub);
          emitInsightsForSession(input, sub.path, sub.sid, sub.role);
        }
      }
      catch (e) { process.stderr.write(`metrics-collector tokens/insights emit failed: ${e.message}\n`); }
    }

    // Stop on the parent dispatcher session writes runs/<run-id>.json + scans
    // the parent jsonl for ★ Insight blocks. Only fires for the parent (not
    // subagent stops) — emitRunSummary checks via prompt.submitted match.
    if (input.hook_event_name === "Stop") {
      try {
        emitRunSummary(input);
        const cwd = input.cwd || process.cwd();
        const sid = input.session_id || "";
        if (sid) {
          const parentPath = join(getProjectSessionsDir(cwd), `${sid}.jsonl`);
          if (existsSync(parentPath)) emitInsightsForSession(input, parentPath, sid, "dispatcher");
        }
      }
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
    const promptText = typeof ti.prompt === "string" ? ti.prompt : "";
    return {
      ts, event: "task.subagent.invoked",
      subagent_type: ti.subagent_type || "unknown",
      agent_role: deriveAgentRole(ti.subagent_type, ti.name),
      phase: matchField(promptText, /^phase:\s*([a-z-]+)/m) || null,
      agent_name: ti.name || null,                       // e.g. "@lead" — present when invoked via TeamCreate flow
      team_name: ti.team_name || null,                   // present when joined to a team
      tool: toolName,                                    // distinguishes legacy Task from canonical Agent
      prompt_summary: promptText.slice(0, 200),
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
  if (hookEvent === "PreToolUse" && toolName === "TeamDelete") {
    // TeamDelete is zero-param (verified via ToolSearch 2026-05-05) — team is
    // implicit from current session context. team_name + terminal_state are
    // recoverable by joining run_id against the immediately-preceding
    // artifact.written:SUMMARY event.
    return { ts, event: "team.shutdown", run_id };
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
  if (hookEvent === "PreToolUse" && (toolName === "TaskCreate" || toolName === "TaskUpdate")) {
    // Per-agent plan tracking. The actual plan-file mutation is owned by
    // hooks/scripts/agent-plan-sync.js; this branch logs the activity so
    // events.jsonl carries an agent-attributed audit of every Task* call
    // (the "what each agent has been doing" log).
    const ti = input?.tool_input || {};
    return {
      ts, event: "agent.plan.task", run_id,
      tool: toolName,                                  // TaskCreate | TaskUpdate
      claude_task_id: ti.taskId ? String(ti.taskId) : null,
      task_subject: typeof ti.subject === "string" ? ti.subject.slice(0, 200) : null,
      task_status: typeof ti.status === "string" ? ti.status : null,
    };
  }
  if (hookEvent === "PreToolUse" && typeof toolName === "string" && toolName.startsWith("mcp__orchestra-")) {
    return { ts, event: "mcp.tool.called", tool: toolName, run_id };
  }
  if (hookEvent === "PreToolUse" && (toolName === "Write" || toolName === "Edit" || toolName === "MultiEdit")) {
    const filePath = input?.tool_input?.file_path || "";
    if (typeof filePath !== "string") return null;
    if (filePath.endsWith("/.orchestra/local.yaml")) {
      const fields = extractBootstrapFields(input?.tool_input);
      return {
        ts, event: "local.bootstrapped", run_id,
        mode: fields.mode || "unknown",
        project_mode: fields.mode || "unknown",
        primary_language: fields.primary_language || "unknown",
        framework: fields.framework || "unknown",
      };
    }
    // Per-agent PLAN observability: writes under
    // <cwd>/.orchestra/tasks/<run-id>/<agent>/<feature-id>.md emit a
    // PLAN-typed artifact.written event so events.jsonl traces both who
    // (agent_role) and what (feature_id) on the per-agent plan surface.
    const planMatch = filePath.match(/\/\.orchestra\/tasks\/([^/]+)\/([^/]+)\/([^/]+)$/);
    if (planMatch) {
      const fileName = planMatch[3];
      return {
        ts, event: "artifact.written", run_id,
        feature_id: fileName.replace(/\.md$/, ""),
        artifact_type: "PLAN",
        artifact_id: `${planMatch[1]}-${planMatch[2]}-${fileName.replace(/\.md$/, "")}`,
        file_name: fileName,
        agent_role: planMatch[2].replace(/^@/, ""),
        plan_run_id: planMatch[1],
        tool: toolName,
      };
    }
    // Pipeline-artifact observability: any write under
    // <cwd>/.orchestra/pipeline/<feature-id>/<file> emits an
    // `artifact.written` event so events.jsonl alone reconstructs the artifact
    // tree without needing Claude Code's session jsonl.
    const pipelineMatch = filePath.match(/\/\.orchestra\/pipeline\/([^/]+)\/([^/]+)$/);
    if (pipelineMatch) {
      const fileName = pipelineMatch[2];
      const artifactType = inferArtifactType(fileName);
      const event = {
        ts, event: "artifact.written", run_id,
        feature_id: pipelineMatch[1],
        artifact_type: artifactType,
        artifact_id: deriveArtifactId(artifactType, fileName),
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
        if (fields.autonomy_level) event.autonomy_level = fields.autonomy_level;
      }
      if (/^SUMMARY-.+\.md$/.test(fileName)) {
        const fields = extractSummaryFields(input?.tool_input);
        if (fields.team_name) event.team_name = fields.team_name;
        if (fields.terminal_state) event.terminal_state = fields.terminal_state;
        if (fields.duration_seconds) event.duration_seconds = fields.duration_seconds;
      }
      return event;
    }
    return null; // other Write/Edit calls aren't logged here (no behavioral capture)
  }
  if (hookEvent === "SubagentStop") {
    // events↔tokens.jsonl join is direct via subagent_session_id. agent_role
    // lifts from the subagent's session jsonl header
    // (`You are @<name> in the orchestra pipeline`).
    const sub = findJustStoppedSubagent(input);
    return {
      ts, event: "subagent.stopped", run_id,
      subagent_session_id: sub?.sid || null,
      agent_role: sub?.role || null,
    };
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
    autonomy_level: matchField(text, /^autonomy_level:\s*"?([A-Z_]+)"?/m),
  };
}

// Best-effort extraction of closure fields from SUMMARY-*.md proposed content.
// Mirrors extractIntentFields — line-match without a full YAML parser. Lifts
// team_name / terminal_state / duration_seconds onto the artifact.written
// event so events.jsonl carries the closure decision, not just fact-of-write.
function extractSummaryFields(toolInput) {
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
    team_name: matchField(text, /^team_name:\s*"?([A-Za-z0-9_-]+?)"?\s*$/m),
    terminal_state: matchField(text, /^terminal_state:\s*"?([a-z]+)"?/m),
    duration_seconds: matchField(text, /^duration_seconds:\s*(\d+)/m),
  };
}

// Infer artifact type from filename. Patterns supported:
//   1. New per-feature shape: <NNN>-<slug>-<TYPE>(-<rest>)?.<ext>.
//      001-todo-api-PRD.md → "PRD"; 001-todo-api-TASKS.md → "TASKS";
//      001-todo-api-ESCALATE-spec-gap.md → "ESCALATE";
//      001-todo-api-ESCALATE-ADR-0007.md → "ESCALATE-ADR";
//      001-todo-api-openapi.yaml / 001-todo-api-asyncapi.yaml → "API".
//   2. Global / singleton legacy shape: SAD.md, ADR-NNNN-<slug>.md,
//      RELEASE-vX.Y.Z.md, RUNBOOK-vX.Y.Z.md, intent.yaml.
// Falls back to "unknown" so the event is still emitted (run_id + file_name
// preserve traceability even when we can't classify).
function inferArtifactType(fileName) {
  if (fileName === "intent.yaml") return "intent";
  if (fileName === "SAD.md") return "SAD";
  // openapi / asyncapi: API artifact regardless of feature-id prefix.
  if (/-(openapi|asyncapi)\.(?:yaml|yml)$/.test(fileName)) return "API";
  // New per-feature shape — first all-uppercase token after the <NNN>-<slug> prefix.
  const newForm = fileName.match(/^\d+-[a-z][a-z0-9-]*?-(ESCALATE-ADR|[A-Z][A-Z0-9]*)(?:-[\w.-]*)?\.[a-z]+$/);
  if (newForm) return newForm[1];
  // Legacy uppercase-prefixed singletons (ADR-NNNN-..., RELEASE-v..., RUNBOOK-v...).
  const legacy = fileName.match(/^([A-Z][A-Z0-9-]*?)-\d/);
  if (legacy) return legacy[1];
  return "unknown";
}

// Reporter helpers.
//
// deriveArtifactId — stable identifier for the reporter's per-artifact token
// attribution. For new per-feature artifacts, id = basename without extension
// (e.g., "001-todo-api-PRD"). For legacy/global artifacts, id = uppercase-and-
// digits prefix (e.g., "ADR-0001"). intent.yaml has no numeric suffix.
function deriveArtifactId(artifactType, fileName) {
  if (fileName === "intent.yaml") return "intent.yaml";
  if (fileName === "SAD.md") return "SAD";
  // New per-feature shape: id is the full basename (matches frontmatter id:).
  const newForm = fileName.match(/^(\d+-[a-z][a-z0-9-]*-(?:ESCALATE-ADR|[A-Z][A-Z0-9]*)(?:-[\w.-]*)?)\.[a-z]+$/);
  if (newForm) return newForm[1];
  // openapi/asyncapi without prefix (legacy): use API + filename stem.
  const apiBare = fileName.match(/^(\d+-[a-z][a-z0-9-]*-(?:openapi|asyncapi))\.(?:yaml|yml)$/);
  if (apiBare) return apiBare[1];
  // Legacy: ADR-NNNN-..., RELEASE-vX.Y.Z..., RUNBOOK-vX.Y.Z... — keep the
  // type+number prefix as a stable id, dropping any trailing slug.
  const legacy = fileName.match(/^([A-Z][A-Z0-9-]*-[\w.]+?)(?:-[\w.]+)?\.[a-z]+$/);
  if (legacy) return legacy[1];
  return artifactType || "unknown";
}

// deriveAgentRole — strips the "orchestra:" prefix from subagent_type
// (e.g., "orchestra:lead" → "lead"); falls back to ti.name without "@".
// Used by the reporter to pivot tokens by role without re-parsing prompts.
function deriveAgentRole(subagentType, agentName) {
  if (typeof subagentType === "string" && subagentType.length > 0) {
    return subagentType.replace(/^orchestra:/, "");
  }
  if (typeof agentName === "string" && agentName.startsWith("@")) {
    return agentName.slice(1);
  }
  return null;
}

// === Token emission on SubagentStop ===
// On SubagentStop, find the just-stopped subagent's session jsonl, sum its
// tokens, and append one row to <cwd>/.orchestra/metrics/tokens.jsonl.
//
// Two transcript layouts are supported (current Claude Code first, older
// builds as fallback) so the hook stays robust across platform changes:
//   v4 layout: ~/.claude/projects/<encoded-cwd>/<parent_sid>/subagents/agent-*.jsonl
//              + sibling agent-*.meta.json with {agentType: "orchestra:<role>"}
//   v3 layout: ~/.claude/projects/<encoded-cwd>/<sub_sid>.jsonl at project root
//              (most-recent-mtime that isn't the parent and identifies as a
//              real subagent — sidecar/permission-mode files are rejected)
function findJustStoppedSubagent(input) {
  const cwd = input.cwd || process.cwd();
  const parentId = input.session_id || "";
  if (!parentId) return null;
  return findSubagentInSiblingDir(cwd, parentId)
      || findSubagentInProjectRoot(cwd, parentId);
}

// v4 layout: <proj>/<parent_sid>/subagents/agent-*.jsonl (paired with
// agent-*.meta.json carrying {agentType: "orchestra:<role>"}). The .meta.json
// is the canonical role source — subagent jsonls don't contain the
// "You are @<name> in the orchestra pipeline" header that identifyAgent looks
// for, so text-grep returns "unknown" and the meta is the only reliable lift.
function findSubagentInSiblingDir(cwd, parentId) {
  const subDir = join(getProjectSessionsDir(cwd), parentId, "subagents");
  let entries;
  try { entries = readdirSync(subDir).filter(f => /^agent-[a-f0-9]+\.jsonl$/i.test(f)); }
  catch { return null; }
  if (entries.length === 0) return null;

  let mostRecent = null, mostRecentMtime = 0;
  for (const f of entries) {
    const path = join(subDir, f);
    let mtime; try { mtime = statSync(path).mtimeMs; } catch { continue; }
    if (mtime > mostRecentMtime) { mostRecentMtime = mtime; mostRecent = { f, path }; }
  }
  if (!mostRecent) return null;

  const sid = mostRecent.f.replace(/\.jsonl$/, "");
  const metaPath = join(subDir, `${sid}.meta.json`);
  let role = "unknown";
  try {
    const meta = JSON.parse(readFileSync(metaPath, "utf8"));
    if (typeof meta.agentType === "string" && meta.agentType.length > 0) {
      role = meta.agentType.replace(/^orchestra:/, "") || "unknown";
    }
  } catch { /* meta missing/unreadable — leave role as "unknown" */ }
  return { sid, path: mostRecent.path, role, ord: null };
}

// v3 fallback: <proj>/<sid>.jsonl at project root. Iterate by mtime desc,
// pick the first candidate that identifies as a real subagent (rejecting
// "unknown" sidecar files and the parent's "dispatcher" caveat-marker file).
function findSubagentInProjectRoot(cwd, parentId) {
  const sessionsDir = getProjectSessionsDir(cwd);
  let entries;
  try { entries = readdirSync(sessionsDir).filter(f => f.endsWith(".jsonl")); }
  catch { return null; }

  const candidates = [];
  for (const f of entries) {
    const sid = f.replace(/\.jsonl$/, "");
    if (sid === parentId) continue;
    const path = join(sessionsDir, f);
    let mtime; try { mtime = statSync(path).mtimeMs; } catch { continue; }
    candidates.push({ sid, path, mtime });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.mtime - a.mtime);

  for (const c of candidates) {
    const agent = identifyAgent(c.path);
    if (agent.role && agent.role !== "unknown" && agent.role !== "dispatcher") {
      return { sid: c.sid, path: c.path, role: agent.role, ord: agent.ord };
    }
  }
  return null;
}

function emitSubagentTokens(input, sub) {
  if (!sub) return null;
  const tokens = sumTokensInJsonl(sub.path);
  if (tokens.turns === 0) return null;

  const cwd = input.cwd || process.cwd();
  const parentId = input.session_id || "";
  const row = {
    ts: new Date().toISOString(),
    event: "subagent.tokens",
    run_id: parentId,
    subagent_session_id: sub.sid,
    agent_role: sub.role,
    agent_turn: sub.ord,
    tokens,
    usd: computeUsd(tokens),
  };

  const dir = join(cwd, ".orchestra/metrics");
  const path = join(dir, "tokens.jsonl");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  appendFileSync(path, JSON.stringify(row) + "\n");

  return { sid: sub.sid, path: sub.path, role: sub.role };
}

function getProjectSessionsDir(cwd) {
  let resolved;
  try { resolved = realpathSync(cwd); } catch { resolved = cwd; }
  const encoded = resolved.replace(/\//g, "-");
  return join(homedir(), ".claude", "projects", encoded);
}

// Streaming writes the same assistant turn 2-3 times to the jsonl (each
// progress event re-serializes the in-flight message). Dedup by message.id
// or per-row totals come out 2-3x inflated. Rows without a message.id
// (legacy / synthetic fixtures) fall through unchanged — the Set is a no-op
// when no id is present.
function sumTokensInJsonl(jsonlPath) {
  const result = { input: 0, output: 0, cache_read: 0, cache_create: 0, turns: 0 };
  const seen = new Set();
  let content;
  try { content = readFileSync(jsonlPath, "utf8"); } catch { return result; }
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      const d = JSON.parse(line);
      const u = d?.message?.usage;
      if (!u) continue;
      const mid = d?.message?.id;
      if (mid && seen.has(mid)) continue;
      if (mid) seen.add(mid);
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

  const metricsDir = join(cwd, ".orchestra/metrics");
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
  const autonomyLevel = intentEvent?.autonomy_level || null;
  const featureId = intentEvent?.feature_id || null;

  // Agents spawned: unique agent_roles from task.subagent.invoked events.
  // agent_role is populated by deriveAgentRole() from subagent_type / @name,
  // so it's reliably present even when agent_name is null (the typical case
  // for orchestra:<role> spawns that don't pass an explicit `name`).
  const agentsSpawned = [...new Set(
    runEvents
      .filter(e => e.event === "task.subagent.invoked" && e.agent_role)
      .map(e => e.agent_role)
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

  // Count insights for this run (by run_id) from insights.jsonl, if it exists.
  // The Stop emission for the parent fires AFTER emitRunSummary in main(), so
  // the parent's own insights are not yet in insights.jsonl at this point —
  // only subagent insights (emitted at SubagentStop) are counted here. The
  // count remains useful as a "subagent reasoning depth" signal; the parent's
  // insights land on disk a moment later and get picked up by aggregators.
  let insightsCount = 0;
  const insightsPath = join(metricsDir, "insights.jsonl");
  if (existsSync(insightsPath)) {
    for (const row of readJsonl(insightsPath)) {
      if (row.run_id === sessionId) insightsCount += 1;
    }
  }

  const escalated = artifactsProduced.some(n => /^ESCALATE/.test(n));
  const status = deadlocked ? "deadlocked" : (escalated ? "aborted" : "completed");

  const summary = {
    run_id: sessionId,
    started_at: startedAt,
    ended_at: endedAt,
    duration_seconds: durationSeconds,
    status,                                                  // enum: completed | deadlocked | aborted
    intent,
    confidence,
    pattern,
    autonomy_level: autonomyLevel,
    feature_id: featureId,
    agents_spawned: agentsSpawned,
    artifacts_produced: artifactsProduced,
    gates,
    tokens,
    cost_usd: computeUsd(tokens),
    insights_count: insightsCount,
    deadlocked,
    plugin_version: readPluginVersion(),
  };

  const runsDir = join(metricsDir, "runs");
  if (!existsSync(runsDir)) mkdirSync(runsDir, { recursive: true });
  writeFileSync(join(runsDir, `${sessionId}.json`), JSON.stringify(summary, null, 2) + "\n");
}

// === Manifest + redaction (privacy guard for consumer telemetry) ===
// Creates metrics/manifest.json on first events.jsonl write with mixed
// defaults: redact_prompts:true, capture_insight_text:true,
// telemetry_optin:"explicit". The two redaction axes are independent —
// prompt_summary/description/args_summary fields stay redacted by default
// (they echo raw user input), while ★ Insight bodies (model-emitted prose)
// are captured by default because they're the primary observability signal.
// Consumers flip either bit in metrics/manifest.json to tighten or loosen.
// The manifest is the harvest unit's privacy policy: plugin authors
// aggregating consumer data inspect this file to confirm what's been redacted.
function ensureManifest(metricsDir) {
  const manifestPath = join(metricsDir, "manifest.json");
  const defaults = {
    schema_version: 1,
    plugin_version: readPluginVersion(),
    redact_prompts: true,
    capture_insight_text: true,
    telemetry_optin: "explicit",
    created_at: new Date().toISOString(),
  };
  if (!existsSync(manifestPath)) {
    try { writeFileSync(manifestPath, JSON.stringify(defaults, null, 2) + "\n"); }
    catch {}
    return defaults;
  }
  try {
    const raw = JSON.parse(readFileSync(manifestPath, "utf8"));
    return { ...defaults, ...raw };
  } catch {
    return defaults;
  }
}

// Replaces user-content fields with "<redacted, len=N>" placeholders.
// Three known fields carry user prompts at this point:
//   prompt_summary  (task.subagent.invoked)
//   description     (team.created)
//   args_summary    (skill.invoked)
// Other event fields (file_name, agent_name, intent, etc.) are derived
// classifications, not raw user text — left intact.
function applyRedaction(event) {
  for (const key of ["prompt_summary", "description", "args_summary"]) {
    if (typeof event[key] === "string" && event[key].length > 0) {
      event[key] = `<redacted, len=${event[key].length}>`;
    }
  }
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

// === Insight extraction (Explanatory Output style ★ Insight blocks) ===
// Scans a session jsonl for `★ Insight ─...─{20,}` blocks emitted by the
// model in `assistant` text content, and appends one row per insight to
// metrics/insights.jsonl. Default: body text is captured. Set
// manifest.capture_insight_text:false to redact text to null (structural
// fields — index, line_count, char_count — remain regardless).
function emitInsightsForSession(input, sessionPath, sessionId, role) {
  if (!existsSync(sessionPath)) return 0;
  const cwd = input.cwd || process.cwd();
  const runId = input.session_id || "";
  const metricsDir = join(cwd, ".orchestra/metrics");
  if (!existsSync(metricsDir)) mkdirSync(metricsDir, { recursive: true });
  const manifest = ensureManifest(metricsDir);

  const insights = extractInsightsFromJsonl(sessionPath);
  if (insights.length === 0) return 0;

  const insightsPath = join(metricsDir, "insights.jsonl");
  const ts = new Date().toISOString();
  for (let i = 0; i < insights.length; i++) {
    const ins = insights[i];
    const row = {
      ts,
      event: "insight.emitted",
      run_id: runId,
      session_id: sessionId,
      agent_role: role,
      insight_index: i + 1,
      line_count: ins.line_count,
      char_count: ins.char_count,
      text: manifest.capture_insight_text ? ins.text : null,
    };
    appendFileSync(insightsPath, JSON.stringify(row) + "\n");
  }
  return insights.length;
}

function extractInsightsFromJsonl(jsonlPath) {
  const found = [];
  let content;
  try { content = readFileSync(jsonlPath, "utf8"); } catch { return found; }
  // Detection pattern: the canonical Explanatory Output style wraps both
  // bracket lines in backticks (`★ Insight ─...─`), but we tolerate the
  // un-backticked variant too in case the style emits differently.
  const insightRe = /`?★ Insight ─+`?\n([\s\S]*?)\n`?─{20,}`?/g;
  for (const line of content.split("\n")) {
    if (!line.trim()) continue;
    try {
      const d = JSON.parse(line);
      if (d?.message?.role !== "assistant") continue;
      let text = d.message.content;
      if (Array.isArray(text)) {
        text = text.filter(c => c?.type === "text").map(c => c.text || "").join("\n");
      }
      if (typeof text !== "string" || !text.includes("★ Insight")) continue;
      insightRe.lastIndex = 0;
      let m;
      while ((m = insightRe.exec(text)) !== null) {
        const body = m[1];
        found.push({
          line_count: body.split("\n").length,
          char_count: body.length,
          text: body,
        });
      }
    } catch {}
  }
  return found;
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
