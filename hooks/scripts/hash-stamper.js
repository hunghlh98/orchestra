#!/usr/bin/env node
// hooks/scripts/hash-stamper.js
// PreToolUse hook: stamps section hashes into orchestra artifact LOCKFILES
// (v2.0.0 sidecar mode — see schemas/lockfile.schema.md and
// docs/DESIGN-005-doc-output-overhaul.md §S-HASHSTAMPER-001).
//
// Branches:
//   .md / .openapi.yaml under .orchestra/  → only-when-paired (H1):
//                                              if <stem>.lock.yaml exists,
//                                              stamp into it; else passthrough.
//   .puml / .svg under .orchestra/         → walk sibling .lock.yaml files;
//                                              update diagrams[].source_hash
//                                              or .rendered_hash on match.
//   anything else                          → passthrough.
//
// Invariant (preserved from v1): this hook NEVER blocks a write. On any error,
// emit a passthrough "allow" decision so the original tool_input proceeds.

import { readFileSync, existsSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, resolve, join, basename, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parse, serialize } from "../lib/yaml-mini.js";
import { hashSections, computeHash } from "../lib/section-hash.js";

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

  const isOrchestra = filePath.includes("/.claude/.orchestra/");
  if (!isOrchestra) {
    passthrough();
    return;
  }

  const isMd = filePath.endsWith(".md");
  const isOpenApi = filePath.endsWith(".openapi.yaml");
  const isPuml = filePath.endsWith(".puml");
  const isSvg = filePath.endsWith(".svg");

  if (isMd || isOpenApi) {
    stampArtifact(filePath, content, isOpenApi);
    passthrough(); // body is not mutated under sidecar mode
    return;
  }

  if (isPuml || isSvg) {
    stampDiagram(filePath, content, isPuml ? "source_hash" : "rendered_hash");
    passthrough();
    return;
  }

  passthrough();
}

function passthrough(updatedInput) {
  const out = {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "allow",
    },
  };
  if (updatedInput) out.hookSpecificOutput.updatedInput = updatedInput;
  process.stdout.write(JSON.stringify(out));
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

// === Artifact path → lockfile resolution ===

function lockfilePathFor(artifactPath) {
  // Replace .md or .openapi.yaml with .lock.yaml. The double-dot in
  // .openapi.yaml is intentional — the stem is everything before the LAST .ext.
  if (artifactPath.endsWith(".openapi.yaml")) {
    return artifactPath.slice(0, -".openapi.yaml".length) + ".lock.yaml";
  }
  if (artifactPath.endsWith(".md")) {
    return artifactPath.slice(0, -".md".length) + ".lock.yaml";
  }
  return null;
}

function projectRootFor(filePath) {
  const idx = filePath.indexOf("/.claude/.orchestra/");
  if (idx < 0) return process.cwd();
  return filePath.slice(0, idx);
}

// === .md / .openapi.yaml branch ===

function stampArtifact(filePath, content, isOpenApi) {
  const lockPath = lockfilePathFor(filePath);
  if (!lockPath || !existsSync(lockPath)) return; // only-when-paired

  let lockText;
  try { lockText = readFileSync(lockPath, "utf8"); }
  catch { return; }

  let lockfile;
  try { lockfile = parse(lockText); }
  catch { return; }
  if (!lockfile || typeof lockfile !== "object") return;

  // Compute body hashes from the WRITTEN content (tool_input.content), not from
  // disk — disk has the pre-write state.
  if (isOpenApi) {
    // Whole-file hash. The .openapi.yaml file has YAML at top level (not
    // markdown frontmatter); hash the whole content with CRLF→LF normalization
    // for cross-platform stability.
    const normalized = content.replace(/\r\n/g, "\n");
    const hash = computeHash(normalized);
    if (!lockfile.sections || typeof lockfile.sections !== "object") lockfile.sections = {};
    const existing = lockfile.sections["S-API-001"] || {};
    lockfile.sections["S-API-001"] = { ...existing, hash };
  } else {
    // .md — anchor walk over body (after frontmatter).
    const fmExtracted = extractFrontmatter(content);
    const body = fmExtracted ? fmExtracted.body : content;
    const hashes = hashSections(body);
    if (!lockfile.sections || typeof lockfile.sections !== "object") lockfile.sections = {};
    for (const { id, hash } of hashes) {
      const existing = lockfile.sections[id] || {};
      lockfile.sections[id] = { ...existing, hash };
    }
  }

  // Resolve TBD references via upstream lockfile (preferred) or upstream
  // frontmatter (legacy fallback during v1→v2 transition).
  if (Array.isArray(lockfile.references)) {
    const root = projectRootFor(filePath);
    for (const ref of lockfile.references) {
      const haw = ref["hash-at-write"];
      if (haw === "TBD" || haw === undefined || haw === null) {
        const upstreamPath = resolveUpstream(ref.type, ref.id, root);
        ref["hash-at-write"] = lookupUpstreamHash(upstreamPath, ref.section);
      }
    }
  }

  try {
    writeFileSync(lockPath, serialize(lockfile) + "\n");
  } catch {
    // Lockfile write failed; passthrough preserves the artifact write.
  }
}

function extractFrontmatter(content) {
  const norm = content.replace(/\r\n/g, "\n");
  if (!norm.startsWith("---\n")) return null;
  const end = norm.indexOf("\n---\n", 4);
  if (end < 0) return null;
  return { text: norm.slice(4, end), body: norm.slice(end + 5) };
}

