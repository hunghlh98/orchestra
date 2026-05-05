#!/usr/bin/env node
// scripts/test-hash-stamper.js
// Mutation suite for the v2 sidecar-mode hash-stamper.
// Covers behaviors NOT exercised by test-hooks.js:
//   - unpaired .md write → passthrough, no lockfile created
//   - paired .md → lockfile.sections updated, frontmatter untouched
//   - .puml whole-file hash → diagrams[].source_hash updated
//   - .svg whole-file hash → diagrams[].rendered_hash updated
//   - references[].hash-at-write resolution from upstream lockfile
//   - non-orchestra path → passthrough
//
// See schemas/lockfile.schema.md and docs/DESIGN-005-doc-output-overhaul.md §S-HASHSTAMPER-001.

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { parse } from "../hooks/lib/yaml-mini.js";
import { hashSections, computeHash, hashFile } from "../hooks/lib/section-hash.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const stamperPath = resolve(root, "hooks/scripts/hash-stamper.js");
let failures = 0;
let passes = 0;

function check(cond, msg) {
  if (cond) { passes++; }
  else { failures++; console.error(`  FAIL: ${msg}`); }
}

function runStamper(filePath, content) {
  return spawnSync("node", [stamperPath], {
    input: JSON.stringify({
      session_id: "test", hook_event_name: "PreToolUse", tool_name: "Write",
      tool_input: { file_path: filePath, content },
    }),
    encoding: "utf8",
  });
}

function withTmp(label, fn) {
  const tmp = mkdtempSync(join(tmpdir(), `orchestra-stamper-${label}-`));
  try { fn(tmp); }
  finally { rmSync(tmp, { recursive: true, force: true }); }
}

// ---------- hashFile helper (regression test for new export) ----------
console.log("hashFile helper:");
{
  withTmp("hashfile", (tmp) => {
    const p = join(tmp, "x.txt");
    writeFileSync(p, "hello world\n");
    const h = hashFile(p);
    check(/^sha256:[a-f0-9]{64}$/.test(h || ""), `hashFile returns sha256:hex (got ${h})`);
    const h2 = hashFile(p);
    check(h === h2, `hashFile is deterministic`);
    check(hashFile(join(tmp, "missing.txt")) === null, `hashFile returns null for missing file`);
    // CRLF normalization parity with hashSections
    const pCrlf = join(tmp, "y.txt");
    writeFileSync(pCrlf, "hello world\r\n");
    check(hashFile(pCrlf) === h, `hashFile CRLF→LF normalizes`);
  });
}

// ---------- M1: unpaired .md write — passthrough, no lockfile written ----------
console.log("M1 unpaired-passthrough:");
withTmp("m1", (tmp) => {
  const orchDir = join(tmp, ".claude/.orchestra/architecture");
  mkdirSync(orchDir, { recursive: true });
  const sadPath = join(orchDir, "SAD.md");
  const sadLockPath = join(orchDir, "SAD.lock.yaml");
  // No lockfile pre-existing.
  const r = runStamper(sadPath,
`---
id: SAD
type: SAD
revision: 1
---
## §1 Vision <a id="S-VISION-001"></a>

Body.
`);
  check(r.status === 0, `unpaired exits 0`);
  const out = JSON.parse(r.stdout || "{}");
  check(out.hookSpecificOutput?.permissionDecision === "allow", `unpaired emits allow`);
  check(out.hookSpecificOutput?.updatedInput === undefined, `unpaired no updatedInput`);
  check(!existsSync(sadLockPath), `unpaired does NOT spontaneously create lockfile`);
});

// ---------- M2: paired .md — lockfile updated, body not mutated ----------
console.log("M2 paired-md-stamps-lockfile:");
withTmp("m2", (tmp) => {
  const orchDir = join(tmp, ".claude/.orchestra/architecture");
  mkdirSync(orchDir, { recursive: true });
  const sadPath = join(orchDir, "SAD.md");
  const sadLockPath = join(orchDir, "SAD.lock.yaml");
  writeFileSync(sadLockPath,
`artifact_id: SAD
artifact_path: architecture/SAD.md
schema_revision: 1
sections:
  S-VISION-001:
    hash: "TBD"
    confirmed: true
`);
  const body = `## §1 Vision <a id="S-VISION-001"></a>\n\nBody content.\n`;
  const r = runStamper(sadPath, `---\nid: SAD\ntype: SAD\nrevision: 1\n---\n${body}`);
  check(r.status === 0, `paired exits 0`);
  const out = JSON.parse(r.stdout || "{}");
  check(out.hookSpecificOutput?.updatedInput === undefined, `paired does NOT mutate body`);
  const lock = parse(readFileSync(sadLockPath, "utf8"));
  const expected = hashSections(body)[0].hash;
  check(lock?.sections?.["S-VISION-001"]?.hash === expected, `lockfile hash matches recomputed`);
  check(lock?.sections?.["S-VISION-001"]?.confirmed === true, `confirmed flag preserved`);
});

