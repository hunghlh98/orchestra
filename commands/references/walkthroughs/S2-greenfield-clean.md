---
strategy: S2
entry: /orchestra spec-to-code
precondition: greenfield, clean docs/ + src/**
---

# S2 — greenfield, clean repo

**Trigger.** `$1 = "spec-to-code"`; preflight `mode: greenfield`, `docs/` empty, `src/**` empty. Optional tail seeds feature-slug + PRD title.

**Trace.**

1. Phase 1 — Read preflight; walk bootstrap `missing_fields`; persist via `mcp__orchestra-utils__*`. Feature-id mint from `features.yaml` + `$ARGUMENTS` slug. No `@explorer` (greenfield).
2. Phase 2a — `EnterPlanMode`. Compose plan body inline: `## Features` lists single feature `classifier: business, depends_on: []`. `## Agent assignments` covers per-feature PRD/FRS/TDD + per-service singleton seeds + impl + test plan. `## Risks + decisions` lists preflight constraints + revision cap. `ExitPlanMode({plan})`. Turn ends.
3. Phase 2b + 3 (next turn on approve) — Write `.orchestra/plans/<session-id>/run-plan.md` locked; `TaskCreate × N` in ONE message; `Agent × N` spawn cohort in ONE message. Subagents `TaskUpdate` per row; `SubagentStop` projects ledger. Verify via `TaskList`.
4. Phase 4 — Spawn `@test-runner` (sequential). On return, spawn `@evaluator ‖ @reviewer` in ONE message. TSR sections lock.

**Artifacts produced.**

```
.orchestra/system.yaml
.orchestra/<service_name>/{local.yaml, features.yaml}
.orchestra/<service_name>/pipeline/<feature-id>/...
.orchestra/plans/<session-id>/{run-plan.md, agent-tasks.md}
docs/README.md
docs/<service_name>/{<service_name>-openapi.yaml, <service_name>-BR-AC.md}
docs/<service_name>/diagrams/{c4-component,erd-logical,state-machine,usecase}.puml + *.svg
docs/<service_name>/<feature-id>/{<feature-id>-PRD.md, -FRS.md, -TDD.md, -TSR.md}
docs/<service_name>/<feature-id>/diagrams/<feature-id>-sd-*.puml + *.svg
docs/adr/ADR-<NNNN>-*.md                                       (only when ADR-worthy decision surfaces)
services/<service_name>/src/{main,test}/<lang>/...
web/src/...                                                    (only when UI layer present)
```

**Edge cases.**

- Single-repo: workspace SAD/ADRs/business-invariants skipped (multi-repo concerns).
- UI-less: `@frontend` omitted from Phase 3 swarm.
- `migration_tool: none`: persistence-bearing TDD without migration; `primary_database` prompt skipped.
- ADR-worthy decision mid-Phase-3: `@architect` writes ADR(s) under `phase: gap-resolution`.
- Plan-mode rejection: Phase 2c revision loop (≤3 cycles); 4th writes `run-plan-DEADLOCK.md`.
