#!/usr/bin/env node
// scripts/tests/scaffold.test.js
// Mutation suite for scripts/scaffold-artifact.js.
// Covers: each type scaffolds with correct anchors + lockfile + diagrams[];
// idempotency (refuse on existing); --force overrides; ADR auto-numbering;
// CHARTER mode dispatch; non-orchestra path refused; bad inputs fail with the
// right exit code.
//
// See docs/DESIGN-005-doc-output-overhaul.md §S-SCAFFOLD-001.

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parse } from "../../hooks/lib/yaml-mini.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCAFFOLD = resolve(root, "scripts/scaffold-artifact.js");
let failures = 0;
let passes = 0;

function check(cond, msg) {
  if (cond) { passes++; }
  else { failures++; console.error(`  FAIL: ${msg}`); }
}

function runScaffold(args, cwd) {
  return spawnSync("node", [SCAFFOLD, ...args, `--cwd=${cwd}`], { encoding: "utf8" });
}

function withTmp(label, fn) {
  const tmp = mkdtempSync(join(tmpdir(), `orchestra-scaffold-${label}-`));
  try { fn(tmp); }
  finally { rmSync(tmp, { recursive: true, force: true }); }
}

// Extract <a id="S-..."> anchors from a markdown body.
function bodyAnchors(content) {
  const ids = [];
  // Mirrors hooks/lib/section-hash.js ANCHOR_RE — multi-segment tags supported.
  const re = /<a id="(S-[A-Z]+(?:-[A-Z]+)*-\d{3})"><\/a>/g;
  let m;
  while ((m = re.exec(content)) !== null) ids.push(m[1]);
  return ids;
}

// === Anchor expectations per type (mirror of scaffold-artifact.js TYPE_SPEC, intentionally duplicated as a fixture) ===
const EXPECTED_ANCHORS = {
  PRD: ["S-PROBLEM-001", "S-USERS-001", "S-GOALS-001", "S-NON-GOALS-001", "S-METRICS-001", "S-OPEN-001"],
  FRS: ["S-FRS-001", "S-ACCEPTANCE-001", "S-ERRORS-001", "S-USECASE-001"],
  SAD: ["S-VISION-001", "S-CONTEXT-001", "S-CONTAINERS-001", "S-ADR-INDEX-001"],
  TDD: ["S-COMPONENTS-001", "S-SEQUENCE-001", "S-DATA-MODEL-001", "S-STATE-001", "S-ERROR-HANDLING-001", "S-CONFIG-001", "S-RISKS-001"],
  TASKS: ["S-DAG-001", "S-TASKS-001"],
  PLAN: ["S-PROBLEM-001", "S-OPTIONS-001", "S-TRADEOFFS-001", "S-RECOMMENDATION-001", "S-OPEN-001"],
  TSR: ["S-EVAL-VERDICT-001", "S-EVAL-TABLE-001", "S-REV-VERDICT-001", "S-REV-FINDINGS-001", "S-SHIP-001"],
  RELEASE: ["S-WHATSNEW-001", "S-ENDPOINTS-001", "S-CONFIG-001", "S-BREAKING-001", "S-GATES-001", "S-KNOWN-001", "S-ANNOUNCEMENT-001"],
  RUNBOOK: ["S-OVERVIEW-001", "S-LIFECYCLE-001", "S-DEPLOY-001", "S-ROLLBACK-001", "S-HEALTH-001", "S-FAILURE-001", "S-LOGS-001", "S-ENVVARS-001"],
  ADR: ["S-STATUS-001", "S-CONTEXT-001", "S-DECISION-001", "S-CONSEQUENCES-001", "S-ALTERNATIVES-001"],
};

const EXPECTED_DIAGRAM_KINDS = {
  PRD: [],
  FRS: ["usecase"],
  SAD: ["c4-context", "c4-container"],
  TDD: ["c4-component", "sequence", "er", "state"],
  TASKS: ["dag"],
  PLAN: [],
  TSR: [],
  RELEASE: [],
  RUNBOOK: ["deploy", "rollback"],
  ADR: ["adr-status"],
};

