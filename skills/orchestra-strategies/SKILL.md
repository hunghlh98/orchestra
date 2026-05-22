---
name: orchestra-strategies
description: "Walk-throughs for /orchestra strategies S1-S9. Invoke after classifying $1, or when user asks 'how does S<N> work', 'walk through code-to-spec', 'reverse-then-forward router trace'."
origin: orchestra
---

# orchestra-strategies

On-demand walk-throughs for the 9 `/orchestra` dispatcher strategies. Each reference under `references/S<N>-*.md` carries preconditions, step-by-step trace, expected artifacts, and edge cases for one strategy.

`commands/orchestra.md` declares the dispatcher contract (parse / strategy matrix / gates / runtime hooks). This skill elaborates the matrix — one file per row.

## When to use

Invoke this skill when:

- Dispatching `/orchestra` and classification of `$1` + `docs/` + `src/**` resolves to a single strategy → read the matching `S<N>-*.md` before the first agent spawn.
- User asks `how does S<N> work`, `walk me through <strategy>`, `what fires after the preflight on a clean repo`, `explain the reverse-then-forward router`.
- Auditing the dispatcher's behavior on a specific shape (e.g., locked partial-impl resume, multi-feature parallel fan-out).

Skip this skill when the answer is in the `commands/orchestra.md` strategy table itself — the matrix carries the one-line summary; references add the trace.

## References

| Strategy | Entry | Reference |
|---|---|---|
| S1 | `/orchestra` (empty) | [`references/S1-empty.md`](references/S1-empty.md) |
| S2 | `/orchestra spec-to-code` (clean `docs/` + `src/**`) | [`references/S2-greenfield-clean.md`](references/S2-greenfield-clean.md) |
| S3 | `/orchestra spec-to-code` (partial locks / partial impl) | [`references/S3-greenfield-partial.md`](references/S3-greenfield-partial.md) |
| S4 | `/orchestra spec-to-code` (N locked features, empty `src/**`) | [`references/S4-greenfield-multifeature.md`](references/S4-greenfield-multifeature.md) |
| S5 | `/orchestra code-to-spec` (no second token) | [`references/S5-brownfield-auto-scope.md`](references/S5-brownfield-auto-scope.md) |
| S6 | `/orchestra code-to-spec system` | [`references/S6-brownfield-system-wide.md`](references/S6-brownfield-system-wide.md) |
| S7 | `/orchestra code-to-spec service:<name> --source=<path>` | [`references/S7-brownfield-per-service.md`](references/S7-brownfield-per-service.md) |
| S8 | `/orchestra <intent>` (greenfield) | [`references/S8-router-greenfield.md`](references/S8-router-greenfield.md) |
| S9 | `/orchestra <intent>` (brownfield) | [`references/S9-router-brownfield.md`](references/S9-router-brownfield.md) |

## How to apply

1. From `commands/orchestra.md` classification (`$1` + preflight `mode` + `workspace_kind` + presence of `docs/<feature-id>/`), pick the row.
2. Read the matching `references/S<N>-*.md`.
3. Drive the trace; let agent prompts cite the canonical authoring contracts in `agents/*.md` and `schemas/*.schema.md` (this skill points to them, does not duplicate them).
4. On strategy transition (S8 → S2, S9 → S5 → S2), re-invoke this skill for the downstream reference.
