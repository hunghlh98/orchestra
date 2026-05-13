---
name: brownfield-inventory
description: "Catalogs a brownfield workspace's pre-existing docs, classifies them against the plugin taxonomy, and gates the chain on a user-approved migration plan."
origin: orchestra
---

# brownfield-inventory

Inventory a brownfield workspace before the forward chain runs. Scan the doc tree, classify each entry against the plugin's artifact taxonomy, ask the user how to migrate, emit `<context_path>/.orchestra/inventory.md` (workspace-global singleton). Chain agents read `inventory.md` at start-of-run to know what legacy material to consult and what to author from scratch.

This skill is scoped to **workspace classification only** — it records what legacy material exists, what bucket each entry lands in, and what the user wants done with it. Per-service shape (invariants, frozen contract surface, owned schema, sub-capability index) is downstream `@architect` work captured in the per-service CSD (`<context_path>/docs/<service_name>/<service_name>-CSD.md`). Per-service feature lists are downstream `@lead` work captured in the per-service run-plan (`<context_path>/.orchestra/<service_name>/run-plan.md`) `S-FEATURES-001`. This skill no longer authors those rows.

## When to use

- Bootstrap detects `system.yaml.workspace_kind` ∈ `multi-repo | multi-service` AND the workspace has pre-existing doc-bearing directories under `context_path`.
- `/orchestra` invoked on a single-repo brownfield project with root-level `*.md` / `*.puml` / `adr/`-style directories.
- `@lead` is about to author PRD/FRS/TDD for a feature but the workspace already has `HighLevelDesign.md`, `architecture/`, `adr/`, or similar legacy material that should seed authoring rather than be ignored.

Greenfield workspaces hit the empty-workspace short-circuit in Step 1b and exit with a stub `inventory.md`.

## Algorithm

### Step 1 — Adaptive-depth structure scan

Run `tree -L N` on `context_path` with progressive depth:

- L1 — top-level shape.
- L2 — descend if any L1 entry is doc-bearing (contains `.md` / `.puml` / `.yaml`).
- L3 — descend if multi-service markers present (`services/`, `packages/`, multiple `pom.xml` / `build.gradle` / `package.json` / `go.mod` files at depth ≥ 2).
- L4–L5 — only when L3 is still ambiguous.

Hard cap at L5. Exclude `.git`, `node_modules`, `target`, `build`, `dist`, `.idea`, `.venv`, plus any path outside `local.yaml.source_lock.read_paths`.

Capture the tree output as the body of `S-SCAN-001` in the emitted `inventory.md`. Record `scan.depth: <N>` and `scan.entries_scanned: <count of doc-bearing entries>` in frontmatter.

### Step 1b — Empty-workspace short-circuit

After the scan, count doc-bearing entries (dirs containing `.md` / `.puml` / `.yaml`) and check for SAD-equivalent files at L1–L3 (filename matches `HighLevelDesign*.md`, `architecture*.md`, `SAD*.md`, `system-design*.md`).

If both counts are zero, emit an `inventory.md` stub with `empty_workspace: true`, all `classification.*` and `decisions.*` counts at zero, the body anchors present but tables empty. Skip Steps 2–4. The chain proceeds as if greenfield.

### Step 2 — Classify each entry

Every doc-bearing path from Step 1 lands in exactly one bucket. Heuristics run in order; first match wins.