// === Upstream resolution (preserved from v1; stays in sync with validate-drift.js) ===

const SINGLETONS = {
  sad: (_id, root) => join(root, ".claude/.orchestra/architecture/SAD.md"),
  runbook: (id, root) => join(root, `.claude/.orchestra/runbooks/RUNBOOK-${id}.md`),
  release: (id, root) => join(root, `.claude/.orchestra/releases/RELEASE-${id}.md`),
};

const TYPE_FOLDER = {
  // v2 canon
  charter: "charter",
  prd: "requirements",
  frs: "requirements",
  contract: "interfaces",
  api: "interfaces",
  tdd: "design",
  tasks: "plan",
  test: "verify",
  tsr: "verify",
  // v1 legacy types still readable during transition
  plan: "plan",
  "impl-notes": "plan",
  "impl-be": "plan",
  "impl-fe": "plan",
  "code-design-be": "plan",
  "code-design-fe": "plan",
  "code-review": "verify",
  verdict: "verify",
  doc: "verify",
};

function numericPrefix(id) {
  if (typeof id !== "string") return id;
  const m = id.match(/^(\d+)/);
  return m ? m[1] : id;
}

function resolveUpstream(type, id, root) {
  if (typeof type !== "string") return null;
  // ADR is global; lives at architecture/decisions/<id>.md (id IS the full ADR-NNNN-slug stem)
  if (type === "adr") {
    return join(root, `.claude/.orchestra/architecture/decisions/${id}.md`);
  }
  if (SINGLETONS[type]) return SINGLETONS[type](id, root);
  const folder = TYPE_FOLDER[type];
  if (!folder) return null;
  const TYPE = type.toUpperCase();
  const num = numericPrefix(id);
  const ext = type === "api" ? "openapi.yaml" : "md";
  return join(root, `.claude/.orchestra/pipeline/${id}/${folder}/${num}-${TYPE}.${ext}`);
}

function lookupUpstreamHash(artifactPath, section) {
  if (!artifactPath) return "TBD-UNRESOLVED";
  // Prefer upstream lockfile (v2). Fall back to inline frontmatter (v1 legacy).
  const lockPath = lockfilePathFor(artifactPath);
  if (lockPath && existsSync(lockPath)) {
    try {
      const parsed = parse(readFileSync(lockPath, "utf8"));
      const hash = parsed?.sections?.[section]?.hash;
      if (typeof hash === "string" && hash !== "TBD") return hash;
    } catch { /* fall through to legacy */ }
  }
  if (!existsSync(artifactPath)) return "TBD-UNRESOLVED";
  try {
    const fm = extractFrontmatter(readFileSync(artifactPath, "utf8"));
    if (!fm) return "TBD-UNRESOLVED";
    const parsed = parse(fm.text);
    const hash = parsed?.sections?.[section]?.hash;
    return typeof hash === "string" && hash !== "TBD" ? hash : "TBD-UNRESOLVED";
  } catch {
    return "TBD-UNRESOLVED";
  }
}

// === .puml / .svg branch ===

// A diagram file at `<artifact-dir>/diagrams/<file>.<ext>` is owned by some
// `<artifact-dir>/<stem>.lock.yaml`. Walk siblings; find the lockfile whose
// `diagrams[]` lists this file as `source` or `rendered`; update that entry.
function stampDiagram(diagramPath, content, hashKey /* "source_hash" | "rendered_hash" */) {
  // The .orchestra/diagrams/ tree only contains one level of nesting today
  // (artifact-dir/diagrams/<file>). The owning lockfile is the artifact-dir's
  // sibling. If conventions later change, broaden this walk.
  const diagramDir = dirname(diagramPath);                  // .../<artifact-dir>/diagrams
  if (basename(diagramDir) !== "diagrams") return;
  const artifactDir = dirname(diagramDir);                  // .../<artifact-dir>
  if (!existsSync(artifactDir)) return;

  const normalized = content.replace(/\r\n/g, "\n");
  const newHash = computeHash(normalized);
  const diagramBasename = basename(diagramPath);

  let entries;
  try { entries = readdirSync(artifactDir); }
  catch { return; }

  for (const entry of entries) {
    if (!entry.endsWith(".lock.yaml")) continue;
    const lockPath = join(artifactDir, entry);
    let lockText;
    try { lockText = readFileSync(lockPath, "utf8"); }
    catch { continue; }
    let lockfile;
    try { lockfile = parse(lockText); }
    catch { continue; }
    if (!lockfile || !Array.isArray(lockfile.diagrams)) continue;

    let matched = false;
    for (const diag of lockfile.diagrams) {
      if (!diag) continue;
      const sourceMatch = typeof diag.source === "string" && basename(diag.source) === diagramBasename;
      const renderedMatch = typeof diag.rendered === "string" && basename(diag.rendered) === diagramBasename;
      // For .puml writes: only update entries where the source path matches.
      // For .svg writes: only update entries where the rendered path matches.
      if (hashKey === "source_hash" && sourceMatch) { diag.source_hash = newHash; matched = true; }
      if (hashKey === "rendered_hash" && renderedMatch) { diag.rendered_hash = newHash; matched = true; }
    }

    if (matched) {
      try { writeFileSync(lockPath, serialize(lockfile) + "\n"); }
      catch { /* passthrough */ }
      return; // first matching lockfile wins; one diagram has one owner
    }
  }
}
