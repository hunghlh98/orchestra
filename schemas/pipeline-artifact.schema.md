---
id: PIPELINE-SCHEMA
title: orchestra Pipeline Artifact Frontmatter Schemas
created: 2026-05-08
status: draft
revision: 7
scope: type-specific frontmatter shapes for every artifact authored by the orchestra agents.
---

# orchestra Pipeline Artifact Frontmatter Schemas

> Frontmatter contract for every consumer-side artifact the chain produces.
> The chain spine: PRD → FRS → SAD → ADR → TDD → openapi (or asyncapi) →
> code + tests → TSR. Lockfile sidecars are gone; review-state,
> reader-scope, and per-section locks live in artifact frontmatter.
> Drift detection moves to `git diff`; idempotency keys live in
> `<project>/.orchestra/manifest.json`.

## Placement model — `docs/` vs `.orchestra/`

Two project-side roots. They serve different audiences and lifetimes — never mix them.

| Root | Audience | Contents | Lifetime |
|---|---|---|---|
| `<project>/docs/` | Humans (PMs, leads, reviewers, ops) | Stakeholder deliverables | Durable; PR-reviewable; cited across artifacts |
| `<project>/.orchestra/` | Agents + plugin internals | Pipeline-internal coordination + runtime state | Ephemeral or run-bound; never PR-reviewed for content |

Litmus: would you link this from a PR description for a non-engineer reviewer? `docs/` if yes, `.orchestra/` if no.

## Three-tier placement <a id="three-tier-placement"></a>

| Tier | Root | Contents | Diagram levels |
|---|---|---|---|
| system | `<context_path>/docs/` | `SAD.md`, `adr/ADR-NNNN-<slug>.md`, `diagrams/*.puml` | C4 L1, L2 |
| service | `<context_path>/docs/<service_name>/` | `<service_name>-CSD.md` (brownfield + `scope_level ∈ {container, service}`) | — (CSD is text-only) |
| feature | `<context_path>/docs/<service_name>/<feature-id>/` | `<feature-id>-PRD.md`, `<feature-id>-FRS.md`, `<feature-id>-TDD.md`, `<feature-id>-openapi.yaml`, `<feature-id>-asyncapi.yaml`, `<feature-id>-TSR.md` | C4 L3 |

Every artifact path embeds the elected `service_name` (workspace-relative basename of the service directory; persisted in `<context_path>/.orchestra/<service_name>/local.yaml`). Single-service workspaces still nest under `<context_path>/docs/<service_name>/` — the partition is uniform, not conditional on `workspace_kind`. `diagrams/` always nests under the matching tier's `docs/` root — bare `<context_path>/diagrams/` is forbidden.

## Folder layout

### Feature-id format <a id="S-FEATURE-ID-FMT-001"></a>

`<feature-id> = <NNN>-<slug>` where:

- `<NNN>` is a zero-padded 3-digit ordinal, monotonically incremented per project. `NNN = max(existing docs/<NNN>-*) + 1`; first feature is `001`.
- `<slug>` is kebab-case, ASCII letters + digits only, derived from the feature name. Length ≤ 40 chars.

Examples: `001-todo-api`, `002-user-auth`, `003-payment-flow`.

Every per-feature artifact filename embeds the full feature-id as a prefix: `<feature-id>-<TYPE>.<ext>` (e.g., `001-todo-api-PRD.md`, `001-todo-api-openapi.yaml`). The frontmatter `id:` field MUST equal the basename without extension.

### `<project>/docs/` (stakeholder surface)

