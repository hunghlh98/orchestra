// hooks/lib/plan-frontmatter.js
// Session-level AGENT-TASKS ledger shape: frontmatter + body table.
// Path: <cwd>/.orchestra/plans/<sessionId>/agent-tasks.md.
// Single file per Claude Code session. Rows keyed on (agent, feature_id, task_id).
// Writer: agent-plan-sync hook on SubagentStop only.

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml, serialize as serializeYaml } from "./yaml-mini.js";
import { safeWrite } from "./safe-fs.js";

export function planPathFor(ctx) {
  return join(ctx.cwd, ".orchestra", "plans", ctx.sessionId, "agent-tasks.md");
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
      id: "agent-tasks",
      type: "AGENT-TASKS",
      session_id: ctx.sessionId,
      created: now,
      updated: now,
      revision: 1,
      status: "in_progress",
    },
    rows: [],
  };
}

export function readPlan(path) {
  const content = readFileSync(path, "utf8");
  const m = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { frontmatter: {}, rows: [] };
  let frontmatter;
  try { frontmatter = parseYaml(m[1]) || {}; } catch { frontmatter = {}; }
  const rows = parseTaskRows(m[2]);
  return { frontmatter, rows };
}

export function writePlan(ctx, plan) {
  const path = planPathFor(ctx);
  const dir = path.replace(/\/[^/]+$/, "");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  safeWrite(path, renderPlan(plan));
}

export function renderPlan(plan) {
  const fm = serializeYaml(plan.frontmatter);
  const body = renderTasksBody(plan.rows || []);
  return `---\n${fm}\n---\n${body}`;
}

// upsertTaskRow — insert or replace the row matching (agent, feature_id, task_id).
// Returns the mutated plan for chaining. Insertion order preserved on insert;
// on replace, existing position retained.
export function upsertTaskRow(plan, row) {
  if (!plan.rows) plan.rows = [];
  const idx = plan.rows.findIndex(r =>
    r.agent === row.agent && r.feature_id === row.feature_id && r.task_id === row.task_id);
  if (idx >= 0) plan.rows[idx] = row;
  else plan.rows.push(row);
  return plan;
}

// finalizeFrontmatter — recompute updated/revision/status from current row set.
// Called once per write, after all upserts for a SubagentStop event apply.
export function finalizeFrontmatter(plan) {
  const fm = plan.frontmatter;
  fm.updated = new Date().toISOString();
  fm.revision = (typeof fm.revision === "number" ? fm.revision : 1) + 1;
  if ((plan.rows || []).length > 0 && plan.rows.every(r => r.status === "completed")) {
    fm.status = "done";
  } else {
    fm.status = "in_progress";
  }
  return plan;
}

// mapClaudeStatus — Claude Code's TaskUpdate status enum → ledger row status.
// "deleted" returns null (ignored).
export function mapClaudeStatus(s) {
  if (s === "pending" || s === "in_progress" || s === "completed") return s;
  return null;
}

export function oneLine(s) {
  if (typeof s !== "string") return "";
  return s.replace(/\s+/g, " ").trim().slice(0, 200);
}

// extractCreatedTaskId — lifts Claude Code's assigned task identifier from a
// TaskCreate tool_response payload. Same heuristic as the prior per-agent
// PLAN code, retained here so transcript-walk callers don't need to duplicate.
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

function renderTasksBody(rows) {
  const header = "## Tasks\n\n| agent | feature_id | task_id | description | status | updated |\n|---|---|---|---|---|---|\n";
  if (rows.length === 0) return header + "\n";
  const body = rows.map(r =>
    `| ${escapeCell(r.agent)} | ${escapeCell(r.feature_id)} | ${escapeCell(r.task_id)} | ${escapeCell(r.description)} | ${escapeCell(r.status)} | ${escapeCell(r.updated)} |`
  ).join("\n");
  return header + body + "\n";
}

function parseTaskRows(body) {
  const rows = [];
  const lines = body.split("\n");
  let inTable = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) { inTable = false; continue; }
    const cells = trimmed.split("|").map(c => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);
    if (cells.length === 0) continue;
    if (cells.every(c => /^:?-+:?$/.test(c))) { inTable = true; continue; }
    if (!inTable) { inTable = (cells[0] === "agent"); continue; }
    if (cells.length < 6) continue;
    rows.push({
      agent: cells[0],
      feature_id: cells[1],
      task_id: cells[2],
      description: cells[3],
      status: cells[4],
      updated: cells[5],
    });
  }
  return rows;
}

function escapeCell(s) {
  if (typeof s !== "string") return "";
  return s.replace(/\|/g, "\\|").replace(/\n/g, " ");
}
