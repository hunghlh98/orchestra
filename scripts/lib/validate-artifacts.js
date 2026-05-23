// scripts/lib/validate-artifacts.js
// Pipeline-artifact validators. Pure functions called from
// scripts/validate-drift.js (consumer-side walker) and the inline mutation
// suite at scripts/tests/validate-mutations.test.js / scripts/tests/validate-extensions.test.js.
//
// Single source-of-truth for required anchors / soft caps / orphan patterns —
// scripts/scaffold-artifact.js mirrors REQUIRED_ANCHORS at scaffold time;
// this file enforces them at validate time.

import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";

export const REQUIRED_ANCHORS = {
  PRD: ["S-PROBLEM-001", "S-USERS-001", "S-GOALS-001", "S-NON-GOALS-001", "S-METRICS-001", "S-OPEN-001"],
  FRS: ["S-FRS-001", "S-ACCEPTANCE-001", "S-ERRORS-001", "S-USECASE-001"],
  SAD: ["S-VISION-001", "S-CONTEXT-001", "S-CONTAINERS-001"],
  TDD: ["S-COMPONENTS-001", "S-SEQUENCE-001", "S-DATA-MODEL-001", "S-STATE-001", "S-ERROR-HANDLING-001", "S-CONFIG-001", "S-RISKS-001"],
  TASKS: ["S-DAG-001", "S-TASKS-001"],
  TEST: ["S-COVERAGE-001"],
  TSR: ["S-TEST-001", "S-EVAL-001", "S-REVIEW-001"],
  RELEASE: ["S-WHATSNEW-001", "S-ENDPOINTS-001", "S-CONFIG-001", "S-BREAKING-001", "S-GATES-001", "S-KNOWN-001", "S-ANNOUNCEMENT-001"],
  RUNBOOK: ["S-OVERVIEW-001", "S-LIFECYCLE-001", "S-DEPLOY-001", "S-ROLLBACK-001", "S-HEALTH-001", "S-FAILURE-001", "S-LOGS-001", "S-ENVVARS-001"],
  ADR: ["S-STATUS-001", "S-CONTEXT-001", "S-DECISION-001", "S-CONSEQUENCES-001", "S-ALTERNATIVES-001"],
  INVENTORY: ["S-SCAN-001", "S-CLASSIFICATION-001", "S-DECISIONS-001", "S-REGEN-PLAN-001", "S-WARNINGS-001"],
  "RUN-PLAN": ["S-FEATURES-001", "S-AGENT-ASSIGNMENTS-001", "S-RISKS-001"],
  "BR-AC": ["S-BR-001", "S-AC-001", "S-INVARIANTS-001"],
  "BUSINESS-INVARIANTS": ["S-INVARIANTS-001"],
  "EXPLORER-REPORT": ["S-FEATURES-DISCOVERED-001", "S-ADR-CANDIDATES-001"],
};

export const SOFT_CAPS = {
  PRD: 120, FRS: 100, SAD: 200, TDD: 250,
  TASKS: 60, TEST: 200, TSR: 150, RELEASE: 120, RUNBOOK: 180, ADR: 100,
  INVENTORY: 250,
  "RUN-PLAN": 250,
  "BR-AC": 200,
  "BUSINESS-INVARIANTS": 150,
  "EXPLORER-REPORT": 150,
  "AGENT-TASKS": 500,
};

// Filename patterns v2 .orchestra/ MUST NOT contain.
export const ORPHAN_PATTERNS = [
  { pattern: /\d+-VERDICT\.md$/, reason: "VERDICT folded into TSR per v2.0" },
  { pattern: /\d+-CODE-REVIEW\.md$/, reason: "CODE-REVIEW folded into TSR per v2.0" },
  { pattern: /^ANNOUNCEMENT-/, reason: "ANNOUNCEMENT folded into RELEASE §S-ANNOUNCEMENT-001 per v2.0" },
  { pattern: /\d+-IMPL-NOTES\.md$/, reason: "IMPL-NOTES dropped per v2.0 (never routed)" },
  { pattern: /\d+-IMPL-(BE|FE)\.md$/, reason: "IMPL-BE/FE dropped per v2.0 (never routed)" },
  { pattern: /\d+-CODE-DESIGN-(BE|FE)\.md$/, reason: "CODE-DESIGN-BE/FE dropped per v2.0 (never routed)" },
];

// Fold-correctness: types must carry specific anchor combos.
export const FOLD_REQUIREMENTS = {
  TSR: ["S-TEST-001", "S-EVAL-001", "S-REVIEW-001"],
  RELEASE: ["S-ANNOUNCEMENT-001"],
};

const ANCHOR_RE_GLOBAL = /<a id="(S-[A-Z]+(?:-[A-Z]+)*-\d{3})"><\/a>/g;
const ROW_ID_RE = /^T-\d+$/;

function extractAnchors(body) {
  const ids = [];
  let m;
  while ((m = ANCHOR_RE_GLOBAL.exec(body)) !== null) ids.push(m[1]);
  return ids;
}

