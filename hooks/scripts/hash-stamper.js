#!/usr/bin/env node
// hooks/scripts/hash-stamper.js
// PreToolUse hook: stamps section hashes into orchestra artifact frontmatter.
// See PRD §8.13 / DESIGN-001-infra §3.3.
//
// Invariant: this hook NEVER blocks a write. On any error, output a passthrough
// "allow" decision so the original tool_input proceeds unchanged.

import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, serialize } from "../lib/yaml-mini.js";
import { hashSections } from "../lib/section-hash.js";

const NAME = "ORCHESTRA_HOOK_HASH_STAMPER";

if (process.env[NAME] === "off") {
  passthrough();
  process.exit(0);
}

main().catch(err => {
  process.stderr.write(`hash-stamper crashed: ${err.message}\n`);
  passthrough();
  process.exit(0);
});

async function main() {
  const stdin = await readStdin();
  let input;
  try { input = JSON.parse(stdin); }
  catch { passthrough(); return; }

  const filePath = input?.tool_input?.file_path;
  const content = input?.tool_input?.content;
  if (typeof filePath !== "string" || typeof content !== "string") {
    passthrough();
    return;
  }

  // Only act on orchestra artifacts.
  const isMd = filePath.endsWith(".md");
  const isOpenApi = filePath.endsWith(".openapi.yaml");
  const isOrchestra = filePath.includes("/.claude/.orchestra/");
  if (!isOrchestra || !(isMd || isOpenApi)) {
    passthrough();
    return;
  }

  const root = projectRootFor(filePath);
  let rewritten = content;
  if (isMd) {
    rewritten = stampMarkdown(content, root);
  }
  // .openapi.yaml passthrough in v1.0.0 PR #2 — full whole-file hash arrives
  // when API artifacts ship in PR #5+.

  const updatedInput = { ...input.tool_input, content: rewritten };
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
      updatedInput,
    },
  }));
}

function passthrough() {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
    },
  }));
}

function readStdin() {
  return new Promise((res, rej) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", c => { data += c; });
    process.stdin.on("end", () => res(data));
    process.stdin.on("error", rej);
  });
}

function projectRootFor(filePath) {
  const idx = filePath.indexOf("/.claude/.orchestra/");
  if (idx < 0) return process.cwd();
  return filePath.slice(0, idx);
}

function stampMarkdown(content, root) {
  const fm = extractFrontmatter(content);
  if (!fm) return content;

  let parsed;
  try { parsed = parse(fm.text); }
  catch { return content; } // grammar violation; let validate-drift report it

  // Stamp section hashes in body
  const hashes = hashSections(fm.body);
  if (!parsed.sections || typeof parsed.sections !== "object") parsed.sections = {};
  for (const { id, hash } of hashes) {
    const existing = parsed.sections[id] || {};
    parsed.sections[id] = { ...existing, hash };
  }

  // Resolve TBD references
  if (Array.isArray(parsed.references)) {
    for (const ref of parsed.references) {
      const haw = ref["hash-at-write"];
      if (haw === "TBD" || haw === undefined || haw === null) {
        const upstreamPath = resolveUpstream(ref.type, ref.id, root);
        ref["hash-at-write"] = lookupUpstreamHash(upstreamPath, ref.section);
      }
    }
  }

  const newFm = serialize(parsed);
  return `---\n${newFm}\n---\n${fm.body}`;
}

function extractFrontmatter(content) {
  const norm = content.replace(/\r\n/g, "\n");
  if (!norm.startsWith("---\n")) return null;
  const end = norm.indexOf("\n---\n", 4);
  if (end < 0) return null;
  return {
    text: norm.slice(4, end),
    body: norm.slice(end + 5),
  };
}

const SINGLETONS = {
  sad: (_id, root) => join(root, ".claude/.orchestra/architecture/SAD.md"),
  runbook: (id, root) => join(root, `.claude/.orchestra/runbooks/RUNBOOK-${id}.md`),
  release: (id, root) => join(root, `.claude/.orchestra/releases/RELEASE-${id}.md`),
};

const PIPELINE_TYPES = new Set([
  "prd", "frs", "tdd", "contract", "test", "code-review", "doc",
  "impl-be", "impl-fe", "code-design-be", "code-design-fe", "plan",
]);

function resolveUpstream(type, id, root) {
  if (typeof type !== "string") return null;
  if (SINGLETONS[type]) return SINGLETONS[type](id, root);
  if (type === "api") return join(root, `.claude/.orchestra/pipeline/${id}/API-${id}.openapi.yaml`);
  if (PIPELINE_TYPES.has(type)) {
    const TYPE = type.toUpperCase();
    return join(root, `.claude/.orchestra/pipeline/${id}/${TYPE}-${id}.md`);
  }
  return null;
}

function lookupUpstreamHash(path, section) {
  if (!path || !existsSync(path)) return "TBD-UNRESOLVED";
  try {
    const content = readFileSync(path, "utf8");
    const fm = extractFrontmatter(content);
    if (!fm) return "TBD-UNRESOLVED";
    const parsed = parse(fm.text);
    const hash = parsed?.sections?.[section]?.hash;
    return typeof hash === "string" && hash !== "TBD" ? hash : "TBD-UNRESOLVED";
  } catch {
    return "TBD-UNRESOLVED";
  }
}
