---
strategy: S9
entry: /orchestra <intent>
precondition: brownfield router (src/** present)
---

# S9 — `<intent>` router, brownfield

**Trigger.** `$1` NOT one of `spec-to-code` / `code-to-spec` / empty; preflight `mode: brownfield` (`src/**` present); `$ARGUMENTS` = freeform intent.

S9 is a two-PlanMode-submission session: reverse-pass first, forward-chain second, both under the same `<session-id>`.

**Trace.**

1. Phase 1 reverse half — Workspace-kind-adaptive permission gate. Single `AskUserQuestion`:
   - Multi-repo: "Reverse-pass first (document existing surface across services), then forward-chain against the locked baseline?"
   - Single-repo: "Reverse-pass first (document existing service), then forward-chain?"
   - `no` → abort with `[orchestra] reverse-then-forward declined; re-invoke with /orchestra spec-to-code to skip reverse`.
2. Reverse routing: `workspace_kind: multi-repo` → S6 trace. `workspace_kind: single-repo` → S7 trace. Intent names ONE service → narrow to S7 with `--source=<path>` prompt if not cached.

Phases 2a-4 of reverse half per S6 or S7 trace. PlanMode submission #1 covers reverse plan.

3. After reverse-pass completes (Phase 4 trivially closes), main agent emits status line + `AskUserQuestion(continue | halt)` pause.
4. Phase 1 forward half — Post-reverse confirmation 3× `AskUserQuestion`:
   - Q1 — restate intent against locked baseline. SEEDS from original `$ARGUMENTS`.
   - Q2 — scope: which feature(s)? New or extension?
   - Q3 — constraints, autonomy, parallel work.
5. Confidence floor cleared. Tech-vs-business classifier (same as S8).
6. Forward routing: S2 / S3 / S4 trace per `docs/` state of targeted feature(s).

Phases 2a-4 of forward half per resolved sub-strategy. PlanMode submission #2 covers forward plan. Both submissions share `.orchestra/plans/<session-id>/`; reverse discovery reports carry forward as forward-half Phase 2a inputs.

**Artifacts produced.** Reverse-pass artifacts (S6/S7) + forward-chain artifacts (S2/S3/S4/tech path).

**Edge cases.**

- User declines reverse-pass: abort. Document via `[orchestra] reverse-then-forward declined`. User can re-invoke `/orchestra spec-to-code <intent>` to skip reverse.
- Reverse-pass surfaces source contradictions: `@architect` writes DEADLOCK artifact. Pause; user resolves; re-invoke under same session-id.
- Intent maps to feature absent from reverse-derived `features.yaml`: Q2 prompts "Add as new feature, or did reverse-pass miss it?" If miss → narrow re-run of S6/S7 against missed service. If new → mint new `<feature-id>` and proceed.
- Forward chain encounters `ratify-spec` divergence on reverse-authored locked artifact: use `mcp__orchestra-utils__amend_locked_artifact` + `relock_artifact`. Reverse-pass origin does NOT exempt from `changelog-append-only` audit trail.
- Mid-run external-state change (DB schema applied after reverse-pass TDD locked): main agent self-explores via Phase 2c-style targeted reads before forward-chain Phase 2a entry.
