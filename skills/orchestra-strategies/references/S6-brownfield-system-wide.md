# S6 — brownfield, system-wide reverse

## Trigger

- `$1 = "code-to-spec"`, second token `system`.
- Preflight `mode: brownfield`, `workspace_kind: multi-repo`.
- `src/**` exists across ≥2 services.

## Trace

**Phase 1 — Discovery.**

1. Confirm `workspace_kind: multi-repo`. Persist `scope_level: system-wide` to every per-service `local.yaml` (auto-create on first encounter).
2. Enumerate services from build-manifest walk (or cached `local.yaml` entries).
3. Spawn `@explorer` fan-out in ONE message — one spawn per service in scope. Each `@explorer` reads its service's `src/**` + manifests and authors `.orchestra/plans/<session-id>/discovery/<service>.md` (per-service feature surface, complexity estimates, ADR-worthy decisions surfaced).
4. Read every discovery report after the last `SubagentStop` fires.

**Phase 2a — Author.**

5. Main agent `EnterPlanMode`. Reads discovery reports as inputs.
6. Compose plan body. `## Features` enumerates features discovered across services (DAG by source-archaeology dependencies). `## Agent assignments` covers:
   - Workspace-scope (`@architect`): `SAD.md`, `business-invariants.md`, workspace ADRs, `c4-context.puml`, `c4-container.puml`, workspace `erd-logical.puml`, cross-service `sd-*.puml`.
   - Per-service singletons (`@architect` for most, `@analyst` for `usecase.puml`): `<service>-BR-AC.md`, `<service>-openapi.yaml` (or `asyncapi.yaml` / `clientapi.yaml`), `c4-component.puml`, `erd-logical.puml`, `state-machine.puml`, `usecase.puml`.
   - Per-feature reverse-pass spec: TDD → FRS → PRD (sequential within feature; parallel across features at the same DAG rank).
7. Each per-feature row carries `reverse_authoring_mode` (`re-author` / `copy-and-modify` / `cite-as-is`) per `docs/README.md` provenance marker. Absent marker pins every reverse-pass author to `re-author`.
8. `ExitPlanMode`.

═══ Turn boundary ═══

**Phase 2b — Lock + Phase 3 — Swarm.**

9. On approve, Write `run-plan.md` locked.
10. `TaskCreate × N` per `## Agent assignments` row in ONE message.
11. `Agent × N` spawn cohort. Workspace artifacts first (single-writer, sequential within workspace cohort). Per-service singletons next. Per-feature reverse-pass spec DAG-rank-batched: rank-zero features in parallel, then ranks 1, 2, ... as parents `TaskUpdate(completed)`.
12. Within each feature: `@architect` → `@analyst` → `@product` strictly sequential. `@product` writes the `features.yaml` entry as part of feature closure.

**Phase 4 — Convergence.**

13. Reverse-pass produces no source impl. Phase 4 trivially completes when last `@product` returns. No `@test-runner` / `@evaluator` / `@reviewer` in reverse mode.
14. Forward-chain `spec-to-code` follow-up (separate `/orchestra` invocation under same session-id) carries the full Phase 4 against the now-locked reverse-derived baseline.

## Artifacts produced

```
.orchestra/plans/<session-id>/discovery/<service>.md              (one per service)
.orchestra/plans/<session-id>/run-plan.md
.orchestra/plans/<session-id>/agent-tasks.md
docs/SAD.md
docs/business-invariants.md
docs/adr/ADR-<NNNN>-*.md                                          (when source-archaeology surfaces non-obvious decisions)
docs/diagrams/c4-context.puml + c4-container.puml + erd-logical.puml + sd-*.puml + *.svg
docs/<service>/<service>-BR-AC.md
docs/<service>/<service>-openapi.yaml                             (or -asyncapi.yaml / -clientapi.yaml)
docs/<service>/adr/ADR-<service>-<NNN>-*.md
docs/<service>/diagrams/c4-component.puml + erd-logical.puml + state-machine.puml + usecase.puml + *.svg
docs/<service>/<feature-id>/<feature-id>-PRD.md
docs/<service>/<feature-id>/<feature-id>-FRS.md
docs/<service>/<feature-id>/<feature-id>-TDD.md
docs/<service>/<feature-id>/diagrams/<feature-id>-sd-*.puml
.orchestra/<service>/features.yaml                                (authored at the END by @product per feature)
```

## Edge cases

- **Workspace SAD container count < 2.** `pre-write-check` `workspace-sad-container-floor` gate rejects. `@architect` re-authors with ≥2 containers.
- **Per-feature `reverse_authoring_mode` classification.** If `docs/README.md` provenance marker absent or stale, every reverse-pass author pins to `re-author` (full rewrite). With marker, classify per-artifact: `cite-as-is` / `copy-and-modify` / `re-author`.
- **Spawn brief discipline.** Reverse-pass briefs describe what to look for, never prescribe what to find. "Verify whether ownership is enforced; if observed, lift to BR-AC. If absent, raise as divergence" — not "X-User-Id ownership matches order owner".
- **Source-only feature with no business-level meaning.** `@product` flags during synthesis. Returns DEADLOCK or asks for clarification.
- **Plan rejection.** Phase 2c revision loop. Reject usually narrows: "missed service X" / "TDD pinned to wrong direction on feature Y". Main agent self-explores via targeted `Read`/`Grep` on hinted service; appends supplemental finding.

## Cross-references

- `agents/explorer.md` — Phase 1 source-survey authoring contract.
- `agents/architect.md` — Reverse-pass authoring contract (TDD derivation from source archaeology, per-handler error contract, persistence-shape priority).
- `skills/c4-architecture/SKILL.md` — diagram authoring + arrow-evidence rule.
- `skills/java-development/SKILL.md` — Spec-correctness match rules (when `primary_language: java`).
- `commands/orchestra.md` — Phase 3 brownfield ordering (`@architect` → `@analyst` → `@product` within feature; per-artifact `reverse_authoring_mode`).
- `schemas/pipeline-artifact.schema.md` — frontmatter shapes for every reverse-pass artifact.
