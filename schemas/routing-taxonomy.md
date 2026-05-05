# Routing Taxonomy (consumer-surface schema)

> Normative consumer-surface document mapping `intent.yaml.intent` to authorized agents and the artifact whitelist for each intent. The dispatcher's spawn prompts (per `commands/orchestra.md` Step 5) reference this file by intent anchor (`#feature`, `#hotfix`, etc.); agents Read the relevant section on demand to verify their authorized outputs. Each spawn prompt also carries a 1-line backstop summary inline so agents do not need to Read this file for the common path.

## How agents use this file

- Spawn prompt mandate: every `Agent({ subagent_type, prompt })` call from the dispatcher embeds `Routed intent: <intent>. Authorized artifacts: see schemas/routing-taxonomy.md#<intent>` plus a 1-line summary. Agents may Read this file when the inline summary is insufficient (e.g., an artifact name they're uncertain about).
- Out-of-whitelist enforcement: if an agent infers an artifact is required that's NOT in its routed-intent whitelist, write `ESCALATE-<feature_id>.md` at the feature-dir root with `reason: "<role> spawned outside routing whitelist for intent=<intent>"` and end your turn. Do NOT no-op silently.

---

## feature {#feature}

**Agents (in order):** `@product` → `@lead` → builder → `@test` → `@evaluator` → `@reviewer` → `@ship`

**Artifact whitelist (full set):**

- `requirements/<NNN>-PRD.md`
- `requirements/<NNN>-FRS.md`
- `design/<NNN>-TDD.md`
- `interfaces/<NNN>-API.openapi.yaml`
- `interfaces/<NNN>-CONTRACT.md`
- `plan/<NNN>-TASKS.md`
- impl source (project's normal layout)
- `verify/<NNN>-TEST.md`
- `verify/<NNN>-VERDICT.md`
- `verify/<NNN>-CODE-REVIEW.md`
- `RELEASE-vX.Y.Z.md` / `RUNBOOK-vX.Y.Z.md` / `ANNOUNCEMENT-vX.Y.Z.md`

This is the only intent that produces the full SDLC artifact set.

## hotfix {#hotfix}

**Agents (in order):** `@lead` → builder → `@test` → `@evaluator` → `@ship`

**Artifact whitelist:**

- `design/<NNN>-TDD.md`
- `plan/<NNN>-TASKS.md`
- impl-fix
- `verify/<NNN>-TEST.md`
- `verify/<NNN>-VERDICT.md`
- `RELEASE-vX.Y.Z.md`

**Excluded:** PRD, FRS, CONTRACT, API, CODE-REVIEW. Hotfixes skip the PRD/FRS step (the bug is the spec); CONTRACT/API are unchanged from the broken release; CODE-REVIEW is folded into the implementer's diff for speed.

## template {#template}

**Agents (in order):** `@product` (intent only) → `@lead` → builder → `@test` → `@evaluator` → `@reviewer`

**Artifact whitelist:**

- `design/<NNN>-TDD.md`
- `plan/<NNN>-TASKS.md`
- impl source
- `verify/<NNN>-TEST.md`
- `verify/<NNN>-VERDICT.md`
- `verify/<NNN>-CODE-REVIEW.md`

**Excluded:** PRD, FRS, CONTRACT, API. Templates are infrastructure scaffolding; they don't define new contracts. `@product` is spawned for the upstream classification slot only — writes a brief `INTENT-<id>.md` summary, NOT a PRD or FRS.

## refactor {#refactor}

**Agents (in order):** `@reviewer` (assess) → `@lead` (TDD update) → builder → `@test` → `@evaluator`

**Artifact whitelist:**

- `verify/<NNN>-CODE-REVIEW.md`
- `design/<NNN>-TDD.md` (update — not net-new)
- impl
- `verify/<NNN>-TEST.md`
- `verify/<NNN>-VERDICT.md`

**Excluded:** PRD, FRS, CONTRACT, API, new SAD. Refactors preserve external behavior; CONTRACT/API are unchanged by definition. SAD updates are limited to component touches (append components, append ADRs), not new architecture.

## docs {#docs}

**Agents (in order):** `@product` (intent only) → `@ship` → `@reviewer`

**Artifact whitelist:**

- The doc files themselves (whatever the user asked for — README updates, rule docs, etc.)
- `verify/<NNN>-CODE-REVIEW.md`

**Excluded:** PRD, FRS, TDD, CONTRACT, API, TASKS, TEST, RELEASE. `@product` is spawned for upstream classification only (writes `INTENT-<id>.md`). `@lead` MUST refuse this route — if spawned, write `ESCALATE-<feature_id>.md` and end the turn.

## review-only {#review-only}

**Agents:** `@reviewer` (assess only — no downstream)

**Artifact whitelist:**

- `verify/<NNN>-CODE-REVIEW.md`

**Excluded:** PRD, FRS, TDD, CONTRACT, API, TASKS, TEST, RELEASE. The user wants a review of existing work, not new work. `@lead` MUST refuse this route.

---

## Versioning

This schema's content matches the routing rules embedded in `commands/orchestra.md` Step 5 (intent → agents quick-reference). When either side changes, both must update. The dispatcher is canonical for spawn order; this file is canonical for artifact whitelists.
