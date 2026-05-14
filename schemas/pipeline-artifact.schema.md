---
id: PIPELINE-SCHEMA
title: orchestra Pipeline Artifact Frontmatter Schemas
created: 2026-05-08
status: draft
revision: 8
scope: type-specific frontmatter shapes for every artifact authored by the orchestra agents.
---

# orchestra Pipeline Artifact Frontmatter Schemas

> Frontmatter contract for every consumer-side artifact the chain produces.
> The chain spine: PRD → FRS → SAD → ADR → TDD → openapi (or asyncapi) →
> code + tests → TSR. Business invariants live in workspace-grain
> `business-invariants.md` and per-service `<service_name>-BR-AC.md`.
> Review-state and per-section locks live in artifact frontmatter; drift
> detection runs via `git diff`.

## Placement model — `docs/` vs `.orchestra/`

Two project-side roots. They serve different audiences and lifetimes — never mix them.

| Root | Audience | Contents | Lifetime |
|---|---|---|---|
| `<project>/docs/` | Humans (PMs, leads, reviewers, ops) | Stakeholder deliverables | Durable; PR-reviewable; cited across artifacts |
| `<project>/.orchestra/` | Agents + plugin internals | Pipeline-internal coordination + runtime state | Ephemeral or run-bound; never PR-reviewed for content |

Litmus: would you link this from a PR description for a non-engineer reviewer? `docs/` if yes, `.orchestra/` if no.

## Two-tier placement <a id="two-tier-placement"></a>

| Tier | Root | Contents |
|---|---|---|
| system | `<context_path>/docs/` | `README.md` (provenance marker), `SAD.md`, `business-invariants.md`, `adr/ADR-NNNN-<slug>.md`, `diagrams/*.puml` |
| feature | `<context_path>/docs/<service_name>/` | `<service_name>-BR-AC.md`, `<feature-id>/<feature-id>-PRD.md`, `<feature-id>-FRS.md`, `<feature-id>-TDD.md`, `<feature-id>-openapi.yaml`, `<feature-id>-asyncapi.yaml`, `<feature-id>-TSR.md` |

Every artifact path embeds the elected `service_name`. Single-repo workspaces still nest under `<context_path>/docs/<service_name>/`. `diagrams/` always nests under the matching tier's `docs/` root — bare `<context_path>/diagrams/` is forbidden.

## Link discipline — `docs/` is a sealed, portable narrative tree <a id="link-discipline"></a>

The `<context_path>/docs/` tree is a self-contained narrative for human stakeholders AND a portable specification: docs authored under one project must be valid `spec-to-code` inputs in another project unchanged. A reader walking the tree MUST NOT have to open the codebase, an external URL, or the `.orchestra/` sibling to resolve references.

**Forbidden in `docs/*` artifact bodies** (enforced by `pre-write-check.js` Gate-D inverse):

