#!/usr/bin/env node
// hooks/scripts/orchestra-preflight.js
// UserPromptSubmit hook. Runs ONLY when the prompt starts with `/orchestra`.
// Emits an <orchestra-preflight> YAML block to stdout (Claude Code injects
// stdout from UserPromptSubmit hooks as additional prompt context).
//
// The dispatcher's first action is to read this block, skip bootstrap
// prompts for resolved fields, and surface AskUserQuestion only for
// missing_fields.
//
// Opt-out: ORCHESTRA_HOOK_PREFLIGHT=off. Do not disable in production —
// dispatcher halts without this block.

import { buildPreflightBlock, parseSourceFlag } from "../lib/preflight-detect.js";

const NAME = "ORCHESTRA_HOOK_PREFLIGHT";

if (process.env[NAME] === "off") {
  process.exit(0);
}

main();

async function main() {
  let stdin = "";
  try {
    process.stdin.setEncoding("utf8");
    for await (const chunk of process.stdin) stdin += chunk;
    const input = stdin.trim() ? JSON.parse(stdin) : {};
    const prompt = String(input.prompt || input.user_message || "");
    if (!/^\/orchestra(?::orchestra)?(\s|$)/.test(prompt)) {
      process.exit(0);
    }

    const cwd = input.cwd || process.cwd();
    const sourceFromPrompt = parseSourceFlag(prompt);
    const perServiceFromPrompt = /(^|\s)service:\S+/.test(prompt);
    const sessionId = typeof input.session_id === "string" ? input.session_id : null;
    process.stdout.write(buildPreflightBlock(cwd, sourceFromPrompt, perServiceFromPrompt, sessionId));
    process.exit(0);
  } catch (err) {
    process.stderr.write(`orchestra-preflight: crashed (non-blocking) — ${err.message}\n`);
    process.exit(0);
  }
}
