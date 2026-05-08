---
id: PIPELINE-SCHEMA
title: orchestra v4.0 Pipeline Artifact Frontmatter Schemas
created: 2026-05-08
status: draft
revision: 6
scope: type-specific frontmatter shapes for every artifact authored by the orchestra agents; v4.0 drops the lockfile sidecar in favor of inline frontmatter for review-state, reader-scope, and per-section locks. Drift detection moves to `git diff`; idempotency keys move to `<project>/.orchestra/manifest.json`.
---

# orchestra v4.0 Pipeline Artifact Frontmatter Schemas

> Frontmatter contract for every consumer-side artifact the chain produces.
> v4.0 reorganizes around the chain as the spine: PRD → FRS → SAD → ADR →
> TDD → openapi (or asyncapi) → code + tests → TSR. Lockfile sidecars are
> gone; review-state, reader-scope, and per-section locks live in artifact
> frontmatter.

## Placement model — `docs/` vs `.orchestra/`

Two project-side roots. They serve different audiences and lifetimes — never mix them.

| Root | Audience | Contents | Lifetime |
|---|---|---|---|
| `<project>/docs/` | Humans (PMs, leads, reviewers, ops) | Stakeholder deliverables | Durable; PR-reviewable; cited across artifacts |
| `<project>/.orchestra/` | Agents + plugin internals | Pipeline-internal coordination + runtime state | Ephemeral or run-bound; never PR-reviewed for content |

Litmus: would you link this from a PR description for a non-engineer reviewer? `docs/` if yes, `.orchestra/` if no.

## Folder layout

### `<project>/docs/` (stakeholder surface)

```
<project>/docs/
├── README.md, CONTRIBUTING.md, SLO.md   ← user-authored; plugin doesn't trample
├── SAD.md                               ← architecture singleton
├── adr/
│   └── ADR-NNNN-<slug>.md               ← global flat numbering; ADRs accrete
├── diagrams/                            ← global (each *.puml has paired *.svg)
│   ├── c4-context.{puml,svg}
│   ├── c4-container.{puml,svg}
│   └── erd-logical.{puml,svg}
└── <feature-id>/                        ← per-feature
    ├── PRD-NNN.md
    ├── FRS-NNN.md
    ├── TDD-NNN.md
    ├── openapi.yaml                     (or asyncapi.yaml; CONTRACT narrative folds into description: + # comments)
    ├── TSR-NNN.md                       (multi-writer: §test-plan @test, §verdict-evaluator @evaluator, §verdict-reviewer @reviewer + ADR review)
    └── diagrams/                        ← feature
        ├── state-business.{puml,svg}
        ├── sequence-inter-<flow>.{puml,svg}
        ├── c4-component.{puml,svg}
        ├── sequence-intra-<usecase>.{puml,svg}
        ├── state-technical.{puml,svg}      (if applicable)
        └── erd-physical.{puml,svg}         (if schema touched)
```

Per-feature prose is **5 files**: PRD, FRS, TDD, openapi, TSR. TEST-NNN.md merges into TSR-NNN.md `§test-plan`; CONTRACT-NNN.md prose folds into openapi `description:` fields and top-of-file `#` comments.

### `<project>/.orchestra/` (agent + plugin internals)

```
<project>/.orchestra/
├── local.yaml                          ← runtime config (mode, depth, chain_rigor, primary_language, framework)
├── manifest.json                       ← idempotency registry (replaces lockfile hashes)
├── events.jsonl                        ← event log (BL-0032; observability stream 7)
├── metrics/                            ← per-role / per-phase token attribution (BL-0035)
│   └── <run-id>.json
└── pipeline/<feature-id>/              ← per-feature coordination state
    ├── intent.yaml                     ← routing decision (input to @lead)
    ├── TASKS-NNN.md                    ← lead → implementer task breakdown
    ├── DEADLOCK-<id>.md                ← transient
    ├── ESCALATE-<id>.md                ← transient
    └── ESCALATE-ADR-<NNNN>.md          ← reviewer-flagged retroactive ADR escalation
```

Lifetime notes:
- `intent.yaml` + `TASKS-NNN.md` are run-scoped — kept across reruns of the same feature for idempotency, history-only after ship.
- `DEADLOCK-*.md` / `ESCALATE-*.md` are transient by design — removed once resolved. Stale escalation files are themselves a CI signal.
- `events.jsonl` and `metrics/` accrete; observability fuel, not deliverables.

Type → folder map:

