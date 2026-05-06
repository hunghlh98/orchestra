---
id: PIPELINE-SCHEMA
title: orchestra v2.0.0 Pipeline Artifact Frontmatter Schemas
created: 2026-04-29
status: draft
revision: 4
scope: type-specific frontmatter shapes for every artifact authored by the orchestra agents; v2.0.0 provenance lives in `<artifact>.lock.yaml` sidecar (see `schemas/lockfile.schema.md`)
references:
  prd:
    - id: PRD-001
      sections: [S-FRONTMATTER-001, S-INVARIANTS-001]
  design:
    - id: DESIGN-005-doc-output-overhaul
      sections: [S-CANON-001, S-SCHEMAS-001, S-LOCKFILE-001]
---

# orchestra v2.0.0 Pipeline Artifact Frontmatter Schemas

> Type-specific frontmatter shapes. As of v2.0.0, provenance metadata
> (`sections:` per-anchor hashes, `references:` upstream links, `diagrams:`
> diagram tracking) lives in a paired `<artifact>.lock.yaml` sidecar — see
> `schemas/lockfile.schema.md` for the normative spec. The artifact body
> frontmatter retains only minimal type fields below.

## Filename + folder layout

Feature-scoped artifacts use `<feature_id>-<TYPE>.<ext>` (numeric or slug feature_id first; type uppercase). The feature_id-first ordering groups all artifacts for a feature under `ls -1` and lets a single grep (`grep "001-PRD"`) hit both the filename and the artifact's `id:` frontmatter field.

```
<project>/.claude/.orchestra/
├── architecture/
│   ├── SAD.md                                  # singleton
│   ├── SAD.lock.yaml
│   ├── diagrams/
│   │   ├── sad-c4-context.{puml,svg}
│   │   └── sad-c4-container.{puml,svg}
│   └── decisions/                              # NEW — global ADR home
│       ├── ADR-NNNN-<slug>.md
│       ├── ADR-NNNN-<slug>.lock.yaml
│       └── diagrams/
│           ├── adr-status.{puml,svg}           # MANDATORY state-machine
│           └── adr-option-{A,B,C}.{puml,svg}   # optional per-option sketches
├── runbooks/
│   ├── RUNBOOK-vX.Y.Z.md (+ .lock.yaml)
│   └── diagrams/{runbook-deploy,runbook-rollback}.{puml,svg}
├── releases/
│   └── RELEASE-vX.Y.Z.md (+ .lock.yaml)
└── pipeline/<feature_id>/
    ├── intent.yaml                             # control plane
    ├── ESCALATE-<id>.md                        # exception files at root
    ├── ESCALATE-ARCH-<id>.md
    ├── ESCALATE-ADR-<NNNN>.md                  # NEW (review→ADR open)
    ├── DEADLOCK-<id>.md
    ├── DEADLOCK-ADR-<NNNN>.md                  # NEW (ADR 3-round circuit)
    ├── SUMMARY-<id>.md
    ├── INTENT-<id>.md                          # template/docs intents only
    ├── charter/
    │   ├── <NNN>-CHARTER.md (+ .lock.yaml)     # NEW
    │   └── diagrams/.gitkeep                    # CHARTER has no diagrams
    ├── requirements/
    │   ├── <NNN>-PRD.md (+ .lock.yaml)
    │   ├── <NNN>-FRS.md (+ .lock.yaml)
    │   └── diagrams/frs-usecase.{puml,svg}
    ├── interfaces/
    │   ├── <NNN>-API.openapi.yaml (+ .lock.yaml)
    │   ├── <NNN>-CONTRACT.md (+ .lock.yaml)
    │   └── diagrams/{contract-service,contract-sequence-<crit>}.{puml,svg}
    ├── design/
    │   ├── <NNN>-TDD.md (+ .lock.yaml)
    │   └── diagrams/{tdd-c4-component,tdd-sequence-<flow>,tdd-er,tdd-state}.{puml,svg}
    ├── plan/
    │   ├── <NNN>-TASKS.md (+ .lock.yaml)
    │   └── diagrams/tasks-dag.{puml,svg}
    └── verify/
        ├── <NNN>-TEST.md (+ .lock.yaml)
        └── <NNN>-TSR.md (+ .lock.yaml)         # NEW — folded VERDICT + CODE-REVIEW
```

Type → folder map:

| Type | Folder | Example filename | Notes |
|---|---|---|---|
| `CHARTER` | `pipeline/<id>/charter/` | `001-CHARTER.md` | NEW (mode: full \| brief) |
| `PRD`, `FRS` | `pipeline/<id>/requirements/` | `001-PRD.md`, `001-FRS.md` | |
| `CONTRACT`, `API` | `pipeline/<id>/interfaces/` | `001-CONTRACT.md`, `001-API.openapi.yaml` | |
| `TDD` | `pipeline/<id>/design/` | `001-TDD.md` | |
| `TASKS` | `pipeline/<id>/plan/` | `001-TASKS.md` | |
| `TEST`, `TSR` | `pipeline/<id>/verify/` | `001-TEST.md`, `001-TSR.md` | TSR folds v1's VERDICT + CODE-REVIEW |
| `SAD` | `architecture/` | `SAD.md` | project singleton |
| `ADR` | `architecture/decisions/` | `ADR-NNNN-<slug>.md` | NEW global flat numbering |
| `RELEASE`, `RUNBOOK` | `releases/`, `runbooks/` | `RELEASE-vX.Y.Z.md` | version singletons; ANNOUNCEMENT folded into RELEASE §S-ANNOUNCEMENT-001 |
| `ESCALATE`, `ESCALATE-ARCH`, `ESCALATE-ADR`, `DEADLOCK`, `DEADLOCK-ADR`, `SUMMARY`, `INTENT` | feature-dir root | `ESCALATE-001.md` | exception types |

**Removed in v2.0.0** (folded or dropped per `docs/DESIGN-005-doc-output-overhaul.md` §S-CANON-001):

- `VERDICT`, `CODE-REVIEW` → folded into `TSR`
- `ANNOUNCEMENT` → folded into `RELEASE` §S-ANNOUNCEMENT-001
- `DOC`, `IMPL-NOTES`, `IMPL-BE`, `IMPL-FE`, `CODE-DESIGN-BE`, `CODE-DESIGN-FE` → dropped (declared in v1 schema but never emitted by any routing intent)
- `COMMIT-MSG` → no longer a file artifact; remains a skill output (`commit-work` produces a string for `git commit`)

## Common shape (all artifacts)

```yaml
---
id: <feature_id>-<TYPE>          # e.g., "001-PRD", "ADR-0001"; "SAD" for singleton
type: <CHARTER|PRD|FRS|TDD|CONTRACT|API|TASKS|TEST|TSR|SAD|ADR|RELEASE|RUNBOOK>
created: <ISO-8601>
revision: <integer ≥ 1>
status: <type-specific enum, where applicable>
version: <semver, where applicable — CHARTER/PRD/RELEASE/RUNBOOK only>
# (plus type-specific minimal fields per "Type-specific frontmatter" below)
---
```

**v1→v2 break**: `sections:` and `references:` blocks are NOT in artifact frontmatter anymore. They live in `<artifact>.lock.yaml` (see `schemas/lockfile.schema.md`). The hash-stamper hook writes the lockfile only when one exists alongside the artifact — scaffold-managed artifacts always have a paired lockfile; hand-authored files do not (and `validate-drift.js` falls back to inline frontmatter for legacy support).

## Body grammar <a id="body-grammar"></a>

Every H2 heading in the body MUST carry an HTML anchor whose id equals a key in the lockfile's `sections:` map:

```markdown
## Vision <a id="S-VISION-001"></a>

A short URL service that …

## Non-Goals <a id="S-NON-GOALS-001"></a>

…
```

Anchor regex: `/^##\s+.*<a id="(S-[A-Z]+(?:-[A-Z]+)*-\d{3})"><\/a>/` (see `hooks/lib/section-hash.js`). Multi-segment uppercase tags supported (`S-NON-GOALS-001`, `S-EVAL-VERDICT-001`, `S-ADR-INDEX-001`).

**Bidirectional invariant**: every key in the lockfile's `sections:` MUST have a matching `<a id>` in the body, and every `<a id>` in the body MUST have a matching key in the lockfile. The validator's `structural-diff` mode flags either direction as a violation.

**Carve-out for `SUMMARY-*.md`**: SUMMARY is parent-authored bookkeeping at terminal state; it carries NO `sections:` block (no lockfile either) and is exempt from the bidirectional rule.

## Diagram requirements

Mandatory diagram slots per artifact type. Each diagram source (`.puml`) lives under the artifact's `diagrams/` directory, is rendered to `.svg` via the `/plantuml` skill, embedded in the artifact body via a markdown image link, and tracked in the lockfile's `diagrams[]` array (source_hash + rendered_hash). The state-machine slot in TDD allows `omit: true` when no lifecycle exists; ADR's status diagram is mandatory (no omit allowed).

