#!/usr/bin/env node
// scripts/tests/agent-plan-sync.test.js
// Hook contract tests for hooks/scripts/agent-plan-sync.js.
//
// SubagentStop-only model: each test seeds a subagent transcript with
// TaskCreate/TaskUpdate events, fires SubagentStop in the parent session,
// and asserts the resulting session-level ledger at
// <cwd>/.orchestra/plans/<sessionId>/agent-tasks.md.

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

// Seeds a subagent transcript with user-spawn-prompt + N task events.
// taskEvents: [{ kind: "create", toolUseId, subject, claudeTaskId, ts }] or
//             [{ kind: "update", taskId, status, ts }].
function seedSubagentSession({ projectsDir, parentSid, subSid, agentRole, featureId, taskEvents = [] }) {
  const subagentsDir = join(projectsDir, parentSid, "subagents");
  mkdirSync(subagentsDir, { recursive: true });
  const jsonlPath = join(subagentsDir, `agent-${subSid}.jsonl`);
  const lines = [];
  lines.push(JSON.stringify({
    type: "user",
    message: { content: `You are @${agentRole} in the orchestra pipeline\nfeature_id: ${featureId}` },
  }));
  for (const evt of taskEvents) {
    if (evt.kind === "create") {
      lines.push(JSON.stringify({
        type: "assistant", timestamp: evt.ts || "2026-05-23T10:00:00Z",
        message: { content: [{ type: "tool_use", id: evt.toolUseId, name: "TaskCreate", input: { subject: evt.subject } }] },
      }));
      lines.push(JSON.stringify({
        type: "user", timestamp: evt.ts || "2026-05-23T10:00:00Z",
        message: { content: [{ type: "tool_result", tool_use_id: evt.toolUseId, content: `Task #${evt.claudeTaskId} created` }] },
      }));
    } else if (evt.kind === "update") {
      lines.push(JSON.stringify({
        type: "assistant", timestamp: evt.ts || "2026-05-23T10:05:00Z",
        message: { content: [{ type: "tool_use", id: `update-${evt.taskId}`, name: "TaskUpdate", input: { taskId: evt.taskId, status: evt.status } }] },
      }));
    }
  }
  writeFileSync(jsonlPath, lines.join("\n") + "\n");
  writeFileSync(join(subagentsDir, `agent-${subSid}.meta.json`), JSON.stringify({ agentType: `orchestra:${agentRole}` }));
  return jsonlPath;
}

