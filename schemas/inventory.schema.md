---
id: INVENTORY-SCHEMA
title: orchestra inventory.md frontmatter schema
created: 2026-05-12
status: draft
revision: 1
scope: shape of `<scope_path>/.orchestra/inventory.md`.
---

# orchestra inventory.md schema

## Placement

```
<scope_path>/.orchestra/inventory.md
<context_path>/.orchestra/inventory.md
```

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
- `S-DECISIONS-001` — `## Decisions` — `| Path | Bucket | Action | Target |`. Action ∈ `migrate-as-regen-seed | keep-as-legacy-reference | fold-into-PRD | fold-into-FRS | fold-into-TDD | fold-into-ADR | archive | discard`.
- `S-REGEN-PLAN-001` — `## Regeneration plan` — `| Feature slug | Legacy seeds | Authoring agents | Notes |`.
- `S-WARNINGS-001` — `## Warnings` — `| Path | Warning |`.

## Validation

`scripts/validate.js` exposes `validateInventoryContent(relPath, raw)`.