| Type | Folder | Example | Notes |
|---|---|---|---|
| `PRD`, `FRS`, `TDD`, `TSR` | `docs/<feature-id>/` | `PRD-001.md` | per-feature prose |
| `API` (openapi/asyncapi) | `docs/<feature-id>/` | `openapi.yaml` | per-feature; CONTRACT narrative inline |
| `SAD` | `docs/` | `SAD.md` | project singleton |
| `ADR` | `docs/adr/` | `ADR-0001-use-sqlite.md` | global flat numbering |
| `RELEASE`, `RUNBOOK` | `docs/releases/`, `docs/runbooks/` | `RELEASE-vX.Y.Z.md` | release-time singletons; ANNOUNCEMENT folded into RELEASE §S-ANNOUNCEMENT-001 |
| `TASKS` | `.orchestra/pipeline/<id>/` | `TASKS-001.md` | agent-internal |
| `ESCALATE`, `DEADLOCK`, `ESCALATE-ADR` | `.orchestra/pipeline/<id>/` | `ESCALATE-001.md` | transient |

**Removed in v4.0** (folded or dropped):
- `CHARTER` → dropped; mode detection (greenfield/brownfield) replaces classification slot
- `TEST` → folded into `TSR` §test-plan
- `CONTRACT` → narrative folds into `openapi` `description:` + top-of-file `#` comments
- `PLAN` → dropped (was `--think` only; no v4.0 entry path produces it)
- `INTENT` → replaced by `.orchestra/pipeline/<id>/intent.yaml` (agent-internal, not stakeholder)
- `SUMMARY` → dropped; terminal-state lives in `events.jsonl` + `<run-id>.json`
- `DEADLOCK-ADR` → folded into `ESCALATE-ADR` (single transient escalation type)

## Common shape (all artifacts)

```yaml
---
id: <feature_id>-<TYPE>          # e.g., "PRD-001", "ADR-0001"; "SAD" for singleton
type: <PRD|FRS|TDD|API|TSR|SAD|ADR|RELEASE|RUNBOOK|TASKS|ESCALATE|DEADLOCK>
created: <ISO-8601>
revision: <integer ≥ 1>
status: draft                    # NEW v4.0 — review-state lives here; values: draft | locked
verdict: pending                 # NEW v4.0 (where applicable); values: PASS | FAIL | APPROVED | REQUEST_CHANGES | pending
readers:                         # NEW v4.0 — soft scope allowlist (block list, not flow)
  - "@architect"
  - "@lead"
sections:                        # NEW v4.0 — multi-writer coordination (block map, not flow)
  S-VISION-001:
    writer: "@product"
    status: locked
  S-NFR-001:
    writer: "@product"
    status: in_progress
# (plus type-specific minimal fields per "Type-specific frontmatter" below)
---
```

**Frontmatter grammar (frozen).** Block-style only. No flow style (`{a: b}` and `[1, 2]` are forbidden). No anchors / aliases. Indentation: 2 spaces per level. String values containing `:`, `#`, leading/trailing whitespace, or YAML reserved words (`null`, `true`, `false`, `~`) MUST be JSON-quoted. Agent handles (`@product`, `@lead`) MUST be JSON-quoted because `@` is a YAML directive marker. The frontmatter parser is `hooks/lib/yaml-mini.js`'s `parse()` — same parser the lockfile schema froze in v3.x, now reused for inline frontmatter.

**v3 → v4 break.** `sections:` (with hash + confirmed) and `references:` blocks are gone. `sections:` is reused as a per-section writer/state map (no hashes). `<artifact>.lock.yaml` files are deleted. Drift detection moves to `git diff` in CI; idempotency keys move to `<project>/.orchestra/manifest.json`.

### `status:` <a id="S-STATUS-001"></a>

| value | meaning | who can write |
|---|---|---|
| `draft` | Author is iterating; downstream consumers may read but should not cite | The artifact's owning agent (per role table) |
| `locked` | Frozen; downstream lifts from this revision | Owning agent; subsequent writes by anyone else are rejected by `pre-write-check.js` Gate-A |

### `verdict:` <a id="S-VERDICT-001"></a>

Applies to TSR (eval / review verdicts), ADR (review verdict), RELEASE (ship verdict). Other types omit.

| value | semantic |
|---|---|
| `pending` | Initial state |
| `PASS` / `FAIL` | Empirical (eval) |
| `APPROVED` / `REQUEST_CHANGES` | Inspection (review) |

### `readers:` <a id="S-READERS-001"></a>

