---
strategy: S7
entry: /orchestra code-to-spec service:<name> --source=<path>
precondition: brownfield, per-service reverse
---

# S7 — brownfield, per-service reverse

**Trigger.** `$1 = "code-to-spec"`, second token `service:<name>`, third token `--source=<path>`; preflight `mode: brownfield`. Forces `scope_level: per-service`.

**Trace.**

1. Phase 1 — Validate `--source=<path>` (required; absolute or `cwd`-relative; leading `@` stripped; reject empty / non-existent dir). Validate `service:<name>` (reject `/`, `\`, whitespace, `..`, reserved). Bootstrap persists `scope_level: per-service` + `source_path` + `service_name`. Auto-promote check: if `workspace_kind: multi-repo` AND workspace `docs/SAD.md` absent → run S6 first (system-wide), then narrow. Spawn `@explorer` (single spawn — one service). Read discovery report.
2. Phase 2a — `EnterPlanMode`. Plan narrowed to one service. `## Features` lists features discovered for this service. `## Agent assignments`: per-service singletons (no workspace SAD/ADRs/business-invariants) + per-feature reverse-pass spec. `## Risks + decisions` surfaces single-service scope + auto-promote flag if it fired. `ExitPlanMode`.
3. Phase 2b + 3 — Write `run-plan.md` locked; `TaskCreate × N`; `Agent × N` spawn cohort. Per-service singletons first (single-writer sequential). Per-feature reverse-pass DAG-rank-batched; sequential `@architect` → `@analyst` → `@product` within feature.
4. Phase 4 — Trivially closes (reverse-pass no source). Forward-chain follow-up as separate `/orchestra spec-to-code` invocation against the locked baseline.

**Artifacts produced.**

```
.orchestra/plans/<session-id>/discovery/<service>.md
.orchestra/plans/<session-id>/{run-plan.md, agent-tasks.md}
docs/<service>/{<service>-BR-AC.md, <service>-openapi.yaml}       (or -asyncapi/-clientapi)
docs/<service>/diagrams/{c4-component,erd-logical,state-machine,usecase}.puml + *.svg
docs/<service>/<feature-id>/{<feature-id>-PRD.md, -FRS.md, -TDD.md}
docs/<service>/<feature-id>/diagrams/<feature-id>-sd-*.puml
.orchestra/<service>/{features.yaml, local.yaml}                  (local.yaml carries source_path)
```

No workspace-level SAD, ADRs, business-invariants — those are S6 territory.

**Edge cases.**

- `--source=<path>` missing: halt with `[orchestra] --source=<path> required for code-to-spec service:<name>`. No spawn.
- `--source=<path>` outside `<cwd>`: allowed (absolute paths); `@explorer` and downstream readers consume from resolved root.
- Per-service run on multi-repo without workspace SAD: auto-promote fires at Phase 1; full S6 first, then narrow. Document in plan `## Risks + decisions`.
- Single-repo with `service:<name>` token: allowed; treats single service as named. `--source` typically `./` or `./services/<name>/`.
