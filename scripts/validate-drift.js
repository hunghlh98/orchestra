#!/usr/bin/env node
// scripts/validate-drift.js
// Walks orchestra artifacts; emits DRIFT-REPORT.md.
// See DESIGN-001-infra §5 for the algorithm.
//
// Exit code is always 0 — this is a reporter, not an enforcer.
// The release gate (PRD §11.2) reads the report and blocks on severity=fail.

import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "../hooks/lib/yaml-mini.js";
import { hashSections } from "../hooks/lib/section-hash.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const orchestraDir = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(repoRoot, ".claude/.orchestra");

const SINGLETONS = {
  sad: (_id) => join(orchestraDir, "architecture/SAD.md"),
  runbook: (id) => join(orchestraDir, `runbooks/RUNBOOK-${id}.md`),
  release: (id) => join(orchestraDir, `releases/RELEASE-${id}.md`),
};
// Type → folder under pipeline/<feature_id>/. See schemas/pipeline-artifact.schema.md.
const TYPE_FOLDER = {
  prd: "requirements",
  frs: "requirements",
  contract: "interfaces",
  api: "interfaces",
  tdd: "design",
  tasks: "plan",
  plan: "plan",
  "impl-notes": "plan",
  "impl-be": "plan",
  "impl-fe": "plan",
  "code-design-be": "plan",
  "code-design-fe": "plan",
  test: "verify",
  "code-review": "verify",
  verdict: "verify",
  doc: "verify",
};
function numericPrefix(id) {
  if (typeof id !== "string") return id;
  const m = id.match(/^(\d+)/);
  return m ? m[1] : id;
}

main();

function main() {
  const artifacts = walkArtifacts();
  if (artifacts.length === 0) {
    // True no-op when orchestraDir doesn't exist: do not spontaneously create
    // metrics/ or DRIFT-REPORT.md in a fresh consumer repo. Real activity
    // creates orchestraDir; we only annotate it once it does.
    if (existsSync(orchestraDir)) {
      writeReport({ findings: [], inferred: [], walked: 0 });
      emitMetrics({ fail_count: 0, warn_count: 0, artifacts_walked: 0 });
    }
    console.log("validate-drift.js: OK (no artifacts found — pass-by-default per Q7)");
    process.exit(0);
  }

  const parsed = artifacts.map(p => analyzeArtifact(p));
  const findings = [];
  const inferredIndex = new Map(); // "path#sectionId" -> { path, section, refCount }

  for (const a of parsed) {
    if (a.parseError) {
      findings.push({ severity: "fail", artifact: a.relPath, type: "frontmatter-parse-failed", reason: a.parseError });
      continue;
    }
    // Hash recompute check
    for (const { id, hash } of a.bodyHashes) {
      const recorded = a.fm?.sections?.[id]?.hash;
      if (recorded && recorded !== "TBD" && recorded !== hash) {
        findings.push({
          severity: "fail",
          artifact: a.relPath,
          type: "frontmatter-out-of-sync",
          section: id,
          reason: `recorded ${recorded.slice(0, 16)}... != computed ${hash.slice(0, 16)}...`,
        });
      }
    }
    // Track inferred sections for the summary block
    for (const [id, sec] of Object.entries(a.fm?.sections || {})) {
      if (sec && sec.inferred === true) {
        inferredIndex.set(`${a.path}#${id}`, { path: a.relPath, section: id, refCount: 0 });
      }
    }
  }

  // Reference checks (second pass — needs all artifacts indexed)
  const byPath = new Map(parsed.map(a => [a.path, a]));
  for (const a of parsed) {
    if (a.parseError) continue;
    const refs = a.fm?.references;
    if (!Array.isArray(refs)) continue;
    for (const ref of refs) {
      const upstreamPath = resolveUpstream(ref.type, ref.id);
      const upstream = upstreamPath ? byPath.get(upstreamPath) : null;
      const haw = ref["hash-at-write"];

      if (haw === "TBD-UNRESOLVED") {
        findings.push({
          severity: "warn",
          artifact: a.relPath,
          type: "reference-unresolved",
          reason: `(${ref.type}, ${ref.id}, ${ref.section}) -> not found at write time`,
        });
        continue;
      }

      if (!upstream) {
        findings.push({
          severity: "fail",
          artifact: a.relPath,
          type: "upstream-vanished",
          reason: `(${ref.type}, ${ref.id}, ${ref.section}) -> ${upstreamPath || "unresolvable"}`,
        });
        continue;
      }

      const upstreamSection = upstream.fm?.sections?.[ref.section];
      if (!upstreamSection) {
        findings.push({
          severity: "fail",
          artifact: a.relPath,
          type: "upstream-section-missing",
          reason: `(${ref.type}, ${ref.id}, ${ref.section}) -> upstream has no such section`,
        });
        continue;
      }

      // Bump inferredIndex refCount for inferred upstream sections
      if (upstreamSection.inferred === true) {
        const key = `${upstream.path}#${ref.section}`;
        const e = inferredIndex.get(key);
        if (e) e.refCount++;
      }

      if (upstreamSection.hash && upstreamSection.hash !== haw) {
        if (upstreamSection.confirmed === true) {
          findings.push({
            severity: "fail",
            artifact: a.relPath,
            type: "drift-on-confirmed",
            section: ref.section,
            reason: `upstream ${ref.type}:${ref.id}:${ref.section} hash drifted (confirmed)`,
          });
        } else if (upstreamSection.inferred === true) {
          findings.push({
            severity: "warn",
            artifact: a.relPath,
            type: "drift-on-inferred",
            section: ref.section,
            reason: `upstream ${ref.type}:${ref.id}:${ref.section} hash drifted (inferred — pending confirmation)`,
          });
        }
      }
    }
  }

  const inferred = Array.from(inferredIndex.values()).sort((a, b) => b.refCount - a.refCount);
  const failCount = findings.filter(f => f.severity === "fail").length;
  const warnCount = findings.filter(f => f.severity === "warn").length;

  writeReport({ findings, inferred, walked: artifacts.length });
  emitMetrics({ fail_count: failCount, warn_count: warnCount, artifacts_walked: artifacts.length });
  console.log(`validate-drift.js: OK (${artifacts.length} artifacts walked, ${failCount} fail, ${warnCount} warn)`);
  process.exit(0);
}

