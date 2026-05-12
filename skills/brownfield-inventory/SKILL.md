---
name: brownfield-inventory
description: "Catalogs a brownfield workspace's pre-existing docs, classifies them against the plugin taxonomy, and gates the chain on a user-approved migration plan."
origin: orchestra
---

# brownfield-inventory

Inventory a brownfield workspace before the forward chain runs. Scan the doc tree, classify each entry against the plugin's artifact taxonomy, ask the user how to migrate, emit `<scope_path>/.orchestra/inventory.md`. Chain agents read `inventory.md` at start-of-run to know what legacy material to consult and what to author from scratch.

## When to use

- Bootstrap detects `system.yaml.workspace_kind` ∈ `multi-repo | multi-service` AND the workspace has pre-existing doc-bearing directories at `context_path` or `scope_path`.
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
| 5 | File extension in `{ .puml, .plantuml, .mmd, .drawio }` AND located outside `docs/diagrams/` | `plugin-equivalent` → diagram | Diagram filename allowlist applies on migration: only `c4-l1-context.puml` / `c4-l2-container.puml` / `c4-l3-component.puml` / `c4-l4-code-<slug>.puml` are first-class without an explicit flag |
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
| `out-of-taxonomy` | `fold-into-PRD` / `fold-into-FRS` / `fold-into-TDD` / `fold-into-ADR` / `keep-as-legacy-reference` / `archive` |
| `redundant` | `keep-canonical` (one per group; others auto-archive) |
| `stale` | `archive` (confirm) / `discard` (only when user is certain) |

Record per-entry decision into `S-DECISIONS-001` with row shape `| Path | Bucket | Action | Target |`. Target is the destination path for `migrate-as-regen-seed` / `fold-into-*` (e.g. `docs/<feature-slug>/PRD-NNN-<slug>.md`), the legacy archive path for `archive` (`<scope_path>/.orchestra/legacy/<path>`), or empty for `discard` / `keep-as-legacy-reference`.

### Step 4 — Emit `inventory.md`

Write the inventory file. Placement:

- `<scope_path>/.orchestra/inventory.md` when `scope_path != context_path`.
- `<context_path>/.orchestra/inventory.md` when `scope_path == context_path`.

Frontmatter and body shape are normative — see `schemas/inventory.schema.md`. Required body anchors in order:

- `S-SCAN-001` — the depth-limited tree from Step 1.
- `S-CLASSIFICATION-001` — `| Path | Bucket | Confidence | Detected as |`.
- `S-DECISIONS-001` — `| Path | Bucket | Action | Target |`.
- `S-REGEN-PLAN-001` — `| Feature slug | Legacy seeds | Authoring agents | Notes |`. One row per feature the chain will author; the `Legacy seeds` column lists rows from `S-DECISIONS-001` whose action is `migrate-as-regen-seed` or `fold-into-*`. **Feature-slug discipline:** each `Feature slug` value MUST be a domain noun-phrase identifying a feature *of* the service (e.g., `order-placement`, `payment-binding`, `cart-checkout`, `refund-issuance`). Reject verb-prefixed slugs (`regen-*`, `refactor-*`, `redoc-*`, `fix-*`, `port-*`) — those name a meta-action on the codebase, not a feature of it. Derive candidates from `project-discovery`'s "Major feature" heuristic (controllers / use-case handlers / domain packages under `services/<name>/src/`); when none of those signals are present, ask the user for a domain noun-phrase rather than slugging the user's intent verb.
- `S-WARNINGS-001` — `| Path | Warning |`. One row per content-sniff override or low-confidence classification the user should review before approving.

Frontmatter counts MUST balance:

- `Σ classification.* == Σ decisions.* == scan.entries_scanned` when `empty_workspace: false`.
- `empty_workspace: true` ⇒ all `classification.*` and `decisions.*` counts zero; body tables may be empty.

Set frontmatter `user_gate: pending` and `status: draft` at emission. Block the chain until the user reviews the file and either:

- accepts → flip `user_gate: accepted` and `status: locked`. `pending_count` in `decisions` must reach zero before locking.
- requests edits → re-enter Step 3 for affected rows; remain at `status: draft`, `user_gate: pending`.

## Migration semantics

Migration is content extraction, not linking. When `S-DECISIONS-001` marks an entry `migrate-as-regen-seed` or `fold-into-*`, the responsible authoring agent reads the source, re-authors the relevant material into the target plugin artifact (PRD body, FRS table, TDD prose, ADR ratification section), and the source is archived or deleted.

Plugin artifacts MUST NOT contain backreferences like `[see HighLevelDesign.md](../HighLevelDesign.md)`. The legacy file has no continuing role once migrated. Legacy path references are permitted only inside `inventory.md` itself (which is the discovery record) and in migration commit messages — nowhere else.

Legacy archive location: files marked `archive` move to `<scope_path>/.orchestra/legacy/<original-path>` (or `<context_path>/.orchestra/legacy/` for system-scope legacy). Plugin-touched paths stay under `.orchestra/` or `docs/`.

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
- `out-of-taxonomy`: `money-flow/` → `fold-into-TDD`; `state-machine/` → `fold-into-TDD`; `events/` → `fold-into-FRS`; `mock-services/` → `keep-as-legacy-reference`; `schedules/` → `archive`.

`S-REGEN-PLAN-001` lists one feature per surviving service domain (e.g. order-validation, order-pricing, order-fulfillment). `@lead` reads `inventory.md` at start-of-run and allocates per-feature authoring agents per the regen-plan rows.
