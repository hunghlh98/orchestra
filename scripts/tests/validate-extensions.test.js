#!/usr/bin/env node
// scripts/tests/validate-extensions.test.js
// Mutation suite for the v4.0 pipeline-artifact validators in validate.js.
// v3.x's lockfile-paired predicates (validateLockfilePresence,
// validateLockfileGrammar, validateDiagramHashes, lockfilePathFor) are
// gone — review-state lives in artifact frontmatter (status/verdict/
// readers/sections), drift detection is git-diff in CI, and diagram
// source/rendered presence enforces via hooks/scripts/post-write-puml.js.
//
// Surviving mutation classes:
//   M11 missing-anchor             (structural-diff)
//   M12 extra-anchor               (structural-diff)
//   M17 orphan-VERDICT             (orphan-types)
//   M18 TSR-missing-rev-anchor     (fold-correctness)
//   M19 RELEASE-missing-announcement (fold-correctness)
//   M-inverse: clean fixtures pass
// Plus: soft-cap warn + --strict upgrade.

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  REQUIRED_ANCHORS,
  typeFromFilename,
  validateStructuralDiff,
  validateOrphanTypes,
  validateFoldCorrectness,
  validateSoftCap,
} from "../validate.js";

let failures = 0;
let passes = 0;
function check(cond, msg) {
  if (cond) passes++;
  else { failures++; console.error(`  FAIL: ${msg}`); }
}

function withTmp(label, fn) {
  const tmp = mkdtempSync(join(tmpdir(), `orchestra-validate-${label}-`));
  try { fn(tmp); }
  finally { rmSync(tmp, { recursive: true, force: true }); }
}

function bodyWith(anchors) {
  return anchors.map((a, i) => `## §${i + 1} <a id="${a}"></a>\n\nBody ${i + 1}.\n`).join("\n");
}

// ---------- typeFromFilename smoke ----------
console.log("typeFromFilename:");
check(typeFromFilename("path/SAD.md") === "SAD", `SAD.md → SAD`);
check(typeFromFilename("path/001-PRD.md") === "PRD", `001-PRD.md → PRD`);
check(typeFromFilename("path/001-API.openapi.yaml") === "API", `001-API.openapi.yaml → API`);
check(typeFromFilename("path/ADR-0001-use-sqlite.md") === "ADR", `ADR-0001-use-sqlite.md → ADR`);
check(typeFromFilename("path/RELEASE-v0.1.0.md") === "RELEASE", `RELEASE-v0.1.0.md → RELEASE`);
check(typeFromFilename("path/RUNBOOK-v0.1.0.md") === "RUNBOOK", `RUNBOOK-v0.1.0.md → RUNBOOK`);
check(typeFromFilename("path/001-NOPE.md") === null, `unknown type → null`);
check(typeFromFilename("path/random.txt") === null, `unrelated file → null`);

// ---------- M11: missing-anchor (structural-diff) ----------
console.log("M11 missing-anchor:");
{
  const body = bodyWith(["S-PROBLEM-001", "S-USERS-001", "S-GOALS-001", "S-METRICS-001", "S-OPEN-001"]);
  // Missing S-NON-GOALS-001 (PRD's required anchor set)
  const errs = validateStructuralDiff("001-PRD.md", body, "PRD");
  check(errs.length === 1, `M11: exactly 1 err`);
  check(/missing-anchors=\[S-NON-GOALS-001\]/.test(errs[0] || ""), `M11: names missing anchor`);
  check(/extra-anchors=\[\]/.test(errs[0] || ""), `M11: extra-anchors empty`);
}

// ---------- M12: extra-anchor (structural-diff) ----------
console.log("M12 extra-anchor:");
{
  const body = bodyWith([...REQUIRED_ANCHORS.PRD, "S-INVENTED-001"]);
  const errs = validateStructuralDiff("001-PRD.md", body, "PRD");
  check(errs.length === 1, `M12: exactly 1 err`);
  check(/extra-anchors=\[S-INVENTED-001\]/.test(errs[0] || ""), `M12: names extra anchor`);
}

// ---------- M-inverse: structural-diff clean ----------
console.log("M-inverse structural-diff:");
{
  const body = bodyWith(REQUIRED_ANCHORS.PRD);
  const errs = validateStructuralDiff("001-PRD.md", body, "PRD");
  check(errs.length === 0, `inverse: clean PRD passes`);
}