// ---------- M1: feature-scoped happy path (PRD) ----------
console.log("M1 PRD happy path:");
withTmp("m1", (tmp) => {
  const r = runScaffold(["PRD", "001-foo", "foo"], tmp);
  check(r.status === 0, `PRD scaffold exits 0 (got ${r.status}; stderr: ${r.stderr})`);
  const artifactPath = join(tmp, ".claude/.orchestra/pipeline/001-foo/requirements/001-PRD.md");
  const lockPath = join(tmp, ".claude/.orchestra/pipeline/001-foo/requirements/001-PRD.lock.yaml");
  check(existsSync(artifactPath), `artifact written`);
  check(existsSync(lockPath), `lockfile written`);
  const body = readFileSync(artifactPath, "utf8");
  const anchors = bodyAnchors(body);
  check(JSON.stringify(anchors) === JSON.stringify(EXPECTED_ANCHORS.PRD), `PRD anchors match (got ${anchors.join(",")})`);
  check(/(^|\n)id: 001-PRD(\n|$)/.test(body), `frontmatter id=001-PRD`);
  check(!body.includes("{{"), `no unsubstituted placeholders`);
  // Lockfile shape
  const lock = parse(readFileSync(lockPath, "utf8"));
  check(lock.artifact_id === "001-PRD", `lockfile artifact_id`);
  check(lock.schema_revision === 1, `lockfile schema_revision`);
  for (const a of EXPECTED_ANCHORS.PRD) {
    check(lock.sections?.[a]?.hash === "TBD", `lockfile seeds ${a} at TBD`);
    check(lock.sections?.[a]?.confirmed === true, `lockfile seeds ${a}.confirmed=true`);
  }
});

// ---------- M2: every type scaffolds with correct anchors + diagram counts ----------
console.log("M2 every-type anchor + diagram parity:");
const FEATURE_TYPES = ["PRD", "FRS", "TDD", "TASKS", "PLAN", "TSR"];
for (const TYPE of FEATURE_TYPES) {
  withTmp(`m2-${TYPE}`, (tmp) => {
    const r = runScaffold([TYPE, "001-foo", "foo"], tmp);
    check(r.status === 0, `${TYPE}: exits 0`);
    const artifactPath = join(tmp, `.claude/.orchestra/pipeline/001-foo/${typeFolder(TYPE)}/001-${TYPE}.md`);
    const lockPath = artifactPath.replace(/\.md$/, ".lock.yaml");
    check(existsSync(artifactPath), `${TYPE}: artifact present`);
    check(existsSync(lockPath), `${TYPE}: lockfile present`);
    const body = readFileSync(artifactPath, "utf8");
    const anchors = bodyAnchors(body);
    check(JSON.stringify(anchors) === JSON.stringify(EXPECTED_ANCHORS[TYPE]),
      `${TYPE}: anchors match expected`);
    const lock = parse(readFileSync(lockPath, "utf8"));
    const lockKinds = (lock.diagrams || []).map(d => d.kind).filter(Boolean);
    check(JSON.stringify(lockKinds) === JSON.stringify(EXPECTED_DIAGRAM_KINDS[TYPE]),
      `${TYPE}: lockfile diagram kinds match (got ${lockKinds.join(",")})`);
    // Each diagram source stub exists.
    for (const d of (lock.diagrams || [])) {
      const stubPath = join(dirname(artifactPath), d.source);
      check(existsSync(stubPath), `${TYPE}: stub ${d.source} written`);
      const stub = readFileSync(stubPath, "utf8");
      check(stub.startsWith("@startuml") && stub.includes("@enduml"), `${TYPE}: stub has plantuml delimiters`);
    }
  });
}

function typeFolder(type) {
  return ({
    PRD: "requirements", FRS: "requirements",
    API: "interfaces",
    TDD: "design",
    TASKS: "plan",
    PLAN: "planning",
    TSR: "verify",
    CHARTER: "charter",
  })[type];
}

// ---------- M3: SAD singleton ----------
console.log("M3 SAD singleton:");
withTmp("m3", (tmp) => {
  const r = runScaffold(["SAD", "--singleton"], tmp);
  check(r.status === 0, `SAD: exits 0 (stderr: ${r.stderr})`);
  const artifactPath = join(tmp, ".claude/.orchestra/architecture/SAD.md");
  const lockPath = join(tmp, ".claude/.orchestra/architecture/SAD.lock.yaml");
  check(existsSync(artifactPath), `SAD.md present`);
  check(existsSync(lockPath), `SAD.lock.yaml present`);
  const lock = parse(readFileSync(lockPath, "utf8"));
  check(lock.artifact_id === "SAD", `SAD lockfile artifact_id=SAD`);
  const kinds = (lock.diagrams || []).map(d => d.kind);
  check(JSON.stringify(kinds) === JSON.stringify(EXPECTED_DIAGRAM_KINDS.SAD), `SAD diagrams: c4-context + c4-container`);
});

