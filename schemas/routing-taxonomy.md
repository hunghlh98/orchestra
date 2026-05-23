# Routing Taxonomy (consumer-surface schema)

> Normative consumer-surface document mapping `intent.yaml.intent` to authorized agents and the artifact whitelist for each intent. The dispatcher's spawn prompts (per `commands/orchestra.md`) reference this file by intent anchor (`#feature`, `#hotfix`, etc.); agents Read the relevant section on demand to verify their authorized outputs. Each spawn prompt also carries a 1-line backstop summary inline so agents do not need to Read this file for the common path.

## How agents use this file

- **Spawn prompt mandate**: every `Agent({ subagent_type, prompt })` call from the dispatcher embeds `Routed intent: <intent>. Authorized artifacts: see schemas/routing-taxonomy.md#<intent>` plus a 1-line summary. Agents may Read this file when the inline summary is insufficient.
- **Out-of-whitelist enforcement**: if an agent infers an artifact is required that's NOT in its routed-intent whitelist, write `<context_path>/.orchestra/<service_name>/pipeline/<feature-id>/<feature-id>-ESCALATE-<slug>.md` with `reason: "<role> spawned outside routing whitelist for intent=<intent>"` and end your turn. Do NOT no-op silently.
- **ADR sub-flow**: `feature` and `refactor` intents may open an ADR mid-flow when a non-obvious system-affecting decision surfaces. `@architect` is sole author; `@reviewer` reviews. 3-round circuit breaker → `<feature-id>-ESCALATE-ADR-<NNNN>.md`. ADRs are referenced from PRD/FRS/TDD/openapi bodies by ID (`ADR-<NNNN>-<slug>`) in plain prose, not by section anchor.

Paths: per-feature prose in `docs/<service_name>/<feature-id>/`, ADRs flat in `docs/adr/`, agent-internal coordination in `<context_path>/.orchestra/<service_name>/pipeline/<feature-id>/`. Filenames are `<feature-id>-<TYPE>.<ext>` (e.g., `todo-001-api-PRD.md`).

---

## feature {#feature}

**Agents (in order):** `@product` → `@architect` → dispatcher (Phase 2 Plan body) → `@backend` / `@frontend` / `@test-author` (parallel) → `@test-runner` → `@evaluator` → `@reviewer`

**Artifact whitelist (full set):**

- `docs/<service_name>/<feature-id>/<feature-id>-PRD.md`
- `docs/<service_name>/<feature-id>/<feature-id>-FRS.md`
- `docs/<service_name>/<service_name>-BR-AC.md` (per-service BR + AC singleton; updated in place)
- `docs/business-invariants.md` (workspace-grain singleton; updated in place when cross-service invariants apply)
- `docs/SAD.md` (project singleton; updated in place)
- `docs/adr/ADR-<NNNN>-<slug>.md` (conditional, per ADR sub-flow)
- `docs/<service_name>/<feature-id>/<feature-id>-TDD.md`
- `docs/<service_name>/<feature-id>/<feature-id>-openapi.yaml` (or `<feature-id>-asyncapi.yaml`)
- `<context_path>/.orchestra/<service_name>/pipeline/<feature-id>/<feature-id>-TASKS.md`
- impl source under `<context_path>/services/<service_name>/src/` (multi-repo) or `<context_path>/src/` (single-repo)
- `docs/<service_name>/<feature-id>/<feature-id>-TSR.md` (multi-writer: `S-TEST-001` by `@test-author` + `@test-runner`, `S-EVAL-001` by `@evaluator`, `S-REVIEW-001` by `@reviewer`)

This is the only intent that produces the full SDLC artifact set.

## hotfix {#hotfix}

**Agents (in order):** dispatcher (Phase 2 Plan body) → `@backend` / `@frontend` → `@test-runner` → `@evaluator`

**Artifact whitelist:**

- `docs/<service_name>/<feature-id>/<feature-id>-TDD.md`
- `<context_path>/.orchestra/<service_name>/pipeline/<feature-id>/<feature-id>-TASKS.md`
- impl-fix
- `docs/<service_name>/<feature-id>/<feature-id>-TSR.md` (no review half required — `S-REVIEW-001` stays `pending`)

**Excluded:** PRD, FRS, openapi (unchanged from broken release), SAD, ADR, BR-AC. Hotfixes skip Planning + Analysis (the bug is the spec). `@reviewer` is NOT spawned. `@test-author` is skipped because spec is unchanged; `@test-runner` still runs the suite.

## template {#template}

**Agents (in order):** `@product` (intent triage only) → dispatcher (Phase 2 Plan body) → `@backend` / `@frontend` → `@test-author` + `@test-runner` → `@evaluator` → `@reviewer`

**Artifact whitelist:**

- `<context_path>/.orchestra/<service_name>/pipeline/<feature-id>/intent.yaml`
- `docs/<service_name>/<feature-id>/<feature-id>-TDD.md`
- `<context_path>/.orchestra/<service_name>/pipeline/<feature-id>/<feature-id>-TASKS.md`
- impl source
- `docs/<service_name>/<feature-id>/<feature-id>-TSR.md`

**Excluded:** PRD, FRS, openapi, SAD, ADR, BR-AC. Templates are infrastructure scaffolding; they don't define new contracts. `@product` is spawned for upstream classification only and writes the routing `intent.yaml`, no narrative.

## refactor {#refactor}

**Agents (in order):** `@reviewer` (pre-impl assessment) → `@architect` (TDD update) → `@backend` / `@frontend` → `@test-runner` → `@evaluator`

**Artifact whitelist:**

- `docs/<service_name>/<feature-id>/<feature-id>-TSR.md` (pre-impl assessment in `S-REVIEW-001`; post-impl `S-EVAL-001` by `@evaluator`)
- `docs/<service_name>/<feature-id>/<feature-id>-TDD.md` (update — not net-new)
- `<context_path>/.orchestra/<service_name>/pipeline/<feature-id>/<feature-id>-TASKS.md`
- impl
- `docs/adr/ADR-<NNNN>-<slug>.md` (conditional — refactors often hit forks)

**Excluded:** PRD, FRS, openapi, new SAD, BR-AC. Refactors preserve external behavior; openapi is unchanged by definition. SAD updates are limited to component touches.

## docs {#docs}

**Agents (in order):** `@product` (intent triage only) → `@reviewer`

**Artifact whitelist:**

- `<context_path>/.orchestra/<service_name>/pipeline/<feature-id>/intent.yaml`
- The doc files themselves (whatever the user asked for — README updates, ADR additions outside a feature, rule docs, etc.)
- `docs/<service_name>/<feature-id>/<feature-id>-TSR.md` (review half only — `S-EVAL-001` stays `pending`)

**Excluded:** PRD, FRS, TDD, openapi, TASKS, BR-AC. `@product` triages without authoring narrative. The dispatcher MUST refuse this route — if spawned downstream, write `<feature-id>-ESCALATE-<slug>.md` and end the turn.

## review-only {#review-only}

**Agents:** `@reviewer` (assess only — no downstream)

**Artifact whitelist:**

- `docs/<service_name>/<feature-id>/<feature-id>-TSR.md` (review half only — `S-EVAL-001` stays `pending` indefinitely)

**Excluded:** PRD, FRS, TDD, openapi, TASKS, BR-AC. The user wants a review of existing work, not new work. The dispatcher MUST refuse this route.

---

## Versioning

This schema's content matches the routing rules embedded in `commands/orchestra.md` (intent → agents quick-reference). When either side changes, both must update. The dispatcher is canonical for spawn order; this file is canonical for artifact whitelists.
