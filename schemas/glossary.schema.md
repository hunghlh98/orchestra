---
id: GLOSSARY-SCHEMA
title: orchestra Workspace-Grain Glossary schema
created: 2026-05-28
status: draft
revision: 1
scope: shape of `<context_path>/docs/glossary.md` (workspace singleton).
---

# orchestra glossary.md schema

Workspace-grain singleton holding ubiquitous-language terms — domain nouns used by ≥2 service artifacts. Anchors shared terminology across services so the same entity (`OrderLine` vs `order_line` vs `LineItemDTO`) resolves to one definition. Authored opportunistically: a row exists when a domain noun appears in artifacts of ≥2 services OR when a single-service term is consumed by cross-service chain artifacts (workspace SAD, business-invariants, cross-features.yaml members).

## Placement

```
<context_path>/docs/glossary.md
```

Workspace singleton. Authored by `@architect` (same workspace-tier ownership pattern as `SAD.md` and `business-invariants.md`). Updated in place when subsequent features introduce shared domain nouns. Single-writer.

**Authored whenever ≥2 services exist in the workspace**, regardless of `workspace_kind` (`single-repo` monorepo hosting N services OR `multi-repo` polyrepo). A workspace with exactly one service MAY omit the file. Absence of the file is permitted; presence is enforced as workspace-singleton.

## Frontmatter

```yaml
---
id: glossary
type: GLOSSARY
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
term_count: <integer ≥ 0>
sections:
  S-GLOSSARY-001:
    writer: "@architect"
    status: pending | in_progress | locked
---
```

## Body grammar

Required anchors:

| Anchor | H2 heading | Row shape | Purpose |
|---|---|---|---|
| `S-GLOSSARY-001` | `## Glossary` | `\| Term \| Definition \| Services \|` | Ubiquitous-language entry. `Term` is the canonical name in the form artifacts use (typically PascalCase domain noun, e.g., `OrderLine`). `Definition` is one sentence in plain prose; no fenced code, no codebase-specific identifiers. `Services` is a comma-separated list of `service_name` values whose artifacts reference the term. |

Anchor regex aligns with `schemas/pipeline-artifact.schema.md` `body-grammar`. Bidirectional invariant enforced.

## Citation discipline

Chain artifacts that introduce a domain noun matching a glossary `Term` MUST trace the cite in the row that introduces it. Two binding sites:

- Per-service `<service_name>-BR-AC.md` `S-BR-001` / `S-AC-001` / `S-INVARIANTS-001` rows whose body text introduces a glossary term carry `Traces: glossary.md/S-GLOSSARY-001/<Term>` in the row's `Traces` cell (alongside existing `business-invariants.md/INV-NNN` cites).
- Per-feature `<feature-id>-PRD.md` / `<feature-id>-FRS.md` body prose referencing a glossary term cites it inline in plain text (`per glossary.md/S-GLOSSARY-001/OrderLine, …`).

Cites are mandatory when the term resolves to a glossary row; absent when the noun is single-service and never reaches the glossary. `@reviewer` raises `untraced-term` for chain artifacts that introduce a noun present in `S-GLOSSARY-001` without the cite.

## Relationship to other workspace artifacts

| Artifact | Relationship |
|---|---|
| `business-invariants.md` | Invariants in `S-INVARIANTS-001` MAY cite glossary terms in `Invariant` / `Rationale` cells. Glossary defines vocabulary; invariants assert rules over that vocabulary. |
| `SAD.md` | Container + component descriptions MAY reference glossary terms in prose. No new vocabulary; the container narrative reuses the glossary's canonical nouns. |
| `cross-features.yaml` | `members[].feature_id` slugs SHOULD reuse glossary nouns where applicable (e.g., `order-001-checkout` vs `order-001-line-item` ↔ `OrderLine`). Not enforced; soft consistency. |
| Per-service `<service_name>-BR-AC.md` | Owns its own `S-BR-001` / `S-AC-001` / `S-INVARIANTS-001` rows. Citation via `Traces:` cell described above. |

## Authoring lifecycle

Single-writer `@architect`. Lifecycle motions:

- **code-to-spec (reverse)** — `@architect` derives glossary rows from per-service BR-AC + per-feature PRD/FRS authored earlier in the reverse pass. Rows added for any noun appearing across ≥2 services OR consumed by cross-service chain artifacts.
- **spec-to-code (forward)** — `@architect` extends the glossary when authoring SAD / `business-invariants.md` / cross-features / per-service BR-AC encounters a domain noun not yet listed. Append-only within a session; row removal requires `status: draft` re-author cycle.

Per-artifact inspect+classify rule applies on reverse pass; `reverse_authoring_mode` logged.

## Writing style

- One canonical noun per row.
- `Definition` is one sentence, ≤ 200 chars, plain prose. No fenced code, no codebase-specific identifiers.
- Use the term itself as the row's identity — no `GL-NNN` ordinal. Cites bind by exact term match.
- `Services` lists `service_name` values in lexicographic order.

**Link discipline.** Same sealed + portable rules as all other `docs/*` artifacts.

## Validation

`scripts/validate.js` exposes `validateGlossaryContent(relPath, raw)`:

- `S-GLOSSARY-001` present; bidirectional anchor ↔ `sections:` invariant.
- When `status: locked`: `term_count` equals row count.
- `Term` values unique (case-sensitive).
- Every row has a non-empty `Services` cell with ≥1 service name.

## Versioning

Bump `revision:` on row-shape change.
