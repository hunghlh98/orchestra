#!/usr/bin/env node
// hooks/scripts/agent-plan-sync.js
// Projects subagent task activity into the session-level ledger at
// <cwd>/.orchestra/plans/<sessionId>/agent-tasks.md.
//
// Single subscribed event: SubagentStop. On fire, locates the most-recently-
// stopped subagent's transcript, extracts every TaskCreate/TaskUpdate event
// from it, and upserts one row per (agent, feature_id, task_id) into the
// session ledger. Subagents never write to the ledger directly — the hook
// is the single writer, eliminating concurrent-write races by construction.
//
// Crash semantics: never block. Exit 0 on any failure.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { findJustStoppedSubagentMeta, projectSubagentRows } from "../lib/plan-sync.js";
import {
  planPathFor, readOrInitPlan, upsertTaskRow, finalizeFrontmatter, writePlan,
} from "../lib/plan-frontmatter.js";
import { readBoundedStdin } from "../lib/stdin-bounded.js";

const NAME = "ORCHESTRA_HOOK_AGENT_PLAN_SYNC";

main();

async function main() {
  try {
    const r = await readBoundedStdin();
    if (r.overflow) {
      process.stderr.write(`agent-plan-sync: stdin exceeded 1 MiB cap (${r.bytes} bytes) — skipping\n`);
      process.exit(0);
    }
    const stdin = r.text;

    if (process.env[NAME] === "off") process.exit(0);

    const input = stdin.trim() ? JSON.parse(stdin) : {};
    if (input.hook_event_name !== "SubagentStop") process.exit(0);

    const cwd = input.cwd || process.cwd();
    const sessionId = input.session_id;
    if (!sessionId) process.exit(0);

    // Cold-start gate: until .orchestra/system.yaml exists, no orchestra
    // session has bootstrapped here — no-op so this hook never creates
    // .orchestra/plans/* unsolicited.
    if (!existsSync(join(cwd, ".orchestra/system.yaml"))) process.exit(0);

    const stopped = findJustStoppedSubagentMeta(cwd, sessionId);
    if (!stopped || stopped.role === "unknown") process.exit(0);

    const rows = projectSubagentRows(cwd, stopped.path, stopped.role);
    if (rows.length === 0) process.exit(0);

    const ctx = { cwd, sessionId };
    const plan = readOrInitPlan(ctx);
    for (const row of rows) {
      if (!row.task_id) continue;
      upsertTaskRow(plan, row);
    }
    finalizeFrontmatter(plan);
    writePlan(ctx, plan);
    process.exit(0);
  } catch (err) {
    process.stderr.write(`agent-plan-sync crashed: ${err.message}\n`);
    process.exit(0);
  }
}