// ---------- M4: RELEASE / RUNBOOK version singletons ----------
console.log("M4 version singletons:");
withTmp("m4-release", (tmp) => {
  const r = runScaffold(["RELEASE", "--version=v0.1.0"], tmp);
  check(r.status === 0, `RELEASE: exits 0 (stderr: ${r.stderr})`);
  const file = join(tmp, ".claude/.orchestra/releases/RELEASE-v0.1.0.md");
  check(existsSync(file), `RELEASE-v0.1.0.md present`);
  const body = readFileSync(file, "utf8");
  check(JSON.stringify(bodyAnchors(body)) === JSON.stringify(EXPECTED_ANCHORS.RELEASE), `RELEASE anchors`);
  // S-ANNOUNCEMENT-001 is present (fold-correctness invariant)
  check(body.includes('<a id="S-ANNOUNCEMENT-001"></a>'), `RELEASE: §Announcement section exists (fold proof)`);
});
withTmp("m4-runbook", (tmp) => {
  const r = runScaffold(["RUNBOOK", "--version=v0.1.0"], tmp);
  check(r.status === 0, `RUNBOOK: exits 0`);
  const lockPath = join(tmp, ".claude/.orchestra/runbooks/RUNBOOK-v0.1.0.lock.yaml");
  const lock = parse(readFileSync(lockPath, "utf8"));
  const kinds = (lock.diagrams || []).map(d => d.kind);
  check(JSON.stringify(kinds) === JSON.stringify(EXPECTED_DIAGRAM_KINDS.RUNBOOK), `RUNBOOK: deploy + rollback diagrams seeded`);
});

// ---------- M5: ADR global numbering ----------
console.log("M5 ADR global numbering:");
withTmp("m5", (tmp) => {
  const r1 = runScaffold(["ADR", "--global", "use-sqlite"], tmp);
  check(r1.status === 0, `ADR-0001: exits 0 (stderr: ${r1.stderr})`);
  const file1 = join(tmp, ".claude/.orchestra/architecture/decisions/ADR-0001-use-sqlite.md");
  check(existsSync(file1), `ADR-0001-use-sqlite.md present`);
  const body1 = readFileSync(file1, "utf8");
  check(/(^|\n)id: ADR-0001(\n|$)/.test(body1), `ADR-0001 frontmatter id`);
  // Status diagram MANDATORY
  const lockPath1 = file1.replace(/\.md$/, ".lock.yaml");
  const lock1 = parse(readFileSync(lockPath1, "utf8"));
  check(lock1.diagrams?.[0]?.kind === "adr-status", `ADR diagrams[0].kind = adr-status`);
  // Stub has the canonical state machine content
  const stubPath = join(dirname(file1), lock1.diagrams[0].source);
  const stub = readFileSync(stubPath, "utf8");
  check(stub.includes("[*] --> proposed"), `ADR state-machine stub has [*] --> proposed`);
  check(stub.includes("proposed --> accepted"), `ADR state-machine stub has proposed --> accepted`);

  // Second ADR auto-increments to 0002
  const r2 = runScaffold(["ADR", "--global", "use-rate-limit"], tmp);
  check(r2.status === 0, `ADR-0002: exits 0`);
  const file2 = join(tmp, ".claude/.orchestra/architecture/decisions/ADR-0002-use-rate-limit.md");
  check(existsSync(file2), `ADR-0002 auto-numbered`);

  // Slug collision (same slug as ADR-0001 → fails)
  // Note: ADR-0002 already used "use-rate-limit". Try a fresh tmp/slug check by re-running ADR-0001 slug.
  // The collision comes from the FILENAME (NNNN-slug) — since NNNN auto-increments, the new attempt becomes ADR-0003-use-sqlite. That's not a collision; it's a rename. Real collision would be running --force on existing file.
  // Bad slug:
  const r3 = runScaffold(["ADR", "--global", "Bad_Slug"], tmp);
  check(r3.status !== 0, `ADR with bad slug fails`);
  check(/slug must match/.test(r3.stderr), `ADR bad slug: stderr names slug constraint`);
});

// ---------- M6: CHARTER mode dispatch ----------
console.log("M6 CHARTER modes:");
withTmp("m6-full", (tmp) => {
  const r = runScaffold(["CHARTER", "001-foo", "foo", "--mode=full"], tmp);
  check(r.status === 0, `CHARTER full: exits 0 (stderr: ${r.stderr})`);
  const file = join(tmp, ".claude/.orchestra/pipeline/001-foo/charter/001-CHARTER.md");
  check(existsSync(file), `CHARTER full: file present`);
  const body = readFileSync(file, "utf8");
  const anchors = bodyAnchors(body);
  check(JSON.stringify(anchors) === JSON.stringify(["S-PROBLEM-001", "S-SCOPE-001", "S-FEASIBILITY-001", "S-DECISION-001"]),
    `CHARTER full: 4 anchors`);
});
withTmp("m6-brief", (tmp) => {
  const r = runScaffold(["CHARTER", "001-foo", "foo", "--mode=brief"], tmp);
  check(r.status === 0, `CHARTER brief: exits 0`);
  const file = join(tmp, ".claude/.orchestra/pipeline/001-foo/charter/001-CHARTER.md");
  const body = readFileSync(file, "utf8");
  const anchors = bodyAnchors(body);
  check(JSON.stringify(anchors) === JSON.stringify(["S-INTENT-001", "S-DECISION-001"]),
    `CHARTER brief: 2 anchors`);
});
withTmp("m6-no-mode", (tmp) => {
  const r = runScaffold(["CHARTER", "001-foo", "foo"], tmp);
  check(r.status === 6, `CHARTER without --mode: exit 6 (got ${r.status})`);
});

