---
id: RUN-PLAN-SCHEMA
title: orchestra run-plan.md frontmatter schema
created: 2026-05-12
status: draft
revision: 1
scope: shape of `<scope_path>/.orchestra/run-plan.md`.
---

# orchestra run-plan.md schema

## Placement

```
<scope_path>/.orchestra/run-plan.md
<context_path>/.orchestra/run-plan.md
```

## Frontmatter

```yaml
---
id: run-plan
type: RUN-PLAN
created: <ISO-8601>
revision: <integer ≥ 1>
status: draft | locked
pipeline_id: <string>
workspace_kind: single-repo | multi-repo | multi-service
context_path: <path>
scope_path: <path>
test_depth: stage1 | stage2
primary_language: <string>
framework: <string>
auto_mode: true | false
run_plan_status: drafted | approved | revision_requested
revision_cycle: <integer ≥ 0>
---
```

Invariants:
- `run_plan_status: approved` ⇒ `status: locked`.
- `auto_mode: true` ⇒ `run_plan_status: approved`.
- `revision_cycle ≤ 3`; exceeding the cap escalates to `ESCALATE-<id>.md`.

## Body grammar

Required anchors:

- `S-CONTEXT-001` — `## Context` — `| Field | Value |` table lifted from `local.yaml` (workspace_kind, context_path, scope_path, test_depth, primary_language, framework, pipeline_id).
- `S-PHASES-001` — `## Phases` — `| Phase | Agents | Output anchors |`. Phase ∈ `discovery | spec-draft | verification | gap-resolution | gate`.
- `S-FEATURES-001` — `## Features` — `| Feature slug | Authoring agents | Artifacts | Legacy seeds |`. Legacy seeds reference rows from `inventory.md` regen plan; empty for greenfield.
- `S-GATES-001` — `## Gates` — `| Gate | Auto-passed under auto_mode | Preserved under auto_mode |`. Preserved column lists structural-failure halts (allowed-set, diagram allowlist), reviewer `REVISE` / `BLOCK` / `ALLOW_WITH_GAP`, schema-validation failures, `ESCALATE` / `DEADLOCK` emission.
- `S-APPROVAL-001` — `## Approval` — `plan_status:` line carries the current `run_plan_status` value; on `revision_requested`, follow with `revision_notes:` listing user-requested changes.

## Validation

`scripts/validate.js` registers `RUN-PLAN` in `REQUIRED_ANCHORS` and `SOFT_CAPS` (cap 250); structural-diff enforces anchor presence. The frontmatter invariants above are enforced by `validateLocalYamlContent` mirroring runs (since the same `auto_mode` / `run_plan_status` fields live in `local.yaml`).
