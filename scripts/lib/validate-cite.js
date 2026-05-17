// scripts/lib/validate-cite.js
// Consumer-surface prose validators:
//   findLeakyCites          — '§' character forbidden in agents/, commands/, skills/
//   findVersionStamps       — version stamps + migration narration in consumer surface
//   findPhaseTagCompliance  — agents/lead.md must declare canonical phase values
//
// Pure functions (testable in isolation) + dir walks that mutate a shared errs[].

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

// === Leaky-cite check ===
// '§' in agents/ / commands/ / skills/ invariably points at internal dev docs
// (docs/PRD-001.md, DESIGN-NNN-*.md, etc.) that consumers don't have. Every
// such cite is either a phantom anchor or an inefficient deferred Read.
// Fix shape: inline the rule, drop the cite.
export function findLeakyCites(relPath, raw) {
  const errs = [];
  const lines = raw.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (/§/.test(lines[i])) {
      const snippet = lines[i].trim().slice(0, 80);
      errs.push(`${relPath}:${i + 1}: leaky '§' cite to dev-surface doc — '${snippet}'`);
    }
  }
  return errs;
}

export function walkLeakyCites(root, dir, errs) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walkLeakyCites(root, full, errs);
    else if (st.isFile() && entry.endsWith(".md")) {
      const relPath = full.slice(root.length + 1);
      const raw = readFileSync(full, "utf8");
      for (const e of findLeakyCites(relPath, raw)) errs.push(e);
    }
  }
}

// === Version-stamp check ===
// Plugin version lives in VERSION + plugin.json + package.json. Sprinkling it
// into rules makes every release drift the prose.
// vN.M-(brief|design) doc-anchor leaks are cite-purity's job, not this one.
export const VERSION_STAMP_PATTERNS = [
  { name: "parenthetical",       re: /\(v\d+\.\d+(?:\.\d+)?\)/,                              why: "(vN.M) parenthetical version stamp" },
  { name: "pre-version",         re: /\bpre-v\d+\.\d+/i,                                     why: "pre-vN.M migration-narration prefix" },
  { name: "migration-verb",      re: /\b(?:GONE|dropped|removed)\s+in\s+v\d+\.\d+/i,         why: "migration narration (GONE/dropped/removed in vN.M)" },
  { name: "in-version-rule",     re: /\bin\s+v\d+\.\d+\b/i,                                  why: "'in vN.M …' rule version-stamp" },
  { name: "the-version-descr",   re: /\bthe\s+v\d+\.\d+\s+[a-z][a-z-]+/i,                    why: "'the vN.M <descriptor>' version-stamp on a current-state rule" },
  { name: "standalone-3segment", re: /(?<![\/\-\w@])\bv\d+\.\d+\.\d+(?![\/\-\w])/,           why: "standalone vN.M.P version stamp" },
  { name: "future-open",         re: /\bv\d+\.\d+\+/,                                        why: "future-version stamp 'vN.M+'" },
  { name: "migration-narration", re: /\b(?:formerly|previously\s+called|previously\s+named|no\s+longer\s+authors|sidecars\s+are\s+gone|are\s+gone\b|is\s+gone\b|was\s+gone\b|absorbs\s+what\s+\S+\s+previously)/i, why: "migration narration without version number" },
];

// Whole-file exemptions per CLAUDE.md "Allowed" list.
export const VERSION_STAMP_EXEMPT_FILES = [
  /^skills\/plantuml\/references\//,
  /^skills\/[^/]+\/LICENSE$/,
  /^skills\/clean-architecture\/SKILL\.md$/,
  /^skills\/commit-message\/SKILL\.md$/,
];

export function findVersionStamps(relPath, raw) {
  if (VERSION_STAMP_EXEMPT_FILES.some(re => re.test(relPath))) return [];
  const errs = [];
  const lines = raw.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^origin:\s/.test(line)) continue;
    for (const { name, re, why } of VERSION_STAMP_PATTERNS) {
      if (re.test(line)) {
        const snippet = line.trim().slice(0, 80);
        errs.push(`${relPath}:${i + 1}: version-stamp [${name}] — ${why} — '${snippet}'`);
        break;
      }
    }
  }
  return errs;
}

export function walkVersionStamps(root, dir, errs) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walkVersionStamps(root, full, errs);
    else if (st.isFile() && entry.endsWith(".md")) {
      const relPath = full.slice(root.length + 1);
      const raw = readFileSync(full, "utf8");
      for (const e of findVersionStamps(relPath, raw)) errs.push(e);
    }
  }
}

// === Phase-tag emission compliance ===
// agents/lead.md MUST declare the canonical phase values consumed by
// hooks/scripts/metrics-collector.js (regex /^phase:\s*([a-z-]+)/m).
export const PHASE_VALUES = ["discovery", "spec-draft", "verification", "gap-resolution", "gate"];

export function findPhaseTagCompliance(raw) {
  const errs = [];
  if (!/^### Phase-tag emission$/m.test(raw)) {
    errs.push("agents/lead.md: missing '### Phase-tag emission' subsection (consumed by metrics-collector.js)");
    return errs;
  }
  const startMatch = /^### Phase-tag emission$/m.exec(raw);
  const after = raw.slice(startMatch.index);
  const nextHeading = /\n(?:### |## )/.exec(after.slice(1));
  const section = nextHeading ? after.slice(0, nextHeading.index + 1) : after;
  for (const phase of PHASE_VALUES) {
    if (!section.includes(phase)) {
      errs.push(`agents/lead.md: '### Phase-tag emission' subsection missing canonical phase value '${phase}'`);
    }
  }
  return errs;
}

export function runConsumerSurfaceChecks(root, errs) {
  for (const r of ["agents", "commands", "skills"]) {
    walkLeakyCites(root, resolve(root, r), errs);
  }
  for (const r of ["agents", "commands", "skills", "schemas", "hooks/calibration", "hooks/references"]) {
    walkVersionStamps(root, resolve(root, r), errs);
  }
  const leadPath = resolve(root, "agents/lead.md");
  if (existsSync(leadPath)) {
    for (const e of findPhaseTagCompliance(readFileSync(leadPath, "utf8"))) errs.push(e);
  }
}
