#!/usr/bin/env node
// scripts/validate-backlog.js
// Lints docs/BACKLOG.md per DESIGN-007 §3.4. Hard-fails on errors
// (missing-body, orphan-section, bad-status, bad-ID, schema-version);
// soft-warns on ID gaps. Prints the exact failing regex on bad-ID per
// R-4 mitigation so authors can fix.
//
// Usage:
//   node scripts/validate-backlog.js [--path PATH]
//
// Exit codes:
//   0 = OK (warnings allowed, errors none)
//   1 = file missing
//   2 = parse failure (frontmatter / structure)
//   3 = validation errors

import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const PLUGIN_ROOT = resolve(dirname(__filename), "..");
const DEFAULT_PATH = resolve(PLUGIN_ROOT, "docs/BACKLOG.md");

const STATUS_ENUM = new Set([
  "proposed", "accepted", "in-flight", "shipped", "killed", "deferred",
]);

const ID_REGEX = /^BL-\d{4}-[a-z][a-z0-9-]+$/;
const ID_REGEX_SOURCE = "^BL-\\d{4}-[a-z][a-z0-9-]+$";

const BODY_HEADING_REGEX =
  /^## (BL-\d{4}-[a-z][a-z0-9-]+) — (.+) <a id="(BL-\d{4}-[a-z][a-z0-9-]+)"><\/a>\s*$/;

function main() {
  const args = process.argv.slice(2);
  const pathIdx = args.indexOf("--path");
  const path = pathIdx >= 0 ? resolve(args[pathIdx + 1]) : DEFAULT_PATH;

  if (!existsSync(path)) {
    process.stderr.write(`error: ${path} does not exist. Run \`node scripts/migrate-backlog.js\` first.\n`);
    process.exit(1);
  }

  const md = readFileSync(path, "utf8");
  const errors = [];
  const warnings = [];

  // === Schema-version: frontmatter `revision: <int>` ===
  const fm = parseFrontmatter(md);
  if (fm === null) {
    process.stderr.write(`error: ${path} is missing or has malformed frontmatter.\n`);
    process.exit(2);
  }
  if (!/^\d+$/.test(String(fm.revision || ""))) {
    errors.push(`schema-version: frontmatter \`revision\` must be an integer (got: ${JSON.stringify(fm.revision)}).`);
  }
  if (!/^\d+$/.test(String(fm.schema_version || ""))) {
    errors.push(`schema-version: frontmatter \`schema_version\` must be an integer (got: ${JSON.stringify(fm.schema_version)}).`);
  }

  // === Parse index table + body sections ===
  const indexRows = parseIndexTable(md);
  const bodySections = parseBodySections(md);

  if (indexRows.length === 0) {
    errors.push("structure: no index table rows found. Expected `| ID | Title | Status | Source | Created | Last changed |` table after `## Index`.");
  }

  // === Bad-ID + bad-status checks (per index row) ===
  for (const row of indexRows) {
    if (!ID_REGEX.test(row.id)) {
      errors.push(`bad-ID: index row "${row.id}" does not match ${ID_REGEX_SOURCE}`);
    }
    if (!STATUS_ENUM.has(row.status)) {
      errors.push(`bad-status: index row "${row.id}" has status "${row.status}"; expected one of ${[...STATUS_ENUM].join(" | ")}`);
    }
  }

  // === Bad-ID checks (per body heading) ===
  for (const sect of bodySections) {
    if (!ID_REGEX.test(sect.id)) {
      errors.push(`bad-ID: body section "${sect.id}" does not match ${ID_REGEX_SOURCE}`);
    }
    if (sect.id !== sect.anchor_id) {
      errors.push(`bad-ID: body section "${sect.id}" anchor mismatch (heading id != <a id> id: "${sect.id}" vs "${sect.anchor_id}")`);
    }
  }

  // === Missing-body / orphan-section bidirectional check ===
  const indexIds = new Set(indexRows.map(r => r.id));
  const bodyIds = new Set(bodySections.map(s => s.id));

  for (const id of indexIds) {
    if (!bodyIds.has(id)) {
      errors.push(`missing-body: index row "${id}" has no matching \`## ${id} — ...\` body section`);
    }
  }
  for (const id of bodyIds) {
    if (!indexIds.has(id)) {
      errors.push(`orphan-section: body section "${id}" has no matching index row`);
    }
  }

  // === ID-gap (soft warn) ===
  const numericIds = [...indexIds]
    .map(id => parseInt(id.match(/^BL-(\d{4})/)?.[1] || "0", 10))
    .filter(n => n > 0)
    .sort((a, b) => a - b);
  if (numericIds.length > 0) {
    let prev = numericIds[0];
    for (let i = 1; i < numericIds.length; i++) {
      const cur = numericIds[i];
      if (cur > prev + 1) {
        warnings.push(`id-gap: missing BL-${String(prev + 1).padStart(4, "0")}..BL-${String(cur - 1).padStart(4, "0")} between BL-${String(prev).padStart(4, "0")} and BL-${String(cur).padStart(4, "0")} (closed terminals can leave gaps; this is informational)`);
      }
      prev = cur;
    }
  }

  // === Report ===
  for (const w of warnings) process.stdout.write(`warn: ${w}\n`);
  for (const e of errors) process.stderr.write(`error: ${e}\n`);

  if (errors.length > 0) {
    process.stderr.write(`\nvalidate-backlog: ${errors.length} error(s), ${warnings.length} warning(s) in ${path}\n`);
    process.exit(3);
  }

  process.stdout.write(`validate-backlog: OK (${indexRows.length} entries; ${warnings.length} warning(s)) — ${path}\n`);
  process.exit(0);
}

// === Helpers ===

function parseFrontmatter(md) {
  if (!md.startsWith("---\n")) return null;
  const end = md.indexOf("\n---\n", 4);
  if (end === -1) return null;
  const block = md.slice(4, end);
  const out = {};
  for (const line of block.split("\n")) {
    const m = line.match(/^([a-zA-Z_][\w-]*)\s*:\s*(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
  return out;
}

function parseIndexTable(md) {
  // Find the first table that follows `## Index`.
  const idx = md.indexOf("## Index");
  if (idx === -1) return [];
  const after = md.slice(idx);
  const lines = after.split("\n");
  const rows = [];
  let inTable = false;
  let headerSeen = false;
  let separatorSeen = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) {
      if (inTable) break;
      continue;
    }
    inTable = true;
    if (!headerSeen) { headerSeen = true; continue; }
    if (!separatorSeen) { separatorSeen = true; continue; }

    const inner = trimmed.replace(/^\||\|$/g, "");
    const cells = inner.split("|").map(c => c.trim());
    if (cells.length !== 6) continue;
    rows.push({
      id: cells[0],
      title: cells[1],
      status: cells[2],
      source: cells[3],
      created: cells[4],
      last_changed: cells[5],
    });
  }
  return rows;
}

function parseBodySections(md) {
  const sections = [];
  for (const line of md.split("\n")) {
    const m = line.match(BODY_HEADING_REGEX);
    if (m) {
      sections.push({ id: m[1], title: m[2], anchor_id: m[3] });
    }
  }
  return sections;
}

main();
