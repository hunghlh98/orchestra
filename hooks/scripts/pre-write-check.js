#!/usr/bin/env node
// hooks/scripts/pre-write-check.js
// PreToolUse(Write|Edit|MultiEdit) hook. Gates run in order:
//   secrets         — secret detection; exit 2 on hit
//   Gate-D          — src/** cite denylist; exit 2 on hit
//   Gate-D-inverse  — docs/** codebase-identifier denylist; exit 2 on hit
//   Gate-E          — workspace-scope SAD/c4-container container floor
//   Gate-A          — frontmatter `status: locked` rejects writes
//   Gate-B          — frontmatter `sections:` all-locked rejection
//   Gate-C          — frontmatter `readers:` allowlist warning (non-blocking)

import { existsSync, readFileSync } from "node:fs";
import { parse as parseYaml } from "../lib/yaml-mini.js";
import {
  checkSecrets, checkGateD, checkGateDInverse, checkGateE,
} from "../lib/gate-d.js";

const NAME = "ORCHESTRA_HOOK_PRE_WRITE_CHECK";

if (process.env[NAME] === "off") {
  process.exit(0);
}

main();

async function main() {
  let stdin = "";
  try {
    process.stdin.setEncoding("utf8");
    for await (const chunk of process.stdin) stdin += chunk;
    const input = JSON.parse(stdin);
    const filePath = input.tool_input?.file_path || "";
    const content = extractContent(input.tool_name, input.tool_input);
    if (!content) process.exit(0);

    // Content-only gates run in declared order; first hit exits 2.
    for (const result of [
      checkSecrets(content),
      checkGateD(filePath, content),
      checkGateDInverse(filePath, content),
      checkGateE(filePath, content),
    ]) {
      if (result) {
        process.stderr.write(result.message);
        process.exit(2);
      }
    }

    // Frontmatter gates only run when the target file already exists on disk
    // (Edit/MultiEdit). Write to a new path skips A/B/C — there's no prior
    // frontmatter to consult.
    if (filePath && existsSync(filePath)) {
      const fm = readFrontmatter(filePath);
      if (fm) {
        if (runGateA(filePath, fm)) process.exit(2);
        if (runGateB(filePath, fm)) process.exit(2);
        runGateC(filePath, fm);
      }
    }

    process.exit(0);
  } catch (err) {
    process.stderr.write(`pre-write-check crashed: ${err.message}\n`);
    process.exit(0);
  }
}

function runGateA(filePath, fm) {
  if (fm.status !== "locked") return false;
  process.stderr.write(
    `pre-write-check: gate-A — ${filePath} is locked (status: locked). Set ORCHESTRA_HOOK_PRE_WRITE_CHECK=off to override.\n`
  );
  return true;
}

function runGateB(filePath, fm) {
  const sections = fm.sections;
  if (!sections || typeof sections !== "object" || Array.isArray(sections)) return false;
  const entries = Object.values(sections).filter(s => s && typeof s === "object");
  if (entries.length === 0) return false;
  const allLocked = entries.every(s => s.status === "locked");
  if (!allLocked) return false;
  process.stderr.write(
    `pre-write-check: gate-B — ${filePath} has all sections locked; no writer can amend without status transition. Override via ORCHESTRA_HOOK_PRE_WRITE_CHECK=off.\n`
  );
  return true;
}

function runGateC(filePath, fm) {
  if (!Array.isArray(fm.readers) || fm.readers.length === 0) return;
  // Soft enforcement; non-blocking. Reporter aggregates these warnings.
  process.stderr.write(
    `pre-write-check: gate-C — readers-scope: ${filePath} readers=[${fm.readers.join(",")}] (non-blocking).\n`
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
  if (toolName === "Edit") return toolInput.new_string || "";
  if (toolName === "MultiEdit") {
    return (toolInput.edits || []).map(e => e?.new_string || "").join("\n");
  }
  return "";
}