// ---------- M3: .puml write → diagrams[].source_hash updated ----------
console.log("M3 puml-source-hash:");
withTmp("m3", (tmp) => {
  const artDir = join(tmp, ".claude/.orchestra/pipeline/001-foo/requirements");
  const diagDir = join(artDir, "diagrams");
  mkdirSync(diagDir, { recursive: true });
  const lockPath = join(artDir, "001-FRS.lock.yaml");
  writeFileSync(lockPath,
`artifact_id: 001-FRS
artifact_path: pipeline/001-foo/requirements/001-FRS.md
schema_revision: 1
sections:
  S-USECASE-001:
    hash: "TBD"
    confirmed: true
diagrams:
  - kind: usecase
    source: diagrams/frs-usecase.puml
    rendered: diagrams/frs-usecase.svg
    source_hash: "TBD"
    rendered_hash: "TBD"
    omit: false
`);
  const pumlPath = join(diagDir, "frs-usecase.puml");
  const pumlContent = `@startuml\nactor User\nUser --> (Shorten URL)\n@enduml\n`;
  const r = runStamper(pumlPath, pumlContent);
  check(r.status === 0, `.puml exits 0`);
  const lock = parse(readFileSync(lockPath, "utf8"));
  const expected = computeHash(pumlContent);
  const entry = lock?.diagrams?.find(d => d?.kind === "usecase");
  check(entry?.source_hash === expected, `source_hash updated (got ${entry?.source_hash})`);
  check(entry?.rendered_hash === "TBD", `rendered_hash NOT touched by .puml write`);
});

// ---------- M4: .svg write → diagrams[].rendered_hash updated ----------
console.log("M4 svg-rendered-hash:");
withTmp("m4", (tmp) => {
  const artDir = join(tmp, ".claude/.orchestra/pipeline/001-foo/requirements");
  const diagDir = join(artDir, "diagrams");
  mkdirSync(diagDir, { recursive: true });
  const lockPath = join(artDir, "001-FRS.lock.yaml");
  writeFileSync(lockPath,
`artifact_id: 001-FRS
artifact_path: pipeline/001-foo/requirements/001-FRS.md
schema_revision: 1
sections: {}
diagrams:
  - kind: usecase
    source: diagrams/frs-usecase.puml
    rendered: diagrams/frs-usecase.svg
    source_hash: "sha256:abc"
    rendered_hash: "TBD"
    omit: false
`);
  const svgPath = join(diagDir, "frs-usecase.svg");
  const svgContent = `<svg xmlns="http://www.w3.org/2000/svg"><circle cx="50" cy="50" r="40"/></svg>\n`;
  const r = runStamper(svgPath, svgContent);
  check(r.status === 0, `.svg exits 0`);
  const lock = parse(readFileSync(lockPath, "utf8"));
  const expected = computeHash(svgContent);
  const entry = lock?.diagrams?.find(d => d?.kind === "usecase");
  check(entry?.rendered_hash === expected, `rendered_hash updated (got ${entry?.rendered_hash})`);
  check(entry?.source_hash === "sha256:abc", `source_hash NOT touched by .svg write`);
});

// ---------- M5: orphan .puml (no matching diagrams[] entry) → passthrough ----------
// yaml-mini omits empty arrays during round-trip serialization; this case
// instead asserts the stamper does NOT crash and exits clean when the lockfile
// has no `diagrams:` block at all.
console.log("M5 orphan-puml-no-crash:");
withTmp("m5", (tmp) => {
  const artDir = join(tmp, ".claude/.orchestra/pipeline/001-foo/design");
  const diagDir = join(artDir, "diagrams");
  mkdirSync(diagDir, { recursive: true });
  const lockPath = join(artDir, "001-TDD.lock.yaml");
  writeFileSync(lockPath,
`artifact_id: 001-TDD
artifact_path: pipeline/001-foo/design/001-TDD.md
schema_revision: 1
sections:
  S-COMPONENTS-001:
    hash: "TBD"
    confirmed: true
`);
  const pumlPath = join(diagDir, "tdd-er.puml"); // not in any diagrams[]
  const r = runStamper(pumlPath, `@startuml\nentity X\n@enduml\n`);
  check(r.status === 0, `orphan .puml exits 0 (no crash)`);
  const lock = parse(readFileSync(lockPath, "utf8"));
  // sections must remain untouched (only-when-paired was satisfied for the lockfile,
  // but the .puml has no owning diagrams[] entry so nothing to update).
  check(lock?.sections?.["S-COMPONENTS-001"]?.hash === "TBD", `unrelated section TBD preserved`);
});

