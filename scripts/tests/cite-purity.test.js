#!/usr/bin/env node
// scripts/tests/cite-purity.test.js
// CLAUDE.md audience-rule check: consumer-surface artifacts (agents/, commands/,
// skills/) MUST NOT cite developer-only documents that aren't shipped to the
// consumer's install. Phantom anchors ("per PRD §8.11", "(DESIGN-002 §10)") read
// as authoritative pointers, but the source file isn't in the consumer's tree —
// the LLM may hallucinate to fill the gap or downgrade confidence on its own
// guidance because the cite can't resolve.
//
// This is the audit-time equivalent of v4.0-brief §7.28's runtime check on
// generated <consumer>/src/** code. Both rules share the same boundary:
// citations belong with their audience, not in artifacts that cross the
// audience line. §7.28 is enforced at write time by pre-write-check.js;
// CLAUDE.md plugin-surface purity is enforced at PR time by this test.
//
// Mutation surface:
//   M1   per PRD §X.Y                  → forbidden cite to plugin PRD
//   M2   (PRD §N)                       → forbidden cite to plugin PRD
//   M3   per DESIGN-NNN §X              → forbidden cite to deleted dev doc
//   M4   (WORKFLOW-NNN §X)              → forbidden cite to deleted dev doc
//   M5   per S-AUTONOMY-001             → forbidden internal anchor
//   M6   v4.0-brief.md / v4.0-design.md → forbidden dev-draft pointer
//   M7   v3.0-canonical-agent-template  → forbidden deleted-doc pointer
//   M-inverse: clean consumer surface produces zero hits

import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const SCANNED_DIRS = ["agents", "commands", "skills"];

// Regex set — each entry: [name, regex, why]. All are case-sensitive on purpose
// (PRD, DESIGN, WORKFLOW are SCREAMING_CAPS in v3.x dev-doc filenames).
const PATTERNS = [
  ["plugin-PRD-cite",
    /(?:^|[^A-Z-])(?:per |see )?\(?PRD §\d/,
    "cites the plugin's own PRD §N — not in consumer install"],
  ["plugin-DESIGN-cite",
    /\b(?:per |see |\()?DESIGN-\d+ §\d/,
    "cites a deleted DESIGN-NNN dev doc"],
  ["plugin-WORKFLOW-cite",
    /\b(?:per |see |\()?WORKFLOW-\d+ §\d/,
    "cites a deleted WORKFLOW-NNN dev doc"],
  ["S-AUTONOMY-anchor",
    /\bS-AUTONOMY-\d+/,
    "cites an internal anchor that lives only in the plugin's PRD"],
  ["v4.0-dev-draft-pointer",
    /\bv4\.0-(?:brief|design)(?:\.md|\s*§)/,
    "points reader at v4.0-brief.md / v4.0-design.md (dev-only)"],
  ["v3.0-deleted-doc-pointer",
    /\bv3\.0-(?:canonical-(?:agent|skill)-template|prompt-tightening-brief)/,
    "points reader at a deleted v3.0 dev doc"],
];

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) yield* walk(p);
    else if (s.isFile() && /\.(md|json|yml|yaml)$/.test(entry)) yield p;
  }
}

function scanFile(file) {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  const hits = [];
  lines.forEach((line, i) => {
    for (const [name, re, why] of PATTERNS) {
      if (re.test(line)) hits.push({ file, line: i + 1, pattern: name, snippet: line.trim(), why });
    }
  });
  return hits;
}

let passes = 0;
let failures = 0;
function check(cond, msg) {
  if (cond) passes++;
  else { failures++; console.error(`  FAIL: ${msg}`); }
}

console.log("Mutation tests (regex must catch known-bad input):");

const KNOWN_BAD = [
  ["M1 per-PRD-cite", "Confidence-tier the dialogue per PRD §8.11: HIGH = no questions.", "plugin-PRD-cite"],
  ["M2 paren-PRD-cite", "## Routing-taxonomy guard (PRD §9.5)", "plugin-PRD-cite"],
  ["M3 DESIGN-cite", "Spawn agents per DESIGN-002 §10 routing taxonomy.", "plugin-DESIGN-cite"],
  ["M4 WORKFLOW-cite", "Per WORKFLOW-001 §3 the team kicks off here.", "plugin-WORKFLOW-cite"],
  ["M5 S-AUTONOMY", "Confirm via S-AUTONOMY-001 before spawning.", "S-AUTONOMY-anchor"],
  ["M6 v4.0-brief", "See v4.0-brief.md §7.28 for src/ purity.", "v4.0-dev-draft-pointer"],
  ["M6b v4.0-design", "Per v4.0-design §10, Stream 10 deletes drafts.", "v4.0-dev-draft-pointer"],
  ["M7 deleted-doc", "Use v3.0-canonical-agent-template as scaffold.", "v3.0-deleted-doc-pointer"],
];

for (const [label, line, expectedPattern] of KNOWN_BAD) {
  const tripped = PATTERNS.find(([, re]) => re.test(line));
  check(tripped !== undefined, `${label}: at least one regex trips`);
  check(tripped?.[0] === expectedPattern, `${label}: trips '${expectedPattern}' (got '${tripped?.[0]}')`);
}

const KNOWN_GOOD = [
  ["G1 artifact-type-noun", "Authors write PRD-NNN.md and FRS-NNN.md under <project>/docs/."],
  ["G2 same-file-section", "See the routing taxonomy below for tier mapping."],
  ["G3 schema-pointer", "See schemas/pipeline-artifact.schema.md for the frontmatter spec."],
  ["G4 cross-consumer-ref", "Spawned by @lead per the chain table in commands/orchestra.md."],
  ["G5 PRD-NNN-with-dash", "Reverse-doc creates PRD-001.md describing existing system."],
];

for (const [label, line] of KNOWN_GOOD) {
  const tripped = PATTERNS.find(([, re]) => re.test(line));
  check(tripped === undefined, `${label}: no regex trips on legitimate prose (tripped '${tripped?.[0]}')`);
}

console.log("\nConsumer-surface scan (agents/ commands/ skills/):");

let totalHits = 0;
let scannedFiles = 0;
const allHits = [];
for (const sub of SCANNED_DIRS) {
  const dir = resolve(root, sub);
  for (const file of walk(dir)) {
    scannedFiles++;
    const hits = scanFile(file);
    if (hits.length) {
      totalHits += hits.length;
      allHits.push(...hits);
    }
  }
}

if (allHits.length) {
  console.error("\nViolations:");
  for (const h of allHits) {
    const rel = h.file.slice(root.length + 1);
    console.error(`  ${rel}:${h.line}  [${h.pattern}]  ${h.snippet}`);
    console.error(`    why: ${h.why}`);
  }
}

check(totalHits === 0, `consumer surface has zero forbidden cites (got ${totalHits} across ${allHits.length ? new Set(allHits.map(h => h.file)).size : 0} files)`);

console.log(`\nScanned ${scannedFiles} files across ${SCANNED_DIRS.join(", ")}.`);

if (failures) {
  console.error(`\ntest-cite-purity.js: FAIL (${failures} of ${passes + failures} assertions)`);
  process.exit(1);
}
console.log(`test-cite-purity.js: OK (${passes} assertions passed)`);