```
<project>/docs/
├── README.md, CONTRIBUTING.md, SLO.md   ← user-authored; plugin doesn't trample
├── SAD.md                               ← system-level singleton
├── adr/
│   └── ADR-NNNN-<slug>.md               ← global flat numbering; ADRs accrete
├── diagrams/                            ← system-level (each *.puml has paired *.svg)
│   ├── c4-context.{puml,svg}
│   ├── c4-container.{puml,svg}
│   ├── erd-logical.{puml,svg}
│   └── sequence-inter-<flow>.{puml,svg} (one per cross-service flow)
└── <service_name>/                       ← per-service partition (e.g., order/, payment-engine/)
    ├── <service_name>-CSD.md             ← per-service singleton (brownfield + scope_level ∈ {container, service})
    └── <feature-id>/                     ← per-feature; <feature-id> = <NNN>-<slug>
        ├── <feature-id>-PRD.md           (e.g., 001-order-placement-PRD.md)
        ├── <feature-id>-FRS.md
        ├── <feature-id>-TDD.md
        ├── <feature-id>-openapi.yaml     (or <feature-id>-asyncapi.yaml)
        ├── <feature-id>-TSR.md           (multi-writer: §test-plan @test, §verdict-evaluator @evaluator, §verdict-reviewer @reviewer + ADR review)
        └── diagrams/                     ← per-feature
            ├── state-business.{puml,svg}
            ├── sequence-inter-<flow>.{puml,svg}
            ├── c4-component.{puml,svg}
            ├── sequence-intra-<usecase>.{puml,svg}
            ├── state-technical.{puml,svg}    (if applicable)
            └── erd-physical.{puml,svg}       (if schema touched)
```

Per-feature artifacts: `<feature-id>-PRD.md`, `<feature-id>-FRS.md`, `<feature-id>-TDD.md`, `<feature-id>-openapi.yaml` (or `<feature-id>-asyncapi.yaml`), `<feature-id>-TSR.md`. Per-service artifacts: `<service_name>-CSD.md` (brownfield, container/service grain).

### `<project>/.orchestra/` (agent + plugin internals)

Workspace-global state at the `.orchestra/` root; per-service execution state partitioned under `.orchestra/<service_name>/`.

```
<project>/.orchestra/
├── system.yaml                         ← workspace config (workspace_kind, context_path)
├── inventory.md                        ← workspace classification (brownfield only)
├── manifest.json                       ← idempotency registry (workspace-wide)
├── events.jsonl                        ← event log (workspace observability)
├── metrics/                            ← per-role / per-phase token attribution (workspace-wide)
│   ├── <run-id>.json
│   ├── cost-by-phase.json
│   └── runs/<run-id>.json              ← run-id row carries service_name for pivots
├── legacy/                             ← brownfield-archive target (mirror of original tree)
└── <service_name>/                     ← per-service execution state (e.g., order/, payment-engine/)
    ├── local.yaml                                  ← service config (service_name, mode, scope_level, chain_rigor, ...)
    ├── run-plan.md                                 ← per-service feature list + execution sequence
    ├── pipeline/                                   ← coordination root
    │   ├── <run-id>-INCOMPLETE.md                  ← run-scoped, written by parity probe on terminal state when S-FEATURES-001 rows lack their full artifact set (status: locked PRD/FRS/TDD/TSR per chain_rigor)
    │   └── <feature-id>/                           ← per-feature coordination state; <feature-id> matches docs/<service_name>/<feature-id>/
    │       ├── intent.yaml                         ← routing decision (input to @lead)
    │       ├── <feature-id>-TASKS.md               ← lead → implementer task breakdown
    │       ├── <feature-id>-DRAFT-COMPLETE.md      ← deferred-TSR marker (Track D, when tsr_gate_mode: deferred)
    │       ├── <feature-id>-DEADLOCK-<slug>.md     ← transient
    │       ├── <feature-id>-ESCALATE-<slug>.md     ← transient
    │       └── <feature-id>-ESCALATE-ADR-<NNNN>.md ← reviewer-flagged retroactive ADR escalation
    └── tasks/<run-id>/<agent>/<feature-id>.md      ← per-agent execution plan (PLAN type); one file per (run-id, agent, feature-id) reused across resumes
```

