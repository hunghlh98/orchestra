#!/usr/bin/env node
// scripts/scaffold-artifact.js
// Scaffold-then-fill engine. Writes a structurally-correct artifact .md (or
// .openapi.yaml), a paired <artifact>.lock.yaml with seeded sections and
// required diagrams[] entries, and stub .puml source files for each required
// diagram. Agents fill <!-- FILL: --> spans only; the validator's
// structural-diff mode rejects anchor drift.
//
// Type knowledge + path/lockfile/diagram helpers live in
// scripts/lib/artifact-types.js. Shell handles argv parsing, template I/O,
// substitution, and the file-emit sequence.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { serialize } from "../hooks/lib/yaml-mini.js";
import {
  TYPE_SPEC, EXIT_OK, EXIT_UNKNOWN_TYPE, EXIT_EXISTS, EXIT_NO_TEMPLATE,
  EXIT_BAD_ID, EXIT_OUTSIDE_ORCH, EXIT_BAD_COMBINATION,
  isInsideOrchestra, computeOutputPaths, buildLockfile, pumlStub,
} from "./lib/artifact-types.js";

const __filename = fileURLToPath(import.meta.url);
const PLUGIN_ROOT = resolve(dirname(__filename), "..");
const TEMPLATES_DIR = join(PLUGIN_ROOT, "schemas/templates");

function parseArgs(argv) {
  // node scaffold-artifact.js <type> <feature-id|--singleton|--global|--version=v...> [<slug>] [--mode=full|brief] [--cwd=<path>] [--force]
  const args = argv.slice(2);
  if (args.length < 1) return { error: "missing <type> argument" };
  const opts = {
    type: args[0].toUpperCase(),
    feature_id: null, slug: null, mode: null,
    cwd: process.cwd(), force: false,
    singleton: false, global: false, version: null,
  };
  let positional = 0;
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a === "--force") { opts.force = true; continue; }
    if (a === "--singleton") { opts.singleton = true; continue; }
    if (a === "--global") { opts.global = true; continue; }
    if (a.startsWith("--version=")) { opts.version = a.slice("--version=".length); continue; }
    if (a.startsWith("--mode=")) { opts.mode = a.slice("--mode=".length); continue; }
    if (a.startsWith("--cwd=")) { opts.cwd = resolve(a.slice("--cwd=".length)); continue; }
    if (a.startsWith("--")) return { error: `unknown flag: ${a}` };
    if (positional === 0) { opts.feature_id = a; positional++; continue; }
    if (positional === 1) { opts.slug = a; positional++; continue; }
    return { error: `unexpected positional arg: ${a}` };
  }
  return opts;
}

function loadTemplate(spec) {
  const path = join(TEMPLATES_DIR, spec.template);
  if (!existsSync(path)) return { error: `template not found: ${spec.template}`, code: EXIT_NO_TEMPLATE };
  return { content: readFileSync(path, "utf8") };
}

// Replace {{KEY}} with vars[KEY]; leave unsubstituted on miss (loud failure if it ships).
function substitute(content, vars) {
  return content.replace(/\{\{(\w+)\}\}/g, (m, k) => {
    if (Object.hasOwn(vars, k) && vars[k] !== undefined && vars[k] !== null) return String(vars[k]);
    return m;
  });
}

function main() {
  const opts = parseArgs(process.argv);
  if (opts.error) {
    process.stderr.write(`scaffold-artifact: ${opts.error}\n`);
    process.exit(EXIT_BAD_COMBINATION);
  }

  const spec = TYPE_SPEC[opts.type];
  if (!spec) {
    process.stderr.write(`scaffold-artifact: unknown type "${opts.type}". Known: ${Object.keys(TYPE_SPEC).join(", ")}\n`);
    process.exit(EXIT_UNKNOWN_TYPE);
  }

  const paths = computeOutputPaths(opts);
  if (paths.error) {
    process.stderr.write(`scaffold-artifact: ${paths.error}\n`);
    process.exit(paths.code || EXIT_BAD_ID);
  }

  if (!isInsideOrchestra(paths.artifactPath, opts.cwd)) {
    process.stderr.write(`scaffold-artifact: refusing to write outside .claude/.orchestra/ (${paths.artifactPath})\n`);
    process.exit(EXIT_OUTSIDE_ORCH);
  }

  if (existsSync(paths.artifactPath) && !opts.force) {
    process.stderr.write(`scaffold-artifact: ${paths.artifactPath} exists; rerun with --force to overwrite\n`);
    process.exit(EXIT_EXISTS);
  }

  const tpl = loadTemplate(spec);
  if (tpl.error) {
    process.stderr.write(`scaffold-artifact: ${tpl.error}\n`);
    process.exit(tpl.code || EXIT_NO_TEMPLATE);
  }

  const today = new Date().toISOString().slice(0, 10);
  const vars = {
    ID: paths.idForBody, TYPE: opts.type, CREATED: today,
    FEATURE_ID: opts.feature_id || "",
    SLUG: paths.slug || "",
    NNNN: paths.nnnn || "",
    MODE: opts.mode || "",
  };
  const artifactContent = substitute(tpl.content, vars);
  const lockfileText = serialize(buildLockfile(spec, paths, opts)) + "\n";

  mkdirSync(paths.artifactDir, { recursive: true });
  writeFileSync(paths.artifactPath, artifactContent);
  writeFileSync(paths.lockPath, lockfileText);

  if (spec.diagrams.length > 0) {
    mkdirSync(paths.diagramsDir, { recursive: true });
    for (const d of spec.diagrams) {
      const stubPath = join(paths.artifactDir, d.source);
      if (!existsSync(stubPath) || opts.force) {
        writeFileSync(stubPath, pumlStub(d.kind, paths.id, d.rendered));
      }
    }
  } else {
    mkdirSync(paths.diagramsDir, { recursive: true });
    const keep = join(paths.diagramsDir, ".gitkeep");
    if (!existsSync(keep)) writeFileSync(keep, "");
  }

  process.stdout.write(`scaffold-artifact: OK\n`);
  process.stdout.write(`  artifact:  ${paths.artifactPath}\n`);
  process.stdout.write(`  lockfile:  ${paths.lockPath}\n`);
  process.stdout.write(`  diagrams:  ${spec.diagrams.length} stub(s) under ${paths.diagramsDir}/\n`);
  process.exit(EXIT_OK);
}

main();
