---
id: PIPELINE-SCHEMA
title: orchestra Pipeline Artifact Frontmatter Schemas
created: 2026-04-29
status: draft
revision: 3
scope: type-specific frontmatter shapes for every artifact authored by the orchestra agents
references:
  prd:
    - id: PRD-001
      sections: [S-FRONTMATTER-001, S-INVARIANTS-001]
---

# orchestra Pipeline Artifact Frontmatter Schemas

> Type-specific extensions of the common frontmatter contract. Every artifact under `<project>/.claude/.orchestra/` carries the common shape plus the type-specific keys listed below. Hook scripts and `validate-drift.js` parse every example here using `hooks/lib/yaml-mini.js`.

## Filename + folder layout

Feature-scoped artifacts use the format `<feature_id>-<TYPE>.<ext>` (numeric or slug feature_id first; type uppercase) and live under topical sub-folders inside the feature pipeline dir:

```
<project>/.claude/.orchestra/
├── architecture/
│   └── SAD.md                                   # project singleton (no feature id)
├── runbooks/
│   └── RUNBOOK-vX.Y.Z.md                        # version singleton
├── releases/
│   └── RELEASE-vX.Y.Z.md                        # version singleton
└── pipeline/
    └── <feature_id>-<slug>/                     # e.g., 001-url-shortener/
        ├── intent.yaml                          # control plane (not an artifact)
        ├── ESCALATE-<id>.md                     # exception files at root
        ├── DEADLOCK-<id>.md
        ├── SUMMARY-<id>.md                      # closure receipt at terminal state
        ├── requirements/
        │   ├── 001-PRD.md
        │   └── 001-FRS.md
        ├── interfaces/
        │   ├── 001-CONTRACT.md
        │   └── 001-API.openapi.yaml
        ├── design/
        │   └── 001-TDD.md
        ├── plan/
        │   ├── 001-TASKS.md
        │   └── 001-IMPL-NOTES.md
        ├── verify/
        │   ├── 001-TEST.md
        │   ├── 001-CODE-REVIEW.md
        │   └── 001-VERDICT.md
        └── release/
            ├── 001-RELEASE.md                   # feature-scoped release notes
            ├── 001-RUNBOOK.md                   # feature-scoped runbook
            ├── 001-ANNOUNCEMENT.md
            └── 001-COMMIT-MSG.txt
```

Type → folder map:

| Type | Folder | Example filename |
|---|---|---|
| `PRD`, `FRS` | `requirements/` | `001-PRD.md`, `001-FRS.md` |
| `CONTRACT`, `API` | `interfaces/` | `001-CONTRACT.md`, `001-API.openapi.yaml` |
| `TDD` | `design/` | `001-TDD.md` |
| `TASKS` (`PLAN`), `IMPL-NOTES` | `plan/` | `001-TASKS.md`, `001-IMPL-NOTES.md` |
| `TEST`, `CODE-REVIEW`, `VERDICT` | `verify/` | `001-TEST.md`, `001-CODE-REVIEW.md`, `001-VERDICT.md` |
| `RELEASE`, `RUNBOOK`, `ANNOUNCEMENT`, `COMMIT-MSG` (feature-scoped) | `release/` | `001-RELEASE.md` |
| `SAD` | `architecture/` (project singleton, no feature id) | `SAD.md` |
| `RUNBOOK-vX.Y.Z`, `RELEASE-vX.Y.Z` (version singletons) | `runbooks/`, `releases/` | `RUNBOOK-v1.2.0.md` |
| `ESCALATE`, `DEADLOCK`, `SUMMARY` | feature-dir root | `ESCALATE-001.md`, `SUMMARY-001.md` |

**Rationale for the format flip**: `<feature_id>-<TYPE>` puts the feature id first so an `ls -1` sort groups all artifacts for a feature together regardless of type. It also makes a single grep pattern (`grep "001-PRD"`) hit both the filename and the artifact's own `id:` frontmatter field.

## Common shape (all artifacts)

```yaml
---
id: <feature_id>-<TYPE>          # e.g., "001-PRD", "001-CONTRACT" — matches filename stem
type: <PRD|FRS|TDD|CONTRACT|...>
created: <ISO-8601>
revision: <integer ≥ 1>
sections:
  S-<TYPE>-NNN:
    hash: "sha256:..."
    confirmed: true              # OR inferred: true (mutually exclusive)
references:
  - type: <upstream-type>        # sad | prd | frs | tdd | contract | api | runbook | release | impl-be | impl-fe | code-review | doc | test | plan
    id: <feature_id>             # e.g., "001-url-shortener"; "" for singletons (sad)
    section: S-<TYPE>-NNN
    hash-at-write: "sha256:..."
---
```

