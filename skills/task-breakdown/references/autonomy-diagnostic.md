# Autonomy Diagnostic (5-Q + 3-axis decomposition)

> Reference loaded by `@lead` on first spawn for a new feature_id when classifying the autonomy level for a `/orchestra <natural language>` run. Surfaced as the suggested tag at PAUSE-1; the user accepts or overrides. v1.0.0: suggestion-only — the diagnostic never changes the resolved level without user assent.
>
> Filed under `skills/task-breakdown/` per the v1.0.1 architectural decision to keep autonomy classification co-located with `@lead`'s existing skill orbit rather than create a new skill. Topical fit is imperfect — this is a `@lead` diagnostic, not a `task-breakdown` resource — but co-location avoids adding a new skill description to the always-loaded metadata layer. Future relocation to a dedicated `lead-orchestration` skill remains possible in v1.1+.

## When `@lead` Reads this file

- On first spawn for a new feature_id (no prior `intent.yaml` recorded): Read this file before issuing PAUSE-1.
- On subsequent spawns within the same feature_id: skip — autonomy was already classified at PAUSE-1; the level is locked in `intent.yaml` for the duration.
- On `/orchestra resume`: the autonomy level was already resolved in the original run — do NOT re-Read this file. Surface the existing level from `intent.yaml`.

## Diagnostic — 5 ordered yes/no questions, first yes wins

1. `EXECUTION_ONLY` — Does the task require following explicit step-by-step instructions without formulating logic?
2. `JOINT_PROCESSING` — Does it require an iterative synchronous loop with the human co-authoring logic?
3. `OPTION_SYNTHESIS` — Is the objective to analyze constraints and generate a bounded option set for human evaluation?
4. `DRAFT_AND_GATE` — Can the agent generate a complete solution, halting at a final authorization checkpoint before state-changing actions?
5. `FULL_AUTONOMY` — Is the task bounded enough that the agent can execute end-to-end with async telemetry-only oversight?

No yes anywhere → not delegable in current form; tighten the spec or keep the work human.

## 3-axis decomposition — strategy / decision / execution

| Tag | Strategy | Decision | Execution |
|---|---|---|---|
| `EXECUTION_ONLY` | Human | Human | AI |
| `JOINT_PROCESSING` | Both | Both | AI |
| `OPTION_SYNTHESIS` | AI | Human | **Human** |
| `DRAFT_AND_GATE` | AI | Human | AI |
| `FULL_AUTONOMY` | AI | AI | AI |

The Consultant inversion is real: at `OPTION_SYNTHESIS`, execution returns to the human after AI does the strategy work. Use it for high-leverage, irreversible decisions (architecture proposals, vendor selection, datastore evaluation). v1.0.0 routes `OPTION_SYNTHESIS` to a halt-after-options form — full `PROPOSAL-<id>.md` artifacts are deferred to v1.1+.

## Resolved precedence

`--autonomy <tag>` CLI flag > `local.yaml.autonomy.level` > hard-coded `DRAFT_AND_GATE`. If `@lead`'s suggested tag differs from the resolved default, surface it at PAUSE-1 alongside intent/confidence/pattern.

## Worked example

**Context:** User prompt: "We're choosing between Postgres and DynamoDB for the events table. Lay out the tradeoffs."

**Action:** Run the diagnostic. Q1 no (no step-by-step). Q2 no (no iterative co-authoring). Q3 **yes** — analyze constraints, return bounded option set. Suggested tag: `OPTION_SYNTHESIS`. Resolved default may be `DRAFT_AND_GATE` from local.yaml; surface at PAUSE-1: "Default is DRAFT_AND_GATE; this looks like OPTION_SYNTHESIS (datastore evaluation — you'll do the apply step). Confirm or override?" If user accepts, halt after delivering the option set; do not author CONTRACT/TASKS.

## Backstop (R-2 mitigation)

If `@lead` does NOT Read this file on first spawn (e.g., context was compacted between dispatcher → spawn), default the resolved level to `DRAFT_AND_GATE` and log a warning event `autonomy.diagnostic.skipped` to `events.jsonl`. The user can still override via `--autonomy <tag>` CLI flag at the next `/orchestra` invocation.