Lifetime notes:
- `intent.yaml` + `<feature-id>-TASKS.md` are run-scoped — kept across reruns of the same feature for idempotency, history-only after ship.
- `<feature-id>-DEADLOCK-*.md` / `<feature-id>-ESCALATE-*.md` / `<run-id>-INCOMPLETE.md` are transient by design — removed once resolved. Stale escalation / INCOMPLETE files are themselves a CI signal.
- `events.jsonl` and `metrics/` accrete; observability fuel, not deliverables. Workspace-global, never per-service.
- `inventory.md` is workspace-global (one per `<context_path>`); `run-plan.md` is per-service (one per `<service_name>`).

Type → folder map:

| Type | Folder | Example | Notes |
|---|---|---|---|
| `PRD`, `FRS`, `TDD`, `TSR` | `docs/<service_name>/<feature-id>/` | `001-order-placement-PRD.md` | per-feature prose; filename = `<feature-id>-<TYPE>.md` |
| `API` (openapi/asyncapi) | `docs/<service_name>/<feature-id>/` | `001-order-placement-openapi.yaml` | per-feature; filename = `<feature-id>-openapi.yaml` or `<feature-id>-asyncapi.yaml` |
| `CSD` | `docs/<service_name>/` | `order-CSD.md` | per-service singleton (brownfield + `scope_level ∈ {container, service}`); filename = `<service_name>-CSD.md` |
| `SAD` | `docs/` | `SAD.md` | system-level singleton |
| `ADR` | `docs/adr/` | `ADR-0001-use-sqlite.md` | global flat numbering — NOT feature-scoped |
| `RELEASE`, `RUNBOOK` | `docs/releases/`, `docs/runbooks/` | `RELEASE-vX.Y.Z.md` | release-time singletons |
| `INVENTORY` | `.orchestra/` | `inventory.md` | workspace-global singleton (brownfield only) |
| `RUN-PLAN` | `.orchestra/<service_name>/` | `run-plan.md` | per-service singleton |
| `TASKS` | `.orchestra/<service_name>/pipeline/<feature-id>/` | `001-order-placement-TASKS.md` | agent-internal; filename = `<feature-id>-TASKS.md` |
| `PLAN` | `.orchestra/<service_name>/tasks/<run-id>/<agent>/` | `001-order-placement.md` | per-agent execution plan; filename = `<feature-id>.md`; one file per `(run-id, agent, feature-id)` |
| `ESCALATE`, `DEADLOCK`, `ESCALATE-ADR` | `.orchestra/<service_name>/pipeline/<feature-id>/` | `001-order-placement-ESCALATE-spec-gap.md` | transient; filename = `<feature-id>-<TYPE>-<slug>.md` (or `<feature-id>-ESCALATE-ADR-<NNNN>.md`) |
| `INCOMPLETE` | `.orchestra/<service_name>/pipeline/` | `r2026-05-13T14-22-INCOMPLETE.md` | run-scoped (NOT feature-scoped); filename = `<run-id>-INCOMPLETE.md`; written by terminal-state parity probe |

## Common shape (all artifacts)

```yaml
---
id: <basename-without-extension>
type: <PRD|FRS|TDD|API|TSR|SAD|ADR|RELEASE|RUNBOOK|TASKS|PLAN|ESCALATE|DEADLOCK|INCOMPLETE|CSD|INVENTORY|RUN-PLAN>
created: <ISO-8601>
revision: <integer ≥ 1>
status: draft                    # draft | locked
verdict: PENDING                 # PENDING | PASS | FAIL | APPROVED | REQUEST_CHANGES
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

**Frontmatter grammar (frozen).** Block-style only. No flow style (`{a: b}` and `[1, 2]` are forbidden). No anchors / aliases. Indentation: 2 spaces per level. String values containing `:`, `#`, leading/trailing whitespace, or YAML reserved words (`null`, `true`, `false`, `~`) MUST be JSON-quoted. Agent handles (`@product`, `@lead`) MUST be JSON-quoted because `@` is a YAML directive marker. The frontmatter parser is `hooks/lib/yaml-mini.js`'s `parse()`.