- **Codebase paths** — `src/foo/Bar.java`, `services/order/src/main/...`, `path/to/file:42`. Describe components by their architectural role, not their file location.
- **External URLs** — RFCs, vendor documentation, GitHub, Stack Overflow. Capture the constraint inline in prose without URL.
- **`.orchestra/` sibling paths** — `.orchestra/<service_name>/run-plan.md`. The plugin's internal coordination state is opaque to readers of `docs/`.
- **Codebase-specific identifiers** — commit SHAs (`a1b2c3d`), branch names (`feature/order-v2`), repo URLs (`github.com/...`).
- **In PRD / FRS only** — fenced code blocks (\`\`\`...\`\`\`). Inline backticks for short identifiers (`OrderState`) are allowed; multi-line snippets are not. PRD/FRS are pure business; technical artifacts (SAD/ADR/TDD/openapi/TSR) may carry inline pseudocode snippets.

**Allowed in `docs/*` artifact bodies:**

- **Cross-references between `docs/*` artifacts** — relative paths within `docs/`. `docs/SAD.md` may reference `docs/<service_name>/<service_name>-BR-AC.md`; BR-AC may reference `docs/<service_name>/<feature-id>/<feature-id>-PRD.md`.
- **ADR citations by ID in plain prose** — "per ADR-0007-use-postgres, ...". The reader resolves the ID against `docs/adr/...` (global) or `docs/<service_name>/adr/...` (service).
- **Anchor citations within `docs/*`** — `SAD/S-CONTAINERS-001`, `BR-AC/S-INVARIANTS-001`.

**Inventory-style indexes belong outside `docs/`.** ADR index (`<context_path>/.orchestra/inventory/adr/index.md`) and any future index live under `.orchestra/inventory/`. Indexes mutate frequently and are derivative; `docs/` carries stable narrative.

**Why portable + sealed:** `docs/` is the artifact tier humans review, stakeholders sign, AND `spec-to-code` consumes as input in a clean project. Codebase paths rot the moment files move. External URLs may go dead. Commit SHAs are project-instance identifiers that don't survive a copy.

## Folder layout

### Feature-id format <a id="S-FEATURE-ID-FMT-001"></a>

`<feature-id> = <NNN>-<slug>` where:

- `<NNN>` is a zero-padded 3-digit ordinal, monotonically incremented per project. `NNN = max(existing docs/<NNN>-*) + 1`; first feature is `001`.
- `<slug>` is kebab-case, ASCII letters + digits only, derived from the feature name. Length ≤ 40 chars.

Examples: `001-todo-api`, `002-user-auth`, `003-payment-flow`.

Every per-feature artifact filename embeds the full feature-id as a prefix: `<feature-id>-<TYPE>.<ext>` (e.g., `001-todo-api-PRD.md`, `001-todo-api-openapi.yaml`). The frontmatter `id:` field MUST equal the basename without extension.

### Doc-provenance marker <a id="S-DOC-PROVENANCE-001"></a>

The reverse pass authors `<context_path>/docs/README.md` on first run with frontmatter `generated_by: orchestra`. Subsequent runs read the marker via `orchestra-preflight.js` to classify existing chain artifacts as plugin-format (eligible for `cite-as-is` / `copy-and-modify` in reverse-pass per-artifact discipline). Absent marker → all reverse-pass classifications default to `re-author`.

### `<project>/docs/` (stakeholder surface)

```
<project>/docs/
├── README.md                            ← provenance marker (generated_by: orchestra)
├── SAD.md                               ← system-level singleton
├── business-invariants.md               ← workspace-grain BR/AC (cross-service)
├── adr/
│   └── ADR-NNNN-<slug>.md               ← global flat numbering; ADRs accrete
├── diagrams/                            ← system-level (each *.puml has paired *.svg)
│   ├── c4-context.{puml,svg}
│   ├── c4-container.{puml,svg}
│   ├── erd-logical.{puml,svg}
│   └── sequence-inter-<flow>.{puml,svg}
└── <service_name>/                      ← per-service partition
    ├── <service_name>-BR-AC.md          ← per-service BR + AC singleton
    └── <feature-id>/                    ← per-feature
        ├── <feature-id>-PRD.md
        ├── <feature-id>-FRS.md
        ├── <feature-id>-TDD.md
        ├── <feature-id>-openapi.yaml    (or <feature-id>-asyncapi.yaml)
        ├── <feature-id>-TSR.md          (multi-writer)
        └── diagrams/                    ← per-feature
            ├── state-business.{puml,svg}
            ├── sequence-intra-<usecase>.{puml,svg}
            ├── c4-component.{puml,svg}
            ├── state-technical.{puml,svg}    (if applicable)
            └── erd-physical.{puml,svg}       (if schema touched)
```

### `<project>/.orchestra/` (agent + plugin internals)

Workspace-global state at the `.orchestra/` root; per-service execution state partitioned under `.orchestra/<service_name>/`.

```
<project>/.orchestra/
├── system.yaml                         ← workspace config (workspace_kind, context_path)
├── manifest.json                       ← idempotency registry
├── events.jsonl                        ← event log
├── metrics/                            ← per-role / per-phase token attribution
│   ├── <run-id>.json
│   ├── cost-by-phase.json
│   └── runs/<run-id>.json              ← keyed by run_id
└── <service_name>/                     ← per-service execution state
    ├── local.yaml                                  ← service config
    ├── run-plan.md                                 ← per-service feature list + execution sequence
    ├── pipeline/                                   ← coordination root
    │   ├── <run-id>-INCOMPLETE.md                  ← run-scoped parity probe (terminal state)
    │   └── <feature-id>/
    │       ├── intent.yaml                         ← routing decision (input to @lead)
    │       ├── <feature-id>-TASKS.md               ← lead → implementer task breakdown
    │       ├── <feature-id>-DEADLOCK-<slug>.md     ← transient
    │       ├── <feature-id>-ESCALATE-<slug>.md     ← transient
    │       └── <feature-id>-ESCALATE-ADR-<NNNN>.md ← ADR-trigger marker
    └── tasks/<run-id>/<agent>/<feature-id>.md      ← per-agent execution plan (PLAN type)
```

Lifetime notes:
- `intent.yaml` + `<feature-id>-TASKS.md` are run-scoped — kept across reruns for idempotency.
- `<feature-id>-DEADLOCK-*.md` / `<feature-id>-ESCALATE-*.md` / `<run-id>-INCOMPLETE.md` are transient by design.
- `events.jsonl` and `metrics/` accrete; observability fuel.

Type → folder map:

| Type | Folder | Example | Notes |
|---|---|---|---|
| `PRD`, `FRS`, `TDD`, `TSR` | `docs/<service_name>/<feature-id>/` | `001-order-placement-PRD.md` | per-feature; filename = `<feature-id>-<TYPE>.md` |
| `API` (openapi/asyncapi) | `docs/<service_name>/<feature-id>/` | `001-order-placement-openapi.yaml` | per-feature; filename = `<feature-id>-openapi.yaml` or `<feature-id>-asyncapi.yaml` |
| `BR-AC` | `docs/<service_name>/` | `order-BR-AC.md` | per-service BR + AC singleton |
| `BUSINESS-INVARIANTS` | `docs/` | `business-invariants.md` | workspace-grain singleton; cross-service business rules |
| `SAD` | `docs/` | `SAD.md` | system-level singleton |
| `ADR` (global) | `docs/adr/` | `ADR-0001-use-sqlite.md` | affects ≥2 services; project-wide flat 4-digit numbering |
| `ADR` (service) | `docs/<service_name>/adr/` | `ADR-order-001-use-outbox.md` | affects exactly one service; per-service 3-digit numbering |
| `README` | `docs/` | `README.md` | provenance marker (`generated_by: orchestra`) |
| `RUN-PLAN` | `.orchestra/<service_name>/` | `run-plan.md` | per-service singleton |
| `TASKS` | `.orchestra/<service_name>/pipeline/<feature-id>/` | `001-order-placement-TASKS.md` | agent-internal |
| `PLAN` | `.orchestra/<service_name>/tasks/<run-id>/<agent>/` | `001-order-placement.md` | per-agent execution plan |
| `ESCALATE`, `DEADLOCK`, `ESCALATE-ADR` | `.orchestra/<service_name>/pipeline/<feature-id>/` | `001-order-placement-ESCALATE-spec-gap.md` | transient |
| `INCOMPLETE` | `.orchestra/<service_name>/pipeline/` | `r2026-05-13T14-22-INCOMPLETE.md` | run-scoped |

## Common shape (all artifacts)

```yaml
---
id: <basename-without-extension>
type: <PRD|FRS|TDD|API|TSR|SAD|ADR|BR-AC|BUSINESS-INVARIANTS|README|TASKS|PLAN|ESCALATE|DEADLOCK|INCOMPLETE|RUN-PLAN>
created: <ISO-8601>
revision: <integer ≥ 1>
status: draft                       # draft | locked
verdict: PENDING                    # PENDING | PASS | FAIL | APPROVED | REQUEST_CHANGES
reverse_authoring_mode: cite-as-is  # cite-as-is | copy-and-modify | re-author — REQUIRED when authored by code-to-spec; omitted on spec-to-code
readers:
  - "@architect"
  - "@lead"
sections:
  S-VISION-001:
    writer: "@product"
    status: locked
  S-NFR-001:
    writer: "@product"
    status: in_progress
---
```

**Frontmatter grammar (frozen).** Block-style only. No flow style. No anchors / aliases. Indentation: 2 spaces per level. String values containing `:`, `#`, leading/trailing whitespace, or YAML reserved words (`null`, `true`, `false`, `~`) MUST be JSON-quoted. Agent handles (`@product`, `@lead`) MUST be JSON-quoted because `@` is a YAML directive marker. The frontmatter parser is `hooks/lib/yaml-mini.js`'s `parse()`.

### `status:` <a id="S-STATUS-001"></a>

| value | meaning | who can write |
|---|---|---|
| `draft` | Author is iterating; downstream consumers may read but should not cite | The artifact's owning agent (per role table) |
| `locked` | Frozen; downstream lifts from this revision | Owning agent; subsequent writes by anyone else are rejected by `pre-write-check.js` Gate-A |

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

### `readers:` <a id="S-READERS-001"></a>

List of agents authorized to read this artifact. **Soft enforcement** — prompt-level discipline only. The `pre-write-check.js` Gate-C reads the target artifact's frontmatter at write time; a write whose calling agent isn't in `readers:` is logged as a non-blocking warning.

### `sections:` <a id="S-SECTIONS-001"></a>

Multi-writer coordination. Map of `S-<TYPE>-NNN → { writer, status }` where `status ∈ {pending, in_progress, locked}`. Most artifacts have a single owning writer and a flat sections list; TSR exercises this most because it has three writers (`@test` for `§test-plan`, `@evaluator` for `§verdict-evaluator`, `@reviewer` for `§verdict-reviewer`).

`pre-write-check.js` Gate-B enforces:
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

**Carve-outs** (no `sections:` block, body-grammar exempt): `intent.yaml`, `<feature-id>-TASKS.md`, `<feature-id>-ESCALATE-*.md`, `<feature-id>-DEADLOCK-*.md`, `<run-id>-INCOMPLETE.md`, `README.md` (provenance marker), and per-agent `PLAN` files.

## Body discipline — no storytelling, no yapping <a id="body-discipline"></a>

Artifacts under `docs/` are stakeholder deliverables. Deliver decisions and contracts, not narrative. On every write:

- **State, don't justify.** Each FR / AC / NFR / persona / decision is one substantive sentence (or a fact bullet).
- **Personas: real, business-domain, system-interacting.** Use names from the consumer's actual domain (`Client`, `Web`, `App`, `Customer`, `Driver`, `Merchant`, `Operator`). A persona is a role that uses the *running system*. Do not invent meta-narrative stand-ins.
- **Out-of-scope = what the request scoped out.** List items the user explicitly excluded.
- **Bullets over prose.** Default to bullets. Reserve paragraphs for connected reasoning that genuinely needs them.
- **No orchestra plumbing in stakeholder bodies.** Do not name `@product` / `@lead` / `@architect` / `@test` / `@evaluator` / `@reviewer` in PRD / FRS / SAD / TDD / ADR / TSR bodies. The chain is invisible to the human reading the artifact. Cross-references between consumer artifacts ARE fine.

## Diagram bindings via `diagrams: [...]` relations array <a id="diagrams"></a>

Diagrams are sub-artifacts of SAD and TDD, referenced via the `diagrams:` frontmatter array. Each `.puml` lives under the parent artifact's `diagrams/` directory, renders to `.svg` via the `plantuml` skill (`post-write-puml` hook enforces render-on-write), and embeds inline in the parent `.md` via `![title](diagrams/<name>.svg)`.

**Diagram vocabulary** (which diagram-ids may appear in which parent's array):

| Parent | Diagram-id vocabulary |
|---|---|
| `SAD` | `c4-context`, `c4-container`, `erd-logical`, `sequence-inter-<flow>` |
| `TDD` | `c4-component`, `sequence-intra-<usecase>`, `state-business`, `state-technical`, `erd-physical` |
| `ADR` | `adr-status` (mandatory), `option-<A,B,C>` (optional sketches) |

The parent's `diagrams: [...]` array enumerates the diagram-ids actually authored for this artifact. `post-write-puml.js` hook checks: every id in the array has a corresponding `<id>.puml` + `<id>.svg` under the parent's `diagrams/` directory, AND the parent body has an inline `![…](diagrams/<id>.svg)` embed. Mismatches surface as non-blocking warnings.

## Type-specific frontmatter

### `<feature-id>-PRD.md`

```yaml
status: draft | locked
verdict: PENDING
version: <semver>
```

PRD body MUST NOT contain fenced code blocks, codebase-paths, or codebase-specific identifiers (Gate-D inverse enforces).

### `<feature-id>-FRS.md`

```yaml
prd: <feature-id>-PRD
acceptance_criteria_count: <int>     # MUST equal S-AC-001 row count
usecase_count: <int>                 # MUST equal state-business diagram actor-count
```

FRS body MUST NOT contain fenced code blocks, codebase-paths, or codebase-specific identifiers (Gate-D inverse enforces).

### `<feature-id>-TDD.md`

```yaml
sad_touched: true | false
sequence_diagram_count: <int>
state_machine_count: <int>
schema_touched: true | false
diagrams:
  - c4-component
  - sequence-intra-checkout
  - state-business
  - state-technical                  # when applicable
  - erd-physical                     # when schema touched
```

### `<feature-id>-openapi.yaml` / `<feature-id>-asyncapi.yaml`

OpenAPI/AsyncAPI document is the artifact body. Frontmatter contract lives in a top-of-file YAML comment block:

```yaml
# orchestra:
#   id: 001-todo-api-openapi
#   type: API
#   status: draft
#   verdict: PENDING
#   readers:
#     - "@architect"
#     - "@lead"
#     - "@backend"
#     - "@frontend"
#     - "@test"
#     - "@evaluator"
#     - "@reviewer"
#   sections:
#     S-API-001:
#       writer: "@lead"
#       status: in_progress
openapi: 3.0.3
info:
  title: Todo API
  description: One-line imperative summary.
  version: 1.0.0
paths:
  ...
```

`pre-write-check.js` reads the comment block as if it were YAML frontmatter for status/sections enforcement.

### `<feature-id>-TSR.md` (multi-writer)

```yaml
status: draft                                 # draft | locked
verdict: PENDING
eval_verdict: PENDING                         # PENDING | PASS | FAIL
eval_score: 0                                 # 0..100
rev_verdict: PENDING                          # PENDING | APPROVED | REQUEST_CHANGES
rev_round: 1                                  # 1..3
sections:
  S-TEST-001:
    writer: "@test"
    status: in_progress
  S-EVAL-001:
    writer: "@evaluator"
    status: pending
  S-REVIEW-001:
    writer: "@reviewer"
    status: pending
```

**Body-row grammar (no duplication between sections).** Each TSR section is a single source of truth for its concern.

`S-TEST-001` (writer `@test`, both stages) — one table, row shape:

```
| id | criterion | axis | critical | fixture | status | evidence |
```

Stage-1 fills `id` / `criterion` / `axis` / `critical` / `fixture` (status + evidence cells empty); section `status: in_progress`. Stage-2 fills `status` + `evidence` cells in place and appends new rows only for newly-introduced white-box tests; section `status: locked`.

`S-EVAL-001` (writer `@evaluator`) — one table, row shape:

```
| id | verdict | reason |
```

`id` MUST reference an existing `S-TEST-001` row id; `verdict ∈ PASS | FAIL | PENDING`; `reason` is one short sentence (≤120 chars) citing the Stage-2 `evidence` excerpt.

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
generated_by: orchestra
```

Authored on first `code-to-spec` run. Body: short description of the docs/ tree layout. Body-grammar exempt (no `sections:` block).

### `<feature-id>-TASKS.md` (`.orchestra/<service_name>/pipeline/<feature-id>/`)

```yaml
status: draft | locked
task_graph_node_count: <int>
estimated_sp: <int>
tasks_pending: <int>
tasks_in_progress: <int>
tasks_done: <int>
```

`S-TASKS-001` is **mutable by design** — implementer-tier owners (`@backend`, `@frontend`) flip rows from `pending → in_progress → done` on pickup/completion.

### `<feature-id>.md` PLAN (`.orchestra/<service_name>/tasks/<run-id>/<agent>/`)

Per-agent execution plan. The agent authors the body before any artifact write or substantial Bash; the `agent-plan-sync` hook owns mutation of `tasks:`, `tasks_pending`, `tasks_in_progress`, `tasks_done`, and lifecycle `status:` flips on `Task*` tool use and on `SubagentStop`.

```yaml
id: <feature-id>
type: PLAN
agent: "@<role>"
run_id: <parent-dispatcher-session-id>
feature_id: <feature-id>
created: <ISO-8601>
updated: <ISO-8601>
status: pending | in_progress | interrupted | done
tasks_pending: <int>
tasks_in_progress: <int>
tasks_done: <int>
tasks:
  - id: T-001
    description: <one-line>
    status: pending | in_progress | completed
```

Body grammar (free-form, no `<a id>` anchors required):

```markdown
## Approach
<2-5 sentence narrative — what the agent intends to do, in what order, citing inputs it will read and outputs it will write>

## Tasks
- [ ] T-001 — <one-line>
- [ ] T-002 — <one-line>
- [x] T-003 — <one-line>      # completed
```

The agent body owns the `## Approach` section. The hook owns the `## Tasks` checklist sync.

### `<feature-id>-ESCALATE-<slug>.md`, `<feature-id>-ESCALATE-ADR-<NNNN>.md`, `<feature-id>-DEADLOCK-<slug>.md`

```yaml
triggered_by_<stage|agent>: <value>
resolution: pending | resolved-via-<X> | abandoned
direction: <free-text — present only when resolved>
strike_count: <int>
```

Body-grammar carve-out applies (no `sections:` block).

## src/ ↔ docs/ cite denylist (Gate-D bidirectional) <a id="gate-d"></a>

`pre-write-check.js` Gate-D rejects writes in BOTH directions:

**Gate-D (existing direction)** — writes to `<context_path>/services/<service_name>/src/**` (and language equivalents) that contain any of:

```
PRD §<N>                              FR-<N>
FRS §<N>                              AC-<N>
TDD §<N>                              C-<N>
CONTRACT §<N>                         NFR-<N>
TSR §<N>                              S-<UPPER>-<NNN>
ADR-<NNNN> §<N>                       openapi.yaml#/paths/
```

Regex:
```
/(?:PRD|FRS|TDD|CONTRACT|TSR)\s*§\s*\d+|ADR-\d{4}\s*§\s*\d+|\b(?:FR|AC|C|NFR)-\d+\b|\bS-[A-Z]+(?:-[A-Z]+)*-\d{3}\b|openapi\.yaml#\/paths\//
```

**Gate-D inverse (new direction)** — writes to chain-artifact `.md` files under `<context_path>/docs/<service_name>/**` (matching filename pattern: `PRD`, `FRS`, `SAD`, `ADR-NNNN`, `TDD`, `TSR`, `BR-AC`, `business-invariants`) reject:

1. **Codebase path tokens** — `src/`, `services/<…>/src/`, language equivalents (`app/`, `cmd/`, `pkg/`, `internal/`, `lib/`).
2. **Codebase-specific identifiers** — commit SHAs (`\b[0-9a-f]{7,40}\b` with context check), branch-name patterns (`feature/<…>`, `release/<…>`), repo URLs (`github.com/…`, `gitlab.com/…`).
3. **PRD / FRS only** — fenced code blocks (lines beginning with three backticks). Inline backticks for short identifiers remain allowed.

Reason: docs are stakeholder-readable AND project-portable. Specs from project A must round-trip into project B unchanged.

## Validation

- `validate.js` exposes pure functions: `validateStructuralDiff`, `validateOrphanTypes`, `validateFoldCorrectness`, `validateSoftCap`.
- Drift detection: `git diff` in CI. If a `locked` artifact has uncommitted changes outside an authoring run, CI flags it.
- `pre-write-check.js` four gates (in addition to the secrets matcher):
  - **Gate-A** — `status: locked` rejects non-owner writes.
  - **Gate-B** — `sections:` map enforces per-section writer + lock.
  - **Gate-C** — `readers:` allowlist; non-blocking warning.
  - **Gate-D** — bidirectional cite denylist; exit 2 on hit in either direction.

## Versioning

Bump `revision:` when adding/renaming type-specific keys, when adding/removing artifact types, or when changing the diagram-binding vocabulary. Additive changes that older readers can ignore (new optional field) do NOT bump `revision`.
