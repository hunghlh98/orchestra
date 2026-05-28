---
strategy: S6
entry: /orchestra code-to-spec system
precondition: brownfield, multi-repo, system-wide reverse
---

# S6 — brownfield, system-wide reverse

**Trigger.** `$1 = "code-to-spec"`, second token `system`; preflight `mode: brownfield`, `workspace_kind: multi-repo`; `src/**` exists across ≥2 services.

**Trace.**

1. Phase 1 — Confirm `workspace_kind: multi-repo`. Persist `scope_level: system-wide` to every per-service `local.yaml`. Enumerate services. Spawn `@explorer` fan-out in ONE message — one spawn per service. Each authors `.orchestra/plans/<session-id>/discovery/<service>.md` (feature surface, complexity estimates, ADR-worthy decisions). Read every report after last `SubagentStop`.
2. Phase 2a — `EnterPlanMode`. Compose plan with reports as inputs. `## Features` enumerates discovered features DAG. `## Agent assignments` covers workspace-scope (`@architect`: SAD, business-invariants, workspace ADRs + diagrams) + per-service singletons (`@architect` for most, `@analyst` for `usecase.puml`) + per-feature reverse-pass spec (TDD → FRS → PRD sequential within feature, parallel across features at same DAG rank). Each per-feature row carries `reverse_authoring_mode` per `docs/README.md` provenance marker. `ExitPlanMode`.
3. Phase 2b + 3 — Write `run-plan.md` locked; `TaskCreate × N`; `Agent × N` spawn cohort. Workspace artifacts first (single-writer sequential). Per-service singletons next. Per-feature reverse-pass DAG-rank-batched. Within feature: `@architect` → `@analyst` → `@product` sequential. `@product` writes `features.yaml` entry as part of feature closure.
4. Phase 4 — Reverse-pass produces no source impl; Phase 4 trivially closes when last `@product` returns. Forward-chain follow-up runs as separate `/orchestra` invocation under same session-id.

**Artifacts produced.**

```
.orchestra/plans/<session-id>/discovery/<service>.md             (one per service)
.orchestra/plans/<session-id>/{run-plan.md, agent-tasks.md}
docs/{SAD.md, business-invariants.md}
docs/adr/ADR-<NNNN>-*.md                                          (when source-archaeology surfaces non-obvious decisions)
docs/diagrams/{c4-context,c4-container,erd-logical,sd-*}.puml + *.svg
docs/<service>/{<service>-BR-AC.md, <service>-openapi.yaml}       (or -asyncapi/-clientapi)
docs/<service>/adr/ADR-<service>-<NNN>-*.md
docs/<service>/diagrams/{c4-component,erd-logical,state-machine,usecase}.puml + *.svg
docs/<service>/<feature-id>/{<feature-id>-PRD.md, -FRS.md, -TDD.md}
docs/<service>/<feature-id>/diagrams/<feature-id>-sd-*.puml
.orchestra/<service>/features.yaml                                (authored at the END by @product per feature)
```

**Edge cases.**

- Workspace SAD container count < 2: `pre-write-check` `workspace-sad-container-floor` rejects; `@architect` re-authors with ≥2.
- Per-feature `reverse_authoring_mode` classification: absent `docs/README.md` `generated_by: orchestra` marker pins every author to `re-author`. With marker, classify per-artifact.
- Spawn brief discipline: describe what to look for, never prescribe what to find. "Verify whether ownership is enforced; if observed, lift to BR-AC. If absent, raise as divergence" — not "X-User-Id ownership matches order owner".
- Source-only feature with no business-level meaning: `@product` flags during synthesis; DEADLOCK or clarification.
- Plan rejection: Phase 2c targets missed service / wrong direction on feature.