| Order | Signal | Bucket | Notes |
|---|---|---|---|
| 1 | Two files share a base name with a suffix variation (e.g. `HighLevelDesign.md` + `HighLevelDesign-WebShop.md`; `ContainerDiagram.puml` + `ContainerDiagram-WebShop.puml`) | `redundant` | Larger or more-recently-modified file wins canonical; smaller queued for archive |
| 2 | Filename or directory name contains `archive`, `old-`, `deprecated`, `legacy`, OR matches dated prefix `YYYY-MM-DD-` / `YYYYMMDD-` | `stale` | Skip content sniff; user confirms archive in Step 3 |
| 3 | Filename matches `HighLevelDesign*.md`, `architecture*.md`, `SAD*.md`, `system-design*.md`, OR `.md` first 30 lines contain ≥ 2 of: `# Architecture`, `# Container`, `# Component`, `## Context`, `## Containers`, `## Components` | `plugin-equivalent` → SAD | Filename + content agree → HIGH; filename only → LOW; content overrides filename → emit warning row |
| 4 | Directory in `{ adr/, decisions/, arch/decisions/, architecture-decisions/ }`, OR `.md` first 20 lines match ADR template signature (≥ 3 of: `## Status`, `## Context`, `## Decision`, `## Consequences`, numbered `ADR-NNN`) | `plugin-equivalent` → ADR | Classify per-file inside the directory |
| 5 | File extension in `{ .puml, .plantuml, .mmd, .drawio }` AND located outside `docs/diagrams/` | `plugin-equivalent` → diagram | Diagram filename allowlist applies on migration: only `c4-context.puml` / `c4-container.puml` / `c4-component[-<service>].puml` / `c4-code[-<service>].puml` are first-class without an explicit flag |
| 6 | Directory at workspace root, doc-bearing, no rule above matched | `out-of-taxonomy` | User picks the target plugin artifact in Step 3 |

Confidence tier per row (for `S-CLASSIFICATION-001`):
- `HIGH` — filename and content signals agree.
- `LOW` — filename-only match (no content sniff or content disagrees).
- `—` — content sniff overrode a non-matching filename; emit a warning row in `S-WARNINGS-001`.

### Step 3 — Elicit decisions, bucket-at-a-time

Present the classification table to the user, then ask one bucket at a time. Skip any bucket with zero entries.

Use a single `AskUserQuestion` per bucket with the per-bucket action set:

| Bucket | Per-entry actions |
|---|---|
| `plugin-equivalent` | `migrate-as-regen-seed` (chain reads as input) / `keep-as-legacy-reference` / `discard` |
| `out-of-taxonomy` | `fold-into-CSD` / `fold-into-PRD` / `fold-into-FRS` / `fold-into-TDD` / `fold-into-ADR` / `keep-as-legacy-reference` / `archive` |
| `redundant` | `keep-canonical` (one per group; others auto-archive) |
| `stale` | `archive` (confirm) / `discard` (only when user is certain) |

Action routing guide for `out-of-taxonomy` entries (apply when prompting; the user always has the final say):

- `fold-into-CSD` — material describing **cross-feature service-wide concerns**: money-flow rules, state-machine guards, idempotency policies, schema-ownership tables, error namespaces. These end up in CSD `S-INVARIANTS-001` / `S-OWNED-001` / `S-BR-001`. HTTP/Kafka contract surface is NOT folded into CSD — each feature's `<feature-id>-openapi.yaml` / `<feature-id>-clientapi.yaml` / `<feature-id>-asyncapi.yaml` owns the contract shape, with `x-orchestra-stability` per operation marking the service-grain commitment. Inventory rows describing legacy Kafka topic surface stay `keep-as-legacy-reference` until the first feature touching each topic captures it in its asyncapi.yaml.
- `fold-into-PRD` — material describing **one feature's problem statement, persona, or acceptance criteria**. Per-feature scope only.
- `fold-into-FRS` — material describing **one feature's use cases or functional contracts**. Per-feature scope only.
- `fold-into-TDD` — material describing **one feature's component layout, sequence flows, or physical schema**.
- `fold-into-ADR` — material describing **a single decision with a multi-option fingerprint** (chosen DB, chosen framework, chosen auth model).