// ---------- M6: references[].hash-at-write resolution from upstream lockfile ----------
console.log("M6 references-resolve-via-upstream-lockfile:");
withTmp("m6", (tmp) => {
  // Upstream: SAD with a real hash in its lockfile.
  const sadDir = join(tmp, ".claude/.orchestra/architecture");
  mkdirSync(sadDir, { recursive: true });
  writeFileSync(join(sadDir, "SAD.md"),
`---
id: SAD
type: SAD
revision: 1
---
## §1 Context <a id="S-CONTEXT-001"></a>

x.
`);
  const sadHash = "sha256:" + "a".repeat(64);
  writeFileSync(join(sadDir, "SAD.lock.yaml"),
`artifact_id: SAD
artifact_path: architecture/SAD.md
schema_revision: 1
sections:
  S-CONTEXT-001:
    hash: "${sadHash}"
    confirmed: true
`);

  // Downstream: PRD with a TBD reference to SAD §S-CONTEXT-001.
  const prdDir = join(tmp, ".claude/.orchestra/pipeline/001-foo/requirements");
  mkdirSync(prdDir, { recursive: true });
  const prdLockPath = join(prdDir, "001-PRD.lock.yaml");
  writeFileSync(prdLockPath,
`artifact_id: 001-PRD
artifact_path: pipeline/001-foo/requirements/001-PRD.md
schema_revision: 1
sections:
  S-PROBLEM-001:
    hash: "TBD"
    confirmed: true
references:
  - type: sad
    id: ""
    section: S-CONTEXT-001
    hash-at-write: "TBD"
`);
  const prdPath = join(prdDir, "001-PRD.md");
  const prdContent = `---\nid: 001-PRD\ntype: PRD\nrevision: 1\n---\n## §1 Problem <a id="S-PROBLEM-001"></a>\n\nProblem.\n`;
  const r = runStamper(prdPath, prdContent);
  check(r.status === 0, `references resolution exits 0`);
  const lock = parse(readFileSync(prdLockPath, "utf8"));
  check(lock?.references?.[0]?.["hash-at-write"] === sadHash,
    `hash-at-write resolved from upstream lockfile (got ${lock?.references?.[0]?.["hash-at-write"]})`);
  // Sections also stamped:
  const expected = hashSections(prdContent.split("\n---\n").slice(1).join("\n---\n"))[0].hash;
  check(lock?.sections?.["S-PROBLEM-001"]?.hash === expected, `PRD section also stamped`);
});

// ---------- M7: non-orchestra path → passthrough ----------
console.log("M7 non-orchestra-passthrough:");
withTmp("m7", (tmp) => {
  const p = join(tmp, "random.md");
  writeFileSync(p + ".lock.yaml", `artifact_id: ignored\nschema_revision: 1\nsections: {}\n`);
  const r = runStamper(p, `---\nid: x\n---\n## §1 <a id="S-X-001"></a>\n`);
  check(r.status === 0, `non-orchestra exits 0`);
  const lockText = readFileSync(p + ".lock.yaml", "utf8");
  // Lockfile must NOT have been touched — non-orchestra path is ignored.
  check(lockText.includes("artifact_id: ignored"), `non-orchestra lockfile untouched`);
});

// ---------- M8: env opt-out ----------
console.log("M8 env-opt-out:");
withTmp("m8", (tmp) => {
  const orchDir = join(tmp, ".claude/.orchestra/architecture");
  mkdirSync(orchDir, { recursive: true });
  const sadPath = join(orchDir, "SAD.md");
  const sadLockPath = join(orchDir, "SAD.lock.yaml");
  writeFileSync(sadLockPath,
`artifact_id: SAD
artifact_path: architecture/SAD.md
schema_revision: 1
sections:
  S-VISION-001:
    hash: "TBD"
    confirmed: true
`);
  const body = `## §1 V <a id="S-VISION-001"></a>\n\nx.\n`;
  const r = spawnSync("node", [stamperPath], {
    input: JSON.stringify({
      session_id: "test", hook_event_name: "PreToolUse", tool_name: "Write",
      tool_input: { file_path: sadPath, content: `---\nid: SAD\n---\n${body}` },
    }),
    encoding: "utf8",
    env: { ...process.env, ORCHESTRA_HOOK_HASH_STAMPER: "off" },
  });
  check(r.status === 0, `opt-out exits 0`);
  const lock = parse(readFileSync(sadLockPath, "utf8"));
  check(lock?.sections?.["S-VISION-001"]?.hash === "TBD", `opt-out: lockfile NOT updated`);
});

if (failures > 0) {
  console.error(`test-hash-stamper.js: FAIL (${passes} passed, ${failures} failed)`);
  process.exit(1);
}
console.log(`test-hash-stamper.js: OK (${passes} assertions passed)`);
