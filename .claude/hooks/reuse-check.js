#!/usr/bin/env node
// .claude/hooks/reuse-check.js
// PreToolUse(Write|Edit|MultiEdit) reuse-check hook. Dev-only — lives under
// .claude/hooks/ so it NEVER ships with the orchestra plugin. Maintainer-loop
// quality gate, not a consumer-surface behavior.
//
// Behavior: when Claude is about to Write a NEW file, scope the check to that
// file's parent directory, invoke @anthropic-ai/claude-agent-sdk's `query()`
// to spawn an isolated reviewer agent that looks for an existing sibling
// already doing the job. On MATCH, emit permissionDecision:"deny" with the
// candidate path in the reason text; the parent agent reads the denial and
// pivots to Edit the matched file instead of creating the new one. No user
// prompt — denial is the pivot signal. Escape hatch: CLAUDE_HOOK_REUSE_CHECK=off.
//
// Reviewer isolation (bare-equivalent against recursion):
//   settingSources defaults to [] (no parent .claude/settings*.json loaded)
//   mcpServers/hooks/plugins default to empty
//   disallowedTools blocks Write/Edit/MultiEdit/Bash/WebFetch/WebSearch
//
// Hard-cap reviewer wall-clock at 30s via AbortController. SHA-256 cache
// (1h TTL) at .claude/.cache/reuse-check/. Auth: ANTHROPIC_API_KEY (or
// CLAUDE_CODE_USE_BEDROCK / _VERTEX / _FOUNDRY). Opt-out via
// CLAUDE_HOOK_REUSE_CHECK=off.
//
// Crash semantics mirror hooks/scripts/pre-write-check.js: any exception →
// exit 0 + stderr log. Reuse-check is advisory; a hook crash must never
// brick the session.

import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, relative, resolve, sep } from "node:path";
import { createRequire } from "node:module";
import { readBoundedStdin } from "../../hooks/lib/stdin-bounded.js";

// SDK lives under .claude/hooks/node_modules. createRequire pins resolution to
// this hook's directory so the import does not depend on the parent project's
// node_modules layout.
const localRequire = createRequire(import.meta.url);
const { query } = localRequire("@anthropic-ai/claude-agent-sdk");

const NAME = "CLAUDE_HOOK_REUSE_CHECK";
const CHILD_TIMEOUT_MS = 30_000;
const CACHE_TTL_MS = 60 * 60 * 1000;
const MIN_CONTENT_BYTES = 200;
const PROMPT_SNIPPET_BYTES = 4000;
const DENY_PATH_RX = /(^|[\\/])(node_modules|dist|build|target|\.git|\.claude|docs|coverage|\.next|\.venv)([\\/]|$)|\.(md|json|yaml|yml|lock|txt|gitignore|gitkeep|env)$|^CHANGELOG\.md$|^README\.md$/i;

if (process.env[NAME] === "off") process.exit(0);

main().catch(err => {
  process.stderr.write(`reuse-check: uncaught (non-blocking) ${err.message}\n`);
  process.exit(0);
});

async function main() {
  const stdin = await readBoundedStdin();
  if (stdin.overflow || !stdin.text) process.exit(0);

  let input;
  try { input = JSON.parse(stdin.text); } catch { process.exit(0); }

  const toolName = input.tool_name;
  const filePath = input.tool_input?.file_path;
  const cwd = input.cwd || process.cwd();
  if (!filePath || !toolName) process.exit(0);

  // Only authoring NEW files triggers the reuse check. Edit/MultiEdit always
  // act on existing files; Write to an existing path is an explicit overwrite.
  // Editing IS the desired outcome of this hook, so short-circuit anything
  // that touches an existing path.
  if (existsSync(filePath)) process.exit(0);
  if (toolName !== "Write") process.exit(0);

  const absFile = resolve(cwd, filePath);
  if (absFile !== cwd && !absFile.startsWith(cwd + sep)) process.exit(0);

  const relFile = relative(cwd, absFile);
  if (DENY_PATH_RX.test(relFile)) process.exit(0);

  const content = input.tool_input?.content || "";
  if (content.length < MIN_CONTENT_BYTES) process.exit(0);

  const scopeDir = computeScopeDir(absFile, cwd);
  if (!existsSync(scopeDir)) process.exit(0);

  const cachePath = cachePathFor(cwd, scopeDir, content);
  const cached = readCache(cachePath);
  if (cached) {
    if (cached.decision) process.stdout.write(JSON.stringify(cached.decision));
    process.exit(0);
  }

  let reviewerOutput;
  try {
    reviewerOutput = await runReviewer({ relFile, scopeDir, content, cwd });
  } catch (err) {
    process.stderr.write(`reuse-check: reviewer failed (non-blocking) ${err.message}\n`);
    process.exit(0);
  }

  const match = parseMatch(reviewerOutput);
  if (!match) {
    writeCache(cachePath, { decision: null });
    process.exit(0);
  }

  const decision = {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason:
        `Reuse detected: ${match.path} already implements this. ` +
        `Do NOT create ${relFile}. Edit ${match.path} instead.`,
      additionalContext: match.rationale,
    },
  };
  writeCache(cachePath, { decision });
  process.stdout.write(JSON.stringify(decision));
  process.exit(0);
}

