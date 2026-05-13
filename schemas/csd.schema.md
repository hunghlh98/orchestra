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
contract_surface_count: <integer ≥ 0>
invariant_count: <integer ≥ 0>
sub_capability_count: <integer ≥ 0>
sections:
  S-OWNED-001:
    writer: "@architect"
    status: pending | in_progress | locked
  S-CONTRACT-001:
    writer: "@architect"
    status: pending | in_progress | locked
  S-INVARIANTS-001:
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
- Count fields (`owned_table_count`, `contract_surface_count`, `invariant_count`, `sub_capability_count`) — populated when `status: locked`; equal the row counts of the four anchored tables. `validate.js` cross-checks at lock time.
- `verdict:` is **omitted** — CSD is a structural reference doc (same family as SAD), not an evaluated artifact. Per `schemas/pipeline-artifact.schema.md` `verdict:` section, only TSR / ADR / RELEASE carry `verdict:`.

Frontmatter grammar follows the frozen contract in `schemas/pipeline-artifact.schema.md` — block-style only, `@`-prefixed agent handles JSON-quoted.

## Body grammar

Required anchors, in order:

| Anchor | H2 heading | Row shape | Purpose |
|---|---|---|---|
| `S-OWNED-001` | `## Owned data` | `\| Table / topic \| Owned columns / keys \| Notes \|` | Schema + tables + Kafka topics + error namespaces this service owns. Lifted from source walk (entity classes, repository interfaces, topic constants). |
| `S-CONTRACT-001` | `## Frozen contract surface` | `\| Path / topic \| Method / direction \| Stability \| Notes \|` | Public HTTP routes + Kafka producer/consumer surface. `Stability ∈ frozen \| evolving \| internal`. Absorbs what inventory previously called `S-CONTRACT-FREEZE-001`. |
| `S-INVARIANTS-001` | `## Cross-feature invariants` | `\| ID \| Invariant \| Rationale \|` | Service-wide invariants every feature must honor (idempotency keys, ordering guarantees, currency precision, identity rotation rules). `ID` format `INV-NNN` zero-padded per CSD. Absorbs what inventory previously called `S-INVARIANTS-001`. |
| `S-SUB-CAPABILITIES-001` | `## Sub-capability index` | `\| Feature slug \| Path \| Status \|` | Index pointing to `<context_path>/docs/<service_name>/<feature-id>/` folders authored under this service. `Status ∈ planned \| in-progress \| shipped`. Append-only as features land. |

Anchor regex aligns with `schemas/pipeline-artifact.schema.md` `body-grammar` — `/^##\s+.*<a id="(S-[A-Z]+(?:-[A-Z]+)*-\d{3})"><\/a>/`. Bidirectional invariant: every `sections:` key has a matching `<a id>`; every `<a id>` has a matching `sections:` key.

## Authoring lifecycle

CSD is authored under brownfield reverse-doc by walking the elected service's source tree:

1. Walk `source_walk_root` for entity classes / `@Entity` / `@Table` / Liquibase migrations / Flyway scripts → populate `S-OWNED-001`.
2. Walk for `@RestController` / `@RequestMapping` / `@KafkaListener` / `@KafkaTemplate` / topic constants → populate `S-CONTRACT-001`.
3. Read existing inventory `S-DECISIONS-001` `migrate-as-regen-seed` rows whose source files describe service-wide rules (idempotency middleware, currency utilities, state-machine guards) → populate `S-INVARIANTS-001`. Cross-reference inventory targets with the source walk to deduplicate.
4. List `<context_path>/docs/<service_name>/<feature-id>/` directories that already exist OR are planned in `run-plan.md` `S-FEATURES-001` → populate `S-SUB-CAPABILITIES-001`.
5. Set count frontmatter fields, flip `status: locked`. Hand back to `@lead` for run-plan-driven feature authoring.

CSD is **non-iterative within a run** — author once at `phase: discovery`, lock, then read-only for all downstream agents in the same run. Mutation only on subsequent runs when service shape moves (new owned table, contract evolution, new invariant ratified via ADR).

## Writing style

CSD prose follows the same four hard rules as SAD (`agents/architect.md` "Writing style"):

- Assertions, not descriptions.
- No section preambles.
- No hedging — uncertainty belongs in an ADR, not in CSD.
- No restatements — `S-CONTRACT-001` does not re-narrate `S-OWNED-001`.

Per-feature concerns belong in the feature's PRD/FRS/TDD, not in CSD. If a row is true only for one feature, it does NOT belong in `S-INVARIANTS-001` — invariants are by definition cross-feature.

## Validation

`scripts/validate.js` exposes `validateCSDContent(relPath, raw)` (when implemented). Checks:

- Filename matches `<service_name>-CSD.md` and `frontmatter.service_name` equals the basename derivation.
- `scope_level ∈ {container, service}` (rejects `capability`).
- All four required anchors present; bidirectional anchor ↔ `sections:` invariant.
- When `status: locked`: `owned_table_count` / `contract_surface_count` / `invariant_count` / `sub_capability_count` equal the corresponding table row counts.
- `S-INVARIANTS-001` `INV-NNN` ids monotonic and unique within the CSD.

## Relationship to other artifacts

- **Inventory** (`<context_path>/.orchestra/inventory.md`) — workspace classification only. Inventory's `S-DECISIONS-001` rows marked `migrate-as-regen-seed` feed CSD authoring; once CSD locks, the inventory rows are read-only history.
- **SAD** (`<context_path>/docs/SAD.md`) — system-level only in v4.2. Service-level SAD is gone; CSD replaces it. SAD `S-CONTAINERS-001` references CSD presence (`| <service_name> | <tech-label> | CSD: docs/<service_name>/<service_name>-CSD.md |`).
- **Feature PRD** (`<context_path>/docs/<service_name>/<feature-id>/<feature-id>-PRD.md`) — under `scope_level ∈ {container, service}`, PRD cites CSD by anchor ("see CSD `S-INVARIANTS-001`") instead of re-narrating service-wide rules. This is the keystone of Track C's PRD compaction.
- **ADR** (`<context_path>/docs/adr/ADR-NNNN-<slug>.md`) — global flat numbering preserved. ADRs touching service shape append a row to the matching CSD's `S-INVARIANTS-001` if the decision creates a cross-feature invariant; otherwise CSD untouched.

## Versioning

Bump `revision:` when adding/renaming anchored sections or changing the row shape of any required table. Additive frontmatter fields (new optional count) do not bump revision.
