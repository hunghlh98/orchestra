// hooks/lib/cite-patterns.js
// Canonical regex tables for pre-write-check secret + cite gates.
// Single-source so the audit reporter reads the same lists.
//
// Token classes:
//   - SECRET_PATTERNS: high-signal credential shapes (AWS / GitHub / GCP API key /
//     Slack / Stripe / generic JWT + bearer + RSA private-key + Spring env-fallback).
//     Scope is intentionally narrow — patterns that would false-match on opaque
//     base64 / hex blobs (generic 32-char hex like Twilio auth-tokens, generic
//     88-char base64 like Azure storage keys) are NOT included. The S-XXX-NNN
//     section-anchor format used throughout orchestra is an orchestra-specific
//     token class, NOT a credential — it's enforced by CITE_DENYLIST_RE below.
//   - SKIP_PATTERNS: lines exempt from secret scanning (env-var dereferences,
//     placeholder / example / test-fixture markers).
//   - CITE_DENYLIST_RE: orchestra chain-artifact section-anchor cites forbidden
//     under business src/** (PRD §N, FRS §N, TDD §N, CONTRACT §N, TSR §N,
//     ADR-NNNN §N, FR-N, AC-N, C-N, NFR-N, S-<UPPER>-NNN, openapi path-fragment).

// Secret-detection patterns. Each entry's `name` flows into the stderr
// rejection message so consumers see which class matched.
export const SECRET_PATTERNS = [
  { name: "aws-access-key",  re: /AKIA[0-9A-Z]{16}/ },
  { name: "github-pat",      re: /\bghp_[A-Za-z0-9]{36}\b/ },
  { name: "github-pat-fine", re: /\bgithub_pat_[A-Za-z0-9_]{82}\b/ },
  { name: "jwt",             re: /\beyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/ },
  { name: "rsa-private-key", re: /-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/ },
  { name: "slack-token",     re: /\bxox[baprs]-[A-Za-z0-9-]+/ },
  { name: "google-api-key",  re: /\bAIza[A-Za-z0-9_-]{35}\b/ },
  { name: "stripe-secret",   re: /\bsk_(?:live|test)_[A-Za-z0-9]{24,}\b/ },
  { name: "bearer-auth",     re: /\b(?:Bearer|Basic)\s+[A-Za-z0-9+/=._-]{12,}/ },
  // Spring Boot `${KEY:default}` fallback whose KEY names a credential.
  // Safe forms like `${SERVER_PORT:8080}` do NOT match (no credential
  // keyword in KEY name).
  { name: "env-fallback-credential",
    re: /\$\{[A-Z_]*(?:PASSWORD|SECRET|TOKEN|API[-_]?KEY|CREDENTIAL|PRIVATE[-_]?KEY)[A-Z_]*:[^}]+\}/i },
];

// Lines matching any SKIP pattern are exempt from secret scanning.
// Narrowed `${KEY}` to anchored uppercase identifier so credential-fallback
// shapes (`${KEY:literal}`) remain visible to env-fallback-credential.
export const SKIP_PATTERNS = [
  /process\.env\./,
  /\$\{[A-Z_]+\}/,
  /placeholder/i,
  /<your-/i,
  /example/i,
  /test-fixture/i,
];

// chain-cite-reject — src/ cite denylist (mirrored in schemas/pipeline-artifact.schema.md).
export const CITE_DENYLIST_RE =
  /(?:PRD|FRS|TDD|CONTRACT|TSR)\s*§\s*\d+|ADR-\d{4}\s*§\s*\d+|\b(?:FR|AC|C|NFR)-\d+\b|\bS-[A-Z]+(?:-[A-Z]+)*-\d{3}\b|openapi\.yaml#\/paths\//;

// Business-src path activation: chain-cite-reject triggers when target file
// is under a code dir AND not a markdown/yaml/json/txt file (READMEs in src/
// exempt).
export const SRC_PATH_RE = /(^|\/)(src|app|cmd|pkg|internal|lib)\//;
export const SRC_EXEMPT_EXT_RE = /\.(md|yaml|yml|json|txt)$/i;

// codebase-token-reject — chain-artifact-under-docs codebase-identifier
// denylist. Enforces portability: docs/**/*.md authored in project A must be
// valid as spec-to-code input in project B.
export const DOCS_PREFIX_RE = /(^|\/)docs\//;
export const DOCS_CHAIN_PRDFRS_RE = /-(?:PRD|FRS)\.md$/;
export const SRC_PATH_TOKEN_RE = /(?:^|[\s`(])(?:src|app|cmd|pkg|internal|lib)\/[\w./-]+/;
export const COMMIT_SHA_RE = /\b(?:commit|sha|hash|rev|revision)[:\s]+[0-9a-f]{7,40}\b/i;
// Branch-name tokens — require an explicit boundary char (start-of-line,
// whitespace, backtick, or open-paren) before the keyword so we don't match
// inside English prose ("Release/v1 plan", "the feature/X package").
export const BRANCH_RE = /(?:^|[\s`(])(?:feature|release|hotfix|bugfix)\/[\w./-]+/;
export const REPO_URL_RE = /\b(?:github|gitlab|bitbucket)\.com\/[\w./-]+/i;
export const FENCED_CODE_RE = /^```[a-z0-9_-]*\s*$/i;

export function isChainArtifactUnderDocs(filePath) {
  if (!DOCS_PREFIX_RE.test(filePath)) return false;
  const base = filePath.split("/").pop();
  if (/^.+-(?:PRD|FRS|TDD|TSR|BR-AC|openapi|asyncapi|clientapi)\.(?:md|yaml)$/.test(base)) return true;
  if (base === "SAD.md") return true;
  if (base === "business-invariants.md") return true;
  if (/^ADR-\d{4}-.+\.md$/.test(base)) return true;
  if (/^ADR-[a-z][a-z0-9-]*-\d{3}-.+\.md$/.test(base)) return true;
  return false;
}
