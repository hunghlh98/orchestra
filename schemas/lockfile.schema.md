---
id: LOCKFILE-SCHEMA
title: orchestra v2.0.0 — Sidecar Lockfile Schema
created: 2026-05-06
status: draft
revision: 1
scope: normative shape of `<artifact>.lock.yaml` files written by scaffold-artifact and mutated by hash-stamper
references:
  design:
    - id: DESIGN-005-doc-output-overhaul
      sections: [S-LOCKFILE-001, S-HASHSTAMPER-001]
---

# orchestra v2.0.0 — Sidecar Lockfile Schema

> Type-specific extension of the v1 frontmatter contract. As of v2.0.0, every scaffold-managed pipeline artifact carries a paired `<artifact>.lock.yaml` sidecar that owns the provenance metadata previously stored inline (`sections:`, `references:`). The sidecar also tracks PlantUML diagram source/rendered hashes (NEW). The artifact's own frontmatter retains only minimal type fields.

## When a lockfile exists

A lockfile is created by `scripts/scaffold-artifact.js` at the moment an artifact is scaffolded. The hash-stamper hook (`hooks/scripts/hash-stamper.js`) operates **only when paired**: if `<artifact>.lock.yaml` exists adjacent to the artifact being written, hashes are stamped into the lockfile; otherwise the hook passes through untouched. Hand-authored or pre-v2 artifacts are not auto-upgraded.

## Filename + folder convention <a id="S-FILENAME-001"></a>

For every artifact `<dir>/<stem>.<ext>` under `<project>/.claude/.orchestra/`, the paired lockfile is `<dir>/<stem>.lock.yaml`.

```
.claude/.orchestra/
├── architecture/
│   ├── SAD.md
│   ├── SAD.lock.yaml                                # paired
│   └── decisions/
│       ├── ADR-0001-use-sqlite.md
│       └── ADR-0001-use-sqlite.lock.yaml            # paired
├── runbooks/
│   ├── RUNBOOK-v0.1.0.md
│   └── RUNBOOK-v0.1.0.lock.yaml                     # paired
├── releases/
│   ├── RELEASE-v0.1.0.md
│   └── RELEASE-v0.1.0.lock.yaml                     # paired
└── pipeline/<NNN>-<slug>/
    └── requirements/
        ├── 001-PRD.md
        ├── 001-PRD.lock.yaml                        # paired
        ├── 001-FRS.md
        ├── 001-FRS.lock.yaml                        # paired
        └── diagrams/
            ├── frs-usecase.puml                     # diagram source
            └── frs-usecase.svg                      # diagram rendered
```

`.puml` and `.svg` files are NOT paired with lockfiles directly — their hashes are tracked inside the **owning artifact's** lockfile under `diagrams[]`.

## Top-level shape <a id="S-SHAPE-001"></a>

```yaml
artifact_id: <ID>                  # mirrors artifact frontmatter id (e.g., "001-PRD", "ADR-0001", "SAD")
artifact_path: <relative-path>     # relative to .claude/.orchestra/ (e.g., "pipeline/001-foo/requirements/001-PRD.md")
schema_revision: 1                 # bump on incompatible lockfile shape changes
sections:
  S-<TYPE>-NNN:
    hash: "sha256:<hex>"           # OR "TBD" pre-stamp; OR "TBD-UNRESOLVED" if upstream lookup failed
    confirmed: true                # mutually exclusive with `inferred:`
    # inferred: true               # brownfield grace — author has not yet confirmed
references:
  - type: <upstream-type>           # sad | prd | frs | tdd | contract | api | tasks | test | tsr | charter | adr | release | runbook
    id: <feature-id-or-empty>       # "001-foo" feature-scoped; "" for singletons (sad/release/runbook); "ADR-NNNN" for ADRs
    section: S-<TYPE>-NNN
    hash-at-write: "sha256:<hex>"   # OR "TBD" pre-stamp; OR "TBD-UNRESOLVED" if upstream missing
diagrams:
  - kind: <see kinds list below>
    source: diagrams/<filename>.puml      # path relative to artifact's directory
    rendered: diagrams/<filename>.svg     # path relative to artifact's directory
    source_hash: "sha256:<hex>"           # whole-file SHA256 over the .puml bytes
    rendered_hash: "sha256:<hex>"         # whole-file SHA256 over the .svg bytes
                                          # OR "sha256:UNRENDERED" when PlantUML unavailable
                                          # OR "sha256:OMIT" when the body carries <!-- OMIT: ... -->
    omit: false                            # true when the diagram is intentionally absent
                                          # (state-machine in TDD when no lifecycle exists, etc.)
```

