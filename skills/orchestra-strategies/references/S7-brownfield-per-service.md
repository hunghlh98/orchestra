# S7 — brownfield, per-service reverse

## Trigger

- `$1 = "code-to-spec"`, second token `service:<name>`, third token `--source=<path>`.
- Preflight `mode: brownfield`.
- Optional preconditions: `workspace_kind` either; this strategy forces `scope_level: per-service`.

## Trace

1. **Validate `--source=<path>`.** REQUIRED on per-service path. Absolute or `cwd`-relative; leading `@` stripped. Reject empty; require directory exists. Persist to `local.yaml.source_path`.
2. **Validate `service:<name>`.** Reject names with `/`, `\`, whitespace, `..`, or reserved (`system`, `metrics`, `inventory`).
3. **Bootstrap.** Persist `scope_level: per-service` + `source_path` + `service_name` to `local.yaml`. Skip workspace-level fields.
4. **Skip architecture layer.** No SAD authoring. No workspace `business-invariants.md`. No system-wide ADRs.
5. **Auto-promote check.** If `workspace_kind: multi-repo` AND workspace `docs/SAD.md` is absent → auto-promote: run S6 first (system-wide), then narrow to this service. Otherwise proceed.
6. **Run-plan author.** Spawn `@lead` `task: run-plan-author`, `chain: reverse-pass`. Per-service `run-plan.md` listing features for THIS service only.
7. **Run-plan approval gate.** `EnterPlanMode` / `ExitPlanMode`.
8. **Phase A — service-shell author.** Spawn `@architect` `task: reverse-pass`, `pass: service-shell-author`. Writes `docs/<service>/<service>-BR-AC.md` + `docs/<service>/diagrams/c4-component.puml` + per-service ERD.
9. **Phase B — per-feature DAG-rank fan-out.** Same as S6 phase B but scoped to this service.
10. **Reverse gates** (TDD → FRS → PRD per feature, gated each handoff).
11. **`features.yaml` written** by `@product` at end.

## Artifacts produced

```
docs/<service>/<service>-BR-AC.md
docs/<service>/diagrams/c4-component.puml (+ c4-code.puml when non-trivial)
docs/<service>/diagrams/erd-logical.puml
docs/<service>/<feature-id>/<feature-id>-PRD.md
docs/<service>/<feature-id>/<feature-id>-FRS.md
docs/<service>/<feature-id>/<feature-id>-TDD.md
docs/<service>/<feature-id>/<feature-id>-openapi.yaml                (or -asyncapi/clientapi.yaml)
docs/<service>/<feature-id>/diagrams/*.puml
.orchestra/<service>/features.yaml
.orchestra/<service>/local.yaml                                      (with source_path persisted)
```

NO workspace-level SAD, ADRs, business-invariants — those are S6 territory.

## Edge cases

- **`--source=<path>` missing.** Halt with `[orchestra] --source=<path> required for code-to-spec service:<name>`. No spawn.
- **`--source=<path>` points outside `<cwd>`.** Allowed (absolute paths supported); `@architect` reads from the resolved root.
- **Per-service run on multi-repo without workspace SAD.** Auto-promote: full S6 first, then narrow. Document the auto-promotion in run-plan `S-CONTEXT-001`.
- **Single-repo project with `service:<name>` token.** Allowed; treats the single service as the named service. `--source` typically `./` or `./services/<name>/`.

## Cross-references

- `references/S6-brownfield-system-wide.md` — when auto-promote fires.
- `agents/architect.md` — Reverse-pass discipline (same two-phase narrowing, scoped narrower).
- `commands/orchestra.md` — Bootstrap predicate for source_path.
- `schemas/pipeline-artifact.schema.md` — artifact frontmatter shape.
