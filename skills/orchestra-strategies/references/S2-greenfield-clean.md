# S2 — greenfield, clean repo

## Trigger

- `$1 = "spec-to-code"`.
- Preflight `mode: greenfield`, `docs/` empty (no `<feature-id>/` directories under any service), `src/**` empty (no source files matching `primary_language` extensions).
- Optional tail: `$ARGUMENTS` post-`spec-to-code` seeds feature-slug + PRD title.

## Trace

1. **Bootstrap.** Walk preflight `missing_fields`. Surface `AskUserQuestion` per field in declaration order. Persist via `mcp__orchestra-utils__write_system_yaml` + `mcp__orchestra-utils__upsert_local_yaml` + `mcp__orchestra-utils__claude_md`.
2. **Feature-id mint.** Read `.orchestra/<service_name>/features.yaml` (init `{ features: [] }` if absent). Compute `<service-prefix>-<NNN>-<slug>` (e.g., `order-001-checkout`).
3. **Gate 0 — tech-business-classifier-gate.** Skipped (entry shape `spec-to-code` implies business path).
4. **Spawn `@product`** with `phase: spec-draft`, feature-id, PRD title seed. Agent writes `docs/<service_name>/<feature-id>/<feature-id>-PRD.md` `status: locked` + `mcp__orchestra-utils__upsert_features_yaml` entry. End turn.
5. **Gate 1 — prd-review-gate.** Main thread Reads PRD. `AskUserQuestion(approve | re-author | halt)`. Approve → next.
6. **Spawn `@analyst`** with `phase: spec-draft`, FRS task. Writes `<feature-id>-FRS.md` locked. End turn.
7. **Gate 2 — frs-review-gate.**
8. **Spawn `@architect`** with `phase: spec-draft`, TDD + openapi/asyncapi task. Writes TDD + contracts. Locks. Optionally writes ADR(s) when non-obvious system-affecting decision surfaces.
9. **Gate 3 — tdd-impl-readiness-gate.**
10. **Spawn `@lead`** with `task: run-plan-author`, `chain: forward-chain`. Writes `run-plan.md` `status: draft`.
11. **Gate 4 — run-plan-approval-gate.** Forward-chain → `AskUserQuestion(approve | revise)`. Approve → flip `auto_mode: true` in `local.yaml`, lock run-plan.
12. **Parallel fan-out.** ONE message spawning `@backend` ‖ `@frontend` (if UI layer) ‖ `@test-author`. Each writes under `<context_path>/services/<service_name>/` (impl) and `docs/<service_name>/<feature-id>/<feature-id>-TSR.md` `S-TEST-001` (test plan).
13. **Converge.** `@test-runner` reads `src/main/**`, augments tests, runs suite, fills `S-TEST-001` evidence + locks. End turn.
14. **TSR verdict.** Spawn `@evaluator` (writes `S-EVAL-001`) + `@reviewer` (writes `S-REVIEW-001`) in one message. Final TSR locked.

## Artifacts produced

```
.orchestra/system.yaml
.orchestra/<service_name>/local.yaml
.orchestra/<service_name>/features.yaml
.orchestra/<service_name>/pipeline/<feature-id>/...
docs/README.md
docs/<service_name>/<feature-id>/<feature-id>-PRD.md
docs/<service_name>/<feature-id>/<feature-id>-FRS.md
docs/<service_name>/<feature-id>/<feature-id>-TDD.md
docs/<service_name>/<feature-id>/<feature-id>-openapi.yaml         (or -asyncapi.yaml)
docs/<service_name>/<feature-id>/<feature-id>-TSR.md
docs/<service_name>/<feature-id>/diagrams/*.puml + *.svg
docs/adr/ADR-<NNNN>-*.md                                            (only if ADR surfaced)
services/<service_name>/src/main/<lang>/...
services/<service_name>/src/test/<lang>/...
```

## Edge cases

- **Single-repo project**: `scope_level` auto-set to `per-service`; SAD authoring skipped (workspace SAD is multi-repo concern). `@architect` writes TDD + openapi only.
- **UI-less project**: `@frontend` skipped at fan-out (preflight detects absence of UI framework in `local.yaml.framework`).
- **`migration_tool: none`**: persistence-bearing TDD section authored without migration script; `primary_database` predicate fails, prompt skipped at bootstrap.
- **Gate rejection at any layer**: upstream artifact `locked → draft` flip + re-spawn with `Feedback:` block. Three consecutive rejects → DEADLOCK writer.

## Cross-references

- `agents/product.md`, `agents/analyst.md`, `agents/architect.md`, `agents/lead.md`, `agents/backend.md`, `agents/frontend.md`, `agents/test-author.md`, `agents/test-runner.md`, `agents/evaluator.md`, `agents/reviewer.md` — per-role authoring contracts.
- `schemas/pipeline-artifact.schema.md` — frontmatter shape for every artifact above.
- `schemas/features.schema.json` — `features.yaml` manifest shape.
- `schemas/run-plan.schema.md` — run-plan shape.
