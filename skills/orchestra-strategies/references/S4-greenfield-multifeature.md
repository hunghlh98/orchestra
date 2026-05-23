# S4 — greenfield, N locked features, empty src

## Trigger

- `$1 = "spec-to-code"`.
- `.orchestra/<service_name>/features.yaml` lists ≥2 features all with locked `<feature-id>-PRD.md` / `-FRS.md` / `-TDD.md` / contracts.
- `services/<service_name>/src/**` empty (or no impl yet for any feature).

## Trace

**Phase 1 — Discovery.**

1. Preflight + bootstrap.
2. Read `features.yaml`. For each entry, check `<feature-id>-TSR.md` verdict — features with `verdict: PASS` skip. Build candidate set = features lacking TSR verdict.
3. Resolve `depends_on:` edges. DAG-rank the candidate set. Rank-zero features (no unresolved dependencies) spawn first; later ranks defer until parents reach `verdict: PASS`.

**Phase 2a — Author.**

4. Main agent `EnterPlanMode`.
5. Plan body's `## Features` enumerates ALL candidate features (multi-feature DAG); `## Agent assignments` lists per-feature impl + test-plan assignments (PRD/FRS/TDD already locked → no spec assignments). Per-service singleton mutations happen via `service_singletons_touched` rows ONLY for features that actually touch them (e.g., new endpoint → `<service>-openapi.yaml` `append-endpoints`). `## Risks + decisions` surfaces DAG structure + single-writer serialization for shared per-service singletons.
6. `ExitPlanMode`.

═══ Turn boundary ═══

**Phase 2b — Lock + Phase 3 — Swarm.**

7. On approve, Write `run-plan.md` locked.
8. `TaskCreate` per per-feature impl + test-plan slot (e.g., `@backend` × N + `@frontend` × N when UI present + `@test-author` × N) — ALL in ONE message.
9. `Agent × M` spawn cohort — rank-zero features only. Features at the same DAG rank spawn in parallel; per-service singleton touches serialize within the rank when paths intersect (main agent enforces by NOT batching parallel spawns on intersecting `service_singletons_touched` paths).
10. Subagents author. `TaskUpdate` rolls per (agent, feature_id, task_id).
11. `TaskList` verify rank-zero completion. Next DAG rank spawns when its parents reach `verdict: PASS` (Phase 4 TSR-locked).

**Phase 4 — Convergence.**

12. Per-feature `@test-runner` → `@evaluator` ‖ `@reviewer` → `<feature-id>-TSR.md`. Independent verdicts; per-feature TSR locks unblock dependents.
13. Iterate ranks until all features pass or DEADLOCK.

## Artifacts produced

```
services/<service_name>/src/main/<lang>/...                       (multi-feature impl)
services/<service_name>/src/test/<lang>/...
docs/<service_name>/<service_name>-openapi.yaml                   (append-endpoints per feature)
docs/<service_name>/diagrams/c4-component.puml                    (append-components per feature)
docs/<service_name>/diagrams/erd-logical.puml                     (append-entities per feature)
docs/<service_name>/diagrams/state-machine.puml                   (append-states per feature)
docs/<service_name>/diagrams/usecase.puml                         (append-usecases per feature)
docs/<service_name>/<feature-id-1>/<feature-id-1>-TSR.md
docs/<service_name>/<feature-id-2>/<feature-id-2>-TSR.md
...
.orchestra/<service_name>/pipeline/<feature-id-N>/...
.orchestra/plans/<session-id>/run-plan.md
.orchestra/plans/<session-id>/agent-tasks.md
```

Spec artifacts (PRD/FRS/TDD/per-feature sd) unchanged — already locked from prior runs.

## Edge cases

- **One feature's `@test-runner` fails.** Its TSR locks `verdict: FAIL`. Dependents stay blocked. Other independent features proceed unaffected.
- **`depends_on:` cycle in `features.yaml`.** `upsert_features_yaml` rejects at write-time. Cycle in existing file → halt with ESCALATE writer.
- **Cross-feature shared code conflict.** Two parallel `@backend` spawns target the same file. Plan author MUST serialize: same authoring agent on intersecting paths means the agent runs sequentially across those features. Detected pre-Phase-3 via path-intersection check in plan `## Agent assignments`.
- **`supersedes:` chain.** Feature N supersedes feature N-1. Predecessor `status:` stays user-controlled (no auto-flip); successor authors fresh artifacts.
- **Plan rejection on multi-feature scope.** Phase 2c revision loop. Reject usually narrows: "drop feature X" / "re-order Y before Z" / "missed feature W in DAG". Main agent self-explores `features.yaml`.

## Cross-references

- `commands/orchestra.md` — Phase 3 Swarm (parallel-spawn discipline, single-writer serialization); Folder layout (`.orchestra/plans/<session-id>/`).
- `schemas/features.schema.json` — DAG manifest shape.
