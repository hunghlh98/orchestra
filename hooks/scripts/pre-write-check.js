#!/usr/bin/env node
// hooks/scripts/pre-write-check.js
// PreToolUse(Write|Edit|MultiEdit) hook. Gates run in order:
//   secrets                          — secret detection; exit 2 on hit
//   chain-cite-reject                — src/** cite denylist; exit 2 on hit
//   codebase-token-reject            — docs/** codebase-identifier denylist; exit 2 on hit
//   workspace-sad-container-floor    — workspace-scope SAD/c4-container container floor
//   iid-pairing-reject               — openapi/asyncapi/clientapi x-orchestra-iid presence + pairing
//   graph-backing-reject             — locked openapi vs persisted Java code-graph baseline completeness + staleness
//   changelog-append-only            — docs/**/*.md ## Changelog append-only (Write-only)
//   locked-status-reject             — frontmatter `status: locked` rejects writes
//   all-sections-locked-reject       — frontmatter `sections:` all-locked rejection
//   readers-scope-warning            — frontmatter `readers:` allowlist warning (non-blocking)
//
// Crash + malformed-input semantics:
//   This hook is defense-in-depth, NOT the single line of defense. Schema
//   pins, MCP allowlists, and the agent prompts also gate writes; a hook
//   crash must not brick the consumer's session. So on internal exception
//   (parser bug, fs glitch) we exit 0 and log to stderr — the surrounding
//   layers still enforce.
//
//   Stdin payload that is missing / oversized / malformed is treated as
//   adversarial: we emit `permissionDecision: "ask"` so the user can
//   eyeball the request before allowing it, rather than fail-open with
//   exit 0. This blocks a hostile transcript from bypassing the gate by
//   feeding a >1 MiB or non-JSON payload.

import { existsSync, readFileSync } from "node:fs";
import { parse as parseYaml } from "../lib/yaml-mini.js";
import {
  checkSecrets, checkChainCiteReject, checkCodebaseTokenReject, checkWorkspaceSadContainerFloor, checkIidPairing,
} from "../lib/gate-d.js";
import { checkChangelogAppendOnly } from "../lib/gate-f.js";
import { checkGraphBacking } from "../lib/gate-graph.js";
import { readBoundedStdin } from "../lib/stdin-bounded.js";

const NAME = "ORCHESTRA_HOOK_PRE_WRITE_CHECK";

if (process.env[NAME] === "off") {
  process.exit(0);
}

main();

async function main() {
  let stdin;
  try {
    stdin = await readBoundedStdin();
  } catch (err) {
    process.stderr.write(`pre-write-check: stdin read failed (non-blocking): ${err.message}\n`);
    process.exit(0);
  }
  if (stdin.overflow) {
    process.stderr.write(`pre-write-check: stdin exceeded 1 MiB cap (${stdin.bytes} bytes) — emitting ask\n`);
    emitAsk("stdin payload exceeded 1 MiB cap");
    process.exit(0);
  }
  let input;
  try {
    input = JSON.parse(stdin.text);
  } catch (err) {
    process.stderr.write(`pre-write-check: malformed stdin (${err.message}) — emitting ask\n`);
    emitAsk(`malformed stdin: ${err.message}`);
    process.exit(0);
  }
  try {
    const filePath = input.tool_input?.file_path || "";
    const content = extractContent(input.tool_name, input.tool_input);
    if (!content) process.exit(0);

    // Content-only gates run in declared order; first hit exits 2.
    for (const result of [
      checkSecrets(content),
      checkChainCiteReject(filePath, content),
      checkCodebaseTokenReject(filePath, content),
      checkWorkspaceSadContainerFloor(filePath, content, input.cwd),
      checkIidPairing(filePath, content, input.cwd),
      checkGraphBacking(filePath, content, input.cwd),
      checkChangelogAppendOnly(filePath, content, input.tool_name),
    ]) {
      if (result) {
        process.stderr.write(result.message);
        process.exit(2);
      }
    }

    // Frontmatter gates only run when the target file already exists on disk
    // (Edit/MultiEdit). Write to a new path skips frontmatter gates — no prior
    // frontmatter to consult.
    if (filePath && existsSync(filePath)) {
      const fm = readFrontmatter(filePath);
      if (fm) {
        if (runLockedStatusReject(filePath, fm)) process.exit(2);
        if (runAllSectionsLockedReject(filePath, fm)) process.exit(2);
        runReadersScopeWarning(filePath, fm);
      }
    }

    process.exit(0);
  } catch (err) {
    process.stderr.write(`pre-write-check crashed (emitting ask): ${err.message}\n`);
    emitAsk(`internal exception: ${err.message}`);
    process.exit(0);
  }
}

