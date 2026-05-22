# S4 — greenfield, N locked features, empty src

## Trigger

- `$1 = "spec-to-code"`.
- `.orchestra/<service_name>/features.yaml` lists ≥2 features all with locked `<feature-id>-PRD.md` / `-FRS.md` / `-TDD.md` / contracts.
- `services/<service_name>/src/**` empty (or no impl yet for any feature).

## Trace

1. **Enumerate features.** Read `features.yaml`. For each `features[]` entry, check `<feature-id>-TSR.md` verdict — features with `verdict: PASS` skip. Build candidate set = features lacking TSR verdict.
2. **DAG check.** Resolve `depends_on:` edges. Features with all dependencies in `verdict: PASS` are spawnable in this round. Defer dependents.
3. **Single-message parallel spawn.** For each spawnable feature, emit one `@lead` `Agent({...})` call (`task: run-plan-author`, `chain: forward-chain`, feature-id). All in ONE assistant message — cohort spawn discipline.
4. **Per-feature gate.** Each `@lead` writes its own `run-plan-<feature-id>.md` draft (or the shared `run-plan.md` `S-FEATURES-001` row for this feature). Main thread runs run-plan-approval-gate per feature (sequential — single-writer surface).
5. **Per-feature fan-out.** Once locked, spawn `@backend` ‖ `@frontend` ‖ `@test-author` per feature. Spawns across features run in same message (cohort = ALL implementers across ALL approved features). Single-writer surfaces (SAD `S-CONTAINERS-001`, workspace `business-invariants.md`) serialize internally.
6. **Per-feature converge.** Each feature's `@test-runner` → `@evaluator` + `@reviewer` → `<feature-id>-TSR.md`. Independent verdicts.
7. **Next DAG layer.** Features blocked on dependencies become spawnable when their parent's TSR locks `verdict: PASS`. Repeat steps 3-6.

## Artifacts produced

```
services/<service_name>/src/main/<lang>/...                         (multi-feature impl)
services/<service_name>/src/test/<lang>/...
docs/<service_name>/<feature-id-1>/<feature-id-1>-TSR.md
docs/<service_name>/<feature-id-2>/<feature-id-2>-TSR.md
...
.orchestra/<service_name>/pipeline/<feature-id-N>/...
```

Spec artifacts (PRD/FRS/TDD/openapi) unchanged — already locked from prior runs.

## Edge cases

- **One feature's `@test-runner` fails.** Its TSR locks `verdict: FAIL`. Dependents stay blocked. Other independent features proceed unaffected.
- **`depends_on:` cycle in `features.yaml`.** `upsert_features_yaml` rejects at write-time. If somehow cycle exists, `@lead` halts with ESCALATE writer.
- **Cross-feature shared code conflict.** Two parallel `@backend` spawns target the same file. Single-writer surface heuristics on `mcp__orchestra-utils__upsert_local_yaml` + write-time `pre-write-check` mediate. Conflicting writes surface as `cohort.spawn.conflict` warnings in `metrics-collector`.
- **`supersedes:` chain.** Feature N supersedes feature N-1. Predecessor `status:` stays user-controlled (no auto-flip); successor authors fresh artifacts.

## Cross-references

- `commands/orchestra.md` — Inter-feature parallel spawn (S4).
- `commands/orchestra.md` — Parallel-spawn discipline (cohort emission rule: ONE message, N tool-use blocks).
- `schemas/features.schema.json` — DAG manifest shape.
- `agents/lead.md` — multi-feature run-plan authoring.
