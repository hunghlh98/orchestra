#!/usr/bin/env node
// hooks/scripts/val-calibration.js
// Rewriter hook: when @evaluator is spawned via Task, prepend the
// calibration anchor block to the prompt. Graceful no-op if the
// calibration source file is missing.

import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readBoundedStdin } from "../lib/stdin-bounded.js";

const NAME = "ORCHESTRA_HOOK_VAL_CALIBRATION";

if (process.env[NAME] === "off") {
  passthrough();
  process.exit(0);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const CALIBRATION_PATH = resolve(
  __dirname,
  "../calibration/calibration-examples.md"
);

main();

async function main() {
  try {
    const r = await readBoundedStdin();
    if (r.overflow) {
      process.stderr.write(`val-calibration: stdin exceeded 1 MiB cap (${r.bytes} bytes) — passthrough\n`);
      passthrough();
      process.exit(0);
    }
    const input = JSON.parse(r.text);

    // Accept both "Task" (legacy) and "Agent" (canonical) — Claude Code
    // renamed the subagent-spawn tool. Smoke #3 surfaced that the literal
    // "Task" filter silently skipped real Agent invocations.
    const isSubagentSpawn = input.tool_name === "Task" || input.tool_name === "Agent";
    const isEvaluator = input?.tool_input?.subagent_type === "evaluator";
    if (!isSubagentSpawn || !isEvaluator) {
      passthrough();
      process.exit(0);
    }

    if (!existsSync(CALIBRATION_PATH)) {
      // Graceful no-op when the calibration file is missing — never block.
      passthrough();
      process.exit(0);
    }

    const calibration = readFileSync(CALIBRATION_PATH, "utf8");
    const originalPrompt = input.tool_input?.prompt || "";
    const newPrompt =
      `<calibration-anchor>\n${calibration.trim()}\n</calibration-anchor>\n\n${originalPrompt}`;

    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "allow",
        updatedInput: { ...input.tool_input, prompt: newPrompt },
      },
    }));
    process.exit(0);
  } catch (err) {
    process.stderr.write(`val-calibration crashed: ${err.message}\n`);
    passthrough();
    process.exit(0);
  }
}

function passthrough() {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
    },
  }));
}
