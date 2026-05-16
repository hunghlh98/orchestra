#!/usr/bin/env node
// hooks/scripts/pre-write-check.js
// PreToolUse(Write|Edit|MultiEdit) hook. Gates run in order:
//   secrets         — exit 2 on detection
//   Gate-D          — src/ cite denylist; exit 2 on hit when target is business src/
//   Gate-D-inverse  — docs/ codebase-identifier denylist; exit 2 on hit when target is chain artifact under docs/
//   Gate-E          — workspace-scope SAD/c4-container container-count floor; exit 2 when workspace artifact ships <2 containers
//   Gate-A          — frontmatter `status: locked` rejects writes
//   Gate-B          — frontmatter `sections:` map; reject if all sections locked
//   Gate-C          — frontmatter `readers:` allowlist; non-blocking warning to stderr

import { existsSync, readFileSync } from "node:fs";
import { parse as parseYaml } from "../lib/yaml-mini.js";

const NAME = "ORCHESTRA_HOOK_PRE_WRITE_CHECK";

if (process.env[NAME] === "off") {
  process.exit(0);
}

const SECRET_PATTERNS = [
  { name: "aws-access-key",  re: /AKIA[0-9A-Z]{16}/ },
  { name: "github-pat",      re: /\bghp_[A-Za-z0-9]{36}\b/ },
  { name: "github-pat-fine", re: /\bgithub_pat_[A-Za-z0-9_]{82}\b/ },
  { name: "jwt",             re: /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/ },
  { name: "rsa-private-key", re: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/ },
  { name: "slack-token",     re: /\bxox[baprs]-[A-Za-z0-9-]+/ },
  { name: "google-api-key",  re: /\bAIza[A-Za-z0-9_-]{35}\b/ },
  { name: "bearer-auth",     re: /\b(?:Bearer|Basic)\s+[A-Za-z0-9+/=._-]{12,}/ },
  // Spring Boot `${KEY:default}` fallback whose KEY names a credential. Catches
  // shapes like `${DB_PASSWORD:literal}` / `${API_TOKEN:literal}` where the
  // literal default leaks credential material into source. Safe forms like
  // `${SERVER_PORT:8080}` do NOT match (no credential keyword in KEY name).
  { name: "env-fallback-credential",
    re: /\$\{[A-Z_]*(?:PASSWORD|SECRET|TOKEN|API[-_]?KEY|CREDENTIAL|PRIVATE[-_]?KEY)[A-Z_]*:[^}]+\}/i },
];

const SKIP_PATTERNS = [
  /process\.env\./,
  // Bare env-var reference `${KEY}` (no colon-suffix → no fallback default).
  // Narrowed from `/\$\{/` so credential-fallback shapes (`${KEY:literal}`)
  // remain visible to the env-fallback-credential SECRET pattern above.
  /\$\{[A-Z_]+\}/,
  /placeholder/i,
  /<your-/i,
  /example/i,
  /test-fixture/i,
];

// Gate-D — src/ cite denylist (canonical regex; mirrored in
// schemas/pipeline-artifact.schema.md). Single-source so the audit
// reporter reads the same list.
const CITE_DENYLIST_RE = /(?:PRD|FRS|TDD|CONTRACT|TSR)\s*§\s*\d+|ADR-\d{4}\s*§\s*\d+|\b(?:FR|AC|C|NFR)-\d+\b|\bS-[A-Z]+(?:-[A-Z]+)*-\d{3}\b|openapi\.yaml#\/paths\//;

// Business-src path activation. Triggers Gate-D when target file is under
// a code dir AND not a markdown/yaml/json file (READMEs in src/ exempted).
const SRC_PATH_RE = /(^|\/)(src|app|cmd|pkg|internal|lib)\//;
const SRC_EXEMPT_EXT_RE = /\.(md|yaml|yml|json|txt)$/i;