| Type | Required diagrams | Lockfile `diagrams[].kind` |
|---|---|---|
| FRS | use-case | `usecase` |
| SAD | C4 L1 (Context), C4 L2 (Container) | `c4-context`, `c4-container` |
| TDD | C4 L3 (Component), sequence (≥1), ER, state-machine *(omittable)* | `c4-component`, `sequence`, `er`, `state` |
| CONTRACT | service-contract, sequence per critical-path criterion | `service-contract`, `sequence` |
| TASKS | DAG (PlantUML activity) | `dag` |
| RUNBOOK | deploy activity, rollback activity | `deploy`, `rollback` |
| ADR | status state-machine (MANDATORY); per-option sketches (optional) | `adr-status`, `option` |
| CHARTER, PRD, API, TEST, TSR, RELEASE | none | — |

## Type-specific frontmatter

### CHARTER-`<id>`.md

```yaml
mode: full | brief                # full=feature/hotfix Planning; brief=template/docs/review-only classification
status: draft | approved | rejected
decision: GO | NO-GO | DEFERRED
```

### PRD-`<id>`.md

```yaml
status: planned | in-flight | shipped | abandoned
version: <semver>                 # the orchestra version this PRD targets
```

### FRS-`<id>`.md

```yaml
prd: <feature_id>-PRD             # parent PRD id
acceptance_criteria_count: <int>  # for spot-check during review
usecase_count: <int>              # MUST equal use-case-diagram actor-count
```

### TDD-`<id>`.md

```yaml
sad-touched: true | false         # whether this feature mutated SAD; gates SAD update flow
c4_levels_present: [3]            # always 3 (Levels 1-2 are SAD's; Level 4 deferred to v2.1)
sequence_diagram_count: <int>
state_machine_count: <int>        # 0 when state diagram has omit:true in lockfile
```

### CONTRACT-`<id>`.md

```yaml
signed: true | false              # @evaluator co-sign
weighted_criteria_total: 100      # validation: must sum to exactly 100
passing_score: <int>              # default 80
probe_count: <int>
critical_failure_conditions: <int>
```

### API-`<id>`.openapi.yaml

OpenAPI 3.x sidecar. Frontmatter is the OpenAPI document itself; lockfile carries a single section `S-API-001` whose `hash` is the whole-file SHA256 of the OpenAPI body (no anchor walk for `.openapi.yaml` artifacts).

### TASKS-`<id>`.md

```yaml
task_graph_node_count: <int>
estimated_sp: <int>               # story points from task-breakdown skill
tasks_pending: <int>              # derived counter
tasks_in_progress: <int>
tasks_done: <int>
```

`S-TASKS-001` is **mutable by design** — its lockfile entry MUST carry `confirmed: false` so `validate-drift` skips it. Implementer-tier owners (`@backend`, `@frontend`) self-report by flipping their row from `pending` to `in_progress` on pickup and to `done` on exit-criterion completion. Read-only-tier owners (`@evaluator`, `@reviewer`) do NOT self-report; their task status is derived at read time from the TSR frontmatter — `@evaluator.done ⟺ TSR.eval_verdict ∈ {PASS, FAIL}`; `@reviewer.done ⟺ TSR.rev_verdict ∈ {APPROVED, REQUEST_CHANGES}`. `ESCALATE-<id>.md` presence at the feature dir overrides task status with `blocked`.

### TEST-`<id>`.md

```yaml
plan_author: "@test"
adversarial_input_count: <int>
```

Body is the coverage matrix only; probe definitions live in CONTRACT §S-CRITERIA-001 — do NOT re-state.

### TSR-`<id>`.md (NEW — folds VERDICT + CODE-REVIEW)

```yaml
eval_verdict: PASS | FAIL | pending
eval_score: <int>                  # 0..100
rev_verdict: APPROVED | REQUEST_CHANGES | pending
rev_round: <1..3>                  # circuit breaker at round 4 (becomes ESCALATE/DEADLOCK)
ship: ALLOW | HOLD | pending
```

Single-writer-per-section discipline: `@evaluator` writes `S-EVAL-*` anchors only; `@reviewer` writes `S-REV-*` only; `@ship` writes `S-SHIP-001`. `validate.js`'s `fold-correctness` mode rejects a TSR missing either `S-EVAL-VERDICT-001` or `S-REV-VERDICT-001`.

### SAD.md (project singleton)

```yaml
project_mode: greenfield | brownfield
c4_levels_present: [1, 2]
adr_count: <int>                   # rows in S-ADR-INDEX-001 with status=accepted
```

