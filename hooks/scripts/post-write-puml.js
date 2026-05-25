#!/usr/bin/env node
// hooks/scripts/post-write-puml.js
// Render-enforcement for .puml writes.
//
// On PostToolUse(Write|Edit|MultiEdit) targeting a *.puml file, invoke the
// plantuml CLI to produce a paired .svg next to the source. After rendering,
// check the parent dir's *.md frontmatter for a `diagrams: [...]` array
// listing the puml's stable id; emit a non-blocking stderr warning when the
// puml is not declared as a sub-artifact of any sibling SAD/TDD.
//
// PostToolUse hooks are observers — never blocks the write. plantuml binary
// resolution: PLANTUML_JAR env var → ~/plantuml.jar → `plantuml` on PATH.
// Missing binary or render failure is a non-blocking warning.
//
// Opt-out: ORCHESTRA_HOOK_POST_WRITE_PUML=off.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, basename, join, extname } from "node:path";
import { homedir } from "node:os";
import { parse as parseYaml } from "../lib/yaml-mini.js";
import { readBoundedStdin } from "../lib/stdin-bounded.js";

const NAME = "ORCHESTRA_HOOK_POST_WRITE_PUML";

if (process.env[NAME] === "off") {
  process.exit(0);
}

main();

async function main() {
  try {
    const r = await readBoundedStdin();
    if (r.overflow) {
      process.stderr.write(`post-write-puml: stdin exceeded 1 MiB cap (${r.bytes} bytes) — skipping\n`);
      process.exit(0);
    }
    const input = JSON.parse(r.text);

    const filePath = input?.tool_input?.file_path;
    if (typeof filePath !== "string" || !filePath.endsWith(".puml")) {
      process.exit(0);
    }
    if (!existsSync(filePath)) {
      // Write may not have flushed yet, or path was a target removed by Edit.
      process.exit(0);
    }

    const svgPath = filePath.replace(/\.puml$/, ".svg");
    const renderResult = renderPuml(filePath);
    if (!renderResult.ok) {
      process.stderr.write(`post-write-puml: render failed for ${filePath} — ${renderResult.reason}\n`);
      process.exit(0);
    }

    // PlantUML often exits 0 even when the produced SVG is an error frame
    // (e.g., C4-PlantUML preprocessor errors from escaped-quote-in-macro-arg).
    // Inspect the SVG for known error signatures and emit a structured warning
    // so a reader scanning hook output can spot a broken diagram.
    const errorSignature = detectErrorFrame(svgPath);
    if (errorSignature) {
      process.stderr.write(
        `<post-write-puml-warning>\n` +
        `  source: ${filePath}\n` +
        `  output: ${svgPath}\n` +
        `  signature: ${errorSignature}\n` +
        `  hint: PlantUML produced an error-frame SVG. Common cause: escaped \\"...\\" inside a C4 macro argument. The C4-PlantUML stdlib parses macro args as preprocessor expressions; escaped quotes inside an already-quoted string fork the parser. Use single quotes ('/x') or unicode quotes («/x»), or drop the inner quotes.\n` +
        `</post-write-puml-warning>\n`
      );
    }

    // Check the puml's stable id against `diagrams: [...]` frontmatter on
    // sibling SAD/TDD markdown(s). Convention: <feature-dir>/diagrams/<id>.puml
    // is declared in <feature-dir>/<TYPE>-NNN.md frontmatter as
    //   diagrams: [<id>, ...]
    // (system-level SAD lives at docs/SAD.md with diagrams: alongside).
    const diagramsDir = dirname(filePath);
    const parentDir = dirname(diagramsDir);
    const pumlId = basename(filePath, ".puml");

    let referenced = false;
    try {
      for (const f of readdirSync(parentDir)) {
        if (!f.endsWith(".md")) continue;
        const md = readFileSync(join(parentDir, f), "utf8");
        const fmMatch = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        if (!fmMatch) continue;
        let fm = null;
        try { fm = parseYaml(fmMatch[1]); } catch { continue; }
        if (Array.isArray(fm?.diagrams) && fm.diagrams.includes(pumlId)) {
          referenced = true;
          break;
        }
      }
    } catch {
      // best-effort
    }

    if (!referenced) {
      process.stderr.write(`post-write-puml: warning — ${pumlId} not listed in any sibling SAD/TDD frontmatter \`diagrams: [...]\` array (non-blocking)\n`);
    }

    process.exit(0);
  } catch (err) {
    process.stderr.write(`post-write-puml: crash (non-blocking) — ${err.message}\n`);
    process.exit(0);
  }
}

// PlantUML emits an error-frame SVG (process exits 0, file written) when the
// source fails preprocessor / parser checks. Scan the SVG for known signatures
// and return the matched text, or null when the render appears clean.
function detectErrorFrame(svgPath) {
  if (!existsSync(svgPath)) return null;
  let svg;
  try {
    svg = readFileSync(svgPath, "utf8");
  } catch {
    return null;
  }
  // Conservative pattern set — each entry is a known PlantUML / C4-PlantUML
  // error-frame fragment. Add cases here as new failure shapes surface.
  const patterns = [
    /Syntax Error\??/i,
    /unquoted function\/procedure cannot use expression/i,
    /cannot use expression/i,
    /\(\(See https?:\/\/.*plantuml/i,
  ];
  for (const re of patterns) {
    const m = svg.match(re);
    if (m) return m[0];
  }
  return null;
}

function renderPuml(filePath) {
  const jarPath = process.env.PLANTUML_JAR || join(homedir(), "plantuml.jar");
  const outDir = dirname(filePath);

  // Try jar first (most common install).
  if (existsSync(jarPath)) {
    const r = spawnSync("java", ["-jar", jarPath, "-tsvg", "-output", outDir, filePath], {
      encoding: "utf8",
      timeout: 30_000,
    });
    if (r.status === 0) return { ok: true, via: "jar" };
    return { ok: false, reason: `java -jar ${jarPath} exit ${r.status}: ${r.stderr || r.stdout || "no output"}` };
  }

  // Fall back to `plantuml` on PATH.
  const r = spawnSync("plantuml", ["-tsvg", "-output", outDir, filePath], {
    encoding: "utf8",
    timeout: 30_000,
  });
  if (r.error?.code === "ENOENT") {
    return { ok: false, reason: "no plantuml.jar (PLANTUML_JAR or ~/plantuml.jar) and `plantuml` not on PATH" };
  }
  if (r.status === 0) return { ok: true, via: "path" };
  return { ok: false, reason: `plantuml exit ${r.status}: ${r.stderr || r.stdout || "no output"}` };
}
