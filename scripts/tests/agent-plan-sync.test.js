#!/usr/bin/env node
// scripts/tests/agent-plan-sync.test.js
// Hook contract tests for hooks/scripts/agent-plan-sync.js.
//
// Each test sets up a tmp HOME so the hook's getProjectSessionsDir()
// (which uses os.homedir()) reads from a sandboxed jsonl/meta layout.

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parse as parseYaml } from "../../hooks/lib/yaml-mini.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = resolve(root, "hooks/scripts/agent-plan-sync.js");

let failures = 0, passes = 0;
const check = (cond, msg) => cond ? passes++ : (failures++, console.error(`  FAIL: ${msg}`));

function setupSandbox(label) {
  const tmp = mkdtempSync(join(tmpdir(), `orchestra-plan-sync-${label}-`));
  const homeDir = join(tmp, "home");
  const cwdDir = join(tmp, "project");
  mkdirSync(homeDir, { recursive: true });
  mkdirSync(cwdDir, { recursive: true });
  const realCwd = realpathSync(cwdDir);
  const encoded = realCwd.replace(/\//g, "-");
  const projectsDir = join(homeDir, ".claude", "projects", encoded);
  return { tmp, homeDir, cwdDir, projectsDir };
}

function seedSubagentSession({ projectsDir, parentSid, subSid, agentRole, featureId }) {
  const subagentsDir = join(projectsDir, parentSid, "subagents");
  mkdirSync(subagentsDir, { recursive: true });
  const userMsg = {
    type: "user",
    message: { content: `You are @${agentRole} in the orchestra pipeline\nfeature_id: ${featureId}` },
  };
  writeFileSync(join(subagentsDir, `agent-${subSid}.jsonl`), JSON.stringify(userMsg) + "\n");
  writeFileSync(join(subagentsDir, `agent-${subSid}.meta.json`), JSON.stringify({ agentType: `orchestra:${agentRole}` }));
}

function runHook(input, env = {}) {
  return spawnSync("node", [SCRIPT], {
    input: JSON.stringify(input),
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

function readPlanFile(planPath) {
  const content = readFileSync(planPath, "utf8");
  const m = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { frontmatter: {}, body: content, raw: content };
  return { frontmatter: parseYaml(m[1]) || {}, body: m[2], raw: content };
}

// ---------- opt-out ----------
console.log("agent-plan-sync — opt-out:");
{
  const r = runHook(
    { hook_event_name: "PreToolUse", tool_name: "TaskCreate", tool_input: {}, session_id: "x", cwd: "/tmp" },
    { ORCHESTRA_HOOK_AGENT_PLAN_SYNC: "off" },
  );
  check(r.status === 0, `opt-out exits 0`);
  check(/permissionDecision/.test(r.stdout), `opt-out emits allow envelope on PreToolUse`);
}

// ---------- PostToolUse(TaskCreate) creates plan ----------
console.log("agent-plan-sync — PostToolUse(TaskCreate) creates plan + appends task:");
{
  const sb = setupSandbox("create");
  try {
    // Real shape (matches Claude Code's session jsonl layout):
    //   parent session ID: UUID-with-hyphens (top-level dir name)
    //   subagent ID:       short hex without hyphens (the hook's
    //                      findJustStoppedSubagentMeta regex requires [a-f0-9]+)
    const parentSid = "aaaaaaaa-1111-2222-3333-444444444444";
    const subSid = "ac88355b4ef902c50";
    seedSubagentSession({
      projectsDir: sb.projectsDir, parentSid, subSid,
      agentRole: "backend", featureId: "001-todo-api",
    });
    const r = runHook(
      {
        hook_event_name: "PostToolUse",
        tool_name: "TaskCreate",
        tool_input: { subject: "Create User entity", description: "POJO + JPA mapping" },
        tool_response: "Task #1 created successfully: Create User entity",
        session_id: subSid,
        cwd: sb.cwdDir,
      },
      { HOME: sb.homeDir },
    );
    check(r.status === 0, `PostToolUse(TaskCreate) exits 0`);
    const planPath = join(sb.cwdDir, ".orchestra", "tasks", parentSid, "backend", "001-todo-api.md");
    check(existsSync(planPath), `plan file created at .orchestra/tasks/<parent_sid>/<agent>/<feature-id>.md`);
    if (existsSync(planPath)) {
      const plan = readPlanFile(planPath);
      check(plan.frontmatter.type === "PLAN", `frontmatter type: PLAN`);
      check(plan.frontmatter.agent === "@backend", `frontmatter agent: @backend`);
      check(plan.frontmatter.run_id === parentSid, `frontmatter run_id matches parent_sid`);
      check(plan.frontmatter.feature_id === "001-todo-api", `frontmatter feature_id`);
      check(plan.frontmatter.status === "in_progress", `status flipped pending → in_progress on first TaskCreate`);
      check(Array.isArray(plan.frontmatter.tasks) && plan.frontmatter.tasks.length === 1, `one task entry appended`);
      const t = plan.frontmatter.tasks?.[0];
      check(t?.id === "T-001", `first task id: T-001`);
      check(String(t?.claude_task_id) === "1", `claude_task_id bound from "Task #1" tool_response`);
      check(t?.status === "pending", `task starts pending`);
      check(plan.frontmatter.tasks_pending === 1 && plan.frontmatter.tasks_done === 0, `counts: 1 pending`);
      check(/## Tasks/.test(plan.body) && /T-001/.test(plan.body), `body contains Tasks checklist mirror`);
    }
  } finally { rmSync(sb.tmp, { recursive: true, force: true }); }
}

// ---------- TaskUpdate flips status ----------
console.log("agent-plan-sync — TaskUpdate(in_progress) flips task status + counts:");
{
  const sb = setupSandbox("update");
  try {
    const parentSid = "cccccccc-9999-aaaa-bbbb-cccccccccccc";
    const subSid = "a6f3b2272e43a03e6";
    seedSubagentSession({
      projectsDir: sb.projectsDir, parentSid, subSid,
      agentRole: "lead", featureId: "002-payments",
    });
    runHook(
      { hook_event_name: "PostToolUse", tool_name: "TaskCreate",
        tool_input: { subject: "Author TDD" },
        tool_response: { taskId: "42" },
        session_id: subSid, cwd: sb.cwdDir },
      { HOME: sb.homeDir },
    );
    const r = runHook(
      { hook_event_name: "PreToolUse", tool_name: "TaskUpdate",
        tool_input: { taskId: "42", status: "in_progress" },
        session_id: subSid, cwd: sb.cwdDir },
      { HOME: sb.homeDir },
    );
    check(r.status === 0, `TaskUpdate exits 0`);
    const planPath = join(sb.cwdDir, ".orchestra", "tasks", parentSid, "lead", "002-payments.md");
    if (existsSync(planPath)) {
      const plan = readPlanFile(planPath);
      check(plan.frontmatter.tasks?.[0]?.status === "in_progress", `task[0] flipped pending → in_progress`);
      check(plan.frontmatter.tasks_in_progress === 1 && plan.frontmatter.tasks_pending === 0, `counts: 0 pending, 1 in_progress`);
      check(/\(in progress\)/.test(plan.body), `body checklist annotates "(in progress)"`);
    }
  } finally { rmSync(sb.tmp, { recursive: true, force: true }); }
}

// ---------- TaskUpdate(completed) flips plan status: done when all done ----------
console.log("agent-plan-sync — last-task completion flips plan status: done:");
{
  const sb = setupSandbox("done");
  try {
    const parentSid = "eeeeeeee-3333-4444-5555-666666666666";
    const subSid = "be1d52b39f01a7c";
    seedSubagentSession({
      projectsDir: sb.projectsDir, parentSid, subSid,
      agentRole: "test", featureId: "003-search",
    });
    runHook(
      { hook_event_name: "PostToolUse", tool_name: "TaskCreate",
        tool_input: { subject: "Write black-box tests" },
        tool_response: { taskId: "99" },
        session_id: subSid, cwd: sb.cwdDir },
      { HOME: sb.homeDir },
    );
    runHook(
      { hook_event_name: "PreToolUse", tool_name: "TaskUpdate",
        tool_input: { taskId: "99", status: "completed" },
        session_id: subSid, cwd: sb.cwdDir },
      { HOME: sb.homeDir },
    );
    const planPath = join(sb.cwdDir, ".orchestra", "tasks", parentSid, "test", "003-search.md");
    if (existsSync(planPath)) {
      const plan = readPlanFile(planPath);
      check(plan.frontmatter.status === "done", `plan status: done when all tasks completed`);
      check(plan.frontmatter.tasks_done === 1, `tasks_done: 1`);
      check(/\[x\] T-001/.test(plan.body), `body checklist shows [x] for completed task`);
    }
  } finally { rmSync(sb.tmp, { recursive: true, force: true }); }
}

// ---------- SubagentStop with open tasks → interrupted ----------
console.log("agent-plan-sync — SubagentStop with open tasks flips status: interrupted:");
{
  const sb = setupSandbox("interrupt");
  try {
    const parentSid = "11111111-2222-3333-4444-555555555555";
    const subSid = "f0a3c1e2b994d7c";
    seedSubagentSession({
      projectsDir: sb.projectsDir, parentSid, subSid,
      agentRole: "backend", featureId: "004-auth",
    });
    runHook(
      { hook_event_name: "PostToolUse", tool_name: "TaskCreate",
        tool_input: { subject: "Implement JWT filter" }, tool_response: { taskId: "1" },
        session_id: subSid, cwd: sb.cwdDir },
      { HOME: sb.homeDir },
    );
    // SubagentStop fires on parent dispatcher session; session_id IS the parent's.
    const r = runHook(
      { hook_event_name: "SubagentStop", session_id: parentSid, cwd: sb.cwdDir },
      { HOME: sb.homeDir },
    );
    check(r.status === 0, `SubagentStop exits 0`);
    const planPath = join(sb.cwdDir, ".orchestra", "tasks", parentSid, "backend", "004-auth.md");
    if (existsSync(planPath)) {
      const plan = readPlanFile(planPath);
      check(plan.frontmatter.status === "interrupted", `status: interrupted on stop with open tasks`);
    }
  } finally { rmSync(sb.tmp, { recursive: true, force: true }); }
}

// ---------- Idempotent: same claude_task_id doesn't double-bind ----------
console.log("agent-plan-sync — idempotent on duplicate PostToolUse(TaskCreate):");
{
  const sb = setupSandbox("idempotent");
  try {
    const parentSid = "bbbbbbbb-cccc-dddd-eeee-ffffffffffff";
    const subSid = "deadbeef0123456";
    seedSubagentSession({
      projectsDir: sb.projectsDir, parentSid, subSid,
      agentRole: "backend", featureId: "005-loyalty",
    });
    for (let i = 0; i < 2; i++) {
      runHook(
        { hook_event_name: "PostToolUse", tool_name: "TaskCreate",
          tool_input: { subject: "Same subject" }, tool_response: { taskId: "7" },
          session_id: subSid, cwd: sb.cwdDir },
        { HOME: sb.homeDir },
      );
    }
    const planPath = join(sb.cwdDir, ".orchestra", "tasks", parentSid, "backend", "005-loyalty.md");
    if (existsSync(planPath)) {
      const plan = readPlanFile(planPath);
      check(plan.frontmatter.tasks?.length === 1, `same claude_task_id appended once, not twice`);
    }
  } finally { rmSync(sb.tmp, { recursive: true, force: true }); }
}

if (failures > 0) {
  console.error(`agent-plan-sync.test.js: FAIL (${passes} passed, ${failures} failed)`);
  process.exit(1);
}
console.log(`agent-plan-sync.test.js: OK (${passes} assertions passed)`);
