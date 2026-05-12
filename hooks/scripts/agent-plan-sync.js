#!/usr/bin/env node
// hooks/scripts/agent-plan-sync.js
// Owns mutation of per-agent PLAN files at
// <cwd>/.orchestra/tasks/<run-id>/<agent>/<feature-id>.md.
//
// Subscribed events:
//   PreToolUse(TaskCreate)   — allow + record the proposed subject (heuristic prebind)
//   PostToolUse(TaskCreate)  — bind Claude Code's assigned taskId to a T-NNN entry, append to plan
//   PreToolUse(TaskUpdate)   — flip status by claude_task_id; recompute counts; flip plan status
//   SubagentStop             — any non-completed task → status: interrupted; all completed → done
//
// Source-of-truth boundary (per "Invariants" in commands/orchestra.md):
//   - Agent body owns the `## Approach` narrative + initial frontmatter on plan creation.
//   - This hook owns the `tasks:` frontmatter array, `tasks_pending|in_progress|done` counts,
//     `updated:` timestamp, top-level `status:` lifecycle flips, and the `## Tasks` checklist mirror.
//   - Anything else is the agent's. The hook never edits `## Approach`.
//
// Crash semantics: never block. Exit 0 on any failure with stderr write.

import {
  existsSync, mkdirSync, readFileSync, readdirSync, statSync, realpathSync,
} from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { parse as parseYaml, serialize as serializeYaml } from "../lib/yaml-mini.js";
import { safeWrite } from "../lib/safe-fs.js";

const NAME = "ORCHESTRA_HOOK_AGENT_PLAN_SYNC";

main();

async function main() {
  let stdin = "";
  try {
    process.stdin.setEncoding("utf8");
    for await (const chunk of process.stdin) stdin += chunk;

    // Opt-out: read stdin first so we can echo the allow envelope on PreToolUse.
    if (process.env[NAME] === "off") {
      emitAllowIfPreToolUse(stdin);
      process.exit(0);
    }

    const input = JSON.parse(stdin);

    const event = input.hook_event_name;
    const tool = input.tool_name;

    if (event === "PreToolUse" && tool === "TaskCreate") {
      handlePreTaskCreate(input);
    } else if (event === "PostToolUse" && tool === "TaskCreate") {
      handlePostTaskCreate(input);
    } else if (event === "PreToolUse" && tool === "TaskUpdate") {
      handlePreTaskUpdate(input);
    } else if (event === "SubagentStop") {
      handleSubagentStop(input);
    }

    if (event === "PreToolUse") {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow" },
      }));
    }
    process.exit(0);
  } catch (err) {
    process.stderr.write(`agent-plan-sync crashed: ${err.message}\n`);
    emitAllowIfPreToolUse(stdin);
    process.exit(0);
  }
}

// === Handlers ===

// PreToolUse(TaskCreate) — best-effort: stash the proposed subject at a known
// path keyed by (subAgentSid, subject-hash) so the matching PostToolUse can
// bind it to Claude Code's assigned taskId. We can't always inspect
// tool_response in PostToolUse (depends on harness), so the prebind cache
// gives us a fallback.
function handlePreTaskCreate(input) {
  const ctx = resolveContext(input);
  if (!ctx) return;
  const subject = input?.tool_input?.subject;
  if (typeof subject !== "string" || subject.length === 0) return;
  // No-op; appending happens in PostToolUse where we have the assigned taskId.
}

// PostToolUse(TaskCreate) — append a new T-NNN entry bound to Claude Code's taskId.
function handlePostTaskCreate(input) {
  const ctx = resolveContext(input);
  if (!ctx) return;
  const subject = input?.tool_input?.subject;
  const description = input?.tool_input?.description || "";
  const claudeTaskId = extractCreatedTaskId(input?.tool_response);
  if (!claudeTaskId) return;

  const plan = readOrInitPlan(ctx);
  const tasks = Array.isArray(plan.frontmatter.tasks) ? plan.frontmatter.tasks : [];
  // Idempotency: don't double-bind if the same claude_task_id already exists.
  if (tasks.some(t => t && String(t.claude_task_id) === String(claudeTaskId))) return;

  const nextOrd = nextTaskOrdinal(tasks);
  tasks.push({
    id: `T-${String(nextOrd).padStart(3, "0")}`,
    claude_task_id: String(claudeTaskId),
    description: oneLine(subject || description),
    status: "pending",
  });

  plan.frontmatter.tasks = tasks;
  recomputeCounts(plan.frontmatter);
  // First task created → flip plan from pending → in_progress.
  if (plan.frontmatter.status === "pending") {
    plan.frontmatter.status = "in_progress";
  }
  plan.frontmatter.updated = new Date().toISOString();
  plan.body = rebuildTasksChecklist(plan.body, tasks);
  writePlan(ctx, plan);
}

