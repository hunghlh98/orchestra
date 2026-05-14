---
id: CSD-SCHEMA
title: orchestra Container Specification Document (CSD) frontmatter schema
created: 2026-05-13
status: draft
revision: 1
scope: shape of `<context_path>/docs/<service_name>/<service_name>-CSD.md` (per-service singleton).
---

# orchestra Container Specification Document (CSD) schema

The CSD is the per-service shape singleton. It pins down what one service owns, what surface it exposes, and what invariants every feature inside it must honor. Authored once per service by `@architect` during `phase: discovery` under `mode: brownfield` AND `scope_level ∈ {container, service}`. Feature PRDs cite CSD by anchor instead of re-narrating service-wide constraints — see `agents/product.md` for the cite pattern.

In the C4 mental model: system-level SAD covers C1+C2 (project-wide containers); CSD covers what lives *inside* one of those containers. Per-feature TDDs then cover C3 components within the CSD's container.

## Placement

```
<context_path>/docs/<service_name>/<service_name>-CSD.md
```

Singleton per service — one CSD per `<service_name>` value in `<context_path>/.orchestra/<service_name>/local.yaml`. Filename MUST equal `<service_name>-CSD.md`; the bracketed `<service_name>` token is replaced with the elected service-directory basename (e.g., `order-CSD.md`, `payment-engine-CSD.md`).

CSD is NOT authored under `mode: greenfield` — greenfield runs derive service shape forward from PRD/FRS/TDD/SAD, no pre-existing source to inventory.

CSD is NOT authored under `scope_level: capability` — capability-grain runs target a named surface inside an already-documented service; the CSD authored under a prior service-grain run is the canonical reference, not re-authored.

## Frontmatter

```yaml
---
id: <service_name>-CSD
type: CSD
created: <ISO-8601>
revision: <integer ≥ 1>
status: draft | locked
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
scope_level: container | service
source_walk_root: <path>
owned_table_count: <integer ≥ 0>
invariant_count: <integer ≥ 0>
sub_capability_count: <integer ≥ 0>
br_count: <integer ≥ 0>
ac_count: <integer ≥ 0>
sections:
  S-OWNED-001:
    writer: "@architect"
    status: pending | in_progress | locked
  S-BR-001:
    writer: "@architect"
    status: pending | in_progress | locked
  S-INVARIANTS-001:
    writer: "@architect"
    status: pending | in_progress | locked
  S-AC-001:
    writer: "@architect"
    status: pending | in_progress | locked
  S-ADR-INDEX-001:
    writer: "@architect"
    status: pending | in_progress | locked
  S-SUB-CAPABILITIES-001:
    writer: "@architect"
    status: pending | in_progress | locked
---
```

Field notes:

- `service_name` — MUST equal the basename of the parent directory and the `service_name` value in the corresponding `<context_path>/.orchestra/<service_name>/local.yaml`. Drift between filename, frontmatter, and `local.yaml` is a structural failure flagged by `validate.js`.
- `scope_level` — MUST match `local.yaml.scope_level`. CSD is never authored at `scope_level: capability` (see Placement above).
- `source_walk_root` — the path `@architect` scanned to populate CSD anchors. Typically `<context_path>/services/<service_name>/src/main/**` for JVM services, or whatever `local.yaml.source_lock.read_paths` resolves to for the elected service. Recorded for provenance — a future reader can re-run the walk and diff.
- Count fields (`owned_table_count`, `br_count`, `invariant_count`, `ac_count`, `sub_capability_count`) — populated when `status: locked`; equal the row counts of the five anchored tables. `validate.js` cross-checks at lock time.
- `verdict:` is **omitted** — CSD is a structural reference doc (same family as SAD), not an evaluated artifact. Per `schemas/pipeline-artifact.schema.md` `verdict:` section, only TSR / ADR / RELEASE carry `verdict:`.

Frontmatter grammar follows the frozen contract in `schemas/pipeline-artifact.schema.md` — block-style only, `@`-prefixed agent handles JSON-quoted.

## Body grammar

Required anchors, in order:

| Anchor | H2 heading | Row shape | Purpose |
|---|---|---|---|
| `S-OWNED-001` | `## Owned data` | `\| Table / topic \| Owned columns / keys \| Notes \|` | Schema + tables + Kafka topics + error namespaces this service owns. Lifted from source walk (entity classes, repository interfaces, topic constants). |
| `S-BR-001` | `## Business rules` | `\| ID \| Rule \| Owner \| Source \|` | Service-scoped business rules — stakeholder-signable policy statements. `ID` format `BR-NNN` zero-padded per CSD. `Owner` MUST be a named human role (`Finance`, `Compliance`, `Platform-Lead`, `Risk-Ops`) — not an agent, not a team alias. `Source` cites the policy of record (`Finance policy 2026-Q2`, `Compliance memo §3.1`, etc.). Feature FRS `S-AC-001` rows trace to a `CSD/BR-NNN`. See "BR vs INV: audience boundary" below. |
| `S-INVARIANTS-001` | `## Cross-feature invariants` | `\| ID \| Invariant \| Rationale \|` | Service-wide implementer-only invariants every feature must honor (idempotency keys, ordering guarantees, currency precision, identity rotation rules). `ID` format `INV-NNN` zero-padded per CSD. |
| `S-AC-001` | `## Service acceptance criteria` | `\| ID \| Assertion \| Verification surface \| Traces \|` | Service-grain acceptance criteria that hold across all features. `ID` format `AC-NNN` zero-padded per CSD. `Verification surface` names the test layer that proves it (`integration-test`, `contract-test`, `monitoring-alert`). `Traces` cites a parent `BR-NNN` (own CSD) or `INV-NNN` (own CSD) or `SAD/BR-NNN` / `SAD/AC-NNN` (system-level). |
| `S-ADR-INDEX-001` | `## Service ADR index` | `\| ADR-id \| slug \| status \| accepted_at \|` | Index of service-scoped ADRs (`scope: service`) accepted for this service. ADR id format `ADR-<service_name>-<NNN>` zero-padded per-service starting at 001. Global ADRs (`scope: global`) live in SAD `S-ADR-INDEX-001`, not here. |
| `S-SUB-CAPABILITIES-001` | `## Sub-capability index` | `\| Feature slug \| Path \| Status \|` | Index pointing to `<context_path>/docs/<service_name>/<feature-id>/` folders authored under this service. `Status ∈ planned \| in-progress \| shipped`. Append-only as features land. |

Anchor regex aligns with `schemas/pipeline-artifact.schema.md` `body-grammar` — `/^##\s+.*<a id="(S-[A-Z]+(?:-[A-Z]+)*-\d{3})"><\/a>/`. Bidirectional invariant: every `sections:` key has a matching `<a id>`; every `<a id>` has a matching `sections:` key.

## BR vs INV: audience boundary

`S-BR-001` (business rules) and `S-INVARIANTS-001` (invariants) both state cross-feature rules; the split is by audience.

- **BR (business rule)** — a stakeholder-signable policy. Stated in business-domain language; a named human role (Finance, Compliance, Platform-Lead, Risk-Ops) owns it and could agree or veto. The `Owner` cell is the test: if no human role exists who could read and sign the row, it isn't a BR — push it to `S-INVARIANTS-001`.
- **INV (invariant)** — an implementer-only consistency rule. Stated in technical / data-shape language; describes what code must hold true (idempotency key derivation, ordering guarantee, currency-precision rule, retry policy). A business owner couldn't sign it because it's a "how", not a "what".

Paired example for an order service:

| Anchor | Row | Why this row goes here |
|---|---|---|
| `S-BR-001` | `\| BR-001 \| Refunds are only allowed within 30 days of order completion \| Finance \| Finance policy 2026-Q2 \|` | Stakeholder-signable policy; Finance owns it. |
| `S-INVARIANTS-001` | `\| INV-001 \| Refund amount precision: stored as DECIMAL(20,4); rounding mode HALF_UP \| Audit consistency \|` | Implementer-only rule; no business stakeholder signs this. |

A row appearing in BOTH anchors is a structural failure — pick one based on the audience test above.

## Authoring lifecycle

CSD is authored under brownfield reverse-doc by walking the elected service's source tree:

1. Walk `source_walk_root` for entity classes / `@Entity` / `@Table` / Liquibase migrations / Flyway scripts → populate `S-OWNED-001`.
2. Read existing inventory `S-DECISIONS-001` `migrate-as-regen-seed` rows whose source files describe service-wide rules. Sort each rule by the audience test: stakeholder-signable policy → `S-BR-001` (require named human Owner per row; an unsigned BR row is a structural failure); implementer-only consistency rule → `S-INVARIANTS-001`. Cross-reference inventory targets with the source walk to deduplicate.
3. Seed `S-AC-001` from service-grain acceptance the source already evidences (e.g., integration-test suites pinned at CI level, contract-test suites, monitoring SLO alerts). Each row MUST cite a parent `BR-NNN` / `INV-NNN` in own CSD or `SAD/BR-NNN` / `SAD/AC-NNN` in the system SAD via the `Traces` cell.
4. List `<context_path>/docs/<service_name>/<feature-id>/` directories that already exist OR are planned in `run-plan.md` `S-FEATURES-001` → populate `S-SUB-CAPABILITIES-001`.
5. Set count frontmatter fields, flip `status: locked`. Hand back to `@lead` for run-plan-driven feature authoring.

HTTP routes + Kafka topic surface are NOT captured in CSD — each feature's `<feature-id>-openapi.yaml` (publish) + `<feature-id>-clientapi.yaml` (outbound deps) + `<feature-id>-asyncapi.yaml` (publish + subscribe) is the single source of truth, with `x-orchestra-stability: frozen | evolving | internal` extension per operation/channel marking the service-grain commitment. Reviewers grep across .yaml files for the cross-feature view.

CSD is **non-iterative within a run** — author once at `phase: discovery`, lock, then read-only for all downstream agents in the same run. Mutation only on subsequent runs when service shape moves (new owned table, contract evolution, new invariant ratified via ADR).