function runHook(input, env = {}, opts = {}) {
  // Cold-start gate: agent-plan-sync no-ops until .orchestra/system.yaml exists.
  // Auto-seed for every test that supplies a cwd unless opts.skipSeed = true.
  if (input && input.cwd && !opts.skipSeed) {
    const sysYamlPath = join(input.cwd, ".orchestra", "system.yaml");
    if (!existsSync(sysYamlPath)) {
      mkdirSync(dirname(sysYamlPath), { recursive: true });
      writeFileSync(sysYamlPath, "workspace_kind: single-repo\ncontext_path: .\n");
    }
  }
  return spawnSync("node", [SCRIPT], {
    input: JSON.stringify(input),
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

function readLedger(planPath) {
  const content = readFileSync(planPath, "utf8");
  const m = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { frontmatter: {}, rows: [], raw: content };
  const frontmatter = parseYaml(m[1]) || {};
  const rows = parseTaskRows(m[2]);
  return { frontmatter, rows, body: m[2], raw: content };
}

function parseTaskRows(body) {
  const rows = [];
  let inTable = false;
  for (const line of body.split("\n")) {
    const t = line.trim();
    if (!t.startsWith("|")) { inTable = false; continue; }
    const cells = t.split("|").map(c => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);
    if (cells.length === 0) continue;
    if (cells.every(c => /^:?-+:?$/.test(c))) { inTable = true; continue; }
    if (!inTable) { inTable = (cells[0] === "agent"); continue; }
    if (cells.length < 6) continue;
    rows.push({ agent: cells[0], feature_id: cells[1], task_id: cells[2], description: cells[3], status: cells[4], updated: cells[5] });
  }
  return rows;
}

// ---------- opt-out ----------
console.log("agent-plan-sync — opt-out:");
{
  const r = runHook(
    { hook_event_name: "SubagentStop", session_id: "x", cwd: "/tmp" },
    { ORCHESTRA_HOOK_AGENT_PLAN_SYNC: "off" },
  );
  check(r.status === 0, `opt-out exits 0`);
}

// ---------- SubagentStop projects transcript to ledger ----------
console.log("agent-plan-sync — SubagentStop projects task rows from subagent transcript:");
{
  const sb = setupSandbox("project");
  try {
    const parentSid = "aaaaaaaa-1111-2222-3333-444444444444";
    const subSid = "ac88355b4ef902c50";
    seedSubagentSession({
      projectsDir: sb.projectsDir, parentSid, subSid,
      agentRole: "backend", featureId: "001-todo-api",
      taskEvents: [
        { kind: "create", toolUseId: "toolu_01", subject: "Create User entity", claudeTaskId: "1", ts: "2026-05-23T10:00:00Z" },
        { kind: "update", taskId: "1", status: "in_progress", ts: "2026-05-23T10:01:00Z" },
        { kind: "create", toolUseId: "toolu_02", subject: "Wire JPA repository", claudeTaskId: "2", ts: "2026-05-23T10:02:00Z" },
        { kind: "update", taskId: "2", status: "completed", ts: "2026-05-23T10:03:00Z" },
      ],
    });
    const r = runHook(
      { hook_event_name: "SubagentStop", session_id: parentSid, cwd: sb.cwdDir },
      { HOME: sb.homeDir },
    );
    check(r.status === 0, `SubagentStop exits 0`);
    const ledgerPath = join(sb.cwdDir, ".orchestra", "plans", parentSid, "agent-tasks.md");
    check(existsSync(ledgerPath), `ledger written at .orchestra/plans/<sessionId>/agent-tasks.md`);
    if (existsSync(ledgerPath)) {
      const l = readLedger(ledgerPath);
      check(l.frontmatter.type === "AGENT-TASKS", `frontmatter type: AGENT-TASKS`);
      check(l.frontmatter.session_id === parentSid, `frontmatter session_id matches parent_sid`);
      check(l.frontmatter.id === "agent-tasks", `frontmatter id: agent-tasks`);
      check(l.rows.length === 2, `two rows (one per TaskCreate observed); got ${l.rows.length}`);
      const r1 = l.rows.find(r => r.task_id === "1");
      check(r1 && r1.agent === "@backend", `row task_id=1 agent: @backend`);
      check(r1 && r1.feature_id === "001-todo-api", `row task_id=1 feature_id: 001-todo-api`);
      check(r1 && r1.description === "Create User entity", `row task_id=1 description`);
      check(r1 && r1.status === "in_progress", `row task_id=1 status: in_progress (latest update)`);
      const r2 = l.rows.find(r => r.task_id === "2");
      check(r2 && r2.status === "completed", `row task_id=2 status: completed`);
      check(l.frontmatter.status === "in_progress", `file status: in_progress (one row not completed)`);
    }
  } finally { rmSync(sb.tmp, { recursive: true, force: true }); }
}

// ---------- All rows completed → file status: done ----------
console.log("agent-plan-sync — all-completed rows flip file status: done:");
{
  const sb = setupSandbox("done");
  try {
    const parentSid = "cccccccc-9999-aaaa-bbbb-cccccccccccc";
    const subSid = "a6f3b2272e43a03e6";
    seedSubagentSession({
      projectsDir: sb.projectsDir, parentSid, subSid,
      agentRole: "test", featureId: "003-search",
      taskEvents: [
        { kind: "create", toolUseId: "toolu_t1", subject: "Write black-box tests", claudeTaskId: "99", ts: "2026-05-23T11:00:00Z" },
        { kind: "update", taskId: "99", status: "completed", ts: "2026-05-23T11:05:00Z" },
      ],
    });
    runHook(
      { hook_event_name: "SubagentStop", session_id: parentSid, cwd: sb.cwdDir },
      { HOME: sb.homeDir },
    );
    const ledgerPath = join(sb.cwdDir, ".orchestra", "plans", parentSid, "agent-tasks.md");
    if (existsSync(ledgerPath)) {
      const l = readLedger(ledgerPath);
      check(l.frontmatter.status === "done", `file status: done when every row completed`);
      check(l.rows.length === 1 && l.rows[0].status === "completed", `one completed row`);
    }
  } finally { rmSync(sb.tmp, { recursive: true, force: true }); }
}

// ---------- Idempotent re-projection: same subagent twice → same row count ----------
console.log("agent-plan-sync — idempotent on re-projection of same subagent:");
{
  const sb = setupSandbox("idempotent");
  try {
    const parentSid = "bbbbbbbb-cccc-dddd-eeee-ffffffffffff";
    const subSid = "deadbeef0123456";
    seedSubagentSession({
      projectsDir: sb.projectsDir, parentSid, subSid,
      agentRole: "backend", featureId: "005-loyalty",
      taskEvents: [
        { kind: "create", toolUseId: "toolu_x", subject: "Loyalty service", claudeTaskId: "7", ts: "2026-05-23T12:00:00Z" },
      ],
    });
    for (let i = 0; i < 2; i++) {
      runHook(
        { hook_event_name: "SubagentStop", session_id: parentSid, cwd: sb.cwdDir },
        { HOME: sb.homeDir },
      );
    }
    const ledgerPath = join(sb.cwdDir, ".orchestra", "plans", parentSid, "agent-tasks.md");
    if (existsSync(ledgerPath)) {
      const l = readLedger(ledgerPath);
      check(l.rows.length === 1, `same (agent, feature_id, task_id) projected twice yields one row, not two`);
    }
  } finally { rmSync(sb.tmp, { recursive: true, force: true }); }
}

// ---------- Cold-start gate: no .orchestra/system.yaml → no-op ----------
console.log("agent-plan-sync — cold-start gate:");
{
  const sb = setupSandbox("cold-start");
  try {
    const r = runHook(
      { hook_event_name: "SubagentStop", session_id: "ses-coldstart", cwd: sb.cwdDir },
      { HOME: sb.homeDir },
      { skipSeed: true },
    );
    check(r.status === 0, `cold-start: exits 0`);
    check(!existsSync(join(sb.cwdDir, ".orchestra")), `cold-start: no .orchestra/ dir materialized`);
  } finally { rmSync(sb.tmp, { recursive: true, force: true }); }
}

// ---------- Non-SubagentStop event ignored ----------
console.log("agent-plan-sync — non-SubagentStop events ignored:");
{
  const sb = setupSandbox("ignore");
  try {
    const r = runHook(
      { hook_event_name: "PreToolUse", tool_name: "TaskCreate", session_id: "x", cwd: sb.cwdDir },
      { HOME: sb.homeDir },
    );
    check(r.status === 0, `PreToolUse exits 0 (ignored)`);
    check(!existsSync(join(sb.cwdDir, ".orchestra", "plans")), `no ledger materialized for non-SubagentStop event`);
  } finally { rmSync(sb.tmp, { recursive: true, force: true }); }
}

if (failures > 0) {
  console.error(`agent-plan-sync.test.js: FAIL (${passes} passed, ${failures} failed)`);
  process.exit(1);
}
console.log(`agent-plan-sync.test.js: OK (${passes} assertions passed)`);
