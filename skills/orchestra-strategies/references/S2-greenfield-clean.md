# S2 — greenfield, clean repo

## Trigger

- `$1 = "spec-to-code"`.
- Preflight `mode: greenfield`, `docs/` empty (no `<feature-id>/` directories under any service), `src/**` empty (no source files matching `primary_language` extensions).
- Optional tail: `$ARGUMENTS` post-`spec-to-code` seeds feature-slug + PRD title.

## Trace

**Phase 1 — Discovery.**

1. Read `<orchestra-preflight>` block; classify entry shape from `$1` × `mode: greenfield`.
2. Walk preflight `missing_fields` (bootstrap). Surface `AskUserQuestion` per field in declaration order. Persist via `mcp__orchestra-utils__write_system_yaml` + `mcp__orchestra-utils__upsert_local_yaml` + `mcp__orchestra-utils__claude_md`.
3. Feature-id mint. Read `.orchestra/<service_name>/features.yaml` (init `{ features: [] }` if absent). Compute `<service-prefix>-<NNN>-<slug>` (e.g., `order-001-checkout`). User supplies slug or main agent lifts from `$ARGUMENTS`.
4. No `@explorer` spawn on greenfield. Phase 1 closes after bootstrap.

**Phase 2a — Author (Turn 1, ends with ExitPlanMode).**

5. Main agent calls `EnterPlanMode`. Tool returns; plan-mode UI engages.
6. Compose plan body inline. `## Features` lists the single feature with `classifier: business`, `depends_on: []`. `## Agent assignments` lifts the greenfield single-feature subset from the canonical ownership matrix in `commands/orchestra.md` Phase 2a: per-feature `@product`-authored PRD, `@analyst`-authored FRS, `@architect`-authored TDD + openapi + per-feature `sd-*.puml` + per-service singleton seeds (`<service>-openapi.yaml`, `c4-component.puml`, `erd-logical.puml`, `state-machine.puml`, `<service>-BR-AC.md`), `@analyst`-authored `usecase.puml`, `@backend`-authored impl + unit tests, `@frontend`-authored UI (only when UI layer present), `@test-author`-authored TSR `S-TEST-001` plan rows. `## Risks + decisions` lists preflight constraints + revision cap (3) + auto-mode flip on approval.
7. Call `ExitPlanMode({plan: <body>})`. Turn ends.

═══ Turn boundary — PlanMode UI ═══

**Phase 2b — Lock + Phase 3 — Swarm (Turn 2 on approval).**

8. On approve, main agent Writes `.orchestra/plans/<session-id>/run-plan.md` with `status: locked`, `run_plan_status: approved`, full plan body.
9. Emit `TaskCreate × N` in ONE message — one per `## Agent assignments` row. Each carries: `agent`, `feature_id`, `artifact_path`, `status: pending`.
10. Emit `Agent × N` in ONE message — one per swarm participant. Each spawn prompt: `phase: spec-draft`, `feature_id`, `task_id`, owned-path list. Single-writer surface ordering (sequential dispatch when paths intersect) enforced by main agent.
11. Subagents execute in parallel. Each `TaskUpdate(status: in_progress)` at start, authors assigned artifact(s), `TaskUpdate(status: completed)` at end.
12. `SubagentStop` hook projects task ledger rows to `.orchestra/plans/<session-id>/agent-tasks.md`.
13. Main agent reads `TaskList` to verify all Phase-3 tasks `completed` before advancing.

**On reject (Phase 2c revision loop).** ≤3 cycles per dispatcher. Main agent reads reject comment, targets `Read`/`Grep` on hinted scope, appends `.orchestra/plans/<session-id>/discovery/supplemental-cycle-<N>.md`, recomposes plan body inline, re-submits via `ExitPlanMode`. 4th cycle writes `run-plan-DEADLOCK.md` and ends turn.

**Phase 4 — Convergence (Turn 3+).**

14. Main agent spawns `@test-runner` (sequential — needs all impl present).
15. On `@test-runner` return, spawn `@evaluator` ‖ `@reviewer` in ONE message.
16. TSR `S-TEST-001` / `S-EVAL-001` / `S-REVIEW-001` sections lock. Terminal state.

## Artifacts produced

```
.orchestra/system.yaml
.orchestra/<service_name>/local.yaml
.orchestra/<service_name>/features.yaml
.orchestra/<service_name>/pipeline/<feature-id>/...
.orchestra/plans/<session-id>/run-plan.md
.orchestra/plans/<session-id>/agent-tasks.md
docs/README.md
docs/<service_name>/<service_name>-openapi.yaml                  (or -asyncapi.yaml)
docs/<service_name>/<service_name>-BR-AC.md
docs/<service_name>/diagrams/c4-component.puml + erd-logical.puml + state-machine.puml + usecase.puml + *.svg
docs/<service_name>/<feature-id>/<feature-id>-PRD.md
docs/<service_name>/<feature-id>/<feature-id>-FRS.md
docs/<service_name>/<feature-id>/<feature-id>-TDD.md
docs/<service_name>/<feature-id>/<feature-id>-TSR.md
docs/<service_name>/<feature-id>/diagrams/<feature-id>-sd-*.puml + *.svg
docs/adr/ADR-<NNNN>-*.md                                         (only when ADR-worthy decision surfaces)
services/<service_name>/src/main/<lang>/...
services/<service_name>/src/test/<lang>/...
web/src/...                                                      (only when UI layer present)
```

## Edge cases

- **Single-repo project**: `scope_level` auto-set to `per-service`; workspace `SAD.md` + `business-invariants.md` + workspace ADRs skipped (those are multi-repo system-wide concerns). Per-service artifacts authored as listed.
- **UI-less project**: `@frontend` omitted from Phase 3 swarm (preflight detects absence of UI framework in `local.yaml.framework`).
- **`migration_tool: none`**: persistence-bearing TDD section authored without migration script; `primary_database` predicate fails at bootstrap, prompt skipped.
- **ADR surface during Phase 3.** `@architect` authors ADR(s) as decisions surface; not enumerated in upfront `## Agent assignments`. Plan `## Risks + decisions` flags the gap-resolution surface.
- **Plan-mode rejection.** Phase 2c revision loop applies. Reject feedback usually names one missed slot or wrong assignment; targeted `Read` fills the gap.
- **Silent-approval bug shape (anthropics/claude-code#50110).** `stop-plan-verify` hook blocks the turn if `ExitPlanMode` is followed by `Task`/`Agent` in the SAME turn. Phase 2b + Phase 3 always fire in the NEXT turn after approval.

## Cross-references

- `agents/product.md`, `agents/analyst.md`, `agents/architect.md`, `agents/backend.md`, `agents/frontend.md`, `agents/test-author.md`, `agents/test-runner.md`, `agents/evaluator.md`, `agents/reviewer.md` — per-role authoring contracts.
- `schemas/pipeline-artifact.schema.md` — frontmatter shape for every artifact above.
- `schemas/features.schema.json` — `features.yaml` manifest shape.
- `schemas/run-plan.schema.md` — run-plan body shape.
- `commands/orchestra.md` — canonical 4-phase dispatch contract.
