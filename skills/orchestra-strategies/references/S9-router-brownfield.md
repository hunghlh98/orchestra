# S9 — `<intent>` router, brownfield

## Trigger

- `$1` is NOT `spec-to-code` / `code-to-spec` / empty.
- Preflight `mode: brownfield` (`src/**` present).
- `$ARGUMENTS` = freeform intent text.

## Trace

S9 is a two-PlanMode-submission session: reverse-pass first, forward-chain second, both under the same `<session-id>`.

**Phase 1 — Discovery, reverse half.**

1. **Workspace-kind-adaptive permission gate.** Single `AskUserQuestion`:
   - Multi-repo: "Reverse-pass first (document existing surface across services), then forward-chain against the locked baseline?"
   - Single-repo: "Reverse-pass first (document existing service), then forward-chain?"
   - Answer `no` → abort with `[orchestra] reverse-then-forward declined; re-invoke with /orchestra spec-to-code to skip reverse`.
   - Answer `yes` → continue.
2. **Reverse phase routing.**
   - `workspace_kind: multi-repo` → S6 trace (system-wide reverse).
   - `workspace_kind: single-repo` → S7 trace (per-service reverse).
   - If user's intent names ONE service → narrow to S7 with that service, prompt for `--source=<path>` if not cached.

**Phases 2a-4 of reverse half** — per the resolved S6 or S7 trace. PlanMode submission #1 covers the reverse-pass plan.

3. After reverse-pass completes (Phase 4 trivially closes), main agent emits status line + `AskUserQuestion(continue | halt)` to pause.

**Phase 1 — Discovery, forward half.**

4. Post-reverse confirmation — three `AskUserQuestion` rounds against the now-locked baseline.
   - Q1 — restate intent against locked baseline. SEEDS from original `$ARGUMENTS`.
   - Q2 — scope: which feature(s) does this intent touch? New or extension?
   - Q3 — constraints, autonomy, parallel work.
5. Confidence floor cleared. Downstream observers see `intent_floor: cleared`.
6. **Tech-vs-business classifier.** Same as S8.
7. **Forward routing.** S2 / S3 / S4 trace per `docs/` state of the targeted feature(s).

**Phases 2a-4 of forward half** — per the resolved sub-strategy. PlanMode submission #2 covers the forward-chain plan. Both submissions run under the same `<session-id>` (same `.orchestra/plans/<session-id>/` dir; reverse-pass artifacts under `discovery/` carry into forward-half Phase 2a as plan-author inputs).

## Artifacts produced

Reverse-pass artifacts (per S6 or S7) + forward-chain artifacts (per S2 / S3 / S4 / tech path). Effectively two PlanMode submissions per session.

## Edge cases

- **User declines reverse-pass.** Abort. Document via `[orchestra] reverse-then-forward declined`. User can re-invoke `/orchestra spec-to-code <intent>` to skip reverse and risk authoring against an undocumented baseline.
- **Reverse-pass surfaces source contradictions.** `@architect` writes DEADLOCK artifact. Pause; user resolves; re-invoke from the pause point under same session-id.
- **Intent maps to a feature absent from reverse-derived `features.yaml`.** Q2 prompts: "Add as new feature, or did reverse-pass miss it?" If miss → narrow re-run of S6/S7 against the missed service; if new → mint new `<feature-id>` and proceed to forward-chain plan.
- **Forward chain encounters `ratify-spec` divergence on a reverse-authored locked artifact.** Use `mcp__orchestra-utils__amend_locked_artifact` + `relock_artifact`. The fact that the artifact came from reverse-pass does NOT exempt it from the `changelog-append-only` audit trail.
- **Mid-run external-state change** (e.g., DB schema applied after reverse-pass TDD locked). Main agent self-explores via Phase 2c-style targeted reads before forward-chain Phase 2a entry.

## Cross-references

- `references/S6-brownfield-system-wide.md`, `references/S7-brownfield-per-service.md` — reverse-phase routing targets.
- `references/S2-greenfield-clean.md`, `references/S3-greenfield-partial.md`, `references/S4-greenfield-multifeature.md` — forward-phase routing targets.
- `commands/orchestra.md` — Ratify-spec on locked artifacts; Folder layout (`<session-id>/` shared across reverse + forward).
