#!/usr/bin/env node
// hooks/scripts/pre-write-check.js
// PreToolUse(Write|Edit|MultiEdit) hook. Gates run in order:
//   secrets         — exit 2 on detection
//   Gate-D          — src/ cite denylist; exit 2 on hit when target is business src/
//   Gate-D-inverse  — docs/ codebase-identifier denylist; exit 2 on hit when target is chain artifact under docs/
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
];

const SKIP_PATTERNS = [
  /process\.env\./,
  /\$\{/,
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
