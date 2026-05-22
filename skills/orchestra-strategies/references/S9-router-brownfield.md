# S9 — `<intent>` router, brownfield

## Trigger

- `$1` is NOT `spec-to-code` / `code-to-spec` / empty.
- Preflight `mode: brownfield` (`src/**` present).
- `$ARGUMENTS` = freeform intent text.

## Trace

1. **Workspace-kind-adaptive permission gate.** Single `AskUserQuestion`:
   - Multi-repo: "Reverse-pass first (document existing surface across services), then forward-chain against the locked baseline?"
   - Single-repo: "Reverse-pass first (document existing service), then forward-chain?"
   - Answer `no` → abort with `[orchestra] reverse-then-forward declined; re-invoke with /orchestra spec-to-code to skip reverse`.
   - Answer `yes` → continue.
2. **Reverse phase routing.**
   - `workspace_kind: multi-repo` → route to S6 (system-wide reverse).
   - `workspace_kind: single-repo` → route to S7 (per-service reverse).
   - If user's intent names ONE service → narrow to S7 with that service, prompt for `--source=<path>` if not cached.
3. **Reverse-pass executes.** Authors SAD (multi-repo) / per-service BR-AC + per-feature TDD/FRS/PRD as appropriate. All artifacts lock.
4. **Pause for review.** Main thread emits status line + `AskUserQuestion(continue | halt)` after reverse-pass completes.
5. **Post-reverse intent confirmation — 3× `AskUserQuestion`.**
   - Q1 — restate intent against the now-locked baseline. SEEDS from original `$ARGUMENTS`.
   - Q2 — scope: which feature(s) does this intent touch? New feature or extension?
   - Q3 — constraints, autonomy, parallel work.
6. **Confidence floor cleared.** Downstream observers see `intent_floor: cleared`.
7. **Tech-vs-business classifier.** Same as S8.
8. **Forward routing.** Route to S2 / S3 / S4 per `docs/` state of the targeted feature(s).

## Artifacts produced

Reverse-pass artifacts (per S6 or S7) + forward-chain artifacts (per S2 / S3 / S4 / tech path). Effectively a two-strategy session.

## Edge cases

- **User declines reverse-pass.** Abort. Document via `[orchestra] reverse-then-forward declined`. User can re-invoke `/orchestra spec-to-code <intent>` to skip reverse and risk authoring against an undocumented baseline.
- **Reverse-pass surfaces source contradictions.** `@architect` writes DEADLOCK artifact. Pause; user resolves; re-invoke from the pause point.
- **Intent maps to a feature absent from reverse-derived `features.yaml`.** Q2 prompts: "Add as new feature, or did reverse-pass miss it?" If miss → re-run S6/S7 narrowed; if new → mint new `<feature-id>` and proceed to S2.
- **Forward chain encounters `ratify-spec` divergence on a reverse-authored locked artifact.** Use `mcp__orchestra-utils__amend_locked_artifact` + `relock_artifact`. The fact that the artifact came from reverse-pass does NOT exempt it from the `changelog-append-only` audit trail.
- **Mid-run external-state change** (e.g., DB schema applied after TDD locked). Re-spawn `@lead` for focused schema-diff pass against `S-DATA-001` BEFORE resuming.

## Cross-references

- `references/S6-brownfield-system-wide.md`, `references/S7-brownfield-per-service.md` — reverse-phase routing targets.
- `references/S2-greenfield-clean.md`, `references/S3-greenfield-partial.md`, `references/S4-greenfield-multifeature.md` — forward-phase routing targets.
- `commands/orchestra.md` — ratify-spec on locked artifacts (divergence resolution on reverse-authored artifacts).
- `commands/orchestra.md` — Run-plan + approval gate / Mid-run external-state change.