### `status:` <a id="S-STATUS-001"></a>

| value | meaning | who can write |
|---|---|---|
| `draft` | Author is iterating; downstream consumers may read but should not cite | The artifact's owning agent (per role table) |
| `locked` | Frozen; downstream lifts from this revision | Owning agent; subsequent writes by anyone else are rejected by `pre-write-check.js` Gate-A |

### `verdict:` <a id="S-VERDICT-001"></a>

Applies to TSR (eval / review verdicts + ship), ADR (review verdict), RELEASE (ship verdict). Other types omit.

| value | semantic |
|---|---|
| `PENDING` | Initial state |
| `PASS` / `FAIL` | Empirical |
| `APPROVED` / `REQUEST_CHANGES` | Inspection |
| `ALLOW` | Ship |
| `ALLOW_WITH_GAP` | Ship when reviewer emitted `ALLOW_WITH_GAP` (genuine "approved with caveat"), OR `tsr_gate_mode: deferred` AND `<feature-id>-DRAFT-COMPLETE.md` exists with absent verdict cells (deferred-mode tolerance) |
| `HOLD` | Ship blocked |

### TSR gate mode <a id="tsr-gate-mode"></a>

`local.yaml.tsr_gate_mode` ∈ `blocking | deferred` (default `blocking`). Ship-verdict mapping reads TSR frontmatter `eval_verdict` + `rev_verdict`:

- `eval_verdict: PASS` AND `rev_verdict: APPROVED` → `ALLOW`.
- `rev_verdict: ALLOW_WITH_GAP` → `ALLOW_WITH_GAP`.
- `eval_verdict: FAIL` OR `rev_verdict: REQUEST_CHANGES` OR `rev_verdict: PENDING` → `HOLD`.

Under `tsr_gate_mode: deferred`, absent verdict cells (eval / review still running async) map to `ALLOW_WITH_GAP` ONLY when the corresponding `<feature-id>-DRAFT-COMPLETE.md` marker exists; otherwise `HOLD`.

### `readers:` <a id="S-READERS-001"></a>

List of agents authorized to read this artifact. **Soft enforcement** — prompt-level discipline only. The `pre-write-check.js` Gate-C reads the target artifact's frontmatter at write time; a write whose calling agent isn't in `readers:` is logged as a non-blocking warning (Stream 7 reporter aggregates). The one **hard-enforced** scope is `@test` Stage-1's exclusion of `<context_path>/services/<service_name>/src/**`, which uses per-stage tool-scoping at agent spawn (not this field).

### `sections:` <a id="S-SECTIONS-001"></a>

Multi-writer coordination. Map of `S-<TYPE>-NNN → { writer, status }` where `status ∈ {pending, in_progress, locked}`. Most artifacts have a single owning writer and a flat sections list; TSR exercises this most because it has three writers (`@test` for `§test-plan`, `@evaluator` for `§verdict-evaluator`, `@reviewer` for `§verdict-reviewer`).

`pre-write-check.js` Gate-B enforces:
- A writer not listed for a section's `writer:` cannot write to that section.
- A write whose target section is `locked` is rejected.
- A writer can only transition own sections (`pending → in_progress → locked`).

Trust-frontmatter enforcement: Gate-B reads the target file's frontmatter and rejects on writer-mismatch / lock-violation / non-self-transition. It does NOT diff the incoming write against `<a id="S-…">` anchors — agents declare which section they're writing via the call payload, and the audit-grep CI catches lies retroactively.

## Body grammar <a id="body-grammar"></a>

Every H2 heading in the body MUST carry an HTML anchor whose id matches a key in frontmatter `sections:`:

```markdown
## Vision <a id="S-VISION-001"></a>

A short URL service that …

## Non-Goals <a id="S-NON-GOALS-001"></a>

…
```

