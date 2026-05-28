---
strategy: S5
entry: /orchestra code-to-spec
precondition: brownfield, no second token (auto-scope)
---

# S5 — brownfield, auto-scope

**Trigger.** `$1 = "code-to-spec"`, no second token; preflight `mode: brownfield`; `system.yaml.workspace_kind` set (or bootstrap sets it).

**Trace.** Scope-resolver only. Heavy lifting in S6 or S7.

1. Resolve scope: `single-repo` → `scope_level: per-service` (auto; hand off to S7). `multi-repo` → `scope_level: system-wide` (hand off to S6).
2. Bootstrap walks `workspace_kind` / `service_name` / `scope_level` / `source_path` (per-service only).
3. Persist scope to `.orchestra/<service_name>/local.yaml`.
4. Hand off to resolved sub-strategy's 4-phase trace.

**Artifacts produced.** Same as resolved sub-strategy (S6 or S7).

**Edge cases.**

- `workspace_kind` ambiguous: bootstrap `AskUserQuestion(single-repo | multi-repo)`.
- `single-repo` with multiple build manifests at repo root: heuristic surfaces; bootstrap prompts for primary `service_name`.
- User intended `system` but omitted token on multi-repo: S5 auto-routes to S6 — correct.
- User intended `per-service` on multi-repo but omitted `service:<name>`: S5 auto-routes to S6. To narrow, re-invoke with explicit `service:<name> --source=<path>`.