export function typeFromFilename(filePath) {
  const normalized = filePath.replace(/\\/g, "/");
  if (/\.orchestra\/plans\/[^/]+\/discovery\/[^/]+\.md$/.test(normalized)) return "EXPLORER-REPORT";
  if (/\.orchestra\/plans\/[^/]+\/run-plan\.md$/.test(normalized)) return "RUN-PLAN";
  if (/\.orchestra\/plans\/[^/]+\/agent-tasks\.md$/.test(normalized)) return "AGENT-TASKS";
  const base = basename(filePath);
  if (base === "SAD.md") return "SAD";
  if (base === "business-invariants.md") return "BUSINESS-INVARIANTS";
  if (/-BR-AC\.md$/.test(base)) return "BR-AC";
  if (/^ADR-\d{4}/.test(base)) return "ADR";
  if (/^RELEASE-v/.test(base)) return "RELEASE";
  if (/^RUNBOOK-v/.test(base)) return "RUNBOOK";
  let m;
  if ((m = base.match(/^\d+-([A-Z]+)\.md$/))) {
    return Object.hasOwn(REQUIRED_ANCHORS, m[1]) ? m[1] : null;
  }
  if (/^\d+-API\.openapi\.yaml$/.test(base)) return "API";
  return null;
}

export function validateStructuralDiff(relPath, body, type, _mode) {
  const errs = [];
  const expected = REQUIRED_ANCHORS[type];
  if (!expected) return errs;
  const found = extractAnchors(body);
  const expectedSet = new Set(expected);
  const foundSet = new Set(found);
  const missing = expected.filter(a => !foundSet.has(a));
  const extra = found.filter(a => !expectedSet.has(a));
  if (missing.length > 0 || extra.length > 0) {
    errs.push(`${relPath}: structural-drift — missing-anchors=[${missing.join(",")}] extra-anchors=[${extra.join(",")}]`);
  }
  return errs;
}

export function validateOrphanTypes(orchestraDir) {
  const errs = [];
  if (!existsSync(orchestraDir)) return errs;
  function walk(dir) {
    let entries;
    try { entries = readdirSync(dir); } catch { return; }
    for (const entry of entries) {
      const full = join(dir, entry);
      let st;
      try { st = statSync(full); } catch { continue; }
      if (st.isDirectory()) walk(full);
      else if (st.isFile()) {
        for (const { pattern, reason } of ORPHAN_PATTERNS) {
          if (pattern.test(entry)) {
            const rel = full.startsWith(orchestraDir) ? full.slice(orchestraDir.length + 1) : full;
            errs.push(`${rel}: orphan-type — ${reason}`);
          }
        }
      }
    }
  }
  walk(orchestraDir);
  return errs;
}

export function validateFoldCorrectness(relPath, body, type) {
  const errs = [];
  const required = FOLD_REQUIREMENTS[type];
  if (!required) return errs;
  const found = new Set(extractAnchors(body));
  for (const anchor of required) {
    if (!found.has(anchor)) {
      errs.push(`${relPath}: fold-violation — missing ${anchor} (${type} fold required this anchor per v2.0)`);
    }
  }
  return errs;
}

// === TSR S-EVAL-001 row-id coverage ===
// Every S-EVAL-001 row id must reference an S-TEST-001 row id. An unknown id
// in S-EVAL-001 is structurally identical to a phantom anchor.
function extractSectionBody(body, anchorId) {
  const startRe = new RegExp(`<a id="${anchorId}"></a>`);
  const startMatch = startRe.exec(body);
  if (!startMatch) return null;
  const after = body.slice(startMatch.index + startMatch[0].length);
  const nextAnchor = /<a id="S-[A-Z]+(?:-[A-Z]+)*-\d{3}"><\/a>/.exec(after);
  return nextAnchor ? after.slice(0, nextAnchor.index) : after;
}

function extractTableRowIds(sectionBody) {
  if (!sectionBody) return new Set();
  const ids = new Set();
  for (const rawLine of sectionBody.split("\n")) {
    const line = rawLine.trim();
    if (!line.startsWith("|")) continue;
    const cells = line.split("|").map(c => c.trim()).filter((_, i, arr) => i > 0 && i < arr.length - 1);
    if (cells.length === 0) continue;
    if (cells.every(c => /^-+:?$/.test(c) || /^:?-+:?$/.test(c))) continue;
    const first = cells[0];
    if (ROW_ID_RE.test(first)) ids.add(first);
  }
  return ids;
}

export function validateTsrEvalCoverage(relPath, body) {
  const errs = [];
  const testBody = extractSectionBody(body, "S-TEST-001");
  const evalBody = extractSectionBody(body, "S-EVAL-001");
  if (testBody === null || evalBody === null) return errs;
  const testIds = extractTableRowIds(testBody);
  const evalIds = extractTableRowIds(evalBody);
  if (evalIds.size === 0) return errs;
  const orphans = [...evalIds].filter(id => !testIds.has(id)).sort();
  if (orphans.length > 0) {
    errs.push(`${relPath}: S-EVAL-001 row-id coverage — S-EVAL-001 ids [${orphans.join(",")}] absent from S-TEST-001 (every S-EVAL-001 row must reference an existing S-TEST-001 row)`);
  }
  return errs;
}

// Soft-cap: per-type body line cap; warning by default, error in --strict.
export function validateSoftCap(relPath, body, type, _mode, opts = {}) {
  const errs = [];
  const cap = SOFT_CAPS[type];
  if (!cap) return errs;
  const lines = body.split("\n").length;
  if (lines > cap) {
    const msg = `${relPath}: soft-cap — ${lines} lines > ${cap} for type ${type}`;
    errs.push(opts.strict ? msg : `WARN ${msg}`);
  }
  return errs;
}
