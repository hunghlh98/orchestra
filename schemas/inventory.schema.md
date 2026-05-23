---
id: INVENTORY-SCHEMA
title: orchestra inventory.md frontmatter schema
created: 2026-05-12
status: draft
revision: 1
scope: shape of `<context_path>/.orchestra/inventory.md` (workspace-global).
---

# orchestra inventory.md schema

## Placement

```
<context_path>/.orchestra/inventory.md
```

Workspace-global singleton — one inventory per `<context_path>`, regardless of how many services are partitioned under `<context_path>/.orchestra/<service_name>/`.

## Frontmatter

```yaml
---
id: inventory
type: INVENTORY
created: <ISO-8601>
revision: <integer ≥ 1>
status: draft | locked
scan:
  root: <path>
  depth: <1..5>
  excludes: [".git", "node_modules", "target", "build", "dist", ".idea", ".venv"]
  entries_scanned: <integer ≥ 0>
empty_workspace: true | false
classification:
  plugin_equivalent: <integer ≥ 0>
  out_of_taxonomy: <integer ≥ 0>
  redundant: <integer ≥ 0>
  stale: <integer ≥ 0>
decisions:
  migrate_count: <integer ≥ 0>
  keep_legacy_count: <integer ≥ 0>
  archive_count: <integer ≥ 0>
  discard_count: <integer ≥ 0>
  pending_count: <integer ≥ 0>
user_gate: pending | accepted
---
```

Invariants:
- `Σ classification.*` == `Σ decisions.*` == `scan.entries_scanned` when `empty_workspace: false`.
- `status: locked` requires `user_gate: accepted`.
- `empty_workspace: true` ⇒ classification + decisions counts all zero; body Classification / Decisions / Regen-plan tables may be empty.

## Body grammar

Required anchors:

- `S-SCAN-001` — `## Scan` — depth-limited `tree -L N` output.
- `S-CLASSIFICATION-001` — `## Classification` — `| Path | Bucket | Confidence | Detected as |`. Bucket ∈ `plugin-equivalent | out-of-taxonomy | redundant | stale`. Confidence ∈ `HIGH | LOW | —`.
- `S-DECISIONS-001` — `## Decisions` — `| Path | Bucket | Action | Target |`. Action ∈ `migrate-as-regen-seed | keep-as-legacy-reference | fold-into-BR-AC | fold-into-business-invariants | fold-into-PRD | fold-into-FRS | fold-into-TDD | fold-into-ADR | archive | discard`.
- `S-WARNINGS-001` — `## Warnings` — `| Path | Warning |`.

Per-service business shape (BRs, ACs, INVs) lives in the per-service BR-AC (`<context_path>/docs/<service_name>/<service_name>-BR-AC.md`) — NOT in inventory. Cross-service business invariants live in workspace `docs/business-invariants.md`. The `S-DECISIONS-001` `fold-into-BR-AC` and `fold-into-business-invariants` actions route legacy material into the matching artifact at `@architect`'s authoring time.

Per-service feature lists live in the per-service run-plan (`<context_path>/.orchestra/<service_name>/run-plan.md`) `S-FEATURES-001` — authored by the dispatcher (Phase 2 Plan body) after the workspace inventory is `user_gate: accepted`.

## Validation

`scripts/validate.js` exposes `validateInventoryContent(relPath, raw)`.
