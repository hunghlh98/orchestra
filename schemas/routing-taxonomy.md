# Routing Taxonomy (consumer-surface schema)

> Normative consumer-surface document mapping `intent.yaml.intent` to authorized agents and the artifact whitelist for each intent. The dispatcher's spawn prompts (per `commands/orchestra.md` Step 5) reference this file by intent anchor (`#feature`, `#hotfix`, etc.); agents Read the relevant section on demand to verify their authorized outputs. Each spawn prompt also carries a 1-line backstop summary inline so agents do not need to Read this file for the common path.

> **v2.0.0 changes**: folded `VERDICT` + `CODE-REVIEW` → `TSR`; folded `ANNOUNCEMENT` into `RELEASE §S-ANNOUNCEMENT-001`; added `<NNN>-CHARTER.md` (mode: full | brief) and conditional `ADR-<NNNN>-<slug>.md`; dropped 6 routing-orphan types (`DOC`, `IMPL-NOTES`, `IMPL-BE/FE`, `CODE-DESIGN-BE/FE`, `COMMIT-MSG-as-file`).

## How agents use this file

- Spawn prompt mandate: every `Agent({ subagent_type, prompt })` call from the dispatcher embeds `Routed intent: <intent>. Authorized artifacts: see schemas/routing-taxonomy.md#<intent>` plus a 1-line summary. Agents may Read this file when the inline summary is insufficient (e.g., an artifact name they're uncertain about).
- Out-of-whitelist enforcement: if an agent infers an artifact is required that's NOT in its routed-intent whitelist, write `ESCALATE-<feature_id>.md` at the feature-dir root with `reason: "<role> spawned outside routing whitelist for intent=<intent>"` and end your turn. Do NOT no-op silently.
- ADR sub-flow: feature and refactor intents may open an ADR mid-flow when a non-obvious system-affecting decision surfaces. `@architect` is sole author (under `chain_rigor=Full`); `@reviewer` reviews. 3-round circuit breaker → `DEADLOCK-ADR-<NNNN>.md`. ADRs are referenced from PRD/FRS/TDD/openapi bodies by ID (`ADR-NNNN-<slug>`) in plain prose, not by section anchor.

---

## feature {#feature}

**Agents (in order):** `@product` → `@lead` → builder → `@test` → `@evaluator` → `@reviewer` → `@ship`

**Artifact whitelist (full set):**

- `charter/<NNN>-CHARTER.md` (mode: full)              <!-- NEW v2.0 -->
- `requirements/<NNN>-PRD.md`
- `requirements/<NNN>-FRS.md`
- `design/<NNN>-TDD.md`
- `interfaces/<NNN>-API.openapi.yaml`
- `interfaces/<NNN>-CONTRACT.md`
- `plan/<NNN>-TASKS.md`
- impl source (project's normal layout)
- `verify/<NNN>-TEST.md`
- `verify/<NNN>-TSR.md`                                 <!-- v2.0: folds VERDICT + CODE-REVIEW -->
- `RELEASE-vX.Y.Z.md` (singleton; absorbs ANNOUNCEMENT)
- `RUNBOOK-vX.Y.Z.md` (singleton; conditional)
- `architecture/decisions/ADR-<NNNN>-<slug>.md`         <!-- NEW v2.0 (conditional) -->

This is the only intent that produces the full SDLC artifact set.

## hotfix {#hotfix}

**Agents (in order):** `@lead` → builder → `@test` → `@evaluator` → `@ship`

**Artifact whitelist:**

- `design/<NNN>-TDD.md`
- `plan/<NNN>-TASKS.md`
- impl-fix
- `verify/<NNN>-TEST.md`
- `verify/<NNN>-TSR.md`                                 <!-- v2.0: replaces VERDICT (no rev half required) -->
- `RELEASE-vX.Y.Z.md`

**Excluded:** CHARTER, PRD, FRS, CONTRACT, API. Hotfixes skip the Planning + Analysis phases (the bug is the spec); CONTRACT/API are unchanged from the broken release. The `@reviewer` is NOT spawned (CODE-REVIEW folds into the implementer's diff for speed); the TSR `S-REV-VERDICT-001` anchor is left at `pending` and `validateFoldCorrectness` is exempt for hotfix-routed TSRs (the validator should be invoked with intent context — implementer carries this in spawn prompt).

## template {#template}

**Agents (in order):** `@product` (intent only) → `@lead` → builder → `@test` → `@evaluator` → `@reviewer`

**Artifact whitelist:**

- `charter/<NNN>-CHARTER.md` (mode: brief)              <!-- NEW v2.0; replaces INTENT-<id>.md -->
- `design/<NNN>-TDD.md`
- `plan/<NNN>-TASKS.md`
- impl source
- `verify/<NNN>-TEST.md`
- `verify/<NNN>-TSR.md`                                 <!-- v2.0: replaces VERDICT + CODE-REVIEW -->

**Excluded:** PRD, FRS, CONTRACT, API. Templates are infrastructure scaffolding; they don't define new contracts. `@product` is spawned for the upstream classification slot only — writes the brief CHARTER (mode: brief) instead of v1's `INTENT-<id>.md`. Legacy `INTENT-<id>.md` remains valid for hand-authored runs but new template-routed runs prefer CHARTER.

## refactor {#refactor}

**Agents (in order):** `@reviewer` (assess) → `@lead` (TDD update) → builder → `@test` → `@evaluator`

**Artifact whitelist:**

- `verify/<NNN>-TSR.md`                                 <!-- v2.0: pre-impl assessment by @reviewer; post-impl by @evaluator -->
- `design/<NNN>-TDD.md` (update — not net-new)
- impl
- `verify/<NNN>-TEST.md`
- `architecture/decisions/ADR-<NNNN>-<slug>.md`         <!-- NEW v2.0 (conditional — refactors often hit forks) -->

**Excluded:** CHARTER, PRD, FRS, CONTRACT, API, new SAD. Refactors preserve external behavior; CONTRACT/API are unchanged by definition. SAD updates are limited to component touches (append components, append ADR-INDEX rows), not new architecture.

## docs {#docs}

**Agents (in order):** `@product` (intent only) → `@ship` → `@reviewer`

**Artifact whitelist:**

- `charter/<NNN>-CHARTER.md` (mode: brief)              <!-- NEW v2.0; replaces INTENT-<id>.md -->
- The doc files themselves (whatever the user asked for — README updates, rule docs, etc.)
- `verify/<NNN>-TSR.md`                                 <!-- v2.0: rev half only; eval half stays pending -->

**Excluded:** PRD, FRS, TDD, CONTRACT, API, TASKS, TEST, RELEASE. `@product` is spawned for upstream classification only (writes the brief CHARTER). `@lead` MUST refuse this route — if spawned, write `ESCALATE-<feature_id>.md` and end the turn.

## review-only {#review-only}

**Agents:** `@reviewer` (assess only — no downstream)

**Artifact whitelist:**

- `verify/<NNN>-TSR.md`                                 <!-- v2.0: rev half only; eval half stays pending indefinitely -->

**Excluded:** CHARTER, PRD, FRS, TDD, CONTRACT, API, TASKS, TEST, RELEASE. The user wants a review of existing work, not new work. `@lead` MUST refuse this route.

---

## Versioning

This schema's content matches the routing rules embedded in `commands/orchestra.md` Step 5 (intent → agents quick-reference). When either side changes, both must update. The dispatcher is canonical for spawn order; this file is canonical for artifact whitelists. v2.0.0 revision: 2 (was 1 in v1).