List of agents authorized to read this artifact. **Soft enforcement** — prompt-level discipline only. The `pre-write-check.js` Gate-C reads the target artifact's frontmatter at write time; a write whose calling agent isn't in `readers:` is logged as a non-blocking warning (Stream 7 reporter aggregates). The one **hard-enforced** scope is `@test` Stage-1's exclusion of `<consumer>/src/**`, which uses per-stage tool-scoping at agent spawn (not this field).

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

Anchor regex: `/^##\s+.*<a id="(S-[A-Z]+(?:-[A-Z]+)*-\d{3})"><\/a>/`. Multi-segment uppercase tags supported (`S-NON-GOALS-001`, `S-VERDICT-EVAL-001`).

**Bidirectional invariant**: every key in `sections:` MUST have a matching `<a id>` in the body, and every `<a id>` in the body MUST have a matching key in `sections:`. `validate.js` flags either direction as a violation.

**Carve-outs** (no `sections:` block, body-grammar exempt): `intent.yaml`, `TASKS-NNN.md`, `ESCALATE-*.md`, `DEADLOCK-*.md` — these are agent-internal coordination, not stakeholder narrative.

## Diagram requirements

Per v4.0-brief §2.bis. Each diagram source (`.puml`) lives under the artifact's `diagrams/` directory, renders to `.svg` via the `plantuml` skill (PostWrite hook enforces — see `hooks/scripts/post-write-puml.js`), and embeds inline in the parent `.md` via `![title](diagrams/<name>.svg)`.

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

### PRD-`<NNN>`.md

```yaml
status: draft | locked
verdict: pending           # PRDs don't get reviewed-as-pass/fail; kept for shape uniformity
version: <semver>          # the orchestra version this PRD targets
open_questions: <int>      # NEW v4.0 — count of open Qs in §S-OPEN-Q-001 (BL-0029)
```

### FRS-`<NNN>`.md

```yaml
prd: PRD-<NNN>                       # parent PRD id
acceptance_criteria_count: <int>     # for spot-check during review
usecase_count: <int>                 # MUST equal state-business diagram actor-count
inherited_open_questions: <int>      # NEW v4.0 — Qs lifted from PRD
resolved_open_questions: <int>       # NEW v4.0 — Qs resolved in this FRS revision
```

### TDD-`<NNN>`.md

```yaml
sad_touched: true | false            # whether this feature mutated SAD
sequence_diagram_count: <int>        # intra-service; ≥1 per use case
state_machine_count: <int>           # 0 when no lifecycle exists
schema_touched: true | false         # gates erd-physical requirement
```

### openapi.yaml / asyncapi.yaml (per-feature)

OpenAPI/AsyncAPI document is the artifact body. The plugin's frontmatter contract does not apply to YAML body — `status:` / `verdict:` / `readers:` / `sections:` instead live in a top-of-file YAML comment block:

```yaml
# orchestra:
#   id: API-001
#   type: API
#   status: draft
#   verdict: pending
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
  description: |
    CONTRACT narrative folds here per v4.0-brief §7.21 / §7.23.
    YAML markdown convention — literal `|` block scalar — preferred for
    multi-paragraph CONTRACT prose; flow scalars for one-liners.
  version: 1.0.0
paths:
  ...
```

`pre-write-check.js` reads the comment block as if it were YAML frontmatter for status/sections enforcement.

### TSR-`<NNN>`.md (multi-writer)

```yaml
status: draft                                 # draft | locked
verdict: pending                              # see eval_verdict + rev_verdict for per-writer
eval_verdict: pending                         # @evaluator-owned; PASS | FAIL | pending
eval_score: 0                                 # 0..100
rev_verdict: pending                          # @reviewer-owned; APPROVED | REQUEST_CHANGES | pending
rev_round: 1                                  # 1..3; circuit at round 4 → ESCALATE
ship: pending                                 # ALLOW | HOLD | pending; /orchestra ship verdict
sections:
  S-TEST-PLAN-001:
    writer: "@test"
    status: locked
  S-VERDICT-EVAL-001:
    writer: "@evaluator"
    status: in_progress
  S-VERDICT-REVIEW-001:
    writer: "@reviewer"
    status: pending
  S-ADR-REVIEW-001:
    writer: "@reviewer"
    status: pending
  S-SHIP-001:
    writer: "@orchestra"
    status: pending
```