function computeScopeDir(absFile, cwd) {
  let d = dirname(absFile);
  if (d === cwd || d === "") d = dirname(d) || cwd;
  return d;
}

function cachePathFor(cwd, scopeDir, content) {
  const key = createHash("sha256").update(scopeDir + "\n" + content).digest("hex");
  return join(cwd, ".claude", ".cache", "reuse-check", `${key}.json`);
}

function readCache(p) {
  try {
    const st = statSync(p);
    if (Date.now() - st.mtimeMs > CACHE_TTL_MS) return null;
    return JSON.parse(readFileSync(p, "utf8"));
  } catch { return null; }
}

function writeCache(p, payload) {
  try {
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(payload));
  } catch (err) {
    process.stderr.write(`reuse-check: cache write failed (non-blocking) ${err.message}\n`);
  }
}

async function runReviewer({ relFile, scopeDir, content, cwd }) {
  const relScope = relative(cwd, scopeDir) || ".";
  const prompt = buildPrompt({ relFile, scopeDir: relScope, content });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CHILD_TIMEOUT_MS);
  try {
    // Bare-equivalent isolation against parent-session recursion:
    //   settingSources: []  → no .claude/settings*.json read (defaults to [])
    //   mcpServers: {}      → no MCP (defaults to {})
    //   hooks: {}           → no hook callbacks (defaults to {})
    //   plugins: []         → no plugins loaded (defaults to [])
    //   disallowedTools     → defense-in-depth against the reviewer mutating state
    const q = query({
      prompt,
      options: {
        cwd,
        model: "claude-sonnet-4-6",
        allowedTools: ["Read", "Glob", "Grep"],
        disallowedTools: ["Write", "Edit", "MultiEdit", "Bash", "WebFetch", "WebSearch"],
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        maxTurns: 4,
        maxBudgetUsd: 0.5,
        systemPrompt:
          "You are reviewing a proposed change to a codebase directory. You " +
          "analyze whether a new file could be accomplished by reusing or " +
          "slightly modifying an existing file in the same directory. Within " +
          "reason, prevent duplicate files from being added to the source. " +
          "Strict read-only — never author code, never suggest more than one " +
          "match. Output Line 1 exactly 'MATCH: <relative-path>' or 'NO_MATCH'; " +
          "Lines 2-5: one-paragraph rationale.",
        abortController: ctrl,
      },
    });
    for await (const msg of q) {
      if (msg.type === "result") {
        if (msg.subtype && msg.subtype !== "success") {
          throw new Error(`reviewer subtype ${msg.subtype}`);
        }
        return msg.result || "";
      }
    }
    return "";
  } finally {
    clearTimeout(timer);
  }
}

function buildPrompt({ relFile, scopeDir, content }) {
  const snippet = content.length > PROMPT_SNIPPET_BYTES
    ? content.slice(0, PROMPT_SNIPPET_BYTES) + "\n...[truncated]"
    : content;
  return [
    `You are reviewing a proposed change to the ${scopeDir}/ directory. Your task is to analyze if the new file could be accomplished by reusing or slightly modifying an existing file in that directory. Within reason, we want to prevent duplicate files from being added into the source, so you are checking whether this change duplicates any existing file.`,
    ``,
    `File: ${relFile}`,
    `New content${content.length > PROMPT_SNIPPET_BYTES ? ` (truncated to ${PROMPT_SNIPPET_BYTES} bytes)` : ""}:`,
    `<new_content>`,
    snippet,
    `</new_content>`,
    ``,
    `Research and analyze the existing files in the ${scopeDir}/ directory. Scan ONLY that directory — use Glob to list files, Read to inspect them. Do not edit anything.`,
    `1. Identify the behavior the new file ${relFile} adds.`,
    `2. Determine if it could be accomplished by:`,
    `   - Using an existing file as-is`,
    `   - Slightly modifying an existing file, perhaps by adding additional arguments or expanding its scope`,
    ``,
    `If yes, report the SINGLE closest existing file to reuse. If no, the change is appropriate.`,
    ``,
    `Output exactly:`,
    `Line 1: MATCH: <relative-path>  OR  NO_MATCH`,
    `Lines 2-5: rationale.`,
  ].join("\n");
}

function parseMatch(resultText) {
  if (!resultText) return null;
  const lines = resultText.split("\n").map(l => l.trim()).filter(Boolean);
  const first = lines[0] || "";
  if (/^NO_MATCH\b/i.test(first)) return null;
  const m = first.match(/^MATCH:\s*(.+)$/i);
  if (!m) return null;
  const path = m[1].trim();
  if (!path) return null;
  const rationale = lines.slice(1, 5).join(" ");
  return { path, rationale };
}
