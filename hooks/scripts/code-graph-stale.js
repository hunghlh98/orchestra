#!/usr/bin/env node
// hooks/scripts/code-graph-stale.js
// Notice hook: when a persisted Java code-graph's commit no longer matches HEAD, surface a
// one-line staleness notice so the reverse-chain baseline gets refreshed. Never blocks.
//   SessionStart            -> additionalContext (injected for the model)
//   PostToolUse(Bash) commit -> stderr notice
// Silent + exit 0 when no code-graph exists, not a git repo, or toggle off.

import { readBoundedStdin } from "../lib/stdin-bounded.js";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const NAME = "ORCHESTRA_HOOK_CODE_GRAPH_STALE";
if (process.env[NAME] === "off") process.exit(0);

const COMMIT_RE = /\bgit\s+(commit|merge|cherry-pick|rebase)\b/;

main();

async function main() {
  try {
    const r = await readBoundedStdin();
    if (r.overflow) process.exit(0);
    let input = {};
    try { input = JSON.parse(r.text || "{}"); } catch { /* SessionStart may send minimal/no payload */ }

    const event = input?.hook_event_name || "";
    const cwd = input?.cwd || process.cwd();

    // PostToolUse Bash: only react to history-moving git commands
    if (event === "PostToolUse") {
      const cmd = input?.tool_input?.command;
      if (typeof cmd !== "string" || !COMMIT_RE.test(cmd)) process.exit(0);
    }

    const head = gitHead(cwd);
    if (!head) process.exit(0);

    const stale = staleServices(cwd, head);
    if (stale.length === 0) process.exit(0);

    const msg = `orchestra: Java code-graph baseline stale for ${stale.join(", ")} `
      + `(built at an earlier commit than ${head.slice(0, 8)}). `
      + `Re-run /orchestra code-to-spec to refresh, or classify-graph-diff.mjs for incremental re-derivation.`;

    if (event === "SessionStart") {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: msg },
      }));
    } else {
      process.stderr.write(`code-graph-stale: ${msg}\n`);
    }
    process.exit(0);
  } catch {
    process.exit(0); // notice hook never blocks
  }
}

function gitHead(cwd) {
  const r = spawnSync("git", ["-C", cwd, "rev-parse", "HEAD"], { encoding: "utf8" });
  return r.status === 0 ? r.stdout.trim() : null;
}

// scan <cwd>/.orchestra/*/code-graph/meta.json for stored commit != HEAD
function staleServices(cwd, head) {
  const base = join(cwd, ".orchestra");
  if (!existsSync(base)) return [];
  const out = [];
  let services;
  try { services = readdirSync(base, { withFileTypes: true }); } catch { return []; }
  for (const d of services) {
    if (!d.isDirectory()) continue;
    const metaPath = join(base, d.name, "code-graph", "meta.json");
    if (!existsSync(metaPath)) continue;
    try {
      const meta = JSON.parse(readFileSync(metaPath, "utf8"));
      if (meta.commit && meta.commit !== head) out.push(d.name);
    } catch { /* skip unreadable meta */ }
  }
  return out;
}