`@test` Stage-1 writes `S-TEST-PLAN-001` (spec-bound — sources allowlist excludes `src/**`). `@evaluator` writes `S-VERDICT-EVAL-*`. `@reviewer` writes `S-VERDICT-REVIEW-*` and `S-ADR-REVIEW-001` (replaces ADR-review's separate artifact). `/orchestra ship` writes `S-SHIP-001`. `validate.js` rejects a `locked` TSR missing any of `S-TEST-PLAN-001`, `S-VERDICT-EVAL-001`, `S-VERDICT-REVIEW-001`.

### SAD.md (project singleton)

```yaml
status: draft | locked
project_mode: greenfield | brownfield
c4_levels_present: [1, 2]            # always 1+2 (3 is TDD's; 4 deferred)
adr_count: <int>                     # rows in §S-ADR-INDEX-001 with status=accepted
```

### ADR-`<NNNN>`-`<slug>`.md

```yaml
status: proposed | accepted | superseded | deprecated  # ADR has its own status enum (pre-existing semantics)
verdict: APPROVED | REQUEST_CHANGES | pending
superseded_by: ADR-<NNNN> | null
triggered_by: PRD-<NNN> | FRS-<NNN> | TDD-<NNN> | SAD
review_round: <1..3>                                   # circuit at 4 → ESCALATE-ADR-<NNNN>.md
option_count: <int>
```

`@architect` writes the body. `@reviewer` Edits only `S-CONSEQUENCES-001` (REQUEST_CHANGES findings) and writes `verdict:` + `review_round:`. `adr-status` state-machine diagram is mandatory.

### RELEASE-vX.Y.Z.md

```yaml
status: draft | locked
verdict: ALLOW | HOLD | pending
version: <semver>                    # matches VERSION + package.json + topmost CHANGELOG entry
released_at: <ISO-8601>
features: [<id>, <id>, ...]
runbook_required: true | false
```

`S-ANNOUNCEMENT-001` is mandatory — absorbs v1's separate ANNOUNCEMENT artifact.

### RUNBOOK-vX.Y.Z.md

```yaml
status: draft | locked
version: <semver>
topology_change_summary: <string>
deploy_steps_count: <int>
rollback_steps_count: <int>
```

### TASKS-`<NNN>`.md (`.orchestra/pipeline/<id>/`)

```yaml
status: draft | locked
task_graph_node_count: <int>
estimated_sp: <int>
tasks_pending: <int>
tasks_in_progress: <int>
tasks_done: <int>
```

`S-TASKS-001` is **mutable by design** — implementer-tier owners (`@backend`, `@frontend`) flip rows from `pending → in_progress → done` on pickup/completion. Read-only-tier owners (`@evaluator`, `@reviewer`) do NOT self-report — their task status derives at read-time from TSR `eval_verdict` / `rev_verdict`.

### ESCALATE-`<id>`.md, ESCALATE-ADR-`<NNNN>`.md, DEADLOCK-`<id>`.md

```yaml
triggered_by_<stage|agent>: <value>
resolution: pending | resolved-via-<X> | abandoned
direction: <free-text — present only when resolved>
strike_count: <int>                  # DEADLOCK only; always 3 (the trigger)
```

Body-grammar carve-out applies (no `sections:` block).

## §7.28 src/ cite denylist (canonical)

`pre-write-check.js` Gate-D rejects writes to `<consumer>/src/**` (and language equivalents below) that contain any of:

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

Reason (per v4.0-brief §7.28): consumer business code is read by reviewers, IDEs, and grep tools that have no access to `docs/<feature-id>/`. Anchor cites become phantom references — same audience-boundary failure as the consumer-vs-developer surface rule, one step downstream. Traceability lives in commit messages, PR descriptions, and TSR `§verdict-*` — not in business code comments.

## Validation

- `validate.js` exposes pure functions: `validateStructuralDiff`, `validateOrphanTypes`, `validateFoldCorrectness`, `validateSoftCap`. (v3's `validateLockfilePresence`, `validateLockfileGrammar`, `validateDiagramHashes` are deleted alongside the lockfile cut.)
- Drift detection: `git diff` in CI. If a `locked` artifact has uncommitted changes outside an authoring run, CI flags it.
- `pre-write-check.js` four gates (in addition to the secrets matcher):
  - **Gate-A** — `status: locked` rejects non-owner writes.
  - **Gate-B** — `sections:` map enforces per-section writer + lock.
  - **Gate-C** — `readers:` allowlist; non-blocking warning on out-of-scope read attempts (Stream 7 reporter aggregates per §7.24 cadence — TBD).
  - **Gate-D** — §7.28 src/ cite denylist; exit 2 on any hit when target path matches `<consumer>/src/**` (or language equivalents).

## Versioning

Bump `revision:` when adding/renaming type-specific keys, when adding/removing artifact types, or when changing the diagram-binding table. v4.0.0's revision is `6` (was `5` in v3.0.0). Additive changes that older readers can ignore (new optional field) do NOT bump `revision`.