Record per-entry decision into `S-DECISIONS-001` with row shape `| Path | Bucket | Action | Target |`. Target is the destination path for `migrate-as-regen-seed` / `fold-into-*` (e.g. `docs/<service_name>/<feature-id>/<feature-id>-PRD.md`), the legacy archive path for `archive` (`<context_path>/.orchestra/legacy/<path>`), or empty for `discard` / `keep-as-legacy-reference`.

### Step 4 — Emit `inventory.md`

Write the inventory file. Placement:

- `<context_path>/.orchestra/inventory.md` — workspace-global singleton, regardless of how many services are partitioned under `<context_path>/.orchestra/<service_name>/`.

Frontmatter and body shape are normative — see `schemas/inventory.schema.md`. Required body anchors in order:

- `S-SCAN-001` — the depth-limited tree from Step 1.
- `S-CLASSIFICATION-001` — `| Path | Bucket | Confidence | Detected as |`.
- `S-DECISIONS-001` — `| Path | Bucket | Action | Target |`.
- `S-WARNINGS-001` — `| Path | Warning |`. One row per content-sniff override or low-confidence classification the user should review before approving.

Feature-slug discipline is enforced downstream where it applies — `@lead` mints `run-plan.md` `S-FEATURES-001` rows with domain noun-phrase slugs (`order-placement`, `payment-binding`, `cart-checkout`, `refund-issuance`); verb-prefixed slugs (`regen-*`, `refactor-*`, `redoc-*`, `fix-*`, `port-*`) name a meta-action on the codebase, not a feature of it, and `@lead` rejects them at run-plan-authoring time. The inventory skill no longer authors that table.

Frontmatter counts MUST balance:

- `Σ classification.* == Σ decisions.* == scan.entries_scanned` when `empty_workspace: false`.
- `empty_workspace: true` ⇒ all `classification.*` and `decisions.*` counts zero; body tables may be empty.

Set frontmatter `user_gate: pending` and `status: draft` at emission. Block the chain until the user reviews the file and either:

- accepts → flip `user_gate: accepted` and `status: locked`. `pending_count` in `decisions` must reach zero before locking.
- requests edits → re-enter Step 3 for affected rows; remain at `status: draft`, `user_gate: pending`.

## Migration semantics

Migration is content extraction, not linking. When `S-DECISIONS-001` marks an entry `migrate-as-regen-seed` or `fold-into-*`, the responsible authoring agent reads the source, re-authors the relevant material into the target plugin artifact (CSD anchor, PRD body, FRS table, TDD prose, ADR ratification section), and the source is archived or deleted.

Authoring-agent routing by action:

| Action | Authoring agent | Target anchor |
|---|---|---|
| `migrate-as-regen-seed` (SAD-equivalent → system-level SAD) | `@architect` | `<context_path>/docs/SAD.md` `S-CONTAINERS-001` / `S-VISION-001` / `S-CONTEXT-001` |
| `migrate-as-regen-seed` (ADR dir) | `@architect` | `<context_path>/docs/adr/ADR-NNNN-<slug>.md` |
| `migrate-as-regen-seed` (allowlisted diagram) | `@architect` (L1/L2) or `@lead` (L3/L4) | `<context_path>/docs/<service_name>/diagrams/` or `<context_path>/docs/diagrams/` per tier |
| `fold-into-CSD` | `@architect` | `<context_path>/docs/<service_name>/<service_name>-CSD.md` `S-OWNED-001` / `S-BR-001` / `S-INVARIANTS-001` |
| `fold-into-PRD` | `@product` | per-feature PRD `S-PROBLEM-001` / `S-SCOPE-001` |
| `fold-into-FRS` | `@product` | per-feature FRS `S-USECASES-001` / `S-AC-001` |
| `fold-into-TDD` | `@lead` | per-feature TDD body |
| `fold-into-ADR` | `@architect` | `<context_path>/docs/adr/ADR-NNNN-<slug>.md` |

