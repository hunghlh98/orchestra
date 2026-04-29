---
id: PIPELINE-SCHEMA
title: orchestra Pipeline Artifact Frontmatter Schemas
created: 2026-04-29
status: draft
revision: 1
scope: type-specific frontmatter shapes for every artifact in PRD §9.3 ownership table
references:
  prd:
    - id: PRD-001
      sections: [S-FRONTMATTER-001, S-INVARIANTS-001]
---

# orchestra Pipeline Artifact Frontmatter Schemas

> Type-specific extensions of the common frontmatter contract in PRD §10.5. Every artifact under `<project>/.claude/.orchestra/` carries the common shape plus the type-specific keys listed below. Hook scripts and `validate-drift.js` parse every example here using `hooks/lib/yaml-mini.js`.

## Common shape (all artifacts)

```yaml
---
id: <ARTIFACT>-<id>
type: <PRD|FRS|TDD|CONTRACT|...>
created: <ISO-8601>
revision: <integer ≥ 1>
sections:
  S-<TYPE>-NNN:
    hash: "sha256:..."
    confirmed: true              # OR inferred: true (mutually exclusive)
references:
  - type: <upstream-type>        # sad | prd | frs | tdd | contract | api | runbook | release | impl-be | impl-fe | code-review | doc | test | plan
    id: <upstream-id>            # "" for singletons (sad)
    section: S-<TYPE>-NNN
    hash-at-write: "sha256:..."
---
```

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
sad-touched: true | false        # whether this feature mutated SAD; gates SAD update flow per PRD §D-22
c4_levels_present: [3, 4]        # which c4 levels this TDD covers (always 3-4; cloned 1-2 sections from SAD)
```

### CONTRACT-<id>.md

```yaml
signed: true | false             # @evaluator co-sign per PRD §8.2
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
review_round: <1..3>             # circuit breaker at round 4 per PRD §8.11
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
```

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

### SUMMARY-<timestamp>.md

```yaml
run_id: <uuid>
agents_used: ["@product", "@lead", ...]
total_token_in: <int>
total_token_out: <int>
features_touched: [<id>, ...]
```

## Validation

`validate.js` (PR #1) and `validate-drift.js` (PR #2) read these via `hooks/lib/yaml-mini.js`. Any frontmatter that violates the frozen grammar (PRD §8.13) fails with `frontmatter-grammar-violation`. Any artifact whose `sections.<id>.hash` differs from the recomputed hash of its body fails with `frontmatter-out-of-sync`.

## Versioning

This document evolves with the artifact contract. Bump `revision:` when adding/renaming type-specific keys; the frontmatter itself follows the common shape so its own changes are tracked the same way.
