// scripts/lib/artifact-types.js
// Artifact-type knowledge table + path/lockfile/diagram helpers consumed by
// scripts/scaffold-artifact.js. Mirrors REQUIRED_ANCHORS in
// scripts/lib/validate-artifacts.js (validate enforces; scaffold produces).

import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

// === Exit codes ===
export const EXIT_OK = 0;
export const EXIT_UNKNOWN_TYPE = 1;
export const EXIT_EXISTS = 2;
export const EXIT_NO_TEMPLATE = 3;
export const EXIT_BAD_ID = 4;
export const EXIT_OUTSIDE_ORCH = 5;
export const EXIT_BAD_COMBINATION = 6;

// === Type knowledge table ===
// Each type knows: target folder, template filename, anchor set, required
// diagram entries. The anchor set is the contract structural-diff enforces.
export const TYPE_SPEC = {
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
    anchors: ["S-VISION-001", "S-CONTEXT-001", "S-CONTAINERS-001"],
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
  TSR: {
    classification: "feature-scoped",
    folder: "verify",
    template: "TSR.template.md",
    anchors: ["S-TEST-001", "S-EVAL-001", "S-REVIEW-001"],
    diagrams: [],
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

export function isInsideOrchestra(absPath, cwd) {
  return absPath.startsWith(join(cwd, ".claude/.orchestra/"));
}

export function relativeToOrchestra(absPath, cwd) {
  const root = join(cwd, ".claude/.orchestra/");
  return absPath.startsWith(root) ? absPath.slice(root.length) : absPath;
}

export function computeNextAdrNnnn(dir) {
  if (!existsSync(dir)) return "0001";
  let max = 0;
  for (const entry of readdirSync(dir)) {
    const m = entry.match(/^ADR-(\d{4})-/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > max) max = n;
    }
  }
  return String(max + 1).padStart(4, "0");
}

export function computeOutputPaths(opts) {
  const spec = TYPE_SPEC[opts.type];
  if (!spec) return { error: `unknown type: ${opts.type}`, code: EXIT_UNKNOWN_TYPE };
  const ORCH = join(opts.cwd, ".claude/.orchestra");

  if (spec.classification === "singleton") {
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
    if (!opts.version) return { error: `${opts.type} requires --version=vX.Y.Z`, code: EXIT_BAD_COMBINATION };
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
    if (!opts.global) return { error: "ADR requires --global", code: EXIT_BAD_COMBINATION };
    if (!opts.feature_id) return { error: "ADR requires <slug> as second positional", code: EXIT_BAD_ID };
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

export function buildLockfile(spec, paths, opts) {
  const lockfile = {
    artifact_id: paths.id,
    artifact_path: relativeToOrchestra(paths.artifactPath, opts.cwd),
    schema_revision: 1,
    sections: {},
    references: [],
    diagrams: [],
  };
  for (const a of spec.anchors) {
    lockfile.sections[a] = { hash: "TBD", confirmed: true };
  }
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

// ADR's state machine ships with the canonical body so authoring is just
// verifying. Other diagrams get a minimal @startuml/@enduml stub for the
// agent to fill.
export function pumlStub(kind, id, rendered) {
  const banner = `' ${kind} diagram for ${id}\n' Render with the /plantuml skill: writes ${rendered} alongside.\n`;
  if (kind === "adr-status") {
    return `@startuml\n${banner}[*] --> proposed\nproposed --> proposed : REQUEST_CHANGES\\n(review_round++)\nproposed --> accepted : APPROVED\nproposed --> deadlock : review_round >= 3\naccepted --> superseded\naccepted --> deprecated\ndeadlock --> [*]\nsuperseded --> [*]\ndeprecated --> [*]\n@enduml\n`;
  }
  return `@startuml\n${banner}@enduml\n`;
}
