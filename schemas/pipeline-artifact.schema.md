---
id: PIPELINE-SCHEMA
title: orchestra Pipeline Artifact Frontmatter Schemas
created: 2026-05-08
status: draft
revision: 10
scope: type-specific frontmatter shapes for every artifact authored by the orchestra agents.
---

# orchestra Pipeline Artifact Frontmatter Schemas

> Frontmatter contract for every consumer-side artifact the chain produces.
> The chain spine: PRD → FRS → SAD → ADR → TDD → openapi (or asyncapi) →
> code + tests → TSR. Business invariants live in workspace-grain
> `business-invariants.md` and per-service `<service_name>-BR-AC.md`.
> Review-state and per-section locks live in artifact frontmatter; drift
> detection runs via `git diff`.

## Two-tier placement <a id="two-tier-placement"></a>

Two project-side roots: `<project>/docs/` (durable stakeholder deliverables; PR-reviewable; cross-cited) and `<project>/.orchestra/` (agent + plugin internals; ephemeral or run-bound). Litmus: would you link it from a PR description for a non-engineer reviewer? `docs/` if yes, `.orchestra/` if no.

| Tier | Root | Contents |
|---|---|---|
| system | `<context_path>/docs/` | `README.md` (provenance marker), `SAD.md`, `business-invariants.md`, `glossary.md`, `adr/ADR-NNNN-<slug>.md`, `diagrams/*.puml` |
| service | `<context_path>/docs/<service_name>/` | `<service_name>-BR-AC.md`, `<service_name>-openapi.yaml` (alt: `<service_name>-asyncapi.yaml` / `<service_name>-clientapi.yaml`), `diagrams/{c4-component,erd-logical,state-machine,usecase}.puml` |
| feature | `<context_path>/docs/<service_name>/<feature-id>/` | `<feature-id>-PRD.md`, `<feature-id>-FRS.md`, `<feature-id>-TDD.md`, `<feature-id>-TSR.md`, `diagrams/<feature-id>-sd-<journey>.puml` |

Every artifact path embeds the elected `service_name`. Single-repo workspaces still nest under `<context_path>/docs/<service_name>/`. `diagrams/` always nests under the matching tier's `docs/` root — bare `<context_path>/diagrams/` is forbidden.

## Link discipline — `docs/` is a sealed, portable narrative tree <a id="link-discipline"></a>

The `<context_path>/docs/` tree is self-contained: a reader walking it MUST NOT have to open the codebase, an external URL, or the `.orchestra/` sibling to resolve a reference. Docs authored under project A must be valid `spec-to-code` inputs in project B unchanged. Enforced at write time by `hooks/scripts/pre-write-check.js` (`codebase-token-reject` gate) — token classes in `#cite-rejects` below.

**Forbidden in `docs/*` artifact bodies:** codebase paths, external URLs, `.orchestra/` sibling paths, codebase-specific identifiers (commit SHAs, branch names, repo URLs), and — in PRD/FRS only — fenced code blocks.

**Allowed:** cross-references between `docs/*` artifacts (relative paths within `docs/`), ADR citations by ID in plain prose (`per ADR-0007-use-postgres, ...`), anchor citations within `docs/*` (`SAD/S-CONTAINERS-001`), inline backticks for short identifiers.

**Inventory-style indexes belong outside `docs/`** — ADR index at `<context_path>/.orchestra/inventory/adr/index.md`; `docs/` carries stable narrative only.

## Folder layout

### Feature-id format <a id="S-FEATURE-ID-FMT-001"></a>

`<feature-id> = <short-service-name>-<NNN>-<slug>` where:

- `<short-service-name>` is the value of `local.yaml.service_name` (kebab-case, ASCII letters + digits, ≤ 24 chars). Embeds cross-service uniqueness in the id.
- `<NNN>` is a zero-padded 3-digit ordinal, monotonically incremented per service. `NNN = max(<NNN> segment across features[].id in .orchestra/<service_name>/features.yaml) + 1`; first feature per service is `001`.
- `<slug>` is kebab-case, ASCII letters + digits only, derived from the feature name. Length ≤ 40 chars.

Examples: `order-001-checkout`, `order-002-refund`, `payment-001-reconcile`.

Every per-feature artifact filename embeds the full feature-id as a prefix: `<feature-id>-<TYPE>.<ext>` (e.g., `order-001-checkout-PRD.md`, `order-001-checkout-openapi.yaml`). The frontmatter `id:` field MUST equal the basename without extension.

### Doc-provenance marker <a id="S-DOC-PROVENANCE-001"></a>

The reverse pass authors `<context_path>/docs/README.md` on first run with frontmatter `generated_by: orchestra`. Subsequent runs read the marker via `orchestra-preflight.js` to classify existing chain artifacts as plugin-format (eligible for `cite-as-is` / `copy-and-modify` in reverse-pass per-artifact discipline). Absent marker → all reverse-pass classifications default to `re-author`.

### `<project>/docs/` (stakeholder surface)