Anchor regex: `/^##\s+.*<a id="(S-[A-Z]+(?:-[A-Z]+)*-\d{3})"><\/a>/`. Multi-segment uppercase tags supported (`S-NON-GOALS-001`, `S-DIVERGENCES-001`).

**Bidirectional invariant**: every key in `sections:` MUST have a matching `<a id>` in the body, and every `<a id>` in the body MUST have a matching key in `sections:`. `validate.js` flags either direction as a violation.

**Carve-outs** (no `sections:` block, body-grammar exempt): `intent.yaml`, `<feature-id>-TASKS.md`, `<feature-id>-ESCALATE-*.md`, `<feature-id>-DEADLOCK-*.md`, `<run-id>-INCOMPLETE.md`, and per-agent `PLAN` files under `.orchestra/<service_name>/tasks/<run-id>/<agent>/` — these are agent-internal coordination, not stakeholder narrative.

## Body discipline — no storytelling, no yapping <a id="body-discipline"></a>

Artifacts under `docs/` are stakeholder deliverables. Deliver decisions and contracts, not narrative. On every write:

- **State, don't justify.** Each FR / AC / NFR / persona / decision is one substantive sentence (or a fact bullet). No methodology paragraphs, no "why this artifact exists", no recap of the orchestra chain. If a sentence doesn't move the build forward, delete it.
- **Personas: real, business-domain, system-interacting.** Use names from the consumer's actual domain. Prefer the shortest unambiguous form for both PRD prose and diagram actor labels: `Client`, `Web`, `App`, `API client`, `Integrator`, `Mobile app`, `Admin user`, `Customer`, `Driver`, `Merchant`, `Operator`. A persona is a role that uses the *running system* — not someone who reads the source. Do not invent meta-narrative stand-ins like `Developer-consumer` or `Reference-impl reader`. If one persona exists, list one — do not pad to look thorough. Architect inherits PRD personas into `SAD.md` `S-CONTEXT-001`; the `c4-architecture` skill inherits them again into `.puml` actor labels — bad names at PRD propagate to every diagram, so fix at source.
- **Out-of-scope = what the request scoped out.** List items the user (or PRD scope statement) explicitly excluded. Do not enumerate every plausible non-feature for completeness.
- **Bullets over prose.** Default to bullets. Reserve paragraphs for connected reasoning that genuinely needs them. Never repeat in prose what a bullet already states.
- **No orchestra plumbing in stakeholder bodies.** Do not name `@product` / `@lead` / `@architect` / `@test` / `@evaluator` / `@reviewer` / `chain_rigor` / `Full-rigor` / `Standard` / `Light` in PRD / FRS / SAD / TDD / ADR / TSR bodies. The chain is invisible to the human reading the artifact. Cross-references between consumer artifacts (`001-todo-api-PRD` ↔ `001-todo-api-FRS` ↔ `001-todo-api-TDD` ↔ `ADR-NNNN-<slug>`) ARE fine — those resolve in the consumer's `docs/`.

## Diagram requirements

Each diagram source (`.puml`) lives under the artifact's `diagrams/` directory, renders to `.svg` via the `plantuml` skill (`post-write-puml` hook enforces render-on-write), and embeds inline in the parent `.md` via `![title](diagrams/<name>.svg)`.

Chain-rigor (`local.yaml.chain_rigor`) controls coverage:

| Type | Diagram bindings | Required at rigor |
|---|---|---|
| `FRS` | `state-business` | always |
| `SAD` | `c4-context`, `c4-container`, `erd-logical` | Full only |
| `SAD` (sequence) | `sequence-inter-<flow>` | Full + Standard (drives openapi) |
| `TDD` | `c4-component`, `sequence-intra-<usecase>` | always |
| `TDD` | `state-technical` | when lifecycle exists |
| `TDD` | `erd-physical` | when schema touched |
| `ADR` | `adr-status` | always (mandatory) |
| `ADR` | `option-<A,B,C>` | optional per-option sketches |
| `RUNBOOK` | `deploy`, `rollback` | always |
| Other types (PRD, openapi, TSR, RELEASE) | none | — |

