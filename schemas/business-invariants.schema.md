---
id: BUSINESS-INVARIANTS-SCHEMA
title: orchestra Workspace-Grain Business Invariants schema
created: 2026-05-14
status: draft
revision: 1
scope: shape of `<context_path>/docs/business-invariants.md` (workspace singleton).
---

# orchestra business-invariants.md schema

Workspace-grain singleton holding cross-service business rules and invariants. Authored only under `workspace_kind: multi-repo` AND `scope_level: system-wide`. Per-service BR-AC files cite this artifact for invariants that span multiple services.

## Placement

```
<context_path>/docs/business-invariants.md
```

Workspace singleton. Authored by `@architect` during the system-wide pass; updated in place when subsequent features introduce cross-service invariants.

**Not authored** under `workspace_kind: single-repo` (no cross-service surface) — the single service's BR-AC `S-INVARIANTS-001` is canonical.

## Frontmatter

```yaml
---
id: business-invariants
type: BUSINESS-INVARIANTS
created: <ISO-8601>
revision: <integer ≥ 1>
status: draft | locked
reverse_authoring_mode: cite-as-is | copy-and-modify | re-author    # REQUIRED when code-to-spec authored
readers:
  - "@product"
  - "@analyst"
  - "@architect"
  - "@backend"
  - "@frontend"
  - "@test-author"
  - "@test-runner"
  - "@evaluator"
  - "@reviewer"
invariant_count: <integer ≥ 0>
sections:
  S-INVARIANTS-001:
    writer: "@architect"
    status: pending | in_progress | locked
---
```

## Body grammar

Required anchors:

| Anchor | H2 heading | Row shape | Purpose |
|---|---|---|---|
| `S-INVARIANTS-001` | `## Cross-service invariants` | `\| ID \| Invariant \| Rationale \| Services \|` | Workspace-grain business rules + invariants that span ≥2 services. `ID` format `INV-NNN`. `Services` is a comma-separated list of `service_name` values the invariant binds. `Rationale` cites the underlying business need in prose (no codebase-specific identifiers). |

Anchor regex aligns with `schemas/pipeline-artifact.schema.md` `body-grammar`. Bidirectional invariant enforced.

## Relationship to per-service BR-AC

Per-service `<service_name>-BR-AC.md` `S-INVARIANTS-001` rows hold invariants scoped to ONE service. `docs/business-invariants.md` `S-INVARIANTS-001` rows hold invariants that bind ≥2 services. A row that appears in both is a structural failure — split by binding scope.

## Authoring lifecycle

See [architect-authoring-discipline](../agents/architect.md#authoring-style). Single-writer `@architect`; reverse-pass derives from BR-AC duplication scans; forward-pass triggers when a feature touches ≥2 services with a new cross-service rule.

## Writing style

See [architect-authoring-discipline](../agents/architect.md#authoring-style). Plus invariants-specific: one invariant per row (no multi-clause rows); describe services by `service_name` only.

**Link discipline.** Inherits per [pipeline-artifact.schema.md#link-discipline](pipeline-artifact.schema.md#link-discipline).

## Validation

`scripts/validate.js` exposes `validateBusinessInvariantsContent(relPath, raw)`:

- `S-INVARIANTS-001` present; bidirectional anchor ↔ `sections:` invariant.
- When `status: locked`: `invariant_count` equals row count.
- `INV-NNN` ids monotonic and unique.
- Every row has a non-empty `Services` cell with ≥2 service names.

## Versioning

Bump `revision:` on row-shape change.