Plugin artifacts MUST NOT contain backreferences like `[see HighLevelDesign.md](../HighLevelDesign.md)`. The legacy file has no continuing role once migrated. Legacy path references are permitted only inside `inventory.md` itself (which is the discovery record) and in migration commit messages — nowhere else.

Legacy archive location: files marked `archive` move to `<context_path>/.orchestra/legacy/<original-path>`. Plugin-touched paths stay under `.orchestra/` or `docs/`.

## Output shape

```yaml
---
id: inventory
type: INVENTORY
created: 2026-05-12T14:30:00Z
revision: 1
status: draft
scan:
  root: /workspace/new-docs
  depth: 3
  excludes: [".git", "node_modules", "target", "build", "dist", ".idea", ".venv"]
  entries_scanned: 21
empty_workspace: false
classification:
  plugin_equivalent: 6
  out_of_taxonomy: 5
  redundant: 2
  stale: 1
decisions:
  migrate_count: 4
  keep_legacy_count: 2
  archive_count: 3
  discard_count: 0
  pending_count: 5
user_gate: pending
---
```

After user review: `status: draft → locked`, `user_gate: pending → accepted`, `decisions.pending_count → 0`.

## Worked example — multi-service pilot mirror

`context_path` is `new-docs/` with 21 doc-bearing entries at L1 including `HighLevelDesign.md` (66 KB), `HighLevelDesign-WebShop.md` (216 KB), `adr/`, `archive/`, `money-flow/`, `state-machine/`, `mock-services/`, `schedules/`, `events/`, root-level `ContainerDiagram.puml`, `ContainerDiagram-WebShop.puml`. Scope path is `new-docs/project-poc/services/order/`.

Classification pass:

- Rule 1: `HighLevelDesign.md` + `HighLevelDesign-WebShop.md` share base — both `redundant`; the 216 KB `-WebShop` file wins canonical.
- Rule 1: `ContainerDiagram.puml` + `ContainerDiagram-WebShop.puml` — same — `redundant`; `-WebShop` canonical.
- Rule 2: `archive/` → `stale`.
- Rule 4: `adr/` → `plugin-equivalent` → ADR.
- Rule 5: surviving canonical `*.puml` files → `plugin-equivalent` → diagram (subject to filename allowlist).
- Rule 6: `money-flow/`, `state-machine/`, `mock-services/`, `schedules/`, `events/` → `out-of-taxonomy`.

Step 3 prompts (all four buckets non-empty, so four `AskUserQuestion` calls):

- `redundant`: user keeps `-WebShop` variants canonical.
- `stale`: user archives `archive/`.
- `plugin-equivalent`: ADR dir migrates as ADR seed; canonical SAD candidate migrates as regen seed; canonical container diagram migrates under the allowlist.
- `out-of-taxonomy`: `money-flow/` → `fold-into-CSD` (cross-feature money invariants → `order-CSD.md` `S-INVARIANTS-001`); `state-machine/` → `fold-into-CSD` (state-machine guards → `S-INVARIANTS-001`); `events/` → `keep-as-legacy-reference` (legacy Kafka topic docs; first feature touching each topic captures the contract in its asyncapi.yaml with `x-orchestra-stability`); `mock-services/` → `keep-as-legacy-reference`; `schedules/` → `archive`.

Once `inventory.md` is `user_gate: accepted`, downstream agents take over: `@architect` reads inventory + walks `<context_path>/services/order/src/main/**` to author `<context_path>/docs/order/order-CSD.md` (folding the `money-flow/`, `state-machine/` content into `S-INVARIANTS-001`); `@lead` reads inventory + CSD to mint `<context_path>/.orchestra/order/run-plan.md` `S-FEATURES-001` rows (one row per domain noun-phrase feature, e.g., `order-validation`, `order-pricing`, `order-fulfillment`). The `events/` legacy Kafka docs stay `keep-as-legacy-reference` until the first feature publishing/consuming each topic authors its `<feature-id>-asyncapi.yaml`.