Drift check: filename arithmetic — every `.puml` has a paired `.svg`; every prose artifact citing a diagram has the matching `![]()` embed line. The PostWrite hook on `*.puml` renders the SVG; `code-review` skill carries a failsafe check for orphan `.puml` (without `.svg`) or orphan embed (without source).

## Type-specific frontmatter

### `<feature-id>-PRD.md`

```yaml
status: draft | locked
verdict: PENDING
version: <semver>
open_questions: <int>
```

### `<feature-id>-FRS.md`

```yaml
prd: <feature-id>-PRD
acceptance_criteria_count: <int>
usecase_count: <int>                 # MUST equal state-business diagram actor-count
inherited_open_questions: <int>
resolved_open_questions: <int>
```

### `<feature-id>-TDD.md`

```yaml
sad_touched: true | false
sequence_diagram_count: <int>
state_machine_count: <int>
schema_touched: true | false
```

### `<feature-id>-openapi.yaml` / `<feature-id>-asyncapi.yaml` (per-feature)

OpenAPI/AsyncAPI document is the artifact body. The plugin's frontmatter contract does not apply to YAML body — `status:` / `verdict:` / `readers:` / `sections:` instead live in a top-of-file YAML comment block:

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
rev_verdict: PENDING                          # PENDING | APPROVED | ALLOW_WITH_GAP | REQUEST_CHANGES
rev_round: 1                                  # 1..3
ship: PENDING                                 # PENDING | ALLOW | ALLOW_WITH_GAP | HOLD
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
  S-DIVERGENCES-001:
    writer: "@architect"
    status: pending