// PreToolUse(TaskUpdate) — flip status by claude_task_id.
function handlePreTaskUpdate(input) {
  const ctx = resolveContext(input);
  if (!ctx) return;
  const claudeTaskId = input?.tool_input?.taskId;
  const newStatus = input?.tool_input?.status;
  if (!claudeTaskId) return;

  const plan = readOrInitPlan(ctx);
  const tasks = Array.isArray(plan.frontmatter.tasks) ? plan.frontmatter.tasks : [];
  const idx = tasks.findIndex(t => t && String(t.claude_task_id) === String(claudeTaskId));
  if (idx === -1) return;

  if (typeof newStatus === "string") {
    const mapped = mapClaudeStatus(newStatus);
    if (mapped) tasks[idx].status = mapped;
  }
  if (typeof input?.tool_input?.subject === "string") {
    tasks[idx].description = oneLine(input.tool_input.subject);
  }

  plan.frontmatter.tasks = tasks;
  recomputeCounts(plan.frontmatter);
  // Lifecycle: in_progress on first non-pending task; done when all completed.
  if (plan.frontmatter.tasks_in_progress > 0 || plan.frontmatter.tasks_done > 0) {
    if (plan.frontmatter.status === "pending") plan.frontmatter.status = "in_progress";
  }
  if (plan.frontmatter.tasks_pending === 0 && plan.frontmatter.tasks_in_progress === 0 && plan.frontmatter.tasks_done > 0) {
    plan.frontmatter.status = "done";
  }
  plan.frontmatter.updated = new Date().toISOString();
  plan.body = rebuildTasksChecklist(plan.body, tasks);
  writePlan(ctx, plan);
}

// SubagentStop — flip status: interrupted (any non-completed) | done (all completed).
// No-op if no plan file exists (the agent never wrote one).
function handleSubagentStop(input) {
  const cwd = input.cwd || process.cwd();
  // SubagentStop fires on the parent dispatcher session; resolveContext for
  // PreToolUse:Task* maps a subagent's session, so reuse the metrics-collector-
  // style lookup to find the just-stopped subagent.
  const stopped = findJustStoppedSubagentMeta(cwd, input.session_id);
  if (!stopped) return;

  const ctx = {
    cwd,
    runId: input.session_id,           // dispatcher run id (canonical)
    subSid: stopped.sid,
    agent: stopped.role,
    featureId: deriveFeatureId(cwd, stopped.path),
  };
  if (!ctx.agent || ctx.agent === "unknown" || !ctx.featureId) return;

  const planPath = planPathFor(ctx);
  if (!existsSync(planPath)) return;

  const plan = readPlan(planPath);
  const tasks = Array.isArray(plan.frontmatter.tasks) ? plan.frontmatter.tasks : [];
  const allDone = tasks.length > 0 && tasks.every(t => t.status === "completed");
  const anyOpen = tasks.some(t => t.status !== "completed");

  if (allDone) {
    plan.frontmatter.status = "done";
  } else if (anyOpen && plan.frontmatter.status !== "done") {
    plan.frontmatter.status = "interrupted";
  }
  plan.frontmatter.updated = new Date().toISOString();
  safeWrite(planPath, renderPlan(plan));
}

// === Context resolution ===

// resolveContext — for Task*-tool hook inputs (fired from inside a subagent),
// derive (cwd, runId=parent_sid, subSid, agent, featureId).
function resolveContext(input) {
  const cwd = input.cwd || process.cwd();
  const subSid = input.session_id;
  if (!subSid) return null;

  const parentSid = findParentSid(cwd, subSid);
  if (!parentSid) return null;

  const subagentJsonlPath = join(getProjectSessionsDir(cwd), parentSid, "subagents", `agent-${subSid}.jsonl`);
  const metaPath = join(getProjectSessionsDir(cwd), parentSid, "subagents", `agent-${subSid}.meta.json`);

  const agent = deriveAgentRoleFromMeta(metaPath) || deriveAgentRoleFromJsonl(subagentJsonlPath);
  if (!agent || agent === "unknown") return null;

  const featureId = deriveFeatureId(cwd, subagentJsonlPath);
  if (!featureId) return null;

  return { cwd, runId: parentSid, subSid, agent, featureId };
}

