// hooks/lib/gate-f.js
// changelog-append-only: append-only enforcement on the `## Changelog` body
// block of consumer chain artifacts under <consumer>/docs/**/*.md.
//
// Scope: PreToolUse(Write) only. Edit/MultiEdit fragments don't carry the
// full new-content body and cannot be safely diffed against on-disk rows;
// the gate returns null (N/A) on those tool names.
//
// Yaml-side enforcement (openapi/asyncapi/clientapi `# Changelog:` comment
// block) is deferred — those artifacts churn less than TDD/PRD/FRS, and
// Markdown coverage closes the highest-traffic mutation surface.

import { existsSync, readFileSync } from "node:fs";

const DOCS_MD_RE = /(^|\/)docs\/.+\.md$/;
const ORCHESTRA_FM_KEY_RE = /^(id|type|phase|agent_role|generated_by|artifact_id):/m;

function hasOrchestraFrontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return false;
  return ORCHESTRA_FM_KEY_RE.test(m[1]);
}

export function parseChangelogRows(content) {
  const lines = content.split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/^##\s+Changelog\s*$/.test(lines[i])) { start = i; break; }
  }
  if (start === -1) return null;
  let end = lines.length;
  for (let j = start + 1; j < lines.length; j++) {
    if (/^##\s+/.test(lines[j])) { end = j; break; }
  }
  const rows = [];
  for (let k = start + 1; k < end; k++) {
    if (/^-\s+/.test(lines[k])) rows.push(lines[k]);
  }
  return rows;
}

function parseRow(row) {
  const m = row.replace(/^-\s+/, "").match(/^(\S+)\s*\|\s*(\S+)\s+by\s+([^|]+?)\s*\|\s*(.*)$/);
  if (!m) return null;
  return { ts: m[1], action: m[2], author: m[3].trim(), reason: m[4] };
}

export function checkChangelogAppendOnly(filePath, content, toolName) {
  if (!filePath) return null;
  if (toolName !== "Write") return null;
  if (!DOCS_MD_RE.test(filePath)) return null;

  // Narrow changelog-append-only to orchestra chain artifacts. Plain
  // user-authored docs/ markdown (no orchestra frontmatter) bypasses — the
  // changelog requirement applies to chain artifacts that opt-in via
  // frontmatter.
  const fileExists = existsSync(filePath);
  let onDiskText = null;
  if (fileExists) {
    try { onDiskText = readFileSync(filePath, "utf8"); }
    catch { onDiskText = null; }
  }
  const newHasFm = hasOrchestraFrontmatter(content);
  const oldHasFm = onDiskText ? hasOrchestraFrontmatter(onDiskText) : false;
  if (!newHasFm && !oldHasFm) return null;

  const newRows = parseChangelogRows(content);

  if (!fileExists) {
    if (newRows === null) {
      return {
        gate: "changelog-append-only",
        message:
          `pre-write-check: changelog-append-only — ${filePath} genesis write missing mandatory ` +
          `\`## Changelog\` body section. First row MUST be ` +
          `\`- <ISO-8601 UTC> | created by @<agent> | <intent>\`. ` +
          `Override via ORCHESTRA_HOOK_PRE_WRITE_CHECK=off.\n`,
      };
    }
    if (newRows.length === 0) {
      return {
        gate: "changelog-append-only",
        message:
          `pre-write-check: changelog-append-only — ${filePath} genesis write \`## Changelog\` ` +
          `must contain a \`created\` row. Override via ORCHESTRA_HOOK_PRE_WRITE_CHECK=off.\n`,
      };
    }
    const first = parseRow(newRows[0]);
    if (!first || first.action !== "created") {
      const got = first ? first.action : "<unparseable>";
      return {
        gate: "changelog-append-only",
        message:
          `pre-write-check: changelog-append-only — ${filePath} genesis write first changelog ` +
          `row action='${got}', expected 'created'. ` +
          `Override via ORCHESTRA_HOOK_PRE_WRITE_CHECK=off.\n`,
      };
    }
    return null;
  }

  if (onDiskText === null) return null;
  const onDiskRows = parseChangelogRows(onDiskText);

  if (newRows === null) return null;
  if (onDiskRows === null) return null;

  if (newRows.length < onDiskRows.length) {
    return {
      gate: "changelog-append-only",
      message:
        `pre-write-check: changelog-append-only — ${filePath} \`## Changelog\` is append-only. ` +
        `On-disk has ${onDiskRows.length} rows; pending write has ${newRows.length}. ` +
        `Existing rows must not be removed. ` +
        `Override via ORCHESTRA_HOOK_PRE_WRITE_CHECK=off.\n`,
    };
  }
  for (let i = 0; i < onDiskRows.length; i++) {
    if (newRows[i] !== onDiskRows[i]) {
      return {
        gate: "changelog-append-only",
        message:
          `pre-write-check: changelog-append-only — ${filePath} \`## Changelog\` row ${i + 1} mutated. ` +
          `On-disk: ${JSON.stringify(onDiskRows[i])}. ` +
          `Pending: ${JSON.stringify(newRows[i])}. ` +
          `Existing rows must not be modified or reordered. ` +
          `Override via ORCHESTRA_HOOK_PRE_WRITE_CHECK=off.\n`,
      };
    }
  }
  return null;
}
