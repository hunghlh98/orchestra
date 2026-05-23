#!/usr/bin/env node
// hooks/scripts/stop-plan-verify.js
// Mitigates anthropics/claude-code#50110 (ExitPlanMode silent-approval).
//
// On Stop event, scans the just-ended main-agent turn for the dangerous
// pattern: an ExitPlanMode tool_use FOLLOWED BY a Task/Agent spawn in the
// SAME turn. Under normal Claude Code semantics, ExitPlanMode is the last
// tool_use of its turn — the assistant turn ends, the approval UI arrives
// async, and approval lands in the NEXT user message. A Task spawn that
// fires AFTER ExitPlanMode in the same turn indicates the silent-approval
// bug fired (model received `"User has approved"` with no UI interaction).
//
// On detection: emit decision:block via stdout. Claude Code halts the
// turn and surfaces the structured reason. User verifies the plan was
// actually approved via the PlanMode UI before re-running /orchestra.
//
// Crash semantics: never block. Exit 0 on any failure.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const NAME = "ORCHESTRA_HOOK_STOP_PLAN_VERIFY";

main();

async function main() {
  try {
    let stdin = "";
    process.stdin.setEncoding("utf8");
    for await (const chunk of process.stdin) stdin += chunk;

    if (process.env[NAME] === "off") process.exit(0);

    const input = stdin.trim() ? JSON.parse(stdin) : {};
    if (input.hook_event_name !== "Stop") process.exit(0);

    const cwd = input.cwd || process.cwd();

    // Cold-start gate: outside an orchestra-bootstrapped workspace this
    // hook is a no-op. PlanMode usage in non-orchestra workflows is the
    // user's own — orchestra does not gate it.
    if (!existsSync(join(cwd, ".orchestra/system.yaml"))) process.exit(0);

    const transcriptPath = input.transcript_path;
    if (!transcriptPath || !existsSync(transcriptPath)) process.exit(0);

    const detection = scanCurrentTurn(transcriptPath);
    if (detection.silentApproval) {
      process.stdout.write(JSON.stringify({
        decision: "block",
        reason: detection.reason,
      }));
      process.exit(0);
    }

    process.exit(0);
  } catch (err) {
    process.stderr.write(`stop-plan-verify crashed: ${err.message}\n`);
    process.exit(0);
  }
}

// Scans the most recent assistant turn in a main-agent transcript.
// "Current turn" = tail of transcript from the most recent `type: user`
// line forward. Collects tool_use names in order, then tests for the
// silent-approval pattern.
//
// Exported for unit testing.
export function scanCurrentTurn(transcriptPath) {
  const text = readFileSync(transcriptPath, "utf8");
  const lines = text.split("\n").filter(Boolean);

  // Find the most recent user-message line; that marks the start of the
  // assistant turn whose Stop event we are servicing.
  let turnStart = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    let row;
    try { row = JSON.parse(lines[i]); } catch { continue; }
    if (row.type === "user") {
      turnStart = i;
      break;
    }
  }

  // Walk forward, collecting tool_use names from assistant blocks.
  const toolUses = [];
  for (let i = turnStart; i < lines.length; i++) {
    let row;
    try { row = JSON.parse(lines[i]); } catch { continue; }
    if (row.type !== "assistant") continue;
    const content = row.message?.content || [];
    for (const block of content) {
      if (block.type === "tool_use" && block.name) {
        toolUses.push({ name: block.name, line: i });
      }
    }
  }

  const exitPlanIdx = toolUses.findIndex(t => t.name === "ExitPlanMode");
  if (exitPlanIdx < 0) {
    return { silentApproval: false, reason: "" };
  }

  // Look for a Task/Agent spawn AFTER the ExitPlanMode call.
  for (let j = exitPlanIdx + 1; j < toolUses.length; j++) {
    const name = toolUses[j].name;
    if (name === "Task" || name === "Agent") {
      return {
        silentApproval: true,
        reason:
          "stop-plan-verify: detected ExitPlanMode followed by a Task spawn in the SAME assistant turn — likely silent-approval bug (anthropics/claude-code#50110). " +
          "Under normal PlanMode semantics, ExitPlanMode submits the plan and ends the turn; approval lands in the NEXT user message. " +
          "Verify the plan was actually approved via the PlanMode UI panel before re-running /orchestra. " +
          "To bypass this gate when approval IS confirmed via UI, set ORCHESTRA_HOOK_STOP_PLAN_VERIFY=off.",
      };
    }
  }

  return { silentApproval: false, reason: "" };
}
