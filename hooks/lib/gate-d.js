// hooks/lib/gate-d.js
// Pure gate matchers for pre-write-check. Each function takes (filePath,
// content) and returns either null (gate passes / not applicable) or
// { gate, message } — caller writes message to stderr and exits 2.
//
// chain-cite-reject              — src/** chain-artifact cite rejection
// codebase-token-reject          — docs/** codebase-identifier rejection (a/b/c sub-cases)
// workspace-sad-container-floor  — workspace SAD + workspace c4-container.puml container floor

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "./yaml-mini.js";
import {
  SECRET_PATTERNS, SKIP_PATTERNS,
  CITE_DENYLIST_RE, SRC_PATH_RE, SRC_EXEMPT_EXT_RE,
  DOCS_CHAIN_PRDFRS_RE, SRC_PATH_TOKEN_RE,
  COMMIT_SHA_RE, BRANCH_RE, REPO_URL_RE, FENCED_CODE_RE,
  isChainArtifactUnderDocs,
} from "./cite-patterns.js";

export function checkSecrets(content) {
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (SKIP_PATTERNS.some(rx => rx.test(line))) continue;
    for (const { name, re } of SECRET_PATTERNS) {
      if (re.test(line)) {
        return {
          gate: "secrets",
          message: `pre-write-check: secrets — detected ${name} at line ${i + 1}. Use process.env or a placeholder.\n`,
        };
      }
    }
  }
  return null;
}

export function checkChainCiteReject(filePath, content) {
  if (!filePath) return null;
  if (!SRC_PATH_RE.test(filePath)) return null;
  if (SRC_EXEMPT_EXT_RE.test(filePath)) return null;
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(CITE_DENYLIST_RE);
    if (m) {
      return {
        gate: "chain-cite-reject",
        message: `pre-write-check: chain-cite-reject — chain-artifact cite '${m[0]}' at line ${i + 1} forbidden in <consumer>/src/**. Move to commit message / PR description / TSR S-VERDICT-* sections.\n`,
      };
    }
  }
  return null;
}

export function checkCodebaseTokenReject(filePath, content) {
  if (!filePath) return null;
  if (!isChainArtifactUnderDocs(filePath)) return null;
  const isPRDorFRS = DOCS_CHAIN_PRDFRS_RE.test(filePath);
  const lines = content.split(/\r?\n/);
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // (b) PRD/FRS fenced-code rejection — line-anchored ``` (optional lang tag)
    if (isPRDorFRS && FENCED_CODE_RE.test(line)) {
      return {
        gate: "codebase-token-reject",
        message: `pre-write-check: codebase-token-reject (b) — fenced code block at line ${i + 1} forbidden in PRD/FRS. PRD/FRS describe behavior; inline backtick spans for type names are allowed.\n`,
      };
    }

    if (FENCED_CODE_RE.test(line)) { inFence = !inFence; continue; }

    // (a) src/** path token rejection
    const sm = line.match(SRC_PATH_TOKEN_RE);
    if (sm) {
      return {
        gate: "codebase-token-reject",
        message: `pre-write-check: codebase-token-reject (a) — codebase path token '${sm[0].trim()}' at line ${i + 1} forbidden under docs/. Docs must be project-portable; describe shapes domain-only.\n`,
      };
    }

    // (c) commit SHA / branch / repo URL — outside fenced code blocks for SHA
    const cm = line.match(COMMIT_SHA_RE);
    if (cm && !inFence) {
      return {
        gate: "codebase-token-reject",
        message: `pre-write-check: codebase-token-reject (c) — commit SHA '${cm[0].trim()}' at line ${i + 1} forbidden under docs/. Portability: docs must not pin to a specific repo state.\n`,
      };
    }
    const bm = line.match(BRANCH_RE);
    if (bm) {
      return {
        gate: "codebase-token-reject",
        message: `pre-write-check: codebase-token-reject (c) — branch name '${bm[0]}' at line ${i + 1} forbidden under docs/.\n`,
      };
    }
    const rm = line.match(REPO_URL_RE);
    if (rm) {
      return {
        gate: "codebase-token-reject",
        message: `pre-write-check: codebase-token-reject (c) — repo URL '${rm[0]}' at line ${i + 1} forbidden under docs/.\n`,
      };
    }
  }
  return null;
}

// === workspace-sad-container-floor: workspace SAD + workspace c4-container.puml container floor ===

const WORKSPACE_CONTAINER_FLOOR = 2;

function readWorkspaceKind(cwd) {
  const root = cwd || process.cwd();
  const candidate = join(root, ".orchestra", "system.yaml");
  if (!existsSync(candidate)) return null;
  try {
    const text = readFileSync(candidate, "utf8");
    const parsed = parseYaml(text);
    return parsed?.workspace_kind || null;
  } catch { return null; }
}

function countSadContainerRows(content) {
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
  const m = content.match(/System_Boundary\s*\([^)]*\)\s*\{([\s\S]*?)\n\s*\}/);
  if (!m) return null;
  const matches = m[1].match(/\bContainer(?:Db|Queue|_Ext)?\s*\(/g);
  return matches ? matches.length : 0;
}

export function checkWorkspaceSadContainerFloor(filePath, content, cwd) {
  if (!filePath) return null;
  const base = filePath.split("/").pop();
  const isWorkspaceSad = base === "SAD.md" && /(^|\/)docs\/SAD\.md$/.test(filePath);
  const isWorkspaceContainerPuml =
    base === "c4-container.puml" && /(^|\/)docs\/diagrams\/c4-container\.puml$/.test(filePath);
  if (!isWorkspaceSad && !isWorkspaceContainerPuml) return null;

  const workspaceKind = readWorkspaceKind(cwd);
  if (workspaceKind !== "multi-repo") return null;

  if (isWorkspaceSad) {
    const rows = countSadContainerRows(content);
    if (rows !== null && rows < WORKSPACE_CONTAINER_FLOOR) {
      return {
        gate: "workspace-sad-container-floor",
        message: `pre-write-check: workspace-sad-container-floor — workspace SAD (workspace_kind: multi-repo) S-CONTAINERS-001 lists ${rows} container row(s); workspace SAD must enumerate ≥${WORKSPACE_CONTAINER_FLOOR} services as Containers. One service rendered as System() with siblings as System_Ext is a service-scope L1/L2 wearing a workspace label — see agents/architect.md "C4 scope continuity".\n`,
      };
    }
  }
  if (isWorkspaceContainerPuml) {
    const containers = countPumlContainersInBoundary(content);
    if (containers !== null && containers < WORKSPACE_CONTAINER_FLOOR) {
      return {
        gate: "workspace-sad-container-floor",
        message: `pre-write-check: workspace-sad-container-floor — workspace c4-container.puml inside System_Boundary declares ${containers} Container() entr(ies); workspace L2 must enumerate ≥${WORKSPACE_CONTAINER_FLOOR} services as Container — see agents/architect.md "C4 scope continuity".\n`,
      };
    }
  }
  return null;
}