function emitAsk(reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "ask",
      permissionDecisionReason: `pre-write-check: ${reason}`,
    },
  }));
}

function runLockedStatusReject(filePath, fm) {
  if (fm.status !== "locked") return false;
  process.stderr.write(
    `pre-write-check: locked-status-reject — ${filePath} is locked (status: locked). ` +
    `Hint: dispatcher may unlock via mcp__orchestra-utils__amend_locked_artifact for a ratify-spec amendment. ` +
    `Override via ORCHESTRA_HOOK_PRE_WRITE_CHECK=off.\n`
  );
  return true;
}

function runAllSectionsLockedReject(filePath, fm) {
  const sections = fm.sections;
  if (!sections || typeof sections !== "object" || Array.isArray(sections)) return false;
  const entries = Object.values(sections).filter(s => s && typeof s === "object");
  if (entries.length === 0) return false;
  const allLocked = entries.every(s => s.status === "locked");
  if (!allLocked) return false;
  process.stderr.write(
    `pre-write-check: all-sections-locked-reject — ${filePath} has all sections locked; no writer can amend without status transition. ` +
    `Override via ORCHESTRA_HOOK_PRE_WRITE_CHECK=off.\n`
  );
  return true;
}

function runReadersScopeWarning(filePath, fm) {
  if (!Array.isArray(fm.readers) || fm.readers.length === 0) return;
  // Soft enforcement; non-blocking. Reporter aggregates these warnings.
  process.stderr.write(
    `pre-write-check: readers-scope-warning — ${filePath} readers=[${fm.readers.join(",")}] (non-blocking).\n`
  );
}

function readFrontmatter(filePath) {
  let text;
  try { text = readFileSync(filePath, "utf8"); } catch { return null; }

  // Standard markdown frontmatter delimited by --- lines.
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (m) return parseYamlSafely(m[1]);

  // <feature-id>-openapi.yaml / -asyncapi.yaml: top-of-file `# orchestra:` block.
  const om = text.match(/^# orchestra:\s*\r?\n((?:#[^\n]*\r?\n)+)/);
  if (om) {
    const stripped = om[1]
      .split(/\r?\n/)
      .map(l => l.replace(/^#\s?/, ""))
      .join("\n");
    return parseYamlSafely(stripped);
  }
  return null;
}

function parseYamlSafely(yaml) {
  try { return parseYaml(yaml); } catch { return null; }
}

function extractContent(toolName, toolInput) {
  if (!toolInput) return "";
  if (toolName === "Write") return toolInput.content || "";
  // For Edit/MultiEdit, scan both old_string and new_string so violations
  // already present in the file are not bypassed by a benign edit. The
  // chain-cite-reject gate must see citations regardless of which side they
  // sit on.
  if (toolName === "Edit") {
    return `${toolInput.old_string || ""}\n${toolInput.new_string || ""}`;
  }
  if (toolName === "MultiEdit") {
    return (toolInput.edits || [])
      .map(e => `${e?.old_string || ""}\n${e?.new_string || ""}`)
      .join("\n");
  }
  return "";
}