`references[].id` is the **feature id** (matches the pipeline sub-dir name, e.g., `001-url-shortener`), not the upstream artifact's `id:` — the resolver uses it to locate the feature dir, then looks up the type-specific folder.

## Authoring contract

Every artifact an agent authors MUST include the common shape above. Author `sections:` and `references:` blocks **explicitly** in the written output — do not rely on the `hash-stamper` hook to create them. The hook attaches to the parent context's `PreToolUse:Write` and may not fire on writes from inside a team-member subagent context. `hash-stamper` resolves `hash: TBD` and `hash-at-write: TBD` placeholders when it does fire; the structural keys must already be in your source.

`sections:` is a **dict keyed by S-ID** (e.g., `S-VISION-001`), not a list. Each S-ID maps to `{hash, confirmed | inferred}`.

## Body grammar <a id="body-grammar"></a>

Every H2 heading in the body MUST carry an HTML anchor whose id equals a key in the `sections:` frontmatter dict:

```markdown
## Vision <a id="S-VISION-001"></a>

A short URL service that …

## Goals <a id="S-GOALS-001"></a>

…
```

`hash-stamper` walks these anchors via the regex `/^##\s+.*<a id="(S-[A-Z]+(?:-[A-Z]+)*-\d{3})"><\/a>/` (see `hooks/lib/section-hash.js`). The section content is the bytes from the anchored heading line (exclusive) to the next anchored heading or EOF. Multi-segment tags are supported (`S-NON-GOALS-001`, `S-EVAL-VERDICT-001`, etc.). Without the anchor, no hash is computed and `validate-drift` cannot detect downstream drift on this section.

**Bidirectional invariant**: every key in `sections:` MUST have a matching `<a id>` in body, and every `<a id>` in body MUST have a matching `sections:` key. The validator flags either direction as a grammar violation.

## Type-specific additions

### PRD-<id>.md

```yaml
status: planned | in-flight | shipped | abandoned
version: <semver>                # the orchestra version this PRD targets
```

### FRS-<id>.md

```yaml
prd: PRD-<id>                    # parent PRD id (informational; references[] still required)
acceptance_criteria_count: <int> # for spot-check during review
```

### TDD-<id>.md

```yaml
sad-touched: true | false        # whether this feature mutated SAD; gates SAD update flow
c4_levels_present: [3, 4]        # which c4 levels this TDD covers (always 3-4; cloned 1-2 sections from SAD)
```

### CONTRACT-<id>.md

```yaml
signed: true | false             # @evaluator co-sign
weighted_criteria_total: 100     # validation: must sum to exactly 100
probe_count: <int>
critical_failure_conditions: <int>
```

### API-<id>.openapi.yaml

OpenAPI 3.x sidecar. Frontmatter is the OpenAPI document itself; `sections:` and `references:` live in an `x-orchestra:` extension key:

```yaml
openapi: 3.0.3
info:
  title: <feature> API
  version: <semver>
x-orchestra:
  sections:
    S-API-001:
      hash: "sha256:..."          # whole-file hash for API artifacts (no anchor walk)
      confirmed: true
  references:
    - type: frs
      id: <id>
      section: S-API-001
      hash-at-write: "sha256:..."
```

Hash-stamper hashes the whole file body for `.openapi.yaml` (no `<a id="...">` walk).

### SAD.md (project singleton)

```yaml
project_mode: greenfield | brownfield
c4_levels_present: [1, 2]
sad_section_count: <int>
inferred_section_count: <int>    # informational; brownfield grace period
```

### TEST-<id>.md

```yaml
plan_author: "@test"
verdict_author: "@evaluator"
verdict: PASS | FAIL | pending
weighted_score: <0..100>
adversarial_input_count: <int>
```

### CODE-REVIEW-<id>.md

```yaml
verdict: APPROVED | REQUEST_CHANGES | pending
review_round: <1..3>             # circuit breaker at round 4
```

### DOC-<id>.md

```yaml
audience: user | contributor | operator
```

### RELEASE-vX.Y.Z.md (release-time singleton)

```yaml
version: <semver>                # matches VERSION + plugin.json + topmost CHANGELOG entry
released_at: <ISO-8601>
features: [<id>, <id>, ...]      # feature ids included in this release
runbook_required: true | false   # if topology changed
```

