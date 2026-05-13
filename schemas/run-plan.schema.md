---
id: RUN-PLAN-SCHEMA
title: orchestra run-plan.md frontmatter schema
created: 2026-05-12
status: draft
revision: 1
scope: shape of `<context_path>/.orchestra/<service_name>/run-plan.md`.
---

# orchestra run-plan.md schema

## Placement

```
<context_path>/.orchestra/<service_name>/run-plan.md
```

One run-plan per service partition under `<context_path>/.orchestra/<service_name>/`. Multi-service workspaces produce one run-plan per registered `service_name`.

## Frontmatter

```yaml
---
id: run-plan
type: RUN-PLAN
created: <ISO-8601>
revision: <integer ≥ 1>
status: draft | locked
pipeline_id: <string>
service_name: <string>
workspace_kind: single-repo | multi-repo | multi-service
context_path: <path>
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

- `S-CONTEXT-001` — `## Context` — `| Field | Value |` table lifted from `system.yaml` + `local.yaml` (workspace_kind, context_path, service_name, scope_level, test_depth, primary_language, framework, pipeline_id).
- `S-PHASES-001` — `## Phases` — `| Phase | Agents | Output anchors |`. Phase ∈ `discovery | spec-draft | verification | gap-resolution | gate`.
- `S-FEATURES-001` — `## Features` — `| Feature slug | Authoring agents | Artifacts | Sub-capabilities | Source anchors | State-machine role | Legacy seeds |`. Column semantics:
  - **Sub-capabilities** — under `scope_level: service`, the bullet list of capability-grain surfaces the single feature row aggregates (e.g., `placement, payment-binding, lifecycle, tracking`). Under `scope_level ∈ {container, capability}`, one capability per row → leave as `—`.
  - **Source anchors** — observable code anchors the feature derives from: controller / use-case / domain-package paths (e.g., `services/order/src/main/java/.../OrderController.java`). Brownfield-mandatory; greenfield may use `—`.
  - **State-machine role** — `owner` (the feature owns a user-facing lifecycle authored as business-state PUML), `participant` (the feature contributes transitions to a CSD-level state machine but does not own it), or `—` (no lifecycle).
  - **Legacy seeds** — under `mode: brownfield`, references `inventory.md` `S-DECISIONS-001` rows whose action ∈ `{migrate-as-regen-seed, fold-into-CSD, fold-into-PRD, fold-into-FRS, fold-into-TDD}` and which seed this feature's authoring; empty for greenfield.
- `S-GATES-001` — `## Gates` — `| Gate | Auto-passed under auto_mode | Preserved under auto_mode | tsr_gate_mode_override |`. Column semantics:
  - **Preserved** lists structural-failure halts (allowed-set, diagram allowlist), reviewer `REVISE` / `BLOCK` / `ALLOW_WITH_GAP`, schema-validation failures, `ESCALATE` / `DEADLOCK` emission.
  - **tsr_gate_mode_override** — `deferred` ONLY on the reviewer-verdict row when the user wants @evaluator + @reviewer to run in parallel with hand-back instead of sequentially before turn end; `—` otherwise. When set, `@lead` surfaces this row explicitly in run-plan approval (greenfield) or in the `ExitPlanMode` summary (brownfield), and on approval mirrors `tsr_gate_mode: deferred` to `local.yaml`. Default value (no row override) keeps the always-blocking semantics described in `commands/orchestra.md` "Auto-mode runtime semantics".
- `S-APPROVAL-001` — `## Approval` — `plan_status:` line carries the current `run_plan_status` value; on `revision_requested`, follow with `revision_notes:` listing user-requested changes.

Optional anchors:

- `S-CHAIN-PLAN-001` — `## Chain plan (narrative)` — prose execution sequence the user reads alongside `S-PHASES-001`'s structured table. Sub-section per phase; `@lead` authors when scope spans ≥3 features OR when the user signalled they want a narrative walkthrough in their intent. Skip when `S-PHASES-001` is self-sufficient (single-feature greenfield, capability-grain runs).

## Validation

`scripts/validate.js` registers `RUN-PLAN` in `REQUIRED_ANCHORS` and `SOFT_CAPS` (cap 250); structural-diff enforces anchor presence. The frontmatter invariants above are enforced by `validateLocalYamlContent` mirroring runs (since the same `auto_mode` / `run_plan_status` fields live in `local.yaml`).