// Gate-D-inverse — chain-artifact-under-docs codebase-identifier denylist.
// Activates when the target is a chain artifact in docs/. Rejects src/** path
// tokens (mirror of Gate-D), commit SHAs, branch names, repo URLs, and (for
// PRD/FRS) fenced code blocks. Enforces the portability contract: docs/**/*.md
// authored in project A must be valid as spec-to-code inputs in project B.
const DOCS_PREFIX_RE = /(^|\/)docs\//;
const DOCS_CHAIN_PRDFRS_RE = /-(?:PRD|FRS)\.md$/;
const SRC_PATH_TOKEN_RE = /(?:^|[\s`(])(?:src|app|cmd|pkg|internal|lib)\/[\w./-]+/;
const COMMIT_SHA_RE = /\b(?:commit|sha|hash|rev|revision)[:\s]+[0-9a-f]{7,40}\b/i;
const BRANCH_RE = /\b(?:feature|release|hotfix|bugfix)\/[\w./-]+/;
const REPO_URL_RE = /\b(?:github|gitlab|bitbucket)\.com\/[\w./-]+/i;
const FENCED_CODE_RE = /^```[a-z0-9_-]*\s*$/i;

function isChainArtifactUnderDocs(filePath) {
  if (!DOCS_PREFIX_RE.test(filePath)) return false;
  const base = filePath.split("/").pop();
  if (/^.+-(?:PRD|FRS|TDD|TSR|BR-AC|openapi|asyncapi|clientapi)\.(?:md|yaml)$/.test(base)) return true;
  if (base === "SAD.md") return true;
  if (base === "business-invariants.md") return true;
  if (/^ADR-\d{4}-.+\.md$/.test(base)) return true;
  if (/^ADR-[a-z][a-z0-9-]*-\d{3}-.+\.md$/.test(base)) return true;
  return false;
}

// Gate-E — workspace-scope SAD + c4-container.puml container-count floor.
// Activates when the target is SAD.md or workspace-scope c4-container.puml AND
// .orchestra/system.yaml declares workspace_kind: multi-repo. Rejects bodies
// that enumerate <2 service containers — those are service-scope L1/L2 wearing
// a workspace-scope label.
const WORKSPACE_CONTAINER_FLOOR = 2;

function readWorkspaceKind() {
  // Walk up from cwd looking for .orchestra/system.yaml (one level only — the
  // dispatcher runs at workspace root; we don't chase distant parents).
  const cwd = process.cwd();
  const candidate = `${cwd}/.orchestra/system.yaml`;
  if (!existsSync(candidate)) return null;
  try {
    const text = readFileSync(candidate, "utf8");
    const parsed = parseYamlSafely(text);
    return parsed?.workspace_kind || null;
  } catch { return null; }
}

function countSadContainerRows(content) {
  // Find S-CONTAINERS-001 section header; count markdown table data rows
  // (lines starting and ending with |) until the next H2.
  const lines = content.split(/\r?\n/);
  let inSection = false;
  let sawSeparator = false;
  let count = 0;
  for (const line of lines) {
    if (/<a\s+id="S-CONTAINERS-001"/.test(line) || /^##\s+S-CONTAINERS-001\b/.test(line)) {
      inSection = true; sawSeparator = false; count = 0; continue;
    }
    if (inSection && /^##\s+/.test(line)) break;
    if (!inSection) continue;
    if (!/^\s*\|.*\|\s*$/.test(line)) continue;
    if (/^\s*\|[\s|:\-]+\|\s*$/.test(line)) { sawSeparator = true; continue; }
    if (sawSeparator) count++;
  }
  return sawSeparator ? count : null;
}

function countPumlContainersInBoundary(content) {
  // Match the first System_Boundary(...) { ... } block and count Container() /
  // ContainerDb() / ContainerQueue() / Container_Ext() calls inside.
  // PlantUML uses Container_Boundary too, but workspace L2 uses System_Boundary.
  const m = content.match(/System_Boundary\s*\([^)]*\)\s*\{([\s\S]*?)\n\s*\}/);
  if (!m) return null;
  const body = m[1];
  const matches = body.match(/\bContainer(?:Db|Queue|_Ext)?\s*\(/g);
  return matches ? matches.length : 0;
}

function runGateE(filePath, content) {
  if (!filePath) return;
  const base = filePath.split("/").pop();
  const isWorkspaceSad = base === "SAD.md" && /(^|\/)docs\/SAD\.md$/.test(filePath);
  const isWorkspaceContainerPuml =
    base === "c4-container.puml" && /(^|\/)docs\/diagrams\/c4-container\.puml$/.test(filePath);
  if (!isWorkspaceSad && !isWorkspaceContainerPuml) return;

  const workspaceKind = readWorkspaceKind();
  if (workspaceKind !== "multi-repo") return;

  if (isWorkspaceSad) {
    const rows = countSadContainerRows(content);
    if (rows !== null && rows < WORKSPACE_CONTAINER_FLOOR) {
      process.stderr.write(
        `pre-write-check: gate-E — workspace SAD (workspace_kind: multi-repo) S-CONTAINERS-001 lists ${rows} container row(s); workspace SAD must enumerate ≥${WORKSPACE_CONTAINER_FLOOR} services as Containers. One service rendered as System() with siblings as System_Ext is a service-scope L1/L2 wearing a workspace label — see agents/architect.md "C4 scope continuity".\n`
      );
      process.exit(2);
    }
  }
  if (isWorkspaceContainerPuml) {
    const containers = countPumlContainersInBoundary(content);
    if (containers !== null && containers < WORKSPACE_CONTAINER_FLOOR) {
      process.stderr.write(
        `pre-write-check: gate-E — workspace c4-container.puml inside System_Boundary declares ${containers} Container() entr(ies); workspace L2 must enumerate ≥${WORKSPACE_CONTAINER_FLOOR} services as Container — see agents/architect.md "C4 scope continuity".\n`
      );
      process.exit(2);
    }
  }
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
    if (!content) { process.exit(0); }

    runSecretsGate(content);
    runGateD(filePath, content);
    runGateDInverse(filePath, content);
    runGateE(filePath, content);

    if (filePath && existsSync(filePath)) {
      const fm = readFrontmatter(filePath);
      if (fm) {
        runGateA(filePath, fm);
        runGateB(filePath, fm);
        runGateC(filePath, fm);
      }
    }

    process.exit(0);
  } catch (err) {
    // Crash semantics: never block on our own bug.
    process.stderr.write(`pre-write-check crashed: ${err.message}\n`);
    process.exit(0);
  }
}

function runSecretsGate(content) {
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (SKIP_PATTERNS.some(rx => rx.test(line))) continue;
    for (const { name, re } of SECRET_PATTERNS) {
      if (re.test(line)) {
        process.stderr.write(
          `pre-write-check: secrets — detected ${name} at line ${i + 1}. Use process.env or a placeholder.\n`
        );
        process.exit(2);
      }
    }
  }
}

function runGateD(filePath, content) {
  if (!filePath) return;
  if (!SRC_PATH_RE.test(filePath)) return;
  if (SRC_EXEMPT_EXT_RE.test(filePath)) return;
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(CITE_DENYLIST_RE);
    if (m) {
      process.stderr.write(
        `pre-write-check: gate-D — chain-artifact cite '${m[0]}' at line ${i + 1} forbidden in <consumer>/src/**. Move to commit message / PR description / TSR S-VERDICT-* sections.\n`
      );
      process.exit(2);
    }
  }
}

