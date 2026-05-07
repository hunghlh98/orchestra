---
name: resume-pipeline
description: "Resumes an interrupted /orchestra feature run. Walks pipeline/*/ dirs, finds the next non-done task, respawns the owner. Use when the dispatcher invokes /orchestra resume."
origin: orchestra
---

# resume-pipeline

Recovers an interrupted feature run by walking `pipeline/*/` and respawning the next non-`done` task in its DAG. Idempotent — re-spawning an owner whose prior turn partially completed is safe; the owner Reads existing artifacts before re-writing. No team spawn — reuses the smart-router spawn pattern at the resume point.

## When to use

Invoked by the dispatcher when the user types `/orchestra resume [<feature-id>]`. Not auto-triggered from natural-language prompts — explicit subcommand only.

## Algorithm

1. **Enumerate candidates.** List `pipeline/*/` dirs missing the terminal artifact for their routed intent: `feature` requires a `RELEASE-vX.Y.Z.md.features` mention; `hotfix` / `template` / `refactor` / `review-only` / `docs` require `verify/<NNN>-TSR.md` with frontmatter `ship: ALLOW`. 0 candidates → emit `[orchestra] resume no in-flight features` and exit. 1 → auto-select. >1 → `AskUserQuestion` with the list. If `<feature-id>` arg was passed, validate it against the candidate list; mismatch → write `DEADLOCK-resume-<id>.md` and halt.

2. **Validate prerequisites.** Read `pipeline/<feature-id>/intent.yaml`. **Missing → fail closed**: write `DEADLOCK-resume-<feature-id>.md` (`triggered_by_stage: RESUME`, body: "intent.yaml absent; re-run /orchestra <natural language>") and halt — an unexpected missing-file state could mask a real bug. Then scan the feature dir:
   - `SUMMARY-<id>.md` present → emit `[orchestra] resume <feature-id> already terminal` and exit.
   - `DEADLOCK-<id>.md` present → emit the standard banner per `commands/orchestra.md ## Status output` and halt; deadlocks need manual rescope.
   - `ESCALATE(-ARCH|-ADR)?-<id>.md` with `resolution: pending` → emit banner + `AskUserQuestion` ("ESCALATE pending: `<reason>`. Resolved externally?"). On reject → halt; on accept → proceed.
   - `DEADLOCK-ADR-<NNNN>.md` present → emit banner; ADR-deadlocks need manual rescope.

3. **Find resume point.** Read `plan/<NNN>-TASKS.md` and walk the table topologically (respect Blocked-by edges). For each task in order:
   - `Status = done` → skip.
   - Owner is T-A (`@evaluator` / `@reviewer`) → derive status from TSR frontmatter: `@evaluator`'s task is `done` ⟺ `eval_verdict ∈ {PASS, FAIL}`; `@reviewer`'s is `done` ⟺ `rev_verdict ∈ {APPROVED, REQUEST_CHANGES}`. Derived `done` → skip. Verdict `pending` → resume point.
   - Owner is `@lead` for an ADR-open subroutine → derive status from `architecture/decisions/ADR-<NNNN>-<slug>.md` frontmatter `status`: `done` ⟺ `status ∈ {accepted, deprecated}` OR `DEADLOCK-ADR-<NNNN>.md` exists. Otherwise the ADR is the resume point.
   - Owner is T-B (`@product` / `@lead` / `@test` / `@ship`) → derive from artifact existence with `confirmed: true` (in lockfile) for the row's exit criterion. Match → skip; otherwise resume point.
   - Otherwise (T-C implementer with `Status ∈ {pending, in_progress}`) → resume point.

4. **REQUEST_CHANGES gate.** If the resume point follows a `verify/<NNN>-TSR.md.rev_verdict = REQUEST_CHANGES`, do NOT auto-respawn the implementer. Emit banner + `AskUserQuestion` ("Last review verdict: REQUEST_CHANGES (`<N findings>`). Respawn @`<owner>` for revision, or halt to address findings manually?"). Accept → respawn at Step 5. Reject → halt with no further writes.

5. **Spawn.** Issue `Agent({ subagent_type, prompt })` per smart-router Step 1 shape. Prompt MUST include: routed intent from `intent.yaml`, the feature_id, prior artifact pointers per the routing taxonomy, the intent-whitelist clause from Step 5 of the smart router, AND a resume directive: "Your task is `T-<id>` in `plan/<NNN>-TASKS.md`. Prior `Updated by` / `Updated at` columns may indicate partial work — Read existing artifacts before re-writing. Idempotent re-write is acceptable."

6. Continue per smart-router Step 5 from the resume point through Step 7 (terminal-state detection → SUMMARY write → `TeamDelete()` → closing status line). Resume does not bypass terminal-state machinery; it just enters mid-flight.

## Status lines

Per `commands/orchestra.md ## Status output`:

- `[orchestra] resume scanning pipeline/` — at Step 1 entry.
- `[orchestra] resume target=<feature-id>` — after candidate selection.
- `[orchestra] resume next-task=T-<id> owner=@<role>` — at Step 5 spawn.

Standard `spawn` / `read` / `pause` / `shutdown` lines per the dispatcher's Status output spec apply for each subsequent agent.

## Return contract

Returns to dispatcher with:

- `terminal_state ∈ {success, deadlock, escalated, "(continued)"}`. The `"(continued)"` value indicates the resume point was found and the dispatcher should continue per smart-router Step 5.
- `feature_id` of the resumed run.

The dispatcher uses these to drive Step 7 closure (SUMMARY write + TeamDelete) when terminal, or to continue the spawn loop otherwise.

`DEADLOCK-resume-<id>.md` parent-context writes follow the same carve-out as Step 7 SUMMARY (parent-authored exception artifact at terminal state, narrowly carved from the "no parent artifact writes" rule).
