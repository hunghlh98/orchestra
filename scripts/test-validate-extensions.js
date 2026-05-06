#!/usr/bin/env node
// scripts/test-validate-extensions.js
// Mutation suite for the v2 pipeline-artifact validators added to validate.js.
// Drives the pure exported functions with synthetic fixtures — no walk needed.
//
// 10 mutation classes per DESIGN-005-doc-output-overhaul §S-VALIDATOR-001 §9.2:
//   M11 missing-anchor             (structural-diff)
//   M12 extra-anchor               (structural-diff)
//   M13 missing-lockfile           (lockfile-presence)
//   M14 wrong-shape lockfile       (lockfile-grammar)
//   M15 modified-puml-stale-hash   (diagram-source-drift)
//   M16 missing-svg                (diagram-rendered-drift)
//   M17 orphan-VERDICT             (orphan-types)
//   M18 TSR-missing-rev-anchor     (fold-correctness)
//   M19 RELEASE-missing-announcement (fold-correctness)
//   M-inverse: clean fixtures pass
// Plus: soft-cap warn + --strict upgrade.

import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  REQUIRED_ANCHORS,
  SOFT_CAPS,
  ORPHAN_PATTERNS,
  FOLD_REQUIREMENTS,
  typeFromFilename,
  lockfilePathFor,
  validateStructuralDiff,
  validateLockfilePresence,
  validateLockfileGrammar,
  validateDiagramHashes,
  validateOrphanTypes,
  validateFoldCorrectness,
  validateSoftCap,
} from "./validate.js";
import { computeHash } from "../hooks/lib/section-hash.js";

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

// ---------- lockfilePathFor smoke ----------
console.log("lockfilePathFor:");
check(lockfilePathFor("a/b/001-PRD.md") === "a/b/001-PRD.lock.yaml", `.md → .lock.yaml`);
check(lockfilePathFor("a/b/001-API.openapi.yaml") === "a/b/001-API.lock.yaml", `.openapi.yaml → .lock.yaml`);
check(lockfilePathFor("a/b/x.txt") === null, `unrelated extension → null`);