function walkArtifacts() {
  const out = [];
  for (const sub of ["pipeline", "architecture", "runbooks", "releases"]) {
    out.push(...walk(join(orchestraDir, sub)));
  }
  return out;
}

function walk(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(full));
    else if (ent.name.endsWith(".md") || ent.name.endsWith(".openapi.yaml")) out.push(full);
  }
  return out;
}

function analyzeArtifact(path) {
  const relPath = path.startsWith(orchestraDir) ? path.slice(orchestraDir.length + 1) : path;
  let content;
  try { content = readFileSync(path, "utf8"); }
  catch (e) { return { path, relPath, parseError: `read failed: ${e.message}` }; }

  const fmExtracted = extractFrontmatter(content);
  if (!fmExtracted) return { path, relPath, parseError: "missing frontmatter" };

  let fm;
  try { fm = parse(fmExtracted.text); }
  catch (e) { return { path, relPath, parseError: e.message }; }

  const bodyHashes = path.endsWith(".md") ? hashSections(fmExtracted.body) : [];
  return { path, relPath, fm, bodyHashes };
}

function extractFrontmatter(content) {
  const norm = content.replace(/\r\n/g, "\n");
  if (!norm.startsWith("---\n")) return null;
  const end = norm.indexOf("\n---\n", 4);
  if (end < 0) return null;
  return { text: norm.slice(4, end), body: norm.slice(end + 5) };
}

function resolveUpstream(type, id) {
  if (typeof type !== "string") return null;
  if (SINGLETONS[type]) return SINGLETONS[type](id);
  const folder = TYPE_FOLDER[type];
  if (!folder) return null;
  const TYPE = type.toUpperCase();
  const num = numericPrefix(id);
  const ext = type === "api" ? "openapi.yaml" : "md";
  return join(orchestraDir, `pipeline/${id}/${folder}/${num}-${TYPE}.${ext}`);
}

function writeReport({ findings, inferred, walked }) {
  if (!existsSync(orchestraDir)) mkdirSync(orchestraDir, { recursive: true });
  const failCount = findings.filter(f => f.severity === "fail").length;
  const warnCount = findings.filter(f => f.severity === "warn").length;
  const lines = [];
  lines.push("# DRIFT-REPORT");
  lines.push("");
  lines.push(`Generated by validate-drift.js. ${walked} artifact(s) walked.`);
  lines.push("");

  lines.push("## Inferred sections needing review");
  lines.push("");
  if (inferred.length === 0) {
    lines.push("_None._");
  } else {
    lines.push("| artifact | section | refCount |");
    lines.push("|---|---|---|");
    for (const { path, section, refCount } of inferred) {
      lines.push(`| ${path} | ${section} | ${refCount} |`);
    }
  }
  lines.push("");

  lines.push("## Drift findings");
  lines.push("");
  if (findings.length === 0) {
    lines.push("_No findings._");
  } else {
    const grouped = new Map();
    for (const f of findings) {
      if (!grouped.has(f.artifact)) grouped.set(f.artifact, []);
      grouped.get(f.artifact).push(f);
    }
    for (const [artifact, items] of grouped) {
      lines.push(`### ${artifact}`);
      lines.push("");
      for (const f of items) {
        const sec = f.section ? ` | section: ${f.section}` : "";
        lines.push(`- severity: ${f.severity} | type: ${f.type}${sec} | ${f.reason}`);
      }
      lines.push("");
    }
  }

  lines.push("## Summary");
  lines.push("");
  lines.push(`- artifacts_walked: ${walked}`);
  lines.push(`- fail_count: ${failCount}`);
  lines.push(`- warn_count: ${warnCount}`);
  lines.push("");

  writeFileSync(join(orchestraDir, "DRIFT-REPORT.md"), lines.join("\n"));
}

function emitMetrics({ fail_count, warn_count, artifacts_walked }) {
  const metricsDir = join(orchestraDir, "metrics");
  const eventsPath = join(metricsDir, "events.jsonl");
  try {
    if (!existsSync(metricsDir)) mkdirSync(metricsDir, { recursive: true });
    const event = {
      ts: new Date().toISOString(),
      event: "validate-drift.completed",
      fail_count,
      warn_count,
      artifacts_walked,
    };
    appendFileSync(eventsPath, JSON.stringify(event) + "\n");
  } catch {
    // Metrics best-effort; never blocks the validator.
  }
}
