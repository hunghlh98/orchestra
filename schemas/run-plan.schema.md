---
id: RUN-PLAN-SCHEMA
title: orchestra run-plan.md frontmatter schema
created: 2026-05-12
status: draft
revision: 2
scope: shape of `<context_path>/.orchestra/<service_name>/run-plan.md`.
---

# orchestra run-plan.md schema

## Placement

```
<context_path>/.orchestra/<service_name>/run-plan.md
```

One run-plan per service partition under `<context_path>/.orchestra/<service_name>/`.

## Frontmatter

```yaml
---
id: run-plan
type: RUN-PLAN
created: <ISO-8601>
revision: <integer ≥ 1>
status: draft | locked
service_name: <string>
workspace_kind: single-repo | multi-repo
context_path: <path>
scope_level: system-wide | per-service
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

- `S-CONTEXT-001` — `## Context` — `| Field | Value |` table lifted from `system.yaml` + `local.yaml` (workspace_kind, context_path, service_name, scope_level, primary_language, framework).
- `S-PHASES-001` — `## Phases` — `| Phase | Agents | Output anchors |`. Phase ∈ `discovery | spec-draft | verification | gate`.
- `S-FEATURES-001` — `## Features` — `| Feature slug | Authoring agents | Artifacts | Source anchors | State-machine role |`. Column semantics:
  - **Source anchors** — observable code anchors the feature derives from when reverse-authoring. Brownfield-mandatory; greenfield may use `—`. Anchors are described in prose (e.g., "order placement controller in the order service"), never as filesystem paths (Gate-D inverse enforces).
  - **State-machine role** — `owner` (the feature owns a user-facing lifecycle authored as business-state PUML), `participant` (the feature contributes transitions but does not own them), or `—` (no lifecycle).
- `S-GATES-001` — `## Gates` — `| Gate | Auto-passed under auto_mode | Preserved under auto_mode |`. **Preserved** lists structural-failure halts (allowed-set, diagram allowlist), reviewer `REQUEST_CHANGES`, schema-validation failures, `ESCALATE` / `DEADLOCK` emission.
- `S-APPROVAL-001` — `## Approval` — `plan_status:` line carries the current `run_plan_status` value; on `revision_requested`, follow with `revision_notes:` listing user-requested changes.

Optional anchors:

- `S-CHAIN-PLAN-001` — `## Chain plan (narrative)` — prose execution sequence the user reads alongside `S-PHASES-001`. `@lead` authors when scope spans ≥3 features OR when the user signalled they want a narrative walkthrough in their intent.

## Validation

`scripts/validate.js` registers `RUN-PLAN` in `REQUIRED_ANCHORS` and `SOFT_CAPS` (cap 250); structural-diff enforces anchor presence. The frontmatter invariants above are enforced by `validateLocalYamlContent` mirroring runs (since the same `auto_mode` / `run_plan_status` fields live in `local.yaml`).