// ---------- M17: orphan-VERDICT (orphan-types) ----------
console.log("M17 orphan-types:");
withTmp("m17", (tmp) => {
  const orchDir = join(tmp, ".orchestra");
  mkdirSync(join(orchDir, "pipeline/001-foo/verify"), { recursive: true });
  writeFileSync(join(orchDir, "pipeline/001-foo/verify/001-VERDICT.md"), "# orphan\n");
  writeFileSync(join(orchDir, "pipeline/001-foo/verify/001-CODE-REVIEW.md"), "# orphan\n");
  writeFileSync(join(orchDir, "pipeline/001-foo/ANNOUNCEMENT-001.md"), "# orphan\n");
  writeFileSync(join(orchDir, "pipeline/001-foo/verify/001-TSR.md"), "# ok\n");
  const errs = validateOrphanTypes(orchDir);
  check(errs.some(e => /001-VERDICT\.md/.test(e) && /VERDICT folded into TSR/.test(e)), `M17a: VERDICT orphan flagged`);
  check(errs.some(e => /001-CODE-REVIEW\.md/.test(e)), `M17b: CODE-REVIEW orphan flagged`);
  check(errs.some(e => /ANNOUNCEMENT-001\.md/.test(e)), `M17c: ANNOUNCEMENT orphan flagged`);
  check(!errs.some(e => /001-TSR\.md/.test(e)), `M17d: legitimate TSR not flagged`);
});

withTmp("m17-inv", (tmp) => {
  const orchDir = join(tmp, ".orchestra");
  mkdirSync(join(orchDir, "pipeline/001-foo/verify"), { recursive: true });
  writeFileSync(join(orchDir, "pipeline/001-foo/verify/001-TSR.md"), "# ok\n");
  const errs = validateOrphanTypes(orchDir);
  check(errs.length === 0, `inverse: clean dir, no orphans`);
});

// ---------- M18: TSR-missing-rev-anchor (fold-correctness) ----------
console.log("M18 TSR-fold:");
{
  const body = bodyWith(["S-EVAL-VERDICT-001", "S-EVAL-TABLE-001", "S-SHIP-001"]);
  const errs = validateFoldCorrectness("001-TSR.md", body, "TSR");
  check(errs.length === 1, `M18: exactly 1 err`);
  check(/missing S-REV-VERDICT-001/.test(errs[0] || ""), `M18: names missing rev anchor`);
}

// ---------- M19: RELEASE-missing-announcement (fold-correctness) ----------
console.log("M19 RELEASE-fold:");
{
  const body = bodyWith(["S-WHATSNEW-001", "S-ENDPOINTS-001"]);
  const errs = validateFoldCorrectness("RELEASE-v0.1.0.md", body, "RELEASE");
  check(errs.length === 1, `M19: exactly 1 err`);
  check(/missing S-ANNOUNCEMENT-001/.test(errs[0] || ""), `M19: names missing announcement anchor`);
}

// M-inverse fold-correctness
{
  const tsrBody = bodyWith(REQUIRED_ANCHORS.TSR);
  check(validateFoldCorrectness("001-TSR.md", tsrBody, "TSR").length === 0, `inverse: TSR with both halves passes`);
  const relBody = bodyWith(REQUIRED_ANCHORS.RELEASE);
  check(validateFoldCorrectness("RELEASE-v0.1.0.md", relBody, "RELEASE").length === 0, `inverse: RELEASE with announcement passes`);
}

// ---------- soft-cap warn + --strict upgrade ----------
console.log("soft-cap:");
{
  const fatBody = "x\n".repeat(130);
  const warns = validateSoftCap("001-PRD.md", fatBody, "PRD");
  check(warns.length === 1 && /^WARN /.test(warns[0]), `soft-cap default: WARN-prefixed`);
  const strict = validateSoftCap("001-PRD.md", fatBody, "PRD", undefined, { strict: true });
  check(strict.length === 1 && !/^WARN /.test(strict[0]), `soft-cap --strict: error not warning`);

  const slim = "x\n".repeat(50);
  check(validateSoftCap("001-PRD.md", slim, "PRD").length === 0, `inverse: under-cap body, no warn`);
}

if (failures > 0) {
  console.error(`test-validate-extensions.js: FAIL (${passes} passed, ${failures} failed)`);
  process.exit(1);
}
console.log(`test-validate-extensions.js: OK (${passes} assertions passed)`);
