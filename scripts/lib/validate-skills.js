// scripts/lib/validate-skills.js
// Walks skills/*/SKILL.md and enforces:
//   - frontmatter present + parseable
//   - frontmatter has `name`, `description`, `origin`
//   - frontmatter `name` === parent folder name
//   - description ≤500 chars (descriptions are the auto-discovery surface;
//     trigger keywords + "Use when X" phrasings need room to land)
//   - body (post-frontmatter) ≤400 lines

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { parse as parseYaml } from "../../hooks/lib/yaml-mini.js";

export function walkSkills(root, errs) {
  const skillsDir = resolve(root, "skills");
  if (!existsSync(skillsDir)) return;
  const folders = readdirSync(skillsDir).filter(name => {
    try { return statSync(join(skillsDir, name)).isDirectory(); }
    catch { return false; }
  });
  for (const folder of folders) {
    const skillPath = join(skillsDir, folder, "SKILL.md");
    if (!existsSync(skillPath)) {
      errs.push(`skills/${folder}/: missing SKILL.md`);
      continue;
    }
    const raw = readFileSync(skillPath, "utf8");
    const fmMatch = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!fmMatch) {
      errs.push(`skills/${folder}/SKILL.md: missing or malformed frontmatter`);
      continue;
    }
    let fm;
    try { fm = parseYaml(fmMatch[1]); }
    catch (e) { errs.push(`skills/${folder}/SKILL.md: frontmatter parse error: ${e.message}`); continue; }
    for (const k of ["name", "description", "origin"]) {
      if (!fm || !fm[k]) errs.push(`skills/${folder}/SKILL.md: missing frontmatter key '${k}'`);
    }
    if (fm?.name && fm.name !== folder) {
      errs.push(`skills/${folder}/SKILL.md: frontmatter name '${fm.name}' ≠ folder '${folder}'`);
    }
    if (typeof fm?.description === "string" && fm.description.length > 500) {
      errs.push(`skills/${folder}/SKILL.md: description ${fm.description.length} chars > 500 cap`);
    }
    const bodyLines = fmMatch[2].split("\n").length;
    if (bodyLines > 400) {
      errs.push(`skills/${folder}/SKILL.md: body ${bodyLines} lines > 400 cap`);
    }
  }
}