```
<project>/docs/
├── README.md                            ← provenance marker (generated_by: orchestra)
├── SAD.md                               ← system-level singleton
├── business-invariants.md               ← workspace-grain BR/AC (cross-service)
├── glossary.md                          ← workspace-grain ubiquitous-language terms (cross-service shared nouns)
├── adr/
│   └── ADR-NNNN-<slug>.md               ← global flat numbering; ADRs accrete
├── diagrams/                            ← workspace-level (each *.puml has paired *.svg)
│   ├── c4-context.{puml,svg}                          ← L1
│   ├── c4-container.{puml,svg}                        ← L2
│   ├── erd-logical.{puml,svg}                         ← workspace-grain ERD
│   └── sd-<full-cross-service-journey>.{puml,svg}     ← one per cross-service journey
└── <service_name>/                      ← per-service partition
    ├── <service_name>-BR-AC.md          ← per-service BR + AC singleton (single-writer)
    ├── <service_name>-openapi.yaml      ← per-service HTTP contract (alt: -asyncapi.yaml | -clientapi.yaml); single-writer
    ├── diagrams/                        ← per-service singletons (single-writer each)
    │   ├── c4-component.{puml,svg}                    ← L3 component diagram
    │   ├── erd-logical.{puml,svg}                     ← service-scope ERD
    │   ├── state-machine.{puml,svg}                   ← lifecycle states across all features of the service
    │   └── usecase.{puml,svg}                         ← end-user use cases across all features of the service
    └── <feature-id>/                    ← per-feature
        ├── <feature-id>-PRD.md
        ├── <feature-id>-FRS.md
        ├── <feature-id>-TDD.md
        ├── <feature-id>-TSR.md          (multi-writer)
        └── diagrams/                    ← per-feature (sd-only; c4-component / erd-logical / state-machine / usecase live at service-scope above)
            └── <feature-id>-sd-<journey>.{puml,svg}   ← one per Journey-gate outcome category
```

### `<project>/.orchestra/` (agent + plugin internals)

Workspace-global state at the `.orchestra/` root; per-service execution state partitioned under `.orchestra/<service_name>/`.

```
<project>/.orchestra/
├── system.yaml                         ← workspace config (workspace_kind, context_path)
├── cross-features.yaml                 ← workspace-grain cross-service feature DAG manifest (append-only)
├── manifest.json                       ← idempotency registry
├── plans/                              ← per-session workspace plans
│   └── <session_id>/                   ← = Claude Code session-id from preflight
│       ├── run-plan.md                                   ← unified PlanMode artifact (workspace-level)
│       ├── discovery/                                    ← brownfield only
│       │   └── <service>.md                              ← @explorer report per service (EXPLORER-REPORT type)
│       ├── events.jsonl                                  ← metrics for this session
│       └── agent-tasks.md                                ← session-level task ledger (AGENT-TASKS type; hook-projected)
└── <service_name>/                     ← per-service workspace-persistent state
    ├── local.yaml                                  ← service config
    ├── features.yaml                               ← intra-service feature DAG manifest (append-only)
    └── pipeline/                                   ← coordination root
        └── <feature-id>/
            ├── <feature-id>-DEADLOCK-<slug>.md     ← transient
            ├── <feature-id>-ESCALATE-<slug>.md     ← transient
            └── <feature-id>-ESCALATE-ADR-<NNNN>.md ← ADR-trigger marker
```

Type → folder map:

| Type | Folder | Example | Notes |
|---|---|---|---|
| `PRD`, `FRS`, `TDD`, `TSR` | `docs/<service_name>/<feature-id>/` | `order-001-placement-PRD.md` | per-feature; filename = `<feature-id>-<TYPE>.md` |
| `API` (openapi/asyncapi/clientapi) | `docs/<service_name>/` | `order-openapi.yaml` | per-service singleton; single-writer; filename = `<service_name>-openapi.yaml` (or `-asyncapi.yaml` / `-clientapi.yaml`) |
| `C4-COMPONENT` | `docs/<service_name>/diagrams/` | `c4-component.puml` | per-service singleton (L3); single-writer |
| `ERD-LOGICAL` (service) | `docs/<service_name>/diagrams/` | `erd-logical.puml` | per-service singleton; single-writer |
| `STATE-MACHINE` | `docs/<service_name>/diagrams/` | `state-machine.puml` | per-service singleton; merges business + technical state across all lifecycle features of the service; single-writer |
| `USECASE` | `docs/<service_name>/diagrams/` | `usecase.puml` | per-service singleton; end-user use cases across all features of the service; single-writer; authored by `@analyst` |
| `BR-AC` | `docs/<service_name>/` | `order-BR-AC.md` | per-service BR + AC singleton; single-writer |
| `BUSINESS-INVARIANTS` | `docs/` | `business-invariants.md` | workspace-grain singleton; cross-service business rules |
| `GLOSSARY` | `docs/` | `glossary.md` | workspace-grain singleton; ubiquitous-language terms shared across services; single-writer `@architect` |
| `SAD` | `docs/` | `SAD.md` | workspace singleton |
| `ADR` (global) | `docs/adr/` | `ADR-0001-use-sqlite.md` | affects ≥2 services; project-wide flat 4-digit numbering |
| `ADR` (service) | `docs/<service_name>/adr/` | `ADR-order-001-use-outbox.md` | affects exactly one service; per-service 3-digit numbering |
| `README` | `docs/` | `README.md` | provenance marker (`generated_by: orchestra`) |
| `RUN-PLAN` | `.orchestra/plans/<session_id>/` | `run-plan.md` | one per Claude Code session; workspace-level unified plan |
| `CROSS-FEATURES` | `.orchestra/` | `cross-features.yaml` | workspace-grain cross-service feature DAG manifest; append-only; binds one logical feature across ≥2 services; closed-allowlist write via `mcp__orchestra-utils__upsert_cross_features_yaml` |
| `EXPLORER-REPORT` | `.orchestra/plans/<session_id>/discovery/` | `order.md` | per-service discovery summary; brownfield only; filename = `<service>.md` |
| `TASKS` | `.orchestra/<service_name>/pipeline/<feature-id>/` | `order-001-placement-TASKS.md` | agent-internal |
| `AGENT-TASKS` | `.orchestra/plans/<session_id>/` | `agent-tasks.md` | session-level ledger; rows-per-(agent × feature-id × task) projected by `agent-plan-sync` hook on `SubagentStop` from subagent transcripts |
| `ESCALATE`, `DEADLOCK`, `ESCALATE-ADR` | `.orchestra/<service_name>/pipeline/<feature-id>/` | `order-001-placement-ESCALATE-spec-gap.md` | transient |
| `INCOMPLETE` | `.orchestra/<service_name>/pipeline/` | `r2026-05-13T14-22-INCOMPLETE.md` | run-scoped |

## Common shape (all artifacts)

```yaml
---
id: <basename-without-extension>
type: <PRD|FRS|TDD|API|TSR|SAD|ADR|BR-AC|BUSINESS-INVARIANTS|GLOSSARY|C4-COMPONENT|ERD-LOGICAL|STATE-MACHINE|USECASE|README|TASKS|AGENT-TASKS|ESCALATE|DEADLOCK|INCOMPLETE|RUN-PLAN|EXPLORER-REPORT|CROSS-FEATURES|INTENT|INVENTORY>
created: <ISO-8601>
revision: <integer ≥ 1>
status: draft                       # draft | locked
verdict: PENDING                    # PENDING | PASS | FAIL | APPROVED | REQUEST_CHANGES
reverse_authoring_mode: cite-as-is  # cite-as-is | copy-and-modify | re-author — REQUIRED when authored by code-to-spec; omitted on spec-to-code
readers:
  - "@architect"
  - "@analyst"
sections:
  S-VISION-001:
    writer: "@product"
    status: locked
  S-NFR-001:
    writer: "@product"
    status: in_progress
---
```

**Frontmatter grammar (frozen).** Block-style only. No flow style (`{}`, `[]`), no anchors / aliases (`&`, `*`), no tags (`!!`), no in-block multi-doc separators (`---` / `...`), no block scalars (`|`, `>`). Indentation: 2 spaces per level. Keys: `[a-zA-Z][a-zA-Z0-9_-]*` only (no dots, no whitespace). Scalar types: `null` / `~`, `true` / `false`, signed integers, JSON-quoted strings — no float literals (write as quoted strings). String values containing `:`, `#`, leading/trailing whitespace, or YAML reserved words (`null`, `true`, `false`, `~`) MUST be JSON-quoted. Agent handles (`@product`, `@architect`) MUST be JSON-quoted because `@` is a YAML directive marker. Callers pass the already-sliced inner block (no `---` fences). The frontmatter parser is `hooks/lib/yaml-mini.js`'s `parse()`.

### `status:` <a id="S-STATUS-001"></a>

| value | meaning | who can write |
|---|---|---|
| `draft` | Author is iterating; downstream consumers may read but should not cite | The artifact's owning agent (per role table) |
| `locked` | Frozen; downstream lifts from this revision | Owning agent; subsequent writes by anyone else are rejected by `pre-write-check.js` `locked-status-reject` gate |

### `verdict:` <a id="S-VERDICT-001"></a>

Applies to TSR (eval / review verdicts), ADR (review verdict). Other types omit.

| value | semantic |
|---|---|
| `PENDING` | Initial state |
| `PASS` / `FAIL` | Empirical (evaluator on tests) |
| `APPROVED` / `REQUEST_CHANGES` | Inspection (reviewer) |

### `reverse_authoring_mode:` <a id="S-REVERSE-MODE-001"></a>

Set by code-to-spec authors. Three values reflect the per-artifact inspect+classify+author discipline:

| value | meaning |
|---|---|
| `cite-as-is` | Existing artifact at this path was `present-locked` AND already in plugin format; lifted unchanged as input to subsequent chain authors |
| `copy-and-modify` | Existing artifact present but with format-drift; frontmatter + anchors adapted; body content preserved |
| `re-author` | Artifact absent OR `present-draft` with structural divergence; full rewrite |

`spec-to-code`-authored artifacts omit this field (forward chain has no prior existence to classify against).

**Diagram exclusion.** Diagrams (`.puml`) OMIT the field even on reverse-pass. Reverse-pass always re-derives diagrams from source archaeology; the three-mode distinction (`cite-as-is` / `copy-and-modify` / `re-author`) does not apply to visual artifacts. Field permitted only on narrative artifacts (`.md`: SAD, business-invariants, BR-AC, PRD, FRS, TDD) and contract artifacts (`.yaml`: openapi, asyncapi, clientapi).

### `readers:` <a id="S-READERS-001"></a>

List of agents authorized to read this artifact. **Soft enforcement** — prompt-level discipline only. The `pre-write-check.js` `readers-scope-warning` gate reads the target artifact's frontmatter at write time; a write whose calling agent isn't in `readers:` is logged as a non-blocking warning.

### `sections:` <a id="S-SECTIONS-001"></a>

Multi-writer coordination. Map of `S-<TYPE>-NNN → { writer, status }` where `status ∈ {pending, in_progress, locked}`. Most artifacts have a single owning writer and a flat sections list; TSR exercises this most because `S-TEST-001` itself accepts a sequential dual-write (`@test-author` lays the plan rows with empty `status`/`evidence` cells; `@test-runner` fills those cells in place and locks). Other TSR sections: `@evaluator` owns `S-EVAL-001`; `@reviewer` owns `S-REVIEW-001`.

`pre-write-check.js` `all-sections-locked-reject` gate enforces:
- A writer not listed for a section's `writer:` cannot write to that section.
- A write whose target section is `locked` is rejected.
- A writer can only transition own sections (`pending → in_progress → locked`).

## Body grammar <a id="body-grammar"></a>

Every H2 heading in the body MUST carry an HTML anchor whose id matches a key in frontmatter `sections:`:

```markdown
## Vision <a id="S-VISION-001"></a>

A short URL service that …

## Non-Goals <a id="S-NON-GOALS-001"></a>

…
```

Anchor regex: `/^##\s+.*<a id="(S-[A-Z]+(?:-[A-Z]+)*-\d{3})"><\/a>/`. Multi-segment uppercase tags supported.

**Bidirectional invariant**: every key in `sections:` MUST have a matching `<a id>` in the body, and every `<a id>` in the body MUST have a matching key in `sections:`. `validate.js` flags either direction as a violation.

**Carve-outs** (no `sections:` block, body-grammar exempt) <a id="carve-outs"></a>: `intent.yaml`, `<feature-id>-TASKS.md`, `<feature-id>-ESCALATE-*.md`, `<feature-id>-DEADLOCK-*.md`, `<run-id>-INCOMPLETE.md`, `README.md` (provenance marker), session-level `agent-tasks.md` (hook-projected ledger), and `EXPLORER-REPORT` files under `.orchestra/plans/<session_id>/discovery/`.

### `## Changelog` (mandatory) <a id="changelog-block"></a>

Every artifact under `docs/**/*.md` opens its body with a `## Changelog` section as the FIRST body element, immediately after frontmatter and BEFORE any `S-<TAG>-NNN` anchor. Yaml chain artifacts (`<feature-id>-openapi.yaml`, `<feature-id>-asyncapi.yaml`, `<feature-id>-clientapi.yaml`) carry the same audit trail in a top-of-file `# Changelog:` comment block; rules below apply equally.

**Row format** (one per line):

```
- YYYY-MM-DDTHH:MM:SSZ | <action> by @<agent>|dispatcher | <one-line reason or revision_notes excerpt ≤ 100 chars>
```

**Action enum**: `created` | `revised` | `unlocked` | `re-locked` | `ratify-spec-amend` | `fix-source` | `regenerated`.

**Rules:**

1. First row of every artifact MUST have action `created` and `@<agent>` matching the original author. The same write that creates the artifact emits this row.
2. A `status: locked` artifact's LAST changelog row MUST have action `re-locked` OR `created` — a locked artifact in any other tail state is mid-transition and structurally invalid.
3. A `status: revision_requested` artifact's LAST changelog row MUST have action `unlocked`.
4. Rows are append-only; existing rows MUST NOT be modified, removed, or reordered. `pre-write-check.js` `changelog-append-only` gate enforces.
5. Reason excerpt ≤ 100 chars, single line, no markdown formatting.

**Transitions that emit rows:**

