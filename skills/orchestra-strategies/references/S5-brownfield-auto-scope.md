# S5 — brownfield, auto-scope

## Trigger

- `$1 = "code-to-spec"`, no second token.
- Preflight `mode: brownfield` (`src/**` exists).
- `system.yaml.workspace_kind` is set (or bootstrap will set it).

## Trace

1. **Resolve scope from `workspace_kind`.**
   - `single-repo` → `scope_level: per-service` (auto; same as S7 minus explicit `service:<name>`).
   - `multi-repo` → `scope_level: system-wide` (same as S6).
2. **Bootstrap.** Walk preflight `missing_fields`. For brownfield, the relevant fields are `workspace_kind`, `service_name`, `scope_level`, `source_path` (if `per-service`).
3. **Persist** scope decision to `.orchestra/<service_name>/local.yaml`.
4. **Hand off to S6 or S7** trace (this strategy is a scope-resolver; the heavy lifting is in the scope-narrowed strategy).

## Artifacts produced

Same as the resolved sub-strategy (S6 or S7).

## Edge cases

- **`workspace_kind` ambiguous.** Bootstrap surfaces `AskUserQuestion(single-repo | multi-repo)`. Persist user choice.
- **`single-repo` workspace with multiple build manifests at repo root.** Heuristic detects → bootstrap prompts for primary `service_name`. Persist; treat as the canonical service for this run.
- **User intended `system` but omitted token on a multi-repo workspace.** S5 auto-routes to S6 — correct outcome. No prompt needed.
- **User intended `per-service` on multi-repo but omitted `service:<name>`.** S5 auto-routes to S6 (system-wide). To narrow, user must re-invoke with explicit `service:<name> --source=<path>`.

## Cross-references

- `references/S6-brownfield-system-wide.md` — when scope resolves to system-wide.
- `references/S7-brownfield-per-service.md` — when scope resolves to per-service.
- `commands/orchestra.md` — Bootstrap predicates for workspace_kind / service_name / scope_level.
