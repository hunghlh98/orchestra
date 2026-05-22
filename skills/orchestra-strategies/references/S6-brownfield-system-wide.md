# S6 — brownfield, system-wide reverse

## Trigger

- `$1 = "code-to-spec"`, second token `system`.
- Preflight `mode: brownfield`, `workspace_kind: multi-repo`.
- `src/**` exists across ≥2 services.

## Trace

1. **Bootstrap.** Confirm `workspace_kind: multi-repo`. Persist `scope_level: system-wide` to every per-service `local.yaml` (auto-create on first encounter).
2. **Run-plan author.** Spawn `@lead` `task: run-plan-author`, `chain: reverse-pass`. Lead writes workspace-level run-plan with `S-FEATURES-001` listing every feature discovered across services.
3. **Run-plan approval gate.** Main thread `EnterPlanMode` with run-plan body; `## Auto-mode notice` prepended. `ExitPlanMode` collects accept/reject.
4. **Phase A — service-shell author.** Single-writer cohort. Spawn `@architect` `task: reverse-pass`, `pass: service-shell-author`. Writes:
   - `docs/SAD.md` (workspace-level, `S-CONTAINERS-001` ≥2 containers).
   - `docs/diagrams/c4-context.puml`, `c4-container.puml`, `erd-logical.puml`.
   - `docs/business-invariants.md` (rules binding ≥2 services).
   - Per-service `docs/<service>/<service>-BR-AC.md` (BR/AC scoped to one service).
5. **Reverse-TDD review gate.** Main thread Reads SAD + container diagrams. Approve / re-author / halt.
6. **Phase B — per-feature DAG-rank batched fan-out.** Main thread reads `features.yaml` (or derives from source surface). DAG-rank features. ONE message spawning `@architect` per rank-zero feature → writes per-feature TDD + openapi/asyncapi/clientapi + per-feature diagrams.
7. **Reverse-TDD per-feature gate.** Per-feature review.
8. **Spawn `@analyst`** (per feature) → derives FRS from TDD + openapi. Reverse-FRS gate.
9. **Spawn `@product`** (per feature) → synthesizes PRD + writes the `features.yaml` entry. Reverse-PRD gate. Done.
10. **No source touched.** `src/main/**`, `src/test/**`, and TSR all forbidden during reverse-pass.

## Artifacts produced

```
docs/SAD.md
docs/business-invariants.md
docs/adr/ADR-<NNNN>-*.md                                            (when source-archaeology surfaces non-obvious decisions)
docs/diagrams/c4-context.puml, c4-container.puml, erd-logical.puml, sequence-inter-*.puml
docs/<service>/<service>-BR-AC.md
docs/<service>/adr/ADR-<service>-<NNN>-*.md
docs/<service>/diagrams/c4-component.puml (+ c4-code.puml when non-trivial), erd-logical.puml
docs/<service>/<feature-id>/<feature-id>-PRD.md
docs/<service>/<feature-id>/<feature-id>-FRS.md
docs/<service>/<feature-id>/<feature-id>-TDD.md
docs/<service>/<feature-id>/<feature-id>-openapi.yaml                (or -asyncapi.yaml, -clientapi.yaml)
docs/<service>/<feature-id>/diagrams/*.puml
.orchestra/<service>/features.yaml                                  (authored at the END by @product)
```

## Edge cases

- **Workspace SAD container count < 2.** `pre-write-check` `workspace-sad-container-floor` gate rejects. Re-author with ≥2 containers or escalate.
- **Per-feature `reverse_authoring_mode` classification.** If `docs/README.md` provenance marker absent or stale, every reverse-pass author pins to `re-author` (full rewrite). With marker, classify per-artifact: `cite-as-is` / `copy-and-modify` / `re-author`.
- **Spawn brief discipline.** Reverse-pass briefs describe what to look for, never prescribe what to find. "Verify whether ownership is enforced; if observed, lift to BR-AC. If absent, raise as divergence" — not "X-User-Id ownership matches order owner".
- **Source-only feature with no business-level meaning.** `@product` flags during synthesis. Returns DEADLOCK or asks for clarification.

## Cross-references

- `agents/architect.md` — Reverse-pass discipline (two-phase narrowing: phase A + phase B contract).
- `agents/architect.md` — Spec-correctness audit (Java/Spring per-handler error contract).
- `skills/c4-architecture/SKILL.md` — diagram authoring + arrow-evidence rule.
- `skills/java-development/SKILL.md` — Spec-correctness match rules (when `primary_language: java`).
- `commands/orchestra.md` — Algorithm payloads / code-to-spec (S5/S6/S7) reverse-pass.
- `schemas/pipeline-artifact.schema.md` — frontmatter shapes for every reverse-pass artifact.
