---
id: RUN-PLAN-SCHEMA
title: orchestra run-plan.md frontmatter schema
created: 2026-05-12
status: draft
revision: 3
scope: shape of `<context_path>/.orchestra/plans/<session_id>/run-plan.md`.
---

# orchestra run-plan.md schema

## Placement

```
<context_path>/.orchestra/plans/<session_id>/run-plan.md
```

One run-plan per Claude Code session. `<session_id>` = Claude Code session-id, sourced from the `orchestra-preflight.js` hook's `<orchestra-preflight>` additional-context block (hook reads `input.session_id` from stdin). Plan scope is workspace-level — one plan covers all services + features in the session.

Multi-`/orchestra`-per-session: same `<session_id>` reuses the dir; second invocation re-authors the plan with features appended and re-locks via PlanMode before dispatch. Hard escape to start a fresh run: `claude --fork-session`.

## Frontmatter

```yaml
---
id: run-plan
type: RUN-PLAN
created: <ISO-8601>
revision: <integer ≥ 1>
status: draft | locked
session_id: <string>                       # = Claude Code session-id from preflight block
direction: forward | reverse               # forward-chain (spec-to-code) or reverse-chain (code-to-spec)
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
- `revision_cycle ≤ 3`; exceeding the cap escalates to `<context_path>/.orchestra/plans/<session_id>/run-plan-DEADLOCK.md`.
- `direction: reverse` ⇒ body's `## Agent assignments` MAY carry a top-level `discovery:` section listing `@explorer` reports; `direction: forward` ⇒ `discovery:` section absent.
- `reverse_authoring_mode` field permitted on `## Agent assignments` rows only when `direction: reverse` AND target path is narrative (`.md`) or contract (`.yaml`). Diagrams (`.puml`) reject the field — reverse-pass always re-derives diagrams from source archaeology.

## Body grammar

Required anchors (3):

- `S-FEATURES-001` — `## Features` — DAG of features authored under this plan. Per-feature entry:
  - `<feature-id>` — `<short-service-name>-<NNN>-<slug>` per `schemas/pipeline-artifact.schema.md` `#S-FEATURE-ID-FMT-001`.
  - `classifier` — `business` | `tech`. Output of intent classification; informs which artifact slots populate.
  - `depends_on` — list of feature-ids that must reach `verdict: PASS` before this feature spawns.
  - `supersedes` — list of feature-ids being replaced (predecessor `status:` user-controlled).
  - `cross_feature` (OPTIONAL) — `<cross_feature_id>` from `<context_path>/.orchestra/cross-features.yaml` declaring this feature is one member of a cross-service feature bound to ≥2 services. Multiple per-service features sharing the same `cross_feature` value MUST appear together in `members:` of the referenced `cross_features[]` entry. Omit on intra-service features.
  - `artifact_slots` — for `business` features: per-feature `PRD`, `FRS`, `TDD` plus per-service single-writer touches (`<service>-openapi.yaml` / `asyncapi.yaml` / `clientapi.yaml`, `diagrams/c4-component.puml`, `diagrams/erd-logical.puml`, `diagrams/state-machine.puml`, `diagrams/usecase.puml` — only the singletons the feature mutates). Per-feature diagram surface = `sd-<journey>.puml` only. For `tech` features: implementation target only.

- `S-AGENT-ASSIGNMENTS-001` — `## Agent assignments` — YAML block mapping output paths to authoring subagents. Top-level keys:
  - `discovery:` (REQUIRED on `direction: reverse`; OMITTED on `direction: forward`) — list of per-service `@explorer` reports. Row keys: `service`, `report_path`, `author`.
  - `workspace:` (OMITTED on `scope_level: per-service`) — workspace-scope singletons. Row keys: `path`, `author`, `reverse_authoring_mode` (narrative/contract only, reverse only).
  - `services:` — per-service singletons created on first service occurrence. Row keys: `service`, `artifacts: [{path, author, reverse_authoring_mode?}]`.
  - `features:` — per-feature artifact mapping. Row keys: `feature`, `direction`, `classifier`, `depends_on`, `supersedes`, `spec_artifacts: [...]`, `diagram_artifacts: [...]` (sd-only), `service_singletons_touched: [...]` (deltas to per-service singletons; each row: `path`, `author`, `write_mode`, `reverse_authoring_mode?`), `impl_artifacts: [...]` (forward only), `convergence_artifacts: [...]` (forward only), `manifest: [...]`.

- `S-RISKS-001` — `## Risks + decisions` — up-front surfacing of: ADR-worthy decisions to author during the run; constraints from preflight (autonomy level, spawn mode, language stack); maximum revision cycles per gate (default 3); auto-mode behavior on plan approval; known unknowns to research mid-execution.

## `write_mode` enum

`service_singletons_touched` rows carry `write_mode:` declaring how the feature contributes to the singleton:

| value | meaning | typical author |
|---|---|---|
| `append-endpoints` | New HTTP/event endpoints added to `<service>-openapi.yaml` / `asyncapi.yaml` / `clientapi.yaml` | `@architect` |
| `append-components` | New components / dependencies added to `<service>/diagrams/c4-component.puml` | `@architect` |
| `append-entities` | New entities / relationships added to `<service>/diagrams/erd-logical.puml` (persistence-touching features) | `@architect` |
| `append-states` | New states / transitions added to `<service>/diagrams/state-machine.puml` (lifecycle-touching features) | `@architect` |
| `append-usecases` | New end-user use cases added to `<service>/diagrams/usecase.puml` (end-user-visible features) | `@analyst` |

Features that do NOT mutate a given singleton OMIT the row entirely. The `@architect` / `@analyst` performing the append reads the current singleton, computes the delta, merges, writes the whole file.

## Single-writer surfaces

Six per-service artifacts are single-writer — at most one `@architect` or `@analyst` may hold a write on the file at any moment:

- `<context_path>/docs/<service>/<service>-openapi.yaml` (alt: `asyncapi.yaml` / `clientapi.yaml`)
- `<context_path>/docs/<service>/diagrams/c4-component.puml`
- `<context_path>/docs/<service>/diagrams/erd-logical.puml`
- `<context_path>/docs/<service>/diagrams/state-machine.puml`
- `<context_path>/docs/<service>/diagrams/usecase.puml`
- `<context_path>/docs/<service>/<service>-BR-AC.md`

Plus workspace singletons (`docs/SAD.md`, `docs/business-invariants.md`, `docs/diagrams/c4-context.puml`, `docs/diagrams/c4-container.puml`, `docs/diagrams/erd-logical.puml`).

Concurrent features whose `service_singletons_touched` paths intersect MUST serialize at the authoring agent's spawn level. The main agent enforces by NOT batching parallel `Agent` spawns when intersection exists. The schema declares the constraint; execution-time enforcement lives in `commands/orchestra.md` (Phase 3 swarm batch rule).

## Validation

`scripts/lib/validate-artifacts.js` registers `RUN-PLAN` in `REQUIRED_ANCHORS` (3 anchors above) and `SOFT_CAPS` (cap 250). Structural-diff enforces anchor presence. Frontmatter invariants enforced by `validateLocalYamlContent` mirroring runs (since `auto_mode` / `run_plan_status` fields also live in `local.yaml`).
