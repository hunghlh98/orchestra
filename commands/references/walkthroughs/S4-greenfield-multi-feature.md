---
strategy: S4
entry: /orchestra spec-to-code
precondition: greenfield, N locked features, empty src
---

# S4 — greenfield, N locked features, empty src

**Trigger.** `$1 = "spec-to-code"`; `features.yaml` lists ≥2 features all with locked PRD/FRS/TDD/contracts; `src/**` empty.

**Trace.**

1. Phase 1 — Bootstrap. Read `features.yaml`. Build candidate set = features lacking TSR verdict. Resolve `depends_on:`; DAG-rank.
2. Phase 2a — `EnterPlanMode`. `## Features` enumerates ALL candidates. `## Agent assignments` per-feature impl + test-plan only (specs already locked). `service_singletons_touched` rows ONLY for features that touch them (e.g., new endpoint → `<service>-openapi.yaml` `append-endpoints`). `## Risks + decisions` surfaces DAG structure + single-writer serialization. `ExitPlanMode`.
3. Phase 2b + 3 — Write `run-plan.md` locked; `TaskCreate` per per-feature slot in ONE message; `Agent × M` spawn cohort — rank-zero features only, parallel within rank; per-service singleton path-intersection serialization enforced by main agent.
4. Phase 4 — Per-feature `@test-runner` → `@evaluator ‖ @reviewer` → `<feature-id>-TSR.md`. Independent verdicts. Iterate ranks until all features pass or DEADLOCK.

**Artifacts produced.**

```
services/<service_name>/src/{main,test}/<lang>/...               (multi-feature impl)
docs/<service_name>/<service_name>-openapi.yaml                  (append-endpoints per feature)
docs/<service_name>/diagrams/{c4-component,erd-logical,state-machine,usecase}.puml  (per-feature appends)
docs/<service_name>/<feature-id-N>/<feature-id-N>-TSR.md
.orchestra/<service_name>/pipeline/<feature-id-N>/...
.orchestra/plans/<session-id>/{run-plan.md, agent-tasks.md}
```

Spec artifacts (PRD/FRS/TDD/sd) unchanged — already locked from prior runs.

**Edge cases.**

- One feature's `@test-runner` fails: its TSR locks `verdict: FAIL`. Dependents stay blocked. Other independent features proceed.
- `depends_on:` cycle: `upsert_features_yaml` rejects at write-time. Cycle in existing file → ESCALATE.
- Cross-feature shared code conflict: plan author serializes same authoring agent on intersecting paths. Detected via `service_singletons_touched` path-intersection check.
- `supersedes:` chain: predecessor `status:` stays user-controlled; successor authors fresh artifacts.
- Plan rejection on multi-feature scope: Phase 2c — reject usually narrows ("drop feature X" / "re-order Y before Z" / "missed feature W").