// ---------- M11: missing-anchor (structural-diff) ----------
console.log("M11 missing-anchor:");
{
  const body = bodyWith(["S-PROBLEM-001", "S-USERS-001", "S-GOALS-001", "S-METRICS-001", "S-OPEN-001"]);
  // Missing S-NON-GOALS-001
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

// CHARTER mode dispatch
{
  const fullErrs = validateStructuralDiff("001-CHARTER.md", bodyWith(REQUIRED_ANCHORS.CHARTER_full), "CHARTER", "full");
  check(fullErrs.length === 0, `CHARTER full: clean`);
  const briefErrs = validateStructuralDiff("001-CHARTER.md", bodyWith(REQUIRED_ANCHORS.CHARTER_brief), "CHARTER", "brief");
  check(briefErrs.length === 0, `CHARTER brief: clean`);
  const wrongModeErrs = validateStructuralDiff("001-CHARTER.md", bodyWith(REQUIRED_ANCHORS.CHARTER_full), "CHARTER", "brief");
  check(wrongModeErrs.length === 1, `CHARTER brief with full anchors: drift`);
}

// ---------- M13: missing-lockfile ----------
console.log("M13 missing-lockfile:");
withTmp("m13", (tmp) => {
  const artifactPath = join(tmp, "001-PRD.md");
  writeFileSync(artifactPath, "# PRD\n");
  // No lockfile present.
  const errs = validateLockfilePresence(artifactPath);
  check(errs.length === 1, `M13: exactly 1 err`);
  check(/missing-lockfile/.test(errs[0] || ""), `M13: error names missing-lockfile`);
});

// M-inverse: lockfile present
withTmp("m13-inv", (tmp) => {
  const artifactPath = join(tmp, "001-PRD.md");
  writeFileSync(artifactPath, "# PRD\n");
  writeFileSync(artifactPath.replace(/\.md$/, ".lock.yaml"), "artifact_id: 001-PRD\n");
  const errs = validateLockfilePresence(artifactPath);
  check(errs.length === 0, `inverse: lockfile present, no err`);
});

// ---------- M14: wrong-shape lockfile (lockfile-grammar) ----------
console.log("M14 lockfile-grammar:");
{
  const errs1 = validateLockfileGrammar("001-PRD.lock.yaml", `not yaml at all\n  - this: is, broken: too`);
  check(errs1.some(e => /lockfile-grammar/.test(e)), `M14a: parse error caught`);

  const errs2 = validateLockfileGrammar("x.lock.yaml", `artifact_path: foo\nschema_revision: 1\nsections:\n  S-X-001:\n    hash: "TBD"\n`);
  check(errs2.some(e => /missing required key 'artifact_id'/.test(e)), `M14b: missing artifact_id flagged`);

  const errs3 = validateLockfileGrammar("x.lock.yaml", `artifact_id: x\nartifact_path: foo\nschema_revision: 1\nsections:\n  - this is a list not a map\n`);
  check(errs3.some(e => /'sections' must be a map/.test(e)), `M14c: sections-as-list flagged`);

  // Inverse: clean lockfile
  const ok = `artifact_id: 001-PRD\nartifact_path: pipeline/001-foo/requirements/001-PRD.md\nschema_revision: 1\nsections:\n  S-PROBLEM-001:\n    hash: "TBD"\n    confirmed: true\n`;
  check(validateLockfileGrammar("ok.lock.yaml", ok).length === 0, `inverse: clean lockfile passes`);
}

// ---------- M15: modified-puml-stale-hash (diagram-source-drift, --with-diagrams) ----------
console.log("M15 modified-puml-stale-hash:");
withTmp("m15", (tmp) => {
  mkdirSync(join(tmp, "diagrams"));
  const sourcePath = join(tmp, "diagrams/frs-usecase.puml");
  writeFileSync(sourcePath, `@startuml\nactor User\n@enduml\n`);
  // Lockfile records a hash that doesn't match the file's actual content.
  const lockfile = {
    diagrams: [{
      kind: "usecase",
      source: "diagrams/frs-usecase.puml",
      rendered: "diagrams/frs-usecase.svg",
      source_hash: "sha256:0000000000000000000000000000000000000000000000000000000000000000",
      rendered_hash: "sha256:UNRENDERED",
      omit: false,
    }],
  };
  const errs = validateDiagramHashes("001-FRS.md", lockfile, tmp, { withDiagrams: true });
  check(errs.some(e => /diagram-source-drift/.test(e) && /recorded.*!= computed/.test(e)),
    `M15: stale source_hash flagged`);
});

// M-inverse: hash matches
withTmp("m15-inv", (tmp) => {
  mkdirSync(join(tmp, "diagrams"));
  const sourcePath = join(tmp, "diagrams/frs-usecase.puml");
  const content = `@startuml\nactor User\n@enduml\n`;
  writeFileSync(sourcePath, content);
  const lockfile = {
    diagrams: [{
      kind: "usecase",
      source: "diagrams/frs-usecase.puml",
      rendered: "diagrams/frs-usecase.svg",
      source_hash: computeHash(content),
      rendered_hash: "sha256:UNRENDERED",
      omit: false,
    }],
  };
  const errs = validateDiagramHashes("001-FRS.md", lockfile, tmp, { withDiagrams: true });
  // Source hash matches; rendered file missing but UNRENDERED sentinel allows it.
  check(errs.length === 0, `inverse: matching source_hash + UNRENDERED rendered passes (got: ${errs.join(";")})`);
});

// ---------- M16: missing-svg ----------
console.log("M16 missing-svg:");
withTmp("m16", (tmp) => {
  mkdirSync(join(tmp, "diagrams"));
  writeFileSync(join(tmp, "diagrams/frs-usecase.puml"), `@startuml\nactor User\n@enduml\n`);
  // rendered_hash is NOT the UNRENDERED sentinel, but the .svg file is absent.
  const lockfile = {
    diagrams: [{
      kind: "usecase",
      source: "diagrams/frs-usecase.puml",
      rendered: "diagrams/frs-usecase.svg",
      source_hash: "TBD",
      rendered_hash: "TBD",
      omit: false,
    }],
  };
  const errs = validateDiagramHashes("001-FRS.md", lockfile, tmp);
  check(errs.some(e => /diagram-rendered-drift/.test(e) && /rendered file missing/.test(e)),
    `M16: missing svg flagged`);
});

// omit: true skips both checks
withTmp("m16-omit", (tmp) => {
  const lockfile = {
    diagrams: [{
      kind: "state",
      source: "diagrams/tdd-state.puml",
      rendered: "diagrams/tdd-state.svg",
      source_hash: "TBD",
      rendered_hash: "TBD",
      omit: true,
    }],
  };
  const errs = validateDiagramHashes("001-TDD.md", lockfile, tmp);
  check(errs.length === 0, `inverse: omit:true skips diagram checks`);
});

// ---------- M17: orphan-VERDICT (orphan-types) ----------
console.log("M17 orphan-types:");
withTmp("m17", (tmp) => {
  const orchDir = join(tmp, ".orchestra");
  mkdirSync(join(orchDir, "pipeline/001-foo/verify"), { recursive: true });
  // v1 orphan
  writeFileSync(join(orchDir, "pipeline/001-foo/verify/001-VERDICT.md"), "# orphan\n");
  // v1 orphan
  writeFileSync(join(orchDir, "pipeline/001-foo/verify/001-CODE-REVIEW.md"), "# orphan\n");
  // v1 orphan at feature root
  writeFileSync(join(orchDir, "pipeline/001-foo/ANNOUNCEMENT-001.md"), "# orphan\n");
  // legitimate v2 file should NOT trigger
  writeFileSync(join(orchDir, "pipeline/001-foo/verify/001-TSR.md"), "# ok\n");
  const errs = validateOrphanTypes(orchDir);
  check(errs.some(e => /001-VERDICT\.md/.test(e) && /VERDICT folded into TSR/.test(e)), `M17a: VERDICT orphan flagged`);
  check(errs.some(e => /001-CODE-REVIEW\.md/.test(e)), `M17b: CODE-REVIEW orphan flagged`);
  check(errs.some(e => /ANNOUNCEMENT-001\.md/.test(e)), `M17c: ANNOUNCEMENT orphan flagged`);
  check(!errs.some(e => /001-TSR\.md/.test(e)), `M17d: legitimate TSR not flagged`);
});

// M-inverse: clean dir
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
  // TSR with only eval half — missing rev half
  const body = bodyWith(["S-EVAL-VERDICT-001", "S-EVAL-TABLE-001", "S-SHIP-001"]);
  const errs = validateFoldCorrectness("001-TSR.md", body, "TSR");
  check(errs.length === 1, `M18: exactly 1 err`);
  check(/missing S-REV-VERDICT-001/.test(errs[0] || ""), `M18: names missing rev anchor`);
}

// ---------- M19: RELEASE-missing-announcement (fold-correctness) ----------
console.log("M19 RELEASE-fold:");
{
  // RELEASE missing the announcement section
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
  // Body that exceeds PRD soft-cap (120) — generate 130 lines.
  const fatBody = "x\n".repeat(130);
  const warns = validateSoftCap("001-PRD.md", fatBody, "PRD");
  check(warns.length === 1 && /^WARN /.test(warns[0]), `soft-cap default: WARN-prefixed`);
  const strict = validateSoftCap("001-PRD.md", fatBody, "PRD", undefined, { strict: true });
  check(strict.length === 1 && !/^WARN /.test(strict[0]), `soft-cap --strict: error not warning`);

  // Inverse: under-cap body
  const slim = "x\n".repeat(50);
  check(validateSoftCap("001-PRD.md", slim, "PRD").length === 0, `inverse: under-cap body, no warn`);
}

if (failures > 0) {
  console.error(`test-validate-extensions.js: FAIL (${passes} passed, ${failures} failed)`);
  process.exit(1);
}
console.log(`test-validate-extensions.js: OK (${passes} assertions passed)`);
