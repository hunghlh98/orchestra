#!/usr/bin/env node
// hooks/scripts/agent-plan-sync.js
// Owns mutation of per-agent PLAN files at
// <cwd>/.orchestra/tasks/<run-id>/<agent>/<feature-id>.md.
//
// Subscribed events:
//   PreToolUse(TaskCreate)   — allow (heuristic prebind reserved for future)
//   PostToolUse(TaskCreate)  — bind Claude Code's assigned taskId to T-NNN entry
//   PreToolUse(TaskUpdate)   — flip status by claude_task_id; recompute counts
//   SubagentStop             — open tasks → status: interrupted; all done → done
//
// Source-of-truth boundary:
//   - Agent body owns `## Approach` narrative + initial frontmatter.
//   - This hook owns `tasks:` array, `tasks_pending|in_progress|done` counts,
//     `updated:` timestamp, top-level `status:` lifecycle, and `## Tasks` mirror.
//   - The hook never edits `## Approach`.
//
// Crash semantics: never block. Exit 0 on any failure.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { resolveContext, findJustStoppedSubagentMeta, deriveFeatureId } from "../lib/plan-sync.js";
import {
  planPathFor, readOrInitPlan, readPlan, writePlan, renderPlan,
  rebuildTasksChecklist, recomputeCounts, nextTaskOrdinal,
  mapClaudeStatus, oneLine, extractCreatedTaskId,
} from "../lib/plan-frontmatter.js";
import { safeWrite } from "../lib/safe-fs.js";

const NAME = "ORCHESTRA_HOOK_AGENT_PLAN_SYNC";

main();

async function main() {
  let stdin = "";
  try {
    process.stdin.setEncoding("utf8");
    for await (const chunk of process.stdin) stdin += chunk;

    if (process.env[NAME] === "off") {
      emitAllowIfPreToolUse(stdin);
      process.exit(0);
    }

    const input = JSON.parse(stdin);

    // Cold-start gate: until .orchestra/system.yaml exists (first /orchestra
    // invocation writes it via mcp__orchestra-utils__write_system_yaml), no
    // orchestra session has bootstrapped here — no-op so this hook never
    // creates .orchestra/tasks/* unsolicited.
    {
      const cwdGuess = input.cwd || process.cwd();
      if (!existsSync(join(cwdGuess, ".orchestra/system.yaml"))) {
        emitAllowIfPreToolUse(stdin);
        process.exit(0);
      }
    }

    const event = input.hook_event_name;
    const tool = input.tool_name;

    if (event === "PreToolUse" && tool === "TaskCreate") {
      // No-op: append happens in PostToolUse where Claude Code's taskId is known.
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

function handlePostTaskCreate(input) {
  const ctx = resolveContext(input);
  if (!ctx) return;
  const subject = input?.tool_input?.subject;
  const description = input?.tool_input?.description || "";
  const claudeTaskId = extractCreatedTaskId(input?.tool_response);
  if (!claudeTaskId) return;

  const plan = readOrInitPlan(ctx);
  const tasks = Array.isArray(plan.frontmatter.tasks) ? plan.frontmatter.tasks : [];
  // Idempotency: don't double-bind if the same claude_task_id exists.
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
  if (plan.frontmatter.status === "pending") plan.frontmatter.status = "in_progress";
  plan.frontmatter.updated = new Date().toISOString();
  plan.body = rebuildTasksChecklist(plan.body, tasks);
  writePlan(ctx, plan);
}

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
  const fm = plan.frontmatter;
  if ((fm.tasks_in_progress > 0 || fm.tasks_done > 0) && fm.status === "pending") {
    fm.status = "in_progress";
  }
  if (fm.tasks_pending === 0 && fm.tasks_in_progress === 0 && fm.tasks_done > 0) {
    fm.status = "done";
  }
  fm.updated = new Date().toISOString();
  plan.body = rebuildTasksChecklist(plan.body, tasks);
  writePlan(ctx, plan);
}

function handleSubagentStop(input) {
  const cwd = input.cwd || process.cwd();
  const stopped = findJustStoppedSubagentMeta(cwd, input.session_id);
  if (!stopped) return;

  const ctx = {
    cwd,
    runId: input.session_id,
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

  if (allDone) plan.frontmatter.status = "done";
  else if (anyOpen && plan.frontmatter.status !== "done") plan.frontmatter.status = "interrupted";
  plan.frontmatter.updated = new Date().toISOString();
  safeWrite(planPath, renderPlan(plan));
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
  } catch {}
}