// findParentSid — walk ~/.claude/projects/<encoded>/<*>/subagents/agent-<subSid>.jsonl
// and return the containing dir name (parent_sid).
function findParentSid(cwd, subSid) {
  const sessionsDir = getProjectSessionsDir(cwd);
  let entries;
  try { entries = readdirSync(sessionsDir, { withFileTypes: true }); }
  catch { return null; }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const candidate = join(sessionsDir, e.name, "subagents", `agent-${subSid}.jsonl`);
    if (existsSync(candidate)) return e.name;
  }
  return null;
}

function getProjectSessionsDir(cwd) {
  let resolved;
  try { resolved = realpathSync(cwd); } catch { resolved = cwd; }
  const encoded = resolved.replace(/\//g, "-");
  return join(homedir(), ".claude", "projects", encoded);
}

function deriveAgentRoleFromMeta(metaPath) {
  try {
    const meta = JSON.parse(readFileSync(metaPath, "utf8"));
    if (typeof meta.agentType === "string" && meta.agentType.length > 0) {
      return meta.agentType.replace(/^orchestra:/, "") || null;
    }
  } catch {}
  return null;
}

function deriveAgentRoleFromJsonl(jsonlPath) {
  let content;
  try { content = readFileSync(jsonlPath, "utf8"); } catch { return null; }
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
      const m = text.match(/You are @(\w+) in the orchestra pipeline/);
      if (m) return m[1];
    } catch {}
  }
  return null;
}

