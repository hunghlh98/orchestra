---
id: BR-AC-SCHEMA
title: orchestra Per-Service Business-Rules + Acceptance-Criteria (BR-AC) schema
created: 2026-05-14
status: draft
revision: 1
scope: shape of `<context_path>/docs/<service_name>/<service_name>-BR-AC.md` (per-service singleton).
---

# orchestra BR-AC schema

Per-service singleton holding the service's business rules, acceptance criteria, and implementer-only invariants. Authored by `@architect` (system-wide reverse pass) or as a side-effect of `@product`'s first feature in a service (forward chain).

In the C4 mental model: system-level SAD covers C1+C2 (project-wide containers); per-feature TDDs cover C3 components. BR-AC carries the cross-feature business contract for one service.

## Placement

```
<context_path>/docs/<service_name>/<service_name>-BR-AC.md
```

Singleton per service. Filename MUST equal `<service_name>-BR-AC.md`; the bracketed `<service_name>` token is replaced with the elected service-directory basename (e.g., `order-BR-AC.md`).

Under `workspace_kind: single-repo`, the file lives at `<context_path>/docs/<service_name>/<service_name>-BR-AC.md` where `<service_name>` = `basename(context_path)`. Under `multi-repo` + `scope_level: system-wide`, one BR-AC per detected service. Under `multi-repo` + `scope_level: per-service`, exactly one BR-AC for the elected service.

## Frontmatter

```yaml
---
id: <service_name>-BR-AC
type: BR-AC
created: <ISO-8601>
revision: <integer ≥ 1>
status: draft | locked
reverse_authoring_mode: cite-as-is | copy-and-modify | re-author    # REQUIRED when code-to-spec authored
readers:
  - "@product"
  - "@architect"
  - "@lead"
  - "@backend"
  - "@frontend"
  - "@test"
  - "@evaluator"
  - "@reviewer"
service_name: <string>
br_count: <integer ≥ 0>
ac_count: <integer ≥ 0>
invariant_count: <integer ≥ 0>
sections:
  S-BR-001:
    writer: "@architect"
    status: pending | in_progress | locked
  S-AC-001:
    writer: "@architect"
    status: pending | in_progress | locked
  S-INVARIANTS-001:
    writer: "@architect"
    status: pending | in_progress | locked
---
```

Field notes:

- `service_name` — MUST equal the basename of the parent directory and `service_name` in `local.yaml`. Drift between filename, frontmatter, and `local.yaml` is a structural failure.
- Count fields — populated when `status: locked`; equal the row counts of the three anchored tables.
- `verdict:` is **omitted** — BR-AC is a structural reference doc, not an evaluated artifact.

## Body grammar

Required anchors:

| Anchor | H2 heading | Row shape | Purpose |
|---|---|---|---|
| `S-BR-001` | `## Business rules` | `\| ID \| Rule \| Owner \| Source \|` | Stakeholder-signable policy statements scoped to this service. `ID` format `BR-NNN`. `Owner` MUST be a named human role (`Finance`, `Compliance`, `Platform-Lead`, `Risk-Ops`). `Source` cites policy of record by name (no URLs). |
| `S-AC-001` | `## Acceptance criteria` | `\| ID \| Assertion \| Verification surface \| Traces \|` | Service-grain acceptance criteria that hold across all features. `ID` format `AC-NNN`. `Verification surface` names the test layer (`integration-test`, `contract-test`, `monitoring-alert`). `Traces` cites a parent `BR-NNN` (own BR-AC) or workspace `business-invariants.md/INV-NNN`. |
| `S-INVARIANTS-001` | `## Service invariants` | `\| ID \| Invariant \| Rationale \|` | Service-wide implementer-only invariants every feature must honor (idempotency keys, ordering guarantees, currency precision). `ID` format `INV-NNN`. |

Anchor regex aligns with `schemas/pipeline-artifact.schema.md` `body-grammar`. Bidirectional invariant: every `sections:` key has a matching `<a id>`; every `<a id>` has a matching `sections:` key.

## BR vs INV: audience boundary

`S-BR-001` and `S-INVARIANTS-001` both state cross-feature rules; the split is by audience.

- **BR (business rule)** — stakeholder-signable policy. Stated in business-domain language; a named human role owns it. The `Owner` cell is the test: if no human role exists who could read and sign the row, it isn't a BR — push it to `S-INVARIANTS-001`.
- **INV (invariant)** — implementer-only consistency rule. Stated in technical / data-shape language. A business owner couldn't sign it because it's a "how", not a "what".

A row appearing in BOTH anchors is a structural failure — pick one based on the audience test.

## Authoring lifecycle

BR-AC is authored:

- **code-to-spec (reverse)** — by `@architect` during the system-wide pass when `scope_level: system-wide` AND `workspace_kind: multi-repo`; otherwise by `@architect` during per-service narrowing. Per-artifact inspect+classify rule applies; `reverse_authoring_mode` logged.
- **spec-to-code (forward)** — by `@architect` as a side-effect of the first feature in a previously-undocumented service. The BR-AC then accretes across subsequent features (rows added; never feature-attributed in body).

BR-AC is **non-iterative within a run** — author once, lock, then read-only for all downstream agents in the same run.

## Body grammar: living service-grain state (no feature attribution in body)

The three anchors describe the service's **current consolidated state**. They are NOT a feature-bundled snapshot.

Forbidden in body rows:

- `#<feature-id>` or `(feature 001)` annotations.
- "added by feature N" / "introduced by 002-..." prose.
- A row that's only true under one feature — those belong in the feature's PRD/FRS/TDD, not in BR-AC.

## Writing style

- Assertions, not descriptions.
- No section preambles.
- No hedging — uncertainty belongs in an ADR.
- No restatements — `S-INVARIANTS-001` does not re-narrate `S-BR-001`.

**Link discipline.** BR-AC lives under `docs/` and inherits the sealed-narrative + portability rule — no codebase paths, no external URLs, no `.orchestra/` siblings, no codebase-specific identifiers. Describe rules by name and role, not by file location. Full rule: `schemas/pipeline-artifact.schema.md#gate-d`.

## Validation

`scripts/validate.js` exposes `validateBRACContent(relPath, raw)`:

- Filename matches `<service_name>-BR-AC.md` and `frontmatter.service_name` equals the basename.
- All three required anchors present; bidirectional anchor ↔ `sections:` invariant.
- When `status: locked`: count fields equal row counts.
- `BR-NNN` / `AC-NNN` / `INV-NNN` ids monotonic and unique within the file.
- Every `S-BR-001` row has a non-empty `Owner` cell.
- Every `S-AC-001` row has a non-empty `Traces` cell.

## Versioning

Bump `revision:` when adding/renaming anchored sections or changing row shape.
