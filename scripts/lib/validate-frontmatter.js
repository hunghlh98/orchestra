// scripts/lib/validate-frontmatter.js
// Rule + command frontmatter validators + their dir walks.
// validateRuleContent / validateCommandContent are pure (testable in isolation).

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "../../hooks/lib/yaml-mini.js";

// Rule: frontmatter `paths` array required; body ≤40 lines.
export function validateRuleContent(relPath, raw) {
  const errs = [];
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) { errs.push(`${relPath}: missing or malformed frontmatter`); return errs; }
  let fm;
  try { fm = parseYaml(fmMatch[1]); }
  catch (e) { errs.push(`${relPath}: frontmatter parse error: ${e.message}`); return errs; }
  if (!fm || !Array.isArray(fm.paths)) {
    errs.push(`${relPath}: frontmatter missing 'paths' array`);
  } else {
    if (fm.paths.length === 0) errs.push(`${relPath}: 'paths' array is empty`);
    for (const p of fm.paths) {
      if (typeof p !== "string" || p.length === 0) {
        errs.push(`${relPath}: 'paths' entry must be non-empty string, got ${JSON.stringify(p)}`);
      }
    }
  }
  const bodyLines = fmMatch[2].split("\n").length;
  if (bodyLines > 40) errs.push(`${relPath}: body ${bodyLines} lines > 40 cap`);
  return errs;
}

// Command: frontmatter `name` + `description` required.
export function validateCommandContent(relPath, raw) {
  const errs = [];
  const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!fmMatch) { errs.push(`${relPath}: missing or malformed frontmatter`); return errs; }
  let fm;
  try { fm = parseYaml(fmMatch[1]); }
  catch (e) { errs.push(`${relPath}: frontmatter parse error: ${e.message}`); return errs; }
  for (const k of ["name", "description"]) {
    if (!fm || !fm[k] || typeof fm[k] !== "string") {
      errs.push(`${relPath}: missing frontmatter key '${k}'`);
    }
  }
  return errs;
}

export function walkRules(dir, errs, rel = "rules") {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const relPath = `${rel}/${entry}`;
    const st = statSync(full);
    if (st.isDirectory()) walkRules(full, errs, relPath);
    else if (st.isFile() && entry.endsWith(".md")) {
      const raw = readFileSync(full, "utf8");
      for (const e of validateRuleContent(relPath, raw)) errs.push(e);
    }
  }
}

export function walkCommands(dir, errs) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith(".md")) continue;
    const full = join(dir, entry);
    const relPath = `commands/${entry}`;
    const raw = readFileSync(full, "utf8");
    for (const e of validateCommandContent(relPath, raw)) errs.push(e);
  }
}
