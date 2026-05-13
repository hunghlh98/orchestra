# Routing Taxonomy (consumer-surface schema)

> Normative consumer-surface document mapping `intent.yaml.intent` to authorized agents and the artifact whitelist for each intent. The dispatcher's spawn prompts (per `commands/orchestra.md`) reference this file by intent anchor (`#feature`, `#hotfix`, etc.); agents Read the relevant section on demand to verify their authorized outputs. Each spawn prompt also carries a 1-line backstop summary inline so agents do not need to Read this file for the common path.

## How agents use this file

- **Spawn prompt mandate**: every `Agent({ subagent_type, prompt })` call from the dispatcher embeds `Routed intent: <intent>. Authorized artifacts: see schemas/routing-taxonomy.md#<intent>` plus a 1-line summary. Agents may Read this file when the inline summary is insufficient (e.g., an artifact name they're uncertain about).
- **Out-of-whitelist enforcement**: if an agent infers an artifact is required that's NOT in its routed-intent whitelist, write `<context_path>/.orchestra/<service_name>/pipeline/<feature-id>/<feature-id>-ESCALATE-<slug>.md` with `reason: "<role> spawned outside routing whitelist for intent=<intent>"` and end your turn. Do NOT no-op silently.
- **ADR sub-flow**: `feature` and `refactor` intents may open an ADR mid-flow when a non-obvious system-affecting decision surfaces. `@architect` is sole author (under `chain_rigor=Full`); `@reviewer` reviews. 3-round circuit breaker → `<feature-id>-ESCALATE-ADR-<NNNN>.md`. ADRs are referenced from PRD/FRS/TDD/openapi bodies by ID (`ADR-<NNNN>-<slug>`) in plain prose, not by section anchor.

Paths use v4.0 layout: per-feature prose in `docs/<feature-id>/`, ADRs flat in `docs/adr/`, agent-internal coordination in `<context_path>/.orchestra/<service_name>/pipeline/<feature-id>/`. Filenames are `<feature-id>-<TYPE>.<ext>` (e.g., `001-todo-api-PRD.md`).

---

## feature {#feature}

**Agents (in order):** `@product` → `@architect` (Full only) → `@lead` → `@backend` / `@frontend` / `@test` Stage-1 (parallel) → `@test` Stage-2 → `@evaluator` → `@reviewer` → `/orchestra ship`

**Artifact whitelist (full set):**

- `docs/<feature-id>/<feature-id>-PRD.md`
- `docs/<feature-id>/<feature-id>-FRS.md`
- `docs/SAD.md` (project singleton; updated in place)
- `docs/adr/ADR-<NNNN>-<slug>.md` (conditional, per ADR sub-flow)
- `docs/<feature-id>/<feature-id>-TDD.md`
- `docs/<feature-id>/<feature-id>-openapi.yaml` (or `<feature-id>-asyncapi.yaml`; CONTRACT narrative folds inline)
- `<context_path>/.orchestra/<service_name>/pipeline/<feature-id>/<feature-id>-TASKS.md`
- impl source (project's normal layout under `<context_path>/services/<service_name>/src/`)
- `docs/<feature-id>/<feature-id>-TSR.md` (multi-writer: `S-TEST-001` by `@test` Stage-1+Stage-2, `S-EVAL-001` by `@evaluator`, `S-REVIEW-001` by `@reviewer` (with ADR-review subsection when ADRs touched), `S-DIVERGENCES-001` by `@architect` (brownfield only); ship verdict in frontmatter `ship:` set by `/orchestra ship`)
- `docs/releases/RELEASE-vX.Y.Z.md` (singleton; absorbs ANNOUNCEMENT into `S-ANNOUNCEMENT-001`)
- `docs/runbooks/RUNBOOK-vX.Y.Z.md` (singleton; conditional)

This is the only intent that produces the full SDLC artifact set.

## hotfix {#hotfix}

**Agents (in order):** `@lead` → `@backend` / `@frontend` → `@test` Stage-2 → `@evaluator` → `/orchestra ship`

**Artifact whitelist:**

- `docs/<feature-id>/<feature-id>-TDD.md`
- `<context_path>/.orchestra/<service_name>/pipeline/<feature-id>/<feature-id>-TASKS.md`
- impl-fix
- `docs/<feature-id>/<feature-id>-TSR.md` (no review half required — `S-REVIEW-001` stays `pending`)
- `docs/releases/RELEASE-vX.Y.Z.md`

**Excluded:** PRD, FRS, openapi (unchanged from broken release), SAD, ADR. Hotfixes skip Planning + Analysis (the bug is the spec). `@reviewer` is NOT spawned (review folds into the implementer's diff for speed). `@test` Stage-1 is skipped because spec is unchanged; Stage-2 still runs the suite.

## template {#template}

**Agents (in order):** `@product` (intent triage only) → `@lead` → `@backend` / `@frontend` → `@test` Stage-1 + Stage-2 → `@evaluator` → `@reviewer`

**Artifact whitelist:**

- `<context_path>/.orchestra/<service_name>/pipeline/<feature-id>/intent.yaml` (routing decision; `@product` triages but writes no PRD)
- `docs/<feature-id>/<feature-id>-TDD.md`
- `<context_path>/.orchestra/<service_name>/pipeline/<feature-id>/<feature-id>-TASKS.md`
- impl source
- `docs/<feature-id>/<feature-id>-TSR.md`

**Excluded:** PRD, FRS, openapi, SAD, ADR. Templates are infrastructure scaffolding; they don't define new contracts. `@product` is spawned for upstream classification only and writes the routing `intent.yaml`, no narrative.

## refactor {#refactor}

**Agents (in order):** `@reviewer` (pre-impl assessment) → `@lead` (TDD update) → `@backend` / `@frontend` → `@test` Stage-2 → `@evaluator`

**Artifact whitelist:**

- `docs/<feature-id>/<feature-id>-TSR.md` (pre-impl assessment in `S-REVIEW-001`; post-impl `S-EVAL-001` by `@evaluator`)
- `docs/<feature-id>/<feature-id>-TDD.md` (update — not net-new)
- `<context_path>/.orchestra/<service_name>/pipeline/<feature-id>/<feature-id>-TASKS.md`
- impl
- `docs/adr/ADR-<NNNN>-<slug>.md` (conditional — refactors often hit forks)

**Excluded:** PRD, FRS, openapi, new SAD. Refactors preserve external behavior; openapi is unchanged by definition. SAD updates are limited to component touches (append components, append `S-ADR-INDEX-001` rows), not new architecture.

## docs {#docs}

**Agents (in order):** `@product` (intent triage only) → `/orchestra ship` → `@reviewer`

**Artifact whitelist:**

- `<context_path>/.orchestra/<service_name>/pipeline/<feature-id>/intent.yaml`
- The doc files themselves (whatever the user asked for — README updates, ADR additions outside a feature, rule docs, etc.)
- `docs/<feature-id>/<feature-id>-TSR.md` (review half only — `S-EVAL-001` stays `pending`)

**Excluded:** PRD, FRS, TDD, openapi, TASKS, RELEASE. `@product` triages without authoring narrative. `@lead` MUST refuse this route — if spawned, write `<feature-id>-ESCALATE-<slug>.md` and end the turn.

## review-only {#review-only}

**Agents:** `@reviewer` (assess only — no downstream)

**Artifact whitelist:**

- `docs/<feature-id>/<feature-id>-TSR.md` (review half only — `S-EVAL-001` stays `pending` indefinitely)

**Excluded:** PRD, FRS, TDD, openapi, TASKS, RELEASE. The user wants a review of existing work, not new work. `@lead` MUST refuse this route.

---

## Versioning

This schema's content matches the routing rules embedded in `commands/orchestra.md` (intent → agents quick-reference). When either side changes, both must update. The dispatcher is canonical for spawn order; this file is canonical for artifact whitelists. v4.0 revision: 3 (was 2 in v2.0; v3 was a rev-only bump).