// deriveFeatureId — three-tier discovery.
//   1. Parse the spawn-prompt initial user message for a feature-id pattern.
//   2. Most-recently-modified <cwd>/.orchestra/pipeline/<feature-id>/intent.yaml.
//   3. Most-recently-modified <cwd>/.orchestra/pipeline/<feature-id>/ dir.
function deriveFeatureId(cwd, subagentJsonlPath) {
  if (subagentJsonlPath && existsSync(subagentJsonlPath)) {
    let content;
    try { content = readFileSync(subagentJsonlPath, "utf8"); } catch { content = ""; }
    // Line-by-line; the spawn prompt is the first user message and embeds the feature-id.
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
        const m = text.match(/\bfeature[_-]?id[:= ]+["']?(\d{3}-[a-z][a-z0-9-]*)/i)
              || text.match(/\bfeature[:= ]+["']?(\d{3}-[a-z][a-z0-9-]*)/i)
              || text.match(/(?:^|[/\s"'`])(\d{3}-[a-z][a-z0-9-]*)(?=[/\s"'`-]|$)/);
        if (m) return m[1];
        break; // only the first user message matters
      } catch {}
    }
  }
  // Fallback: pipeline-dir mtime.
  const pipelineRoot = join(cwd, ".orchestra", "pipeline");
  let dirs;
  try { dirs = readdirSync(pipelineRoot, { withFileTypes: true }); }
  catch { return null; }
  let best = null;
  for (const d of dirs) {
    if (!d.isDirectory()) continue;
    if (!/^\d{3}-[a-z][a-z0-9-]*$/.test(d.name)) continue;
    const intentPath = join(pipelineRoot, d.name, "intent.yaml");
    let mtime;
    try { mtime = statSync(existsSync(intentPath) ? intentPath : join(pipelineRoot, d.name)).mtimeMs; }
    catch { continue; }
    if (!best || mtime > best.mtime) best = { name: d.name, mtime };
  }
  return best ? best.name : null;
}

// findJustStoppedSubagentMeta — used at SubagentStop. Mirrors
// metrics-collector.findSubagentInSiblingDir but we need a callable here too.
function findJustStoppedSubagentMeta(cwd, parentSid) {
  if (!parentSid) return null;
  const subDir = join(getProjectSessionsDir(cwd), parentSid, "subagents");
  let entries;
  try { entries = readdirSync(subDir).filter(f => /^agent-[a-f0-9]+\.jsonl$/i.test(f)); }
  catch { return null; }
  if (entries.length === 0) return null;

  let mostRecent = null, bestMtime = 0;
  for (const f of entries) {
    const path = join(subDir, f);
    let mtime; try { mtime = statSync(path).mtimeMs; } catch { continue; }
    if (mtime > bestMtime) { bestMtime = mtime; mostRecent = { f, path }; }
  }
  if (!mostRecent) return null;

  const sid = mostRecent.f.replace(/\.jsonl$/, "");
  const metaPath = join(subDir, `${sid}.meta.json`);
  const role = deriveAgentRoleFromMeta(metaPath) || deriveAgentRoleFromJsonl(mostRecent.path) || "unknown";
  return { sid, path: mostRecent.path, role };
}

// === Plan-file I/O ===

function planPathFor(ctx) {
  return join(ctx.cwd, ".orchestra", "tasks", ctx.runId, ctx.agent, `${ctx.featureId}.md`);
}

function readOrInitPlan(ctx) {
  const path = planPathFor(ctx);
  if (existsSync(path)) return readPlan(path);
  return initPlan(ctx);
}

function initPlan(ctx) {
  const now = new Date().toISOString();
  return {
    frontmatter: {
      id: ctx.featureId,
      type: "PLAN",
      agent: `@${ctx.agent}`,
      run_id: ctx.runId,
      feature_id: ctx.featureId,
      created: now,
      updated: now,
      status: "pending",
      tasks_pending: 0,
      tasks_in_progress: 0,
      tasks_done: 0,
      tasks: [],
    },
    body: `## Approach\n\n_Plan body authored on first agent action._\n\n## Tasks\n`,
  };
}

function readPlan(path) {
  const content = readFileSync(path, "utf8");
  const m = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) {
    return { frontmatter: {}, body: content };
  }
  let frontmatter;
  try { frontmatter = parseYaml(m[1]) || {}; }
  catch { frontmatter = {}; }
  return { frontmatter, body: m[2] };
}

function writePlan(ctx, plan) {
  const path = planPathFor(ctx);
  const dir = path.replace(/\/[^/]+$/, "");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  safeWrite(path, renderPlan(plan));
}

function renderPlan(plan) {
  const fm = serializeYaml(plan.frontmatter);
  return `---\n${fm}\n---\n${plan.body || ""}`;
}

// rebuildTasksChecklist — replaces the body's `## Tasks` block with a
// fresh checklist mirror. Preserves the `## Approach` block and any other
// content above/below `## Tasks`.
function rebuildTasksChecklist(body, tasks) {
  const checklist = tasks.map(t => {
    const box = t.status === "completed" ? "[x]" : "[ ]";
    const tag = t.status === "in_progress" ? " *(in progress)*" : "";
    return `- ${box} ${t.id} — ${t.description}${tag}`;
  }).join("\n");
  const rendered = `## Tasks\n\n${checklist}\n`;

  // Replace existing `## Tasks` section if present; else append.
  const re = /^## Tasks\b[\s\S]*?(?=^## |\Z)/m;
  if (re.test(body)) return body.replace(re, rendered);
  return (body.endsWith("\n") ? body : body + "\n") + "\n" + rendered;
}

// === Helpers ===

function recomputeCounts(fm) {
  const tasks = Array.isArray(fm.tasks) ? fm.tasks : [];
  fm.tasks_pending = tasks.filter(t => t.status === "pending").length;
  fm.tasks_in_progress = tasks.filter(t => t.status === "in_progress").length;
  fm.tasks_done = tasks.filter(t => t.status === "completed").length;
}

function nextTaskOrdinal(tasks) {
  let max = 0;
  for (const t of tasks) {
    const m = typeof t?.id === "string" && t.id.match(/^T-(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max + 1;
}

function mapClaudeStatus(s) {
  if (s === "pending" || s === "in_progress" || s === "completed") return s;
  if (s === "deleted") return null;
  return null;
}

function oneLine(s) {
  if (typeof s !== "string") return "";
  return s.replace(/\s+/g, " ").trim().slice(0, 200);
}

// extractCreatedTaskId — best-effort lift of Claude Code's assigned task ID
// from the tool_response. Tries documented field names, then falls back to
// regex on the stringified payload (matches "Task #(\d+)" or `"taskId":"..."`).
function extractCreatedTaskId(toolResponse) {
  if (!toolResponse) return null;
  if (typeof toolResponse === "object") {
    const direct = toolResponse.taskId || toolResponse.task_id || toolResponse.id;
    if (direct) return String(direct);
  }
  const text = typeof toolResponse === "string" ? toolResponse : JSON.stringify(toolResponse);
  const m = text.match(/Task\s*#?(\d+)/) || text.match(/"task_?[Ii]d"\s*:\s*"?([0-9a-zA-Z_-]+)"?/);
  return m ? m[1] : null;
}

function emitAllowIfPreToolUse(stdin) {
  try {
    if (stdin) {
      const input = JSON.parse(stdin);
      if (input.hook_event_name === "PreToolUse") {
        process.stdout.write(JSON.stringify({
          hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow" },
        }));
      }
    }
  } catch { /* silent */ }
}