```

**Body-row grammar (no duplication between sections).** Each TSR section is a single source of truth for its concern; downstream sections reference upstream by `id`, never restate columns.

`S-TEST-001` (writer `@test`, both stages) — one table, row shape:

```
| id | criterion | axis | critical | fixture | status | evidence |
```

Stage-1 fills `id` / `criterion` / `axis` / `critical` / `fixture` (status + evidence cells empty); section `status: in_progress`. Stage-2 fills `status` + `evidence` cells in place — Stage-1 columns preserved verbatim — and appends new rows only for newly-introduced white-box tests; section `status: locked`. Spec-bound during Stage-1 (sources allowlist excludes `src/**`); impl-aware during Stage-2.

`S-EVAL-001` (writer `@evaluator`) — one table, row shape:

```
| id | verdict | reason |
```

`id` MUST reference an existing `S-TEST-001` row id; `verdict ∈ PASS | FAIL | PENDING`; `reason` is one short sentence (≤120 chars) citing the Stage-2 `evidence` excerpt. No criterion / axis / fixture restatement.

`S-REVIEW-001` (writer `@reviewer`) — per-severity findings keyed on `file:line`; explicit list (`Critical`, `Major`, `Minor`, `Nit`). When ADRs were touched in this feature, append a `## ADR review` subsection to `S-REVIEW-001`; on greenfield/no-ADR runs, no subsection is required. Findings cite source coordinates, never `S-EVAL-001` row ids.

`S-DIVERGENCES-001` (writer `@architect`, brownfield-conditional) — table row shape `| ID | UC slug | File:line | Finding | Guard test ID |`. On greenfield runs, omit the anchor entirely.

Final ship verdict lives in frontmatter `ship:` (no body section). `/orchestra ship` reads `eval_verdict` + `rev_verdict` + `local.yaml.tsr_gate_mode` (with `<feature-id>-DRAFT-COMPLETE.md` marker presence under deferred mode) to compute the value and writes it to frontmatter.

`validate.js` rejects a `locked` TSR missing any of `S-TEST-001`, `S-EVAL-001`, `S-REVIEW-001`, and rejects any `S-EVAL-001` row whose `id` is not present in `S-TEST-001`.

### SAD.md (project singleton)

```yaml
status: draft | locked
project_mode: greenfield | brownfield
c4_levels_present: [1, 2]
adr_count: <int>
```

### ADR-`<NNNN>`-`<slug>`.md

```yaml
status: proposed | accepted | superseded | deprecated
verdict: PENDING | APPROVED | REQUEST_CHANGES
superseded_by: ADR-<NNNN>-<slug> | null
triggered_by: <feature-id>-PRD | <feature-id>-FRS | <feature-id>-TDD | SAD | DIV-<NNN>
review_round: <1..3>
option_count: <int>
```

`@architect` writes the body. `@reviewer` Edits only `S-CONSEQUENCES-001` (REQUEST_CHANGES findings) and writes `verdict:` + `review_round:`. `adr-status` state-machine diagram is mandatory.

Required body anchors: `S-CONTEXT-001`, `S-DECISION-001`, `S-ALTERNATIVES-001`, `S-CONSEQUENCES-001`. Retroactive ADRs (those with `triggered_by: DIV-<NNN>`, opened during the `gap-resolution` phase to ratify brownfield divergences per `agents/architect.md`) add a fifth anchor `S-RATIFICATION-001` between `S-DECISION-001` and `S-ALTERNATIVES-001`. Row shape: `| Field | Value |` with fields `Original divergence` (DIV-NNN), `Discovered in` (TSR section), `Pre-existing behavior` (one sentence), `Ratified or corrected` (`ratified` = spec amended, `corrected` = source change scheduled).

### RELEASE-vX.Y.Z.md

```yaml
status: draft | locked
verdict: PENDING | ALLOW | ALLOW_WITH_GAP | HOLD
version: <semver>
released_at: <ISO-8601>
features: [<id>, <id>, ...]
runbook_required: true | false
```

`S-ANNOUNCEMENT-001` is mandatory.

### RUNBOOK-vX.Y.Z.md

```yaml
status: draft | locked
version: <semver>
topology_change_summary: <string>
deploy_steps_count: <int>
rollback_steps_count: <int>
```

### `<feature-id>-TASKS.md` (`.orchestra/<service_name>/pipeline/<feature-id>/`)

```yaml
status: draft | locked
task_graph_node_count: <int>
estimated_sp: <int>
tasks_pending: <int>
tasks_in_progress: <int>
tasks_done: <int>
```

`S-TASKS-001` is **mutable by design** — implementer-tier owners (`@backend`, `@frontend`) flip rows from `pending → in_progress → done` on pickup/completion. Read-only-tier owners (`@evaluator`, `@reviewer`) do NOT self-report — their task status derives at read-time from TSR `eval_verdict` / `rev_verdict`.

### `<feature-id>.md` PLAN (`.orchestra/<service_name>/tasks/<run-id>/<agent>/`)

Per-agent execution plan. The agent authors the body before any artifact write or substantial Bash; the `agent-plan-sync` hook owns mutation of `tasks:`, `tasks_pending`, `tasks_in_progress`, `tasks_done`, and lifecycle `status:` flips on `Task*` tool use and on `SubagentStop`.

```yaml
id: <feature-id>
type: PLAN
agent: "@<role>"                              # @product | @architect | @lead | @backend | @frontend | @test | @evaluator | @reviewer
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

`status:` lifecycle:

| value | meaning | who flips |
|---|---|---|
| `pending` | Plan body authored; the agent has not yet started any task | Agent writes; hook never flips into this |
| `in_progress` | At least one task `in_progress` or `completed` | `agent-plan-sync` hook on first `TaskUpdate(status: in_progress)` or `TaskCreate` |
| `interrupted` | `SubagentStop` fired with at least one task not `completed` | `agent-plan-sync` hook on `SubagentStop` |
| `done` | All tasks `completed` | `agent-plan-sync` hook on `TaskUpdate(status: completed)` of the last task |

`/orchestra resume` consults `<project>/.orchestra/<service_name>/tasks/*/<agent>/<feature-id>.md` (latest run-id by mtime) BEFORE walking `<feature-id>-TASKS.md`. A plan with `status: interrupted` resumes at the first non-`completed` task; with `status: in_progress` warns and confirms before respawn (concurrent-session guard).

Body grammar (free-form, no `<a id>` anchors required):

```markdown
## Approach
<2-5 sentence narrative — what the agent intends to do, in what order, citing inputs it will read and outputs it will write>

