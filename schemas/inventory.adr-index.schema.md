---
id: ADR-INDEX-SCHEMA
title: orchestra .orchestra/inventory/adr/index.md frontmatter schema
created: 2026-05-14
status: draft
revision: 1
scope: shape of `<context_path>/.orchestra/inventory/adr/index.md` (workspace-global ADR index).
---

# orchestra .orchestra/inventory/adr/index.md schema

## Placement

```
<context_path>/.orchestra/inventory/adr/index.md
```

Workspace-global singleton — one index file regardless of how many services are partitioned under `<context_path>/.orchestra/<service_name>/`. Lives **outside `docs/`** because `docs/` is a sealed narrative tree: `docs/*` artifacts link only to other `docs/*` artifacts, never to codebase paths, external URLs, or `.orchestra/` siblings. Inventory-style indexes belong under `.orchestra/inventory/`.

Individual ADR bodies stay under `docs/`:
- Global ADRs at `<context_path>/docs/adr/ADR-<NNNN>-<slug>.md` (`scope: global`).
- Service ADRs at `<context_path>/docs/<service_name>/adr/ADR-<service_name>-<NNN>-<slug>.md` (`scope: service`).

This file indexes them; their bodies are the source of truth. Downstream artifacts (PRD, FRS, TDD, RUNBOOK, RELEASE) cite accepted ADRs by ID in plain prose ("per ADR-0007-use-postgres, ..."), never by section anchor and never by linking the index file from inside `docs/`.

## Frontmatter

```yaml
---
id: adr-index
type: ADR_INDEX
created: <ISO-8601>
revision: <integer ≥ 1>
adr_count: <integer ≥ 0>      # total rows across both tables
global_count: <integer ≥ 0>   # rows in S-GLOBAL-001
service_count: <integer ≥ 0>  # rows in S-SERVICES-001
---
```

Invariants:
- `adr_count == global_count + service_count`.
- `revision` increments on every row append, row update (status change), or row removal.
- `created` is set once at first emission; never updated.

## Body grammar

Two required anchors in order:

- `S-GLOBAL-001` — `## Global ADRs`. Row shape `| ADR | Slug | Status | Accepted at |`. One row per accepted ADR with `scope: global` in its frontmatter. ADR id format `ADR-<NNNN>` zero-padded 4 digits, project-wide flat numbering.
- `S-SERVICES-001` — `## Service-scoped ADRs`. Row shape `| Service | ADR | Slug | Status | Accepted at |`. One row per accepted ADR with `scope: service`. Service column equals the owning `<service_name>`. ADR id format `ADR-<service_name>-<NNN>` zero-padded 3 digits, per-service numbering starting at 001.

Both tables MAY be empty (header rows only). `revision: 1` at emission with zero rows is valid.

## Status values

`Status` column ∈ `accepted | superseded`. `proposed` ADRs are NOT indexed — they appear here only after `@reviewer` flips them to `accepted`. Superseded ADRs stay in the index (their decisions remain operative history).

## Lifecycle

1. **Bootstrap.** First ADR-acceptance in the workspace triggers emission of the file with the accepting row appended. No empty-shell pre-creation.
2. **Append.** On every `proposed → accepted` transition, `@architect` appends the row to the correct table (`S-GLOBAL-001` or `S-SERVICES-001`) and bumps `revision`.
3. **Supersede.** On `accepted → superseded`, update the row in place (Status column) and bump `revision`. The row stays.
4. **Read.** `@lead` / `@product` / implementer tiers locate accepted ADRs from this index, then read the ADR body at `<context_path>/docs/adr/...` (or `<context_path>/docs/<service_name>/adr/...`). The index is a discovery / overview surface; the ADR body is authoritative.

## Validation

`scripts/validate.js` exposes `validateAdrIndexContent(relPath, raw)`.