### RUNBOOK-vX.Y.Z.md (conditional release-time singleton)

```yaml
version: <semver>
topology_change_summary: <string>
deploy_steps_count: <int>
rollback_steps_count: <int>
```

### CODE-DESIGN-{BE,FE}-<id>.md

```yaml
side: BE | FE
files_to_touch: [<glob>, ...]    # informational impact estimate
```

### IMPL-{BE,FE}-<id>.md

```yaml
side: BE | FE
related_design: CODE-DESIGN-<SIDE>-<id>
```

### PLAN-<id>.md

```yaml
task_graph_node_count: <int>
estimated_sp: <int>              # story points from task-breakdown skill
tasks_pending: <int>             # derived counter (S-TASKS-001 rows with Status=pending)
tasks_in_progress: <int>
tasks_done: <int>
```

`S-TASKS-001` is **mutable by design** — its frontmatter MUST carry `confirmed: false` so `validate-drift` skips it. The body table optionally includes `Status`, `Updated by`, `Updated at` columns; `Status ∈ {pending, in_progress, done}` (initial state `pending`). Implementer-tier owners (`@backend`, `@frontend`) self-report by flipping their row from `pending` to `in_progress` on pickup and to `done` on exit-criterion completion, re-stamping `S-TASKS-001.hash: TBD` on each write. Read-only-tier owners (`@evaluator`, `@reviewer`) do NOT self-report; their task status is derived at read time from the verdict frontmatter they author — `@evaluator`'s task is `done` ⟺ `verify/<NNN>-TEST.md` `verdict ∈ {PASS, FAIL}`; `@reviewer`'s task is `done` ⟺ `verify/<NNN>-CODE-REVIEW.md` `verdict ∈ {APPROVED, REQUEST_CHANGES}`. Tier-B owners (`@product`, `@lead`, `@test`, `@ship`) status is derived from artifact existence with `confirmed: true` sections. `ESCALATE-<id>.md` presence on the feature dir overrides task status with `blocked` for `/orchestra resume` logic. Backward-compat: a TASKS.md authored before this addition (no Status column) remains valid; readers treat a missing column as all rows `pending`.

### DEADLOCK-<id>.md

```yaml
triggered_by_stage: <PRD|TDD|CONTRACT|TEST|CODE-REVIEW>
strike_count: 3                  # always 3 — that's the trigger
resolution: pending | abandoned | resolved-with-direction | requires-rescope
direction: <free-text — present only when resolution is resolved-with-direction>
```

### ESCALATE-ARCH-<id>.md

```yaml
triggered_by_agent: "@backend" | "@frontend"
sad_section_to_update: S-<TYPE>-NNN
resolution: pending | resolved-via-sad-update | abandoned
```

### SUMMARY-<id>.md

Parent-authored closure receipt written at every terminal state (success, deadlock, escalated, aborted). Lives at feature-dir root alongside `ESCALATE-<id>.md` and `DEADLOCK-<id>.md`. Thin by design — does NOT duplicate `runs/<run-id>.json` digest content.

```yaml
team_name: orchestra-<feature_id>
started_at: <ISO-8601>             # from team.created event
ended_at: <ISO-8601>               # set at write time
duration_seconds: <int>            # ended_at − started_at
terminal_state: success | deadlock | escalated | aborted
artifact_count: <int>              # count of *.md / *.yaml under feature-dir at write time
```

Body is a 1–3 line plain-text closing note. **No `sections:` / `references:` block** — SUMMARY is parent-authored bookkeeping at terminal state, not a referenced node in the C4-style traceability graph.

**Body-grammar carve-out:** the bidirectional invariant in [Body grammar](#body-grammar) (every H2 has `<a id="S-...">`, every key in `sections:` has a matching anchor) does NOT apply to SUMMARY-*.md. `validate.js` and `validate-drift.js` MUST skip the anchor walk for this artifact type.

## Validation

`validate.js` (PR #1) and `validate-drift.js` (PR #2) read these via `hooks/lib/yaml-mini.js`. Any frontmatter that violates the frozen grammar fails with `frontmatter-grammar-violation`. Any artifact whose `sections.<id>.hash` differs from the recomputed hash of its body fails with `frontmatter-out-of-sync`.

## Versioning

This document evolves with the artifact contract. Bump `revision:` when adding/renaming type-specific keys; the frontmatter itself follows the common shape so its own changes are tracked the same way.