### ADR-`<NNNN>`-`<slug>`.md (NEW — global flat numbering)

```yaml
status: proposed | accepted | superseded | deprecated
superseded_by: ADR-<NNNN> | null
triggered_by: <PRD-NNN | FRS-NNN | TDD-NNN | SAD>
review_round: <1..3>               # circuit at round 4 → DEADLOCK-ADR-<NNNN>.md
option_count: <int>
```

`@lead` is sole author of body content. `@reviewer` Edits only `S-CONSEQUENCES-001` (REQUEST_CHANGES findings) and sets frontmatter `rev_verdict`-equivalent transitions on `status`. State machine is mandatory and rendered as `diagrams/adr-status.svg`.

### RELEASE-vX.Y.Z.md (release-time singleton; folds ANNOUNCEMENT)

```yaml
version: <semver>                  # matches VERSION + plugin.json + topmost CHANGELOG entry
released_at: <ISO-8601>
features: [<id>, <id>, ...]
runbook_required: true | false
```

`S-ANNOUNCEMENT-001` is mandatory — it absorbs v1's separate `ANNOUNCEMENT-*.md` artifact. `validate.js`'s `fold-correctness` mode rejects a RELEASE missing this anchor.

### RUNBOOK-vX.Y.Z.md (conditional release-time singleton)

```yaml
version: <semver>
topology_change_summary: <string>
deploy_steps_count: <int>
rollback_steps_count: <int>
```

### ESCALATE-`<id>`.md, ESCALATE-ARCH-`<id>`.md, ESCALATE-ADR-`<NNNN>`.md

```yaml
triggered_by_<stage|agent>: <value>
resolution: pending | resolved-via-<X> | abandoned
direction: <free-text — present only when resolved>
```

`ESCALATE-ADR-<NNNN>.md` is NEW in v2.0.0 — written by `@reviewer` (or implementers via `ESCALATE-ARCH-*.md` upgrade path) when an undocumented architectural decision warrants opening an ADR.

### DEADLOCK-`<id>`.md, DEADLOCK-ADR-`<NNNN>`.md

```yaml
triggered_by_stage: <PRD|TDD|CONTRACT|TEST|TSR>
strike_count: 3                    # always 3 — that's the trigger
resolution: pending | abandoned | resolved-with-direction | requires-rescope
direction: <free-text>
```

`DEADLOCK-ADR-<NNNN>.md` is NEW in v2.0.0 — written when an ADR's `review_round` reaches 3 with `rev_verdict: REQUEST_CHANGES` still standing.

### SUMMARY-`<id>`.md

Parent-authored closure receipt at every terminal state (success, deadlock, escalated, aborted). Lives at feature-dir root. **NO `sections:` block, NO lockfile** — body-grammar carve-out applies. Thin by design — does NOT duplicate `runs/<run-id>.json` digest content.

```yaml
team_name: orchestra-<feature_id>
started_at: <ISO-8601>
ended_at: <ISO-8601>
duration_seconds: <int>
terminal_state: success | deadlock | escalated | aborted
artifact_count: <int>
```

Body: 1–3 line plain-text closing note.

### INTENT-`<id>`.md

Brief classification artifact for `template` / `docs` / `review-only` intents (per `schemas/routing-taxonomy.md`). v2.0.0 increasingly prefers `<NNN>-CHARTER.md` (mode: brief) for these slots, but `INTENT-<id>.md` remains valid for routes that don't scaffold a charter. Same body-grammar carve-out as SUMMARY.

## Validation

- `validate.js` (the plugin's static checker) walks plugin-internal dirs; PR #3 added pure functions for pipeline-artifact validation (`validateStructuralDiff`, `validateLockfilePresence`, `validateLockfileGrammar`, `validateDiagramHashes`, `validateOrphanTypes`, `validateFoldCorrectness`, `validateSoftCap`).
- `validate-drift.js` walks consumer `.claude/.orchestra/` artifacts; reads hashes from lockfile when paired (v2), falls back to inline frontmatter for v1 legacy fixtures.
- The `hash-stamper` hook writes hashes into the lockfile only when one is paired — see `schemas/lockfile.schema.md` §S-FILENAME-001.
- Any artifact frontmatter that violates the type-specific shape fails with `frontmatter-grammar-violation`. Any artifact whose `lockfile.sections.<id>.hash` differs from the recomputed body-section hash fails with `frontmatter-out-of-sync`.

## Versioning

Bump `revision:` when adding/renaming type-specific keys, when adding/removing artifact types, or when changing the diagram-slot table. v2.0.0's revision is `4` (was 3 in v1).