## Tasks
- [ ] T-001 — <one-line>
- [ ] T-002 — <one-line>
- [x] T-003 — <one-line>      # completed
```

The agent body owns the `## Approach` section. The hook owns the `## Tasks` checklist sync (mirror of `tasks:` frontmatter). The agent body MUST NOT manually flip `tasks:` frontmatter or `## Tasks` checkbox state — those drift across the hook's source of truth (Claude Code's native Task tool calls).

### `<feature-id>-ESCALATE-<slug>.md`, `<feature-id>-ESCALATE-ADR-<NNNN>.md`, `<feature-id>-DEADLOCK-<slug>.md`

```yaml
triggered_by_<stage|agent>: <value>
resolution: pending | resolved-via-<X> | abandoned
direction: <free-text — present only when resolved>
strike_count: <int>
```

Body-grammar carve-out applies (no `sections:` block).

## src/ cite denylist (canonical)

`pre-write-check.js` Gate-D rejects writes to `<context_path>/services/<service_name>/src/**` (and language equivalents below) that contain any of:

```
PRD §<N>                              FR-<N>
FRS §<N>                              AC-<N>
TDD §<N>                              C-<N>
CONTRACT §<N>                         NFR-<N>
TSR §<N>                              S-<UPPER>-<NNN>
ADR-<NNNN> §<N>                       openapi.yaml#/paths/
```

Regex (single-source for hook + audit reporter):

```
/(?:PRD|FRS|TDD|CONTRACT|TSR)\s*§\s*\d+|ADR-\d{4}\s*§\s*\d+|\b(?:FR|AC|C|NFR)-\d+\b|\bS-[A-Z]+(?:-[A-Z]+)*-\d{3}\b|openapi\.yaml#\/paths\//
```

Path-match for Gate-D activation:

```
^(.*\/)?(src\/main\/|src\/test\/|src\/(?!.*\.(md|yaml)$)|app\/|cmd\/|pkg\/|internal\/|lib\/(?!.*\.md$))
```

Reason: consumer business code is read by reviewers, IDEs, and grep tools that have no access to `docs/<service_name>/<feature-id>/`. Anchor cites become phantom references — same audience-boundary failure as the consumer-vs-developer surface rule, one step downstream. Traceability lives in commit messages, PR descriptions, and TSR `§verdict-*` — not in business code comments.

## Validation

- `validate.js` exposes pure functions: `validateStructuralDiff`, `validateOrphanTypes`, `validateFoldCorrectness`, `validateSoftCap`.
- Drift detection: `git diff` in CI. If a `locked` artifact has uncommitted changes outside an authoring run, CI flags it.
- `pre-write-check.js` four gates (in addition to the secrets matcher):
  - **Gate-A** — `status: locked` rejects non-owner writes.
  - **Gate-B** — `sections:` map enforces per-section writer + lock.
  - **Gate-C** — `readers:` allowlist; non-blocking warning on out-of-scope read attempts (reporter aggregates).
  - **Gate-D** — src/ cite denylist; exit 2 on any hit when target path matches `<context_path>/services/<service_name>/src/**` (or language equivalents).

## Versioning

Bump `revision:` when adding/renaming type-specific keys, when adding/removing artifact types, or when changing the diagram-binding table. Additive changes that older readers can ignore (new optional field) do NOT bump `revision`.