function runGateDInverse(filePath, content) {
  if (!filePath) return;
  if (!isChainArtifactUnderDocs(filePath)) return;
  const isPRDorFRS = DOCS_CHAIN_PRDFRS_RE.test(filePath);
  const lines = content.split(/\r?\n/);
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // (b) PRD/FRS fenced-code rejection — line-anchored ``` (with optional lang tag)
    if (isPRDorFRS && FENCED_CODE_RE.test(line)) {
      process.stderr.write(
        `pre-write-check: gate-D-inverse (b) — fenced code block at line ${i + 1} forbidden in PRD/FRS. PRD/FRS describe behavior; inline backtick spans for type names are allowed.\n`
      );
      process.exit(2);
    }

    // Track fenced state for SAD/TDD/etc (allowed) — but we still scan their content for codebase identifiers
    if (FENCED_CODE_RE.test(line)) { inFence = !inFence; continue; }

    // (a) src/** path token rejection
    const sm = line.match(SRC_PATH_TOKEN_RE);
    if (sm) {
      process.stderr.write(
        `pre-write-check: gate-D-inverse (a) — codebase path token '${sm[0].trim()}' at line ${i + 1} forbidden under docs/. Docs must be project-portable; describe shapes domain-only.\n`
      );
      process.exit(2);
    }

    // (c) codebase-specific identifier rejection
    const cm = line.match(COMMIT_SHA_RE);
    if (cm && !inFence) {
      process.stderr.write(
        `pre-write-check: gate-D-inverse (c) — commit SHA '${cm[0].trim()}' at line ${i + 1} forbidden under docs/. Portability: docs must not pin to a specific repo state.\n`
      );
      process.exit(2);
    }
    const bm = line.match(BRANCH_RE);
    if (bm) {
      process.stderr.write(
        `pre-write-check: gate-D-inverse (c) — branch name '${bm[0]}' at line ${i + 1} forbidden under docs/.\n`
      );
      process.exit(2);
    }
    const rm = line.match(REPO_URL_RE);
    if (rm) {
      process.stderr.write(
        `pre-write-check: gate-D-inverse (c) — repo URL '${rm[0]}' at line ${i + 1} forbidden under docs/.\n`
      );
      process.exit(2);
    }
  }
}

function runGateA(filePath, fm) {
  if (fm.status === "locked") {
    process.stderr.write(
      `pre-write-check: gate-A — ${filePath} is locked (status: locked). Set ORCHESTRA_HOOK_PRE_WRITE_CHECK=off to override.\n`
    );
    process.exit(2);
  }
}

function runGateB(filePath, fm) {
  const sections = fm.sections;
  if (!sections || typeof sections !== "object" || Array.isArray(sections)) return;
  const entries = Object.values(sections).filter(s => s && typeof s === "object");
  if (entries.length === 0) return;
  const allLocked = entries.every(s => s.status === "locked");
  if (allLocked) {
    process.stderr.write(
      `pre-write-check: gate-B — ${filePath} has all sections locked; no writer can amend without status transition. Override via ORCHESTRA_HOOK_PRE_WRITE_CHECK=off.\n`
    );
    process.exit(2);
  }
}

function runGateC(filePath, fm) {
  if (!Array.isArray(fm.readers) || fm.readers.length === 0) return;
  // Soft enforcement; non-blocking. The reporter aggregates these warnings
  // when summarising readers-violations.
  process.stderr.write(
    `pre-write-check: gate-C — readers-scope: ${filePath} readers=[${fm.readers.join(",")}] (non-blocking).\n`
  );
}

function readFrontmatter(filePath) {
  let text;
  try { text = readFileSync(filePath, "utf8"); }
  catch { return null; }

  // Standard markdown frontmatter delimited by --- lines.
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (m) return parseYamlSafely(m[1]);

  // <feature-id>-openapi.yaml / <feature-id>-asyncapi.yaml shape: top-of-file `# orchestra:` block.
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
  try { return parseYaml(yaml); }
  catch { return null; }
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