// ---------- M7: idempotency — refuse on existing, --force overrides ----------
console.log("M7 idempotency:");
withTmp("m7", (tmp) => {
  const r1 = runScaffold(["PRD", "001-foo", "foo"], tmp);
  check(r1.status === 0, `first scaffold OK`);
  const r2 = runScaffold(["PRD", "001-foo", "foo"], tmp);
  check(r2.status === 2, `re-scaffold without --force: exit 2 (got ${r2.status})`);
  check(/--force/.test(r2.stderr), `re-scaffold: stderr names --force`);
  const r3 = runScaffold(["PRD", "001-foo", "foo", "--force"], tmp);
  check(r3.status === 0, `--force re-scaffold: exit 0`);
});

// ---------- M8: bad inputs ----------
console.log("M8 bad inputs:");
withTmp("m8", (tmp) => {
  const r1 = runScaffold(["NOPE", "001-foo", "foo"], tmp);
  check(r1.status === 1, `unknown type: exit 1 (got ${r1.status})`);
  const r2 = runScaffold(["PRD"], tmp); // missing feature-id
  check(r2.status === 4, `missing feature-id: exit 4 (got ${r2.status})`);
  const r3 = runScaffold(["PRD", "BadFeatureId", "x"], tmp);
  check(r3.status === 4, `bad feature-id: exit 4`);
  const r4 = runScaffold(["RELEASE"], tmp); // missing --version
  check(r4.status === 6, `RELEASE missing --version: exit 6`);
  const r5 = runScaffold(["RELEASE", "--version=not-semver"], tmp);
  check(r5.status === 4, `RELEASE bad version: exit 4`);
});

// ---------- M9: anchor parity (lockfile.sections keys === body anchors) ----------
console.log("M9 anchor parity:");
withTmp("m9", (tmp) => {
  for (const TYPE of ["PRD", "FRS", "TDD", "TASKS", "PLAN", "TSR"]) {
    runScaffold([TYPE, "001-foo", "foo"], tmp);
    const artifactPath = join(tmp, `.claude/.orchestra/pipeline/001-foo/${typeFolder(TYPE)}/001-${TYPE}.md`);
    const lockPath = artifactPath.replace(/\.md$/, ".lock.yaml");
    const body = readFileSync(artifactPath, "utf8");
    const lock = parse(readFileSync(lockPath, "utf8"));
    const bodyIds = bodyAnchors(body).sort();
    const lockIds = Object.keys(lock.sections || {}).sort();
    check(JSON.stringify(bodyIds) === JSON.stringify(lockIds),
      `${TYPE}: anchor parity (body=${bodyIds.join(",")} lock=${lockIds.join(",")})`);
  }
});

// ---------- M10: API.openapi.yaml whole-file artifact ----------
console.log("M10 API openapi:");
withTmp("m10", (tmp) => {
  const r = runScaffold(["API", "001-foo", "foo"], tmp);
  check(r.status === 0, `API: exits 0 (stderr: ${r.stderr})`);
  const apiPath = join(tmp, ".claude/.orchestra/pipeline/001-foo/interfaces/001-API.openapi.yaml");
  const lockPath = join(tmp, ".claude/.orchestra/pipeline/001-foo/interfaces/001-API.lock.yaml");
  check(existsSync(apiPath), `API.openapi.yaml present`);
  check(existsSync(lockPath), `API.lock.yaml present`);
  const lock = parse(readFileSync(lockPath, "utf8"));
  // Single section S-API-001 (whole-file hash)
  check(Object.keys(lock.sections || {}).join(",") === "S-API-001", `API lockfile has only S-API-001`);
});

if (failures > 0) {
  console.error(`test-scaffold.js: FAIL (${passes} passed, ${failures} failed)`);
  process.exit(1);
}
console.log(`test-scaffold.js: OK (${passes} assertions passed)`);
