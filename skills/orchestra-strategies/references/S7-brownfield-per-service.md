# S7 — brownfield, per-service reverse

## Trigger

- `$1 = "code-to-spec"`, second token `service:<name>`, third token `--source=<path>`.
- Preflight `mode: brownfield`.
- Optional preconditions: `workspace_kind` either; this strategy forces `scope_level: per-service`.

## Trace

**Phase 1 — Discovery.**

1. Validate `--source=<path>`. REQUIRED on per-service path. Absolute or `cwd`-relative; leading `@` stripped. Reject empty; require directory exists. Persist to `local.yaml.source_path`.
2. Validate `service:<name>`. Reject names containing `/`, `\`, whitespace, `..`, or reserved (`system`, `metrics`, `inventory`).
3. Bootstrap. Persist `scope_level: per-service` + `source_path` + `service_name` to `local.yaml`. Skip workspace-level fields.
4. **Auto-promote check.** If `workspace_kind: multi-repo` AND workspace `docs/SAD.md` is absent → auto-promote: run S6 first (system-wide), then narrow. Otherwise proceed.
5. Spawn `@explorer` (single spawn — one service). Reads `src/**` from `source_path`; authors `.orchestra/plans/<session-id>/discovery/<service>.md`.
6. Read discovery report.

**Phase 2a — Author.**

7. Main agent `EnterPlanMode`.
8. Compose plan body narrowed to one service. `## Features` lists features discovered for this service. `## Agent assignments`:
   - Per-service singletons only (no workspace SAD / ADRs / business-invariants).
   - Per-feature reverse-pass spec: TDD → FRS → PRD per feature.
9. `## Risks + decisions` surfaces single-service scope + auto-promote flag if it fired.
10. `ExitPlanMode`.

═══ Turn boundary ═══

**Phase 2b — Lock + Phase 3 — Swarm.**

11. On approve, Write `run-plan.md` locked.
12. `TaskCreate × N` in ONE message.
13. `Agent × N` spawn cohort. Per-service singletons first (single-writer, sequential). Per-feature reverse-pass spec DAG-rank-batched; sequential `@architect` → `@analyst` → `@product` within feature.

**Phase 4 — Convergence.**

14. Reverse-pass produces no source impl. Phase 4 trivially completes when last `@product` returns. Forward-chain follow-up runs as a separate `/orchestra spec-to-code` invocation against the locked baseline.

## Artifacts produced

```
.orchestra/plans/<session-id>/discovery/<service>.md
.orchestra/plans/<session-id>/run-plan.md
.orchestra/plans/<session-id>/agent-tasks.md
docs/<service>/<service>-BR-AC.md
docs/<service>/<service>-openapi.yaml                             (or -asyncapi.yaml / -clientapi.yaml)
docs/<service>/diagrams/c4-component.puml + erd-logical.puml + state-machine.puml + usecase.puml + *.svg
docs/<service>/<feature-id>/<feature-id>-PRD.md
docs/<service>/<feature-id>/<feature-id>-FRS.md
docs/<service>/<feature-id>/<feature-id>-TDD.md
docs/<service>/<feature-id>/diagrams/<feature-id>-sd-*.puml
.orchestra/<service>/features.yaml
.orchestra/<service>/local.yaml                                   (with source_path persisted)
```

NO workspace-level SAD, ADRs, business-invariants — those are S6 territory.

## Edge cases

- **`--source=<path>` missing.** Halt with `[orchestra] --source=<path> required for code-to-spec service:<name>`. No spawn.
- **`--source=<path>` points outside `<cwd>`.** Allowed (absolute paths supported); `@explorer` and downstream readers consume from the resolved root.
- **Per-service run on multi-repo without workspace SAD.** Auto-promote fires at step 4: full S6 first, then narrow. Document the auto-promotion in plan `## Risks + decisions`.
- **Single-repo project with `service:<name>` token.** Allowed; treats the single service as the named service. `--source` typically `./` or `./services/<name>/`.

## Cross-references

- `references/S6-brownfield-system-wide.md` — when auto-promote fires.
- `agents/explorer.md` — Phase 1 source-survey authoring contract.
- `agents/architect.md` — Reverse-pass authoring contract.
- `commands/orchestra.md` — Bootstrap predicate for source_path; Phase 1 brownfield discovery (`@explorer` fan-out).
- `schemas/pipeline-artifact.schema.md` — artifact frontmatter shape.