| Transition | Writer | Action |
|---|---|---|
| Initial author-write | `@<agent>` | `created` |
| Section update on draft artifact | `@<agent>` | `revised` |
| ratify-spec unlock | dispatcher via `mcp__orchestra-utils__amend_locked_artifact` | `unlocked` |
| ratify-spec amendment | authoring agent (typically `@architect`) on `task: ratify-spec-amend` | `ratify-spec-amend` |
| ratify-spec re-lock | dispatcher via `mcp__orchestra-utils__relock_artifact` | `re-locked` |
| fix-source closure | dispatcher | `fix-source` |
| Full regenerate (rare; user-driven) | dispatcher | `regenerated` |

**Carve-outs.** Exemption set defined at [#carve-outs](#carve-outs) above. The changelog block is mandatory ONLY on durable chain artifacts (PRD / FRS / SAD / ADR / TDD / TSR / BR-AC / business-invariants / glossary / openapi / asyncapi / clientapi / RUN-PLAN).

## Body discipline <a id="body-discipline"></a>

Per-agent writing-style rules live in each authoring agent's `## Writing style` section (e.g., `agents/architect.md`, and equivalents on the other authoring agents).

## Diagram bindings via `diagrams: [...]` relations array <a id="diagrams"></a>

Diagrams are sub-artifacts referenced via the parent's `diagrams:` frontmatter array. Each `.puml` lives under the parent artifact's `diagrams/` directory; `post-write-puml` renders the paired `.svg` on write and surfaces array/file/embed mismatches as non-blocking warnings.

**Diagram vocabulary** (which diagram-ids may appear in which parent's array):

| Parent | Diagram-id vocabulary |
|---|---|
| `SAD` | `c4-context`, `c4-container`, `erd-logical`, `sd-<full-cross-service-journey>` (authored under `scope_level: system-wide` only) |
| `BR-AC` | `c4-component`, `erd-logical`, `state-machine`, `usecase` — per-service singletons; each binds back as its own typed artifact (`C4-COMPONENT` / `ERD-LOGICAL` / `STATE-MACHINE` / `USECASE`); single-writer |
| `TDD` | `sd-<journey>` — per-feature only; structural / behavioral / requirements diagrams live at service-scope under BR-AC's singleton set |
| `ADR` | `adr-status` (mandatory), `option-<A,B,C>` (optional sketches) |

## Type-specific frontmatter

### `<feature-id>-PRD.md`

```yaml
status: draft | locked
verdict: PENDING
version: <semver>
```

PRD body MUST NOT contain fenced code blocks, codebase-paths, or codebase-specific identifiers (`codebase-token-reject` gate enforces).

### `<feature-id>-FRS.md`

```yaml
prd: <feature-id>-PRD
acceptance_criteria_count: <int>     # MUST equal S-AC-001 row count
usecase_count: <int>                 # MUST equal the use-case-rows this feature contributes to docs/<service_name>/diagrams/usecase.puml
```

FRS body MUST NOT contain fenced code blocks, codebase-paths, or codebase-specific identifiers (`codebase-token-reject` gate enforces).

### `<feature-id>-TDD.md`

```yaml
sad_touched: true | false
sequence_diagram_count: <int>            # MUST equal per-feature sd-<journey>.puml count
service_singletons_touched:              # paths the feature appends to (see schemas/run-plan.schema.md write_mode enum)
  - <service_name>-openapi.yaml          # if API endpoints added
  - c4-component                         # if new components / dependencies introduced
  - erd-logical                          # if persistence schema touched
  - state-machine                        # if lifecycle states added
  - usecase                              # if end-user use cases added (authored by @analyst)
diagrams:
  - sd-<journey>                         # one per Journey-gate outcome category; only per-feature diagram surface
```

Structural / behavioral / requirements diagrams (`c4-component`, `erd-logical`, `state-machine`, `usecase`) are per-service singletons, not per-feature. The TDD's `service_singletons_touched` enumerates which singletons the feature mutates; the actual diagram artifacts live at `<context_path>/docs/<service_name>/diagrams/*.puml`.

### `<service_name>-openapi.yaml` / `<service_name>-asyncapi.yaml` / `<service_name>-clientapi.yaml`

Per-service single-writer contract. OpenAPI/AsyncAPI/ClientAPI document is the artifact body; frontmatter contract lives in a top-of-file YAML comment block. Concurrent features touching the same service serialize at `@architect` spawn level; each feature's contribution is appended via `write_mode: append-endpoints` per `schemas/run-plan.schema.md`.

```yaml
# orchestra:
#   id: order-openapi
#   type: API
#   status: draft
#   verdict: PENDING
#   readers:
#     - "@architect"
#     - "@backend"
#     - "@frontend"
#     - "@test-author"
#     - "@test-runner"
#     - "@evaluator"
#     - "@reviewer"
#   sections:
#     S-API-001:
#       writer: "@architect"
#       status: in_progress
openapi: 3.0.3
info:
  title: Order Service API
  description: One-line imperative summary.
  version: 1.0.0
paths:
  ...
```

`pre-write-check.js` reads the comment block as if it were YAML frontmatter for status/sections enforcement.

<a id="iid-pairing"></a>
**Integration-point identity (`x-orchestra-iid`).** Every `paths.<route>.<method>` MUST carry an `x-orchestra-iid: <kebab>-<NNN>-<kebab>` extension as a sibling of `summary:` / `description:`. The id pairs a producer (`<service>-openapi.yaml` / `-asyncapi.yaml`) with its consumer (`<service>-clientapi.yaml`): a clientapi entry referencing iid `ord-001-place` MUST resolve to a producer with the same iid under `<workspace>/docs/**/*-{openapi,asyncapi}.yaml`. OpenAPI `x-*` vendor extensions support the field natively — no spec fork. Enforced by `pre-write-check.js` `iid-pairing-reject` gate; reverse-pass writes carrying `reverse_authoring_mode:` skip the gate (brownfield clientapi may reference producers not yet iid-tagged). Example sibling block:

```yaml
paths:
  /orders:
    post:
      x-orchestra-iid: ord-001-place
      summary: Place an order
      operationId: placeOrder
```

**Graph-backed completeness at lock (`inferred_paths`).** On `status: locked` an openapi artifact is checked against the persisted Java code-graph at `<context_path>/.orchestra/<service>/code-graph/graph.json`. Every graph endpoint MUST appear in `paths:` or in frontmatter `inferred_paths:` (string array; entries are `"METHOD /route"` or bare `"/route"`). Lock additionally requires `meta.commit == git rev-parse HEAD`. Enforced by `pre-write-check.js` `graph-backing-reject` gate; skipped when the graph is absent (greenfield, non-Java services).

```yaml
# orchestra:
#   id: order-openapi
#   type: API
#   status: locked
#   inferred_paths:
#     - "GET /internal/health"
#     - "/admin/diagnostics"
```

### `<feature-id>-TSR.md` (multi-writer) <a id="tsr-grammar"></a>

```yaml
status: draft                                 # draft | locked
verdict: PENDING
eval_verdict: PENDING                         # PENDING | PASS | FAIL
eval_score: 0                                 # 0..100
rev_verdict: PENDING                          # PENDING | APPROVED | REQUEST_CHANGES
rev_round: 1                                  # 1..3
sections:
  S-TEST-001:
    writer: "@test-author"                      # @test-author lays plan rows; @test-runner fills status+evidence cells, locks
    status: in_progress
  S-EVAL-001:
    writer: "@evaluator"
    status: pending
  S-REVIEW-001:
    writer: "@reviewer"
    status: pending
```

**Body-row grammar (no duplication between sections).** Each TSR section is a single source of truth for its concern.

`S-TEST-001` (sequential dual-writer: `@test-author` lays plan rows; `@test-runner` fills cells + locks) — one table, row shape:

```
| id | criterion | axis | critical | fixture | status | evidence |
```

`@test-author` fills `id` / `criterion` / `axis` / `critical` / `fixture` (status + evidence cells empty); section `status: in_progress`. `@test-runner` fills `status` + `evidence` cells in place and appends new rows only for newly-introduced white-box tests; section `status: locked`.

`S-EVAL-001` (writer `@evaluator`) — one table, row shape:

```
| id | verdict | reason |
```

`id` MUST reference an existing `S-TEST-001` row id; `verdict ∈ PASS | FAIL | PENDING`; `reason` is one short sentence (≤120 chars) citing the `@test-runner` `evidence` excerpt.

`S-REVIEW-001` (writer `@reviewer`) — per-severity findings (`Critical`, `Major`, `Minor`, `Nit`). When ADRs were touched in this feature, append a `## ADR review` subsection to `S-REVIEW-001`.

`validate.js` rejects a `locked` TSR missing any of `S-TEST-001`, `S-EVAL-001`, `S-REVIEW-001`, and rejects any `S-EVAL-001` row whose `id` is not present in `S-TEST-001`.

### SAD.md (project singleton)

```yaml
status: draft | locked
project_mode: greenfield | brownfield
c4_levels_present: [1, 2]
diagrams:
  - c4-context
  - c4-container
  - erd-logical                        # when persistence layer exists
  - sequence-inter-<flow>              # per cross-service flow
```

ADR count lives in `.orchestra/inventory/adr/index.md` frontmatter — see `schemas/inventory.adr-index.schema.md`.

### ADR-`<NNNN>`-`<slug>`.md (global) / ADR-`<service_name>`-`<NNN>`-`<slug>`.md (service)

```yaml
status: proposed | accepted | superseded | deprecated
verdict: PENDING | APPROVED | REQUEST_CHANGES
scope: global | service                 # decides path + numbering scheme
service_name: <string>                  # required when scope == service; omit when global
superseded_by: ADR-<NNNN>-<slug> | ADR-<service_name>-<NNN>-<slug> | null
triggered_by: <feature-id>-PRD | <feature-id>-FRS | <feature-id>-TDD | SAD | BR-AC
review_round: <1..3>
option_count: <int>
diagrams:
  - adr-status                         # mandatory
  - option-A                           # optional per-option sketches
  - option-B
```

`scope: global` → path `<context_path>/docs/adr/ADR-<NNNN>-<slug>.md`. `scope: service` → path `<context_path>/docs/<service_name>/adr/ADR-<service_name>-<NNN>-<slug>.md`. See `agents/architect.md` for the scope-decision rule.

`@architect` writes the body. `@reviewer` Edits only `S-CONSEQUENCES-001` (REQUEST_CHANGES findings) and writes `verdict:` + `review_round:`.

Required body anchors: `S-CONTEXT-001`, `S-DECISION-001`, `S-ALTERNATIVES-001`, `S-CONSEQUENCES-001`.

### `<service_name>-BR-AC.md` (per-service singleton)

```yaml
status: draft | locked
service_name: <string>
br_count: <int>                        # MUST equal S-BR-001 row count
ac_count: <int>                        # MUST equal S-AC-001 row count
```

Required body anchors: `S-BR-001` (Business Rules), `S-AC-001` (Acceptance Criteria), `S-INVARIANTS-001` (service-grain invariants).

### `business-invariants.md` (workspace-grain singleton)

```yaml
status: draft | locked
invariant_count: <int>                 # MUST equal S-INVARIANTS-001 row count
```

Required body anchors: `S-INVARIANTS-001` (cross-service business rules + invariants).

### `README.md` (docs/ provenance marker)

```yaml
id: docs-readme
type: README
generated_by: orchestra
status: locked
```

Authored on first `code-to-spec` run as classification beacon for future reverse-pass runs (`@product` / `@architect` / `@analyst` read `generated_by: orchestra` to decide `cite-as-is` vs `re-author`). Body-grammar exempt (no `sections:` block).

**Authoring is owned by `mcp__orchestra-utils__docs_readme(context_path)`** — the tool pins the four-field frontmatter shape above and writes a canonical body from `hooks/references/docs-readme.template.md`. `@architect` MUST NOT author this file via `Write`; the MCP tool guarantees a uniform body across consumer installs and removes the improvisation surface that produced earlier defects (phantom anchors, wrong layout trees, non-enum `type:` values).

### `<feature-id>-TASKS.md` (`.orchestra/<service_name>/pipeline/<feature-id>/`) <a id="tasks-frontmatter"></a>

```yaml
status: draft | locked
task_graph_node_count: <int>
estimated_sp: <int>
tasks_pending: <int>
tasks_in_progress: <int>
tasks_done: <int>
```

`S-TASKS-001` is **mutable by design** — implementer-tier owners (`@backend`, `@frontend`) flip rows from `pending → in_progress → done` on pickup/completion.

### `agent-tasks.md` AGENT-TASKS (`.orchestra/plans/<session_id>/`)

Session-level ledger of subagent task activity. Single file per Claude Code session aggregates rows across every subagent spawned in the session, indexed by `(agent, feature_id, task_id)` compound key. Hook-projected: `agent-plan-sync` reads each finished subagent's transcript on `SubagentStop`, extracts `TaskCreate` / `TaskUpdate` tool-call events, and upserts rows into the single file. Subagents do not write to this artifact directly.

```yaml
id: agent-tasks
type: AGENT-TASKS
session_id: <claude-code-session-id>
created: <ISO-8601>
updated: <ISO-8601>
revision: <integer ≥ 1>
status: in_progress | done
```

Body grammar (single `## Tasks` table; row order = insertion order; one row per `(agent, feature_id, task_id)` tuple):

```markdown
## Tasks

| agent     | feature_id          | task_id | description           | status      | updated              |
|-----------|---------------------|---------|-----------------------|-------------|----------------------|
| @backend  | order-001-checkout  | 1       | Create User entity    | completed   | 2026-05-23T10:14:02Z |
| @backend  | order-001-checkout  | 2       | Wire repository       | in_progress | 2026-05-23T10:18:11Z |
| @frontend | order-001-checkout  | 1       | Checkout form         | pending     | 2026-05-23T10:14:02Z |
```

**Row semantics:**

- `agent` — subagent role with `@` prefix (e.g., `@backend`, `@analyst`).
- `feature_id` — derived from subagent spawn-prompt (`<short-service-name>-<NNN>-<slug>`) OR `_workspace` for non-feature-scoped spawns (e.g., reverse-pass `@explorer`).
- `task_id` — Claude Code's assigned task identifier (opaque to orchestra; sourced from `TaskCreate` `tool_response.taskId`).
- `description` — one-line description, ≤ 200 chars, sourced from `tool_input.subject` (falls back to `tool_input.description`).
- `status` — `pending` | `in_progress` | `completed`. Derived from latest `TaskUpdate` event for this `task_id` within the subagent transcript; `pending` if only `TaskCreate` observed.
- `updated` — ISO-8601 timestamp of latest event observed for this row.

**Upsert key:** `(agent, feature_id, task_id)`. Subsequent `SubagentStop` events re-projecting the same subagent transcript overwrite the existing row (idempotent).

**File-level `status:`** flips `in_progress → done` when every row reaches `completed` AND no spawned subagent is still running (heuristic: hook can't observe parent state; `done` set only when the projecting `SubagentStop` event observes all rows `completed`).

Body-grammar exempt from `<a id>` ↔ `sections:` invariant (carve-out above). The hook is the single writer; agents must not write to this path.

### `<service>.md` EXPLORER-REPORT (`.orchestra/plans/<session_id>/discovery/`)

Per-service brownfield discovery summary. Authored by `@explorer` during Phase 1 — Discovery, one report per service in plan scope. Read by the main agent in Phase 2 — Plan to enumerate features in `## Features` and assign agents in `## Agent assignments`.

```yaml
id: <service>
type: EXPLORER-REPORT
service: <string>                       # the service this report covers
session_id: <string>                    # = Claude Code session-id from preflight
agent_role: "@explorer"
subagent_session_id: <string>           # the spawn session-id; joins to events.jsonl
created: <ISO-8601>
status: locked                          # explorer reports are write-once
```

Required body anchors:

- `S-FEATURES-DISCOVERED-001` — `## Features discovered` — `| Feature slug | Source anchors | Complexity | Persistence touched | Integrations touched |`. Per-row:
  - `Feature slug` — proposed `<short-service-name>-<NNN>-<slug>` (main agent may rename in plan).
  - `Source anchors` — prose anchors describing observable code surfaces (e.g., "order placement REST controller"). Anchors are described in prose, never as filesystem paths (`codebase-token-reject` gate enforces).
  - `Complexity` — `low` | `medium` | `high` per `@explorer`'s rubric (defined in `agents/explorer.md`).
  - `Persistence touched` — `true` | `false`. Drives `service_singletons_touched` planning for `erd-logical.puml`.
  - `Integrations touched` — `true` | `false`. Drives ADR-candidate surfacing.

- `S-ADR-CANDIDATES-001` — `## ADR candidates` — `| Decision | Found at | Rationale |`. Surfaced architectural decisions found in source archaeology that warrant ADR authoring in the forward chain. Empty table allowed (no candidates surfaced) — anchor still REQUIRED.

Body-grammar exempt from `<a id>` ↔ `sections:` invariant (carve-out above) — anchors are conventional but `sections:` block is omitted because the report is write-once at the file level.

### `<feature-id>-ESCALATE-<slug>.md`, `<feature-id>-ESCALATE-ADR-<NNNN>.md`, `<feature-id>-DEADLOCK-<slug>.md`

```yaml
triggered_by_<stage|agent>: <value>
resolution: pending | resolved-via-<X> | abandoned
direction: <free-text — present only when resolved>
strike_count: <int>
```

Body-grammar carve-out applies (no `sections:` block).

## src/ ↔ docs/ cite denylist (bidirectional) <a id="cite-rejects"></a>

Enforced by `hooks/scripts/pre-write-check.js`. Both directions reject the write on hit.

**`chain-cite-reject` (src/** ← docs/-anchor cite)** — writes to `<context_path>/services/<service_name>/src/**` (and language equivalents) rejecting chain-artifact section-anchor cites. Token classes: PRD / FRS / TDD / CONTRACT / TSR section-anchor; ADR-NNNN section-anchor; FR-N / AC-N / C-N / NFR-N; S-`<UPPER>`-NNN; openapi-path-fragments. Canonical regex source: `hooks/lib/cite-patterns.js > CITE_DENYLIST_RE`.

**`codebase-token-reject` (docs/** ← codebase token)** — writes to chain-artifact `.md` files under `<context_path>/docs/<service_name>/**` (filenames: `PRD`, `FRS`, `SAD`, `ADR-NNNN`, `TDD`, `TSR`, `BR-AC`, `business-invariants`) reject codebase path tokens (`src/`, `services/<…>/src/`, `app/`, `cmd/`, `pkg/`, `internal/`, `lib/`), codebase-specific identifiers (commit SHAs `\b[0-9a-f]{7,40}\b`, branch patterns `feature/<…>`/`release/<…>`, repo URLs `github.com/…`/`gitlab.com/…`), and — PRD/FRS only — fenced code blocks.

## Validation

Frontmatter shape validators live in `scripts/validate.js`; the write-time gates (`locked-status-reject`: `status: locked` rejects non-owner writes; `all-sections-locked-reject`: `sections:` enforces per-section writer + lock; `readers-scope-warning`: `readers:` allowlist warning; `chain-cite-reject` + `codebase-token-reject`: bidirectional cite denylist per `#cite-rejects`) plus secrets matcher live in `hooks/scripts/pre-write-check.js`. Drift detection via `git diff` in CI on `locked` artifacts.

## Versioning

Bump `revision:` when adding/renaming type-specific keys, when adding/removing artifact types, or when changing the diagram-binding vocabulary. Additive changes that older readers can ignore (new optional field) do NOT bump `revision`.