**Empty top-level keys** (`sections: {}`, `references: []`, `diagrams: []`) are valid for newly-scaffolded artifacts. The hash-stamper populates them progressively as the artifact is filled in.

## Diagram kinds <a id="S-KINDS-001"></a>

Locked enum for `diagrams[].kind`. The validator's `diagram-source-presence` check uses this list:

| kind | Owning artifact type | Required? |
|---|---|---|
| `usecase` | FRS | yes |
| `c4-context` | SAD | yes |
| `c4-container` | SAD | yes |
| `c4-component` | TDD | yes |
| `sequence` | TDD, CONTRACT | TDD: ≥1; CONTRACT: per critical-path criterion |
| `er` | TDD | yes |
| `state` | TDD | only when lifecycle exists; else `omit: true` |
| `service-contract` | CONTRACT | yes |
| `dag` | TASKS | yes |
| `deploy` | RUNBOOK | yes |
| `rollback` | RUNBOOK | yes |
| `adr-status` | ADR | yes — MANDATORY (no `omit: true` allowed for ADR) |
| `option` | ADR | optional, one per option compared |

## Grammar constraint <a id="S-GRAMMAR-001"></a>

Lockfiles MUST round-trip through `hooks/lib/yaml-mini.js`:
- Block-style only. No flow style (`{a: b, c: d}` and `[1, 2]` are forbidden).
- No anchors / aliases (`&foo`, `*foo`).
- No multi-document streams (no `---` separator inside a lockfile).
- Top-level key regex: `/^([a-zA-Z][a-zA-Z0-9_-]*):/`.
- Indentation: 2 spaces per level.
- String values containing `:`, `#`, leading/trailing whitespace, or YAML reserved words (`null`, `true`, `false`, `~`) MUST be JSON-quoted (`"..."`).
- Hash strings ALWAYS quoted (e.g., `"sha256:abc..."`) — they contain `:`.

Any divergence is a `lockfile-grammar` validator failure.

## Bidirectional invariant with body <a id="S-INVARIANT-001"></a>

For every `.md` artifact paired with a `.lock.yaml`:
1. Every key in `lockfile.sections` MUST have a matching `<a id="S-...">` in the artifact body.
2. Every `<a id="S-...">` in the artifact body MUST have a matching key in `lockfile.sections`.

This is the same bidirectional rule as v1's inline frontmatter — only the storage moves. `validate.js` and `validate-drift.js` enforce both directions.

For `.openapi.yaml` artifacts: no anchor walk. The lockfile has a single section `S-API-001` whose `hash` is the whole-file SHA256 of the OpenAPI document body (frontmatter excluded).

## Upstream resolution <a id="S-UPSTREAM-001"></a>

When the hash-stamper sees `references[].hash-at-write: TBD`, it resolves by:

1. Compute the upstream artifact path from `(type, id)` using the type→folder map (same map as `hash-stamper.js:142-159` v1 — preserved by reference, not duplicated, so the contract stays single-source).
2. If `<upstream>.lock.yaml` exists, read `lockfile.sections[<ref.section>].hash` from it.
3. Else (legacy fallback during v1→v2 transition): read inline `fm.sections[<ref.section>].hash` from the upstream artifact's frontmatter.
4. If neither yields a hash, write `"TBD-UNRESOLVED"`.

Validators flag `TBD-UNRESOLVED` as a `reference-unresolved` warning. Real fail conditions remain `drift-on-confirmed` / `drift-on-inferred` per existing `validate-drift.js` semantics.

## Frontmatter slimming (v1 → v2) <a id="S-SLIM-001"></a>

The artifact's own frontmatter (post-sidecar) carries ONLY:

```yaml
---
id: <ID>
type: <TYPE>
created: <ISO-8601>
revision: <integer ≥ 1>
status: <type-specific enum, where applicable>
version: <semver, where applicable>
# (plus type-specific minimal fields per `pipeline-artifact.schema.md`)
---
```

**Removed from frontmatter** (now in lockfile):
- `sections:`
- `references:`

Validator failure on inline `sections:` or `references:` blocks in v2-scaffolded artifacts: `frontmatter-slim-violation`.

## Versioning

`schema_revision: 1` is the v2.0.0 shape. Bump on any incompatible change (renamed top-level key, removed field, semantic change to an existing field). Additive changes that older readers can ignore (new optional field) do NOT bump `schema_revision`.
