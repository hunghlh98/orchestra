// hooks/lib/plan-frontmatter.js
// Per-agent PLAN file shape: frontmatter mutation + body checklist mirror.
// All functions are pure on the {frontmatter, body} pair except the
// path-IO surface (readPlan / writePlan / readOrInitPlan).
//
// Plan file lives at
// <cwd>/.orchestra/tasks/<runId>/<agent>/<featureId>.md.

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml, serialize as serializeYaml } from "./yaml-mini.js";
import { safeWrite } from "./safe-fs.js";

export function planPathFor(ctx) {
  return join(ctx.cwd, ".orchestra", "tasks", ctx.runId, ctx.agent, `${ctx.featureId}.md`);
}

export function readOrInitPlan(ctx) {
  const path = planPathFor(ctx);
  if (existsSync(path)) return readPlan(path);
  return initPlan(ctx);
}

export function initPlan(ctx) {
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

export function readPlan(path) {
  const content = readFileSync(path, "utf8");
  const m = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { frontmatter: {}, body: content };
  let frontmatter;
  try { frontmatter = parseYaml(m[1]) || {}; } catch { frontmatter = {}; }
  return { frontmatter, body: m[2] };
}

export function writePlan(ctx, plan) {
  const path = planPathFor(ctx);
  const dir = path.replace(/\/[^/]+$/, "");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  safeWrite(path, renderPlan(plan));
}

export function renderPlan(plan) {
  const fm = serializeYaml(plan.frontmatter);
  return `---\n${fm}\n---\n${plan.body || ""}`;
}

// rebuildTasksChecklist — replaces the body's `## Tasks` block with a fresh
// checklist mirror. Preserves the `## Approach` block and any content
// outside the `## Tasks` section.
export function rebuildTasksChecklist(body, tasks) {
  const checklist = tasks.map(t => {
    const box = t.status === "completed" ? "[x]" : "[ ]";
    const tag = t.status === "in_progress" ? " *(in progress)*" : "";
    return `- ${box} ${t.id} — ${t.description}${tag}`;
  }).join("\n");
  const rendered = `## Tasks\n\n${checklist}\n`;
  const re = /^## Tasks\b[\s\S]*?(?=^## |\Z)/m;
  if (re.test(body)) return body.replace(re, rendered);
  return (body.endsWith("\n") ? body : body + "\n") + "\n" + rendered;
}

export function recomputeCounts(fm) {
  const tasks = Array.isArray(fm.tasks) ? fm.tasks : [];
  fm.tasks_pending = tasks.filter(t => t.status === "pending").length;
  fm.tasks_in_progress = tasks.filter(t => t.status === "in_progress").length;
  fm.tasks_done = tasks.filter(t => t.status === "completed").length;
}

export function nextTaskOrdinal(tasks) {
  let max = 0;
  for (const t of tasks) {
    const m = typeof t?.id === "string" && t.id.match(/^T-(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return max + 1;
}

// Maps Claude Code's TaskUpdate status values to plan status enum.
// "deleted" is intentionally null — the hook ignores deletes.
export function mapClaudeStatus(s) {
  if (s === "pending" || s === "in_progress" || s === "completed") return s;
  return null;
}

export function oneLine(s) {
  if (typeof s !== "string") return "";
  return s.replace(/\s+/g, " ").trim().slice(0, 200);
}

// extractCreatedTaskId — best-effort lift of Claude Code's assigned task ID
// from the tool_response. Tries documented field names, then falls back to
// regex on the stringified payload.
export function extractCreatedTaskId(toolResponse) {
  if (!toolResponse) return null;
  if (typeof toolResponse === "object") {
    const direct = toolResponse.taskId || toolResponse.task_id || toolResponse.id;
    if (direct) return String(direct);
  }
  const text = typeof toolResponse === "string" ? toolResponse : JSON.stringify(toolResponse);
  const m = text.match(/Task\s*#?(\d+)/) || text.match(/"task_?[Ii]d"\s*:\s*"?([0-9a-zA-Z_-]+)"?/);
  return m ? m[1] : null;
}
