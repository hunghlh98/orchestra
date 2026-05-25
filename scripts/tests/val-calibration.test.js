#!/usr/bin/env node
// scripts/tests/val-calibration.test.js
// Regression: val-calibration must be idempotent. A prompt already wrapped
// with <calibration-anchor>...</calibration-anchor> (e.g., a second
// PreToolUse on the same Task tool_use after a hook re-run) must pass
// through unchanged — never double-wrap.

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCRIPT = resolve(root, "hooks/scripts/val-calibration.js");

let failures = 0, passes = 0;
const check = (cond, msg) => cond ? passes++ : (failures++, console.error(`  FAIL: ${msg}`));

function runHook(input, env = {}) {
  return spawnSync("node", [SCRIPT], {
    input: JSON.stringify(input),
    encoding: "utf8",
    env: { ...process.env, ...env },
  });
}

// Hook only fires on Task/Agent spawn with subagent_type:"evaluator".
const evalInput = (prompt) => ({
  hook_event_name: "PreToolUse",
  tool_name: "Task",
  tool_input: { subagent_type: "evaluator", prompt },
});

// ---------- Opt-out ----------
console.log("val-calibration — opt-out exits silently:");
{
  const r = runHook(evalInput("do thing"), { ORCHESTRA_HOOK_VAL_CALIBRATION: "off" });
  check(r.status === 0, `opt-out exits 0`);
}

// ---------- Non-evaluator spawn → passthrough ----------
console.log("val-calibration — non-evaluator subagent → no anchor:");
{
  const r = runHook({
    hook_event_name: "PreToolUse",
    tool_name: "Task",
    tool_input: { subagent_type: "backend", prompt: "implement" },
  });
  let payload; try { payload = JSON.parse(r.stdout); } catch { payload = null; }
  check(!payload?.hookSpecificOutput?.updatedInput, `non-evaluator passthrough — no updatedInput`);
}

// ---------- First-time wrap ----------
console.log("val-calibration — first-time wrap injects <calibration-anchor>:");
{
  const r = runHook(evalInput("spawn @evaluator to grade S-EVAL-001"));
  let payload;
  try { payload = JSON.parse(r.stdout); } catch { payload = null; }
  const wrapped = payload?.hookSpecificOutput?.updatedInput?.prompt || "";
  check(/^<calibration-anchor>/.test(wrapped), `first call prepends anchor`);
  check(/<\/calibration-anchor>/.test(wrapped), `anchor block is closed`);
  check(wrapped.includes("spawn @evaluator to grade S-EVAL-001"), `original prompt preserved after anchor`);
}

// ---------- Idempotency: already-anchored prompt passes through ----------
console.log("val-calibration — second call on anchored prompt does NOT double-wrap:");
{
  const alreadyAnchored = "<calibration-anchor>\nHIGH = no questions, MEDIUM = 1, LOW = 2-3\n</calibration-anchor>\n\nspawn @evaluator to grade S-EVAL-001";
  const r = runHook(evalInput(alreadyAnchored));
  let payload;
  try { payload = JSON.parse(r.stdout); } catch { payload = null; }
  // Idempotent passthrough: hook emits passthrough (no updatedInput); the
  // upstream prompt stays as-is. updatedInput would mean double-wrap.
  check(!payload?.hookSpecificOutput?.updatedInput, `already-anchored input → passthrough (no updatedInput)`);
}

if (failures > 0) {
  console.error(`val-calibration.test.js: FAIL (${passes} passed, ${failures} failed)`);
  process.exit(1);
}
console.log(`val-calibration.test.js: OK (${passes} assertions passed)`);
