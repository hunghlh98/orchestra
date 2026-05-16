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
feature_framing: aggregate-cohesion | lifecycle-loop  # optional; defaults to aggregate-cohesion
auto_promote_workspace_sad: true | false  # optional; defaults to false
run_plan_status: drafted | approved | revision_requested
revision_cycle: <integer ≥ 0>
---
```

Invariants:
- `run_plan_status: approved` ⇒ `status: locked`.
- `auto_mode: true` ⇒ `run_plan_status: approved`.
- `revision_cycle ≤ 3`; exceeding the cap escalates to `ESCALATE-<id>.md`.
- `feature_framing` (optional): controls how `@lead`'s plan-mode walk groups entry points into `S-FEATURES-001` rows. Default `aggregate-cohesion` keeps the existing one-feature-per-aggregate-root collapse rule. Setting `lifecycle-loop` replaces it with the **Journey gate** from `commands/orchestra.md` `## Shared rules` — one feature per outcome category of the aggregate's terminal-state partition. Aggregate atomicity at the lock/transition layer stays unified across sibling lifecycle features via service-scope `<service_name>-BR-AC.md S-INVARIANTS-001`, NOT duplicated per feature.
- `auto_promote_workspace_sad` (optional): set `true` by the dispatcher when the `code-to-spec` auto-promote rule fires (`multi-repo` + `per-service` + workspace `SAD.md` absent — see `commands/orchestra.md` "Auto-promote spawn brief"). `true` ⇒ `S-SCOPE-UPGRADE-001` anchor REQUIRED in body, declaring that SAD / C4 L1+L2 / `business-invariants.md` author at workspace scope (one System() box = the platform; every Service-Topology entry = a Container) even though `source_path` points at one service. The human reviewer reads this anchor before approving — it's the explicit handshake on scope upgrade.

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
- `S-SCOPE-UPGRADE-001` — `## Scope upgrade` — REQUIRED when frontmatter `auto_promote_workspace_sad: true`; omitted otherwise. Body shape:
  ```
  | Field | Value |
  | requested scope | per-service: <service_name> |
  | upgraded scope  | workspace (multi-repo, system-wide) |
  | trigger         | workspace SAD absent at <context_path>/docs/SAD.md |
  | workspace pass artifacts | SAD.md, c4-context.puml, c4-container.puml, erd-logical.puml (when persistence exists), sequence-inter-<flow>.puml per cross-service journey, business-invariants.md, per-service BR-AC for every Service-Topology service, accepted ADRs |
  | narrowing pass artifacts | per-feature {PRD, FRS, TDD, openapi.yaml} for <service_name> only |
  ```
  This anchor is the explicit handshake: workspace pass authors at platform scope (one System() box = the platform; siblings as Containers, not System_Ext), narrowing pass authors per-feature artifacts for the requested service only. `@lead` populates this anchor in the first run-plan draft when the dispatcher signals auto-promote.

## Validation

`scripts/validate.js` registers `RUN-PLAN` in `REQUIRED_ANCHORS` and `SOFT_CAPS` (cap 250); structural-diff enforces anchor presence. The frontmatter invariants above are enforced by `validateLocalYamlContent` mirroring runs (since the same `auto_mode` / `run_plan_status` fields live in `local.yaml`).