## Body grammar: living service-grain state (no feature attribution in body)

The four service-grain anchors `S-OWNED-001`, `S-BR-001`, `S-INVARIANTS-001`, `S-AC-001` describe the service's **current consolidated state** — what it owns, promises, and asserts today. They are NOT a feature-bundled snapshot.

Forbidden in body rows of these five anchors:

- `#<feature-id>` or `(feature 001)` annotations on a row (e.g., `| orders | id, status, ... | #001-order-placement |`).
- "added by feature N" / "introduced by 002-..." prose anywhere in a row's cells.
- A row that's only true under one feature — those belong in the feature's TDD `S-DATA-001` or the feature FRS, not in CSD.

Feature attribution lives **only** in `S-SUB-CAPABILITIES-001`, which is the index of which features the service has shipped or has planned. The other anchors mutate in place across runs.

Subsequent-feature flow:

1. Re-walk source under `local.yaml.source_lock.read_paths` (same heuristics as initial CSD authoring).
2. Diff observed state against current CSD body rows.
3. Update `S-OWNED-001` / `S-BR-001` / `S-INVARIANTS-001` / `S-AC-001` rows **in place** so each anchor reflects the post-feature consolidated state — rows mutate (column edited), append (new row), or remove (no longer observable in source).
4. Append exactly one new row to `S-SUB-CAPABILITIES-001` for the new feature.
5. Bump CSD `revision:` if any of the four service-grain anchors changed shape (row added, removed, or column edited). Append-only mutation to `S-SUB-CAPABILITIES-001` alone does NOT bump `revision:`.

`@reviewer`'s `feature-attribution-in-csd-body` gate rejects any feature-id annotation found outside `S-SUB-CAPABILITIES-001`.

## Writing style

CSD prose follows the same four hard rules as SAD (`agents/architect.md` "Writing style"):

- Assertions, not descriptions.
- No section preambles.
- No hedging — uncertainty belongs in an ADR, not in CSD.
- No restatements — `S-INVARIANTS-001` does not re-narrate `S-OWNED-001`.

Per-feature concerns belong in the feature's PRD/FRS/TDD, not in CSD. If a row is true only for one feature, it does NOT belong in `S-INVARIANTS-001` — invariants are by definition cross-feature.

## Validation

`scripts/validate.js` exposes `validateCSDContent(relPath, raw)` (when implemented). Checks:

- Filename matches `<service_name>-CSD.md` and `frontmatter.service_name` equals the basename derivation.
- `scope_level ∈ {container, service}` (rejects `capability`).
- All six required anchors (`S-OWNED-001`, `S-BR-001`, `S-INVARIANTS-001`, `S-AC-001`, `S-ADR-INDEX-001`, `S-SUB-CAPABILITIES-001`) present; bidirectional anchor ↔ `sections:` invariant.
- When `status: locked`: `owned_table_count` / `br_count` / `invariant_count` / `ac_count` / `sub_capability_count` equal the corresponding table row counts.
- `S-INVARIANTS-001` `INV-NNN` ids, `S-BR-001` `BR-NNN` ids, and `S-AC-001` `AC-NNN` ids each monotonic and unique within the CSD.
- Every `S-BR-001` row has a non-empty `Owner` cell.
- Every `S-AC-001` row has a non-empty `Traces` cell citing `BR-NNN` / `INV-NNN` (own CSD) or `SAD/BR-NNN` / `SAD/AC-NNN`.

## Relationship to other artifacts

- **Inventory** (`<context_path>/.orchestra/inventory.md`) — workspace classification only. Inventory's `S-DECISIONS-001` rows marked `migrate-as-regen-seed` feed CSD authoring; once CSD locks, the inventory rows are read-only history.
- **SAD** (`<context_path>/docs/SAD.md`) — system-level only. SAD `S-CONTAINERS-001` references CSD presence (`| <service_name> | <tech-label> | CSD: docs/<service_name>/<service_name>-CSD.md |`).
- **Feature PRD** (`<context_path>/docs/<service_name>/<feature-id>/<feature-id>-PRD.md`) — under `scope_level ∈ {container, service}`, PRD cites CSD by anchor ("see CSD `S-INVARIANTS-001`") instead of re-narrating service-wide rules. This is the keystone of Track C's PRD compaction.
- **ADR** — two scopes. Global ADRs (`scope: global`, path `<context_path>/docs/adr/ADR-<NNNN>-<slug>.md`, project-wide flat 4-digit numbering) affect ≥2 services and live in SAD `S-ADR-INDEX-001`. Service-scoped ADRs (`scope: service`, path `<context_path>/docs/<service_name>/adr/ADR-<service_name>-<NNN>-<slug>.md`, per-service 3-digit numbering starting at 001) affect exactly one service and live in CSD `S-ADR-INDEX-001`. Either kind, when its decision creates a cross-feature invariant for the elected service, ALSO appends a row to that service's CSD `S-INVARIANTS-001`.

## Versioning

Bump `revision:` when adding/renaming anchored sections or changing the row shape of any required table. Additive frontmatter fields (new optional count) do not bump revision.
