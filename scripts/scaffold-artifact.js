#!/usr/bin/env node
// scripts/scaffold-artifact.js
// Scaffold-then-fill engine. Writes a structurally-correct artifact .md (or
// .openapi.yaml), a paired <artifact>.lock.yaml with seeded sections and
// required diagrams[] entries, and stub .puml source files for each required
// diagram. Agents fill <!-- FILL: --> spans only; the validator's
// structural-diff mode (PR #3) rejects anchor drift.
//
// See docs/DESIGN-005-doc-output-overhaul.md §S-SCAFFOLD-001 and
// schemas/lockfile.schema.md.

import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { resolve, dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { serialize } from "../hooks/lib/yaml-mini.js";

const __filename = fileURLToPath(import.meta.url);
const PLUGIN_ROOT = resolve(dirname(__filename), "..");
const TEMPLATES_DIR = join(PLUGIN_ROOT, "schemas/templates");

// === Exit codes (DESIGN-005 §C.3) ===
const EXIT_OK = 0;
const EXIT_UNKNOWN_TYPE = 1;
const EXIT_EXISTS = 2;
const EXIT_NO_TEMPLATE = 3;
const EXIT_BAD_ID = 4;
const EXIT_OUTSIDE_ORCH = 5;
const EXIT_BAD_COMBINATION = 6;

// === Type knowledge table ===
// Each type knows: target folder, template filename, anchor set, required
// diagram entries. The anchor set is the contract structural-diff enforces.

const TYPE_SPEC = {
  CHARTER: {
    classification: "feature-scoped",
    folder: "charter",
    templates: { full: "CHARTER-full.template.md", brief: "CHARTER-brief.template.md" },
    anchors: {
      full: ["S-PROBLEM-001", "S-SCOPE-001", "S-FEASIBILITY-001", "S-DECISION-001"],
      brief: ["S-INTENT-001", "S-DECISION-001"],
    },
    diagrams: [],
    ext: "md",
  },
  PRD: {
    classification: "feature-scoped",
    folder: "requirements",
    template: "PRD.template.md",
    anchors: ["S-PROBLEM-001", "S-USERS-001", "S-GOALS-001", "S-NON-GOALS-001", "S-METRICS-001", "S-OPEN-001"],
    diagrams: [],
    ext: "md",
  },
  FRS: {
    classification: "feature-scoped",
    folder: "requirements",
    template: "FRS.template.md",
    anchors: ["S-FRS-001", "S-ACCEPTANCE-001", "S-ERRORS-001", "S-USECASE-001"],
    diagrams: [{ kind: "usecase", source: "diagrams/frs-usecase.puml", rendered: "diagrams/frs-usecase.svg" }],
    ext: "md",
  },
  SAD: {
    classification: "singleton",
    folder: "architecture",
    template: "SAD.template.md",
    filename: "SAD.md",
    anchors: ["S-VISION-001", "S-CONTEXT-001", "S-CONTAINERS-001", "S-ADR-INDEX-001"],
    diagrams: [
      { kind: "c4-context", source: "diagrams/sad-c4-context.puml", rendered: "diagrams/sad-c4-context.svg" },
      { kind: "c4-container", source: "diagrams/sad-c4-container.puml", rendered: "diagrams/sad-c4-container.svg" },
    ],
    ext: "md",
  },
  TDD: {
    classification: "feature-scoped",
    folder: "design",
    template: "TDD.template.md",
    anchors: ["S-COMPONENTS-001", "S-SEQUENCE-001", "S-DATA-MODEL-001", "S-STATE-001", "S-ERROR-HANDLING-001", "S-CONFIG-001", "S-RISKS-001"],
    diagrams: [
      { kind: "c4-component", source: "diagrams/tdd-c4-component.puml", rendered: "diagrams/tdd-c4-component.svg" },
      { kind: "sequence", source: "diagrams/tdd-sequence-primary.puml", rendered: "diagrams/tdd-sequence-primary.svg" },
      { kind: "er", source: "diagrams/tdd-er.puml", rendered: "diagrams/tdd-er.svg" },
      // state-machine defaults to omit:true; agent flips to false when a lifecycle is added.
      { kind: "state", source: "diagrams/tdd-state.puml", rendered: "diagrams/tdd-state.svg", omit: true },
    ],
    ext: "md",
  },
  CONTRACT: {
    classification: "feature-scoped",
    folder: "interfaces",
    template: "CONTRACT.template.md",
    anchors: ["S-INTERFACE-001", "S-SERVICE-CONTRACT-001", "S-SCORING-001", "S-CRITERIA-001"],
    diagrams: [
      // service-contract is universal; sequence-per-critical-criterion is added by the agent.
      { kind: "service-contract", source: "diagrams/contract-service.puml", rendered: "diagrams/contract-service.svg" },
    ],
    ext: "md",
  },
  API: {
    classification: "feature-scoped",
    folder: "interfaces",
    template: "API.template.openapi.yaml",
    anchors: ["S-API-001"], // whole-file hash; no body anchor walk
    diagrams: [],
    ext: "openapi.yaml",
  },
  TASKS: {
    classification: "feature-scoped",
    folder: "plan",
    template: "TASKS.template.md",
    anchors: ["S-DAG-001", "S-TASKS-001"],
    diagrams: [{ kind: "dag", source: "diagrams/tasks-dag.puml", rendered: "diagrams/tasks-dag.svg" }],
    ext: "md",
  },
  PLAN: {
    classification: "feature-scoped",
    folder: "planning",
    template: "PLAN.template.md",
    anchors: ["S-PROBLEM-001", "S-OPTIONS-001", "S-TRADEOFFS-001", "S-RECOMMENDATION-001", "S-OPEN-001"],
    diagrams: [],
    ext: "md",
  },
  TEST: {
    classification: "feature-scoped",
    folder: "verify",
    template: "TEST.template.md",
    anchors: ["S-COVERAGE-001"],
    diagrams: [],
    ext: "md",
  },
  TSR: {
    classification: "feature-scoped",
    folder: "verify",
    template: "TSR.template.md",
    anchors: ["S-EVAL-VERDICT-001", "S-EVAL-TABLE-001", "S-REV-VERDICT-001", "S-REV-FINDINGS-001", "S-SHIP-001"],
    diagrams: [],
    ext: "md",
  },
  RELEASE: {
    classification: "version-singleton",
    folder: "releases",
    template: "RELEASE.template.md",
    anchors: ["S-WHATSNEW-001", "S-ENDPOINTS-001", "S-CONFIG-001", "S-BREAKING-001", "S-GATES-001", "S-KNOWN-001", "S-ANNOUNCEMENT-001"],
    diagrams: [],
    ext: "md",
  },
  RUNBOOK: {
    classification: "version-singleton",
    folder: "runbooks",
    template: "RUNBOOK.template.md",
    anchors: ["S-OVERVIEW-001", "S-LIFECYCLE-001", "S-DEPLOY-001", "S-ROLLBACK-001", "S-HEALTH-001", "S-FAILURE-001", "S-LOGS-001", "S-ENVVARS-001"],
    diagrams: [
      { kind: "deploy", source: "diagrams/runbook-deploy.puml", rendered: "diagrams/runbook-deploy.svg" },
      { kind: "rollback", source: "diagrams/runbook-rollback.puml", rendered: "diagrams/runbook-rollback.svg" },
    ],
    ext: "md",
  },
  ADR: {
    classification: "global",
    folder: "architecture/decisions",
    template: "ADR.template.md",
    anchors: ["S-STATUS-001", "S-CONTEXT-001", "S-DECISION-001", "S-CONSEQUENCES-001", "S-ALTERNATIVES-001"],
    diagrams: [{ kind: "adr-status", source: "diagrams/adr-status.puml", rendered: "diagrams/adr-status.svg" }],
    ext: "md",
  },
};

// === Argv parsing ===

function parseArgs(argv) {
  // node scaffold-artifact.js <type> <feature-id|--singleton|--global|--version=v...> [<slug>] [--mode=full|brief] [--cwd=<path>] [--force]
  const args = argv.slice(2);
  if (args.length < 1) return { error: "missing <type> argument" };
  const type = args[0].toUpperCase();
  let feature_id = null;
  let slug = null;
  let mode = null;
  let cwd = process.cwd();
  let force = false;
  let singleton = false;
  let global = false;
  let version = null;

  let positional = 0;
  for (let i = 1; i < args.length; i++) {
    const a = args[i];
    if (a === "--force") { force = true; continue; }
    if (a === "--singleton") { singleton = true; continue; }
    if (a === "--global") { global = true; continue; }
    if (a.startsWith("--version=")) { version = a.slice("--version=".length); continue; }
    if (a.startsWith("--mode=")) { mode = a.slice("--mode=".length); continue; }
    if (a.startsWith("--cwd=")) { cwd = resolve(a.slice("--cwd=".length)); continue; }
    if (a.startsWith("--")) return { error: `unknown flag: ${a}` };
    if (positional === 0) { feature_id = a; positional++; continue; }
    if (positional === 1) { slug = a; positional++; continue; }
    return { error: `unexpected positional arg: ${a}` };
  }
  return { type, feature_id, slug, mode, cwd, force, singleton, global, version };
}

// === Path computation per classification ===

function isInsideOrchestra(absPath, cwd) {
  return absPath.startsWith(join(cwd, ".claude/.orchestra/"));
}

function computeOutputPaths(opts) {
  const spec = TYPE_SPEC[opts.type];
  if (!spec) return { error: `unknown type: ${opts.type}`, code: EXIT_UNKNOWN_TYPE };
  const ORCH = join(opts.cwd, ".claude/.orchestra");

  if (spec.classification === "singleton") {
    // SAD only.
    const dir = join(ORCH, spec.folder);
    const file = join(dir, spec.filename);
    return {
      artifactDir: dir,
      artifactPath: file,
      lockPath: file.replace(/\.md$/, ".lock.yaml"),
      diagramsDir: join(dir, "diagrams"),
      id: opts.type,
      idForBody: opts.type,
      slug: opts.type,
    };
  }

  if (spec.classification === "version-singleton") {
    // RELEASE / RUNBOOK — opts.version (e.g., "v0.1.0") drives filename + id.
    if (!opts.version) {
      return { error: `${opts.type} requires --version=vX.Y.Z`, code: EXIT_BAD_COMBINATION };
    }
    if (!/^v\d+\.\d+\.\d+(-[a-zA-Z0-9.-]+)?$/.test(opts.version)) {
      return { error: `--version must match vX.Y.Z (got "${opts.version}")`, code: EXIT_BAD_ID };
    }
    const dir = join(ORCH, spec.folder);
    const filename = `${opts.type}-${opts.version}.md`;
    const file = join(dir, filename);
    return {
      artifactDir: dir,
      artifactPath: file,
      lockPath: file.replace(/\.md$/, ".lock.yaml"),
      diagramsDir: join(dir, "diagrams"),
      id: `${opts.type}-${opts.version}`,
      idForBody: `${opts.type}-${opts.version}`,
      slug: opts.version,
    };
  }

  if (spec.classification === "global") {
    // ADR — auto-compute next NNNN.
    if (!opts.global) return { error: "ADR requires --global", code: EXIT_BAD_COMBINATION };
    if (!opts.feature_id) return { error: "ADR requires <slug> as second positional", code: EXIT_BAD_ID };
    // For ADR, the first positional is interpreted as <slug> (not feature-id).
    const slug = opts.feature_id;
    if (!/^[a-z][a-z0-9-]*$/.test(slug)) {
      return { error: `ADR slug must match /^[a-z][a-z0-9-]*$/ (got "${slug}")`, code: EXIT_BAD_ID };
    }
    const dir = join(ORCH, spec.folder);
    const nnnn = computeNextAdrNnnn(dir);
    const filename = `ADR-${nnnn}-${slug}.md`;
    const file = join(dir, filename);
    if (existsSync(file)) {
      return { error: `ADR slug collision: ${filename} already exists`, code: EXIT_BAD_ID };
    }
    return {
      artifactDir: dir,
      artifactPath: file,
      lockPath: file.replace(/\.md$/, ".lock.yaml"),
      diagramsDir: join(dir, "diagrams"),
      id: `ADR-${nnnn}`,
      idForBody: `ADR-${nnnn}`,
      slug,
      nnnn,
    };
  }

  // feature-scoped
  if (!opts.feature_id) return { error: `${opts.type} requires <feature-id> (e.g., 001-foo)`, code: EXIT_BAD_ID };
  if (!/^\d+(-[a-z0-9-]+)?$/.test(opts.feature_id)) {
    return { error: `feature-id must match /^\\d+(-[a-z0-9-]+)?$/ (got "${opts.feature_id}")`, code: EXIT_BAD_ID };
  }
  const num = opts.feature_id.match(/^(\d+)/)[1];
  const slug = opts.slug || opts.feature_id.replace(/^\d+-?/, "") || opts.feature_id;
  const dir = join(ORCH, "pipeline", opts.feature_id, spec.folder);
  const filename = `${num}-${opts.type}.${spec.ext}`;
  const file = join(dir, filename);
  return {
    artifactDir: dir,
    artifactPath: file,
    lockPath: file.replace(new RegExp(`\\.${spec.ext.replace(".", "\\.")}$`), ".lock.yaml"),
    diagramsDir: join(dir, "diagrams"),
    id: `${num}-${opts.type}`,
    idForBody: `${num}-${opts.type}`,
    slug,
  };
}

function computeNextAdrNnnn(dir) {
  if (!existsSync(dir)) return "0001";
  const entries = readdirSync(dir);
  let max = 0;
  for (const entry of entries) {
    const m = entry.match(/^ADR-(\d{4})-/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return String(max + 1).padStart(4, "0");
}

// === Substitution + write ===

function loadTemplate(spec, mode) {
  let templateName;
  if (typeof spec.templates === "object") {
    if (!mode || !spec.templates[mode]) {
      return { error: `${spec === TYPE_SPEC.CHARTER ? "CHARTER" : "type"} requires --mode=full|brief` };
    }
    templateName = spec.templates[mode];
  } else {
    templateName = spec.template;
  }
  const path = join(TEMPLATES_DIR, templateName);
  if (!existsSync(path)) return { error: `template not found: ${templateName}`, code: EXIT_NO_TEMPLATE };
  return { content: readFileSync(path, "utf8") };
}

function substitute(content, vars) {
  return content.replace(/\{\{(\w+)\}\}/g, (m, k) => {
    if (Object.hasOwn(vars, k) && vars[k] !== undefined && vars[k] !== null) return String(vars[k]);
    return m; // leave unsubstituted; loud failure if it ships
  });
}

function buildLockfile(spec, paths, opts) {
  const lockfile = {
    artifact_id: paths.id,
    artifact_path: relativeToOrchestra(paths.artifactPath, opts.cwd),
    schema_revision: 1,
    sections: {},
    references: [],
    diagrams: [],
  };
  // Seed sections from anchor list (CHARTER picks anchors by mode).
  const anchors = (typeof spec.anchors === "object" && !Array.isArray(spec.anchors))
    ? spec.anchors[opts.mode]
    : spec.anchors;
  for (const a of anchors) {
    lockfile.sections[a] = { hash: "TBD", confirmed: true };
  }
  // Seed diagrams[].
  for (const d of spec.diagrams) {
    lockfile.diagrams.push({
      kind: d.kind,
      source: d.source,
      rendered: d.rendered,
      source_hash: "TBD",
      rendered_hash: "TBD",
      omit: !!d.omit,
    });
  }
  return lockfile;
}

function relativeToOrchestra(absPath, cwd) {
  const root = join(cwd, ".claude/.orchestra/");
  if (absPath.startsWith(root)) return absPath.slice(root.length);
  return absPath;
}

function pumlStub(kind, id, rendered) {
  const banner = `' ${kind} diagram for ${id}\n' Render with the /plantuml skill: writes ${rendered} alongside.\n`;
  if (kind === "adr-status") {
    // ADR's state machine ships with the canonical body so authoring is just
    // verifying — DESIGN-005 §S-ADR-001 §6.1 mandates this exact shape.
    return `@startuml\n${banner}[*] --> proposed\nproposed --> proposed : REQUEST_CHANGES\\n(review_round++)\nproposed --> accepted : APPROVED\nproposed --> deadlock : review_round >= 3\naccepted --> superseded\naccepted --> deprecated\ndeadlock --> [*]\nsuperseded --> [*]\ndeprecated --> [*]\n@enduml\n`;
  }
  return `@startuml\n${banner}@enduml\n`;
}

// === Main ===

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

  // CHARTER mode validation.
  if (opts.type === "CHARTER" && (opts.mode !== "full" && opts.mode !== "brief")) {
    process.stderr.write(`scaffold-artifact: CHARTER requires --mode=full or --mode=brief\n`);
    process.exit(EXIT_BAD_COMBINATION);
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

  // Load + substitute template.
  const tpl = loadTemplate(spec, opts.mode);
  if (tpl.error) {
    process.stderr.write(`scaffold-artifact: ${tpl.error}\n`);
    process.exit(tpl.code || EXIT_NO_TEMPLATE);
  }

  const today = new Date().toISOString().slice(0, 10);
  const vars = {
    ID: paths.idForBody,
    TYPE: opts.type,
    CREATED: today,
    FEATURE_ID: opts.feature_id || "",
    SLUG: paths.slug || "",
    NNNN: paths.nnnn || "",
    MODE: opts.mode || "",
  };
  const artifactContent = substitute(tpl.content, vars);

  // Build lockfile.
  const lockfile = buildLockfile(spec, paths, opts);
  const lockfileText = serialize(lockfile) + "\n";

  // Write all the things.
  mkdirSync(paths.artifactDir, { recursive: true });
  writeFileSync(paths.artifactPath, artifactContent);
  writeFileSync(paths.lockPath, lockfileText);

  // Diagram stubs.
  if (spec.diagrams.length > 0) {
    mkdirSync(paths.diagramsDir, { recursive: true });
    for (const d of spec.diagrams) {
      const stubPath = join(paths.artifactDir, d.source);
      if (!existsSync(stubPath) || opts.force) {
        writeFileSync(stubPath, pumlStub(d.kind, paths.id, d.rendered));
      }
    }
  } else {
    // Ensure diagrams/.gitkeep exists so the empty dir survives git.
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
