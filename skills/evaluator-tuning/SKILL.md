---
name: evaluator-tuning
description: "Calibrates @evaluator verdicts against worked PASS/FAIL boundary cases. Use when grading CONTRACT criteria or judging probes."
origin: orchestra
---

# evaluator-tuning

Anchors `@evaluator`'s judgment to consistent PASS / FAIL / pending semantics. The `val-calibration` hook reads `references/calibration-examples.md` on every `Task(subagent_type=evaluator)` spawn and prepends it as `<calibration-anchor>` — so calibration is automatic, not opt-in.

## When to use

- You are `@evaluator` grading the eval halves of `verify/<NNN>-TSR.md` (`S-EVAL-VERDICT-001` + `S-EVAL-TABLE-001`) against `interfaces/<NNN>-CONTRACT.md` criteria.
- A criterion's outcome is ambiguous and you're not sure whether it's PASS, FAIL, or pending.
- A probe returned partial evidence (200 status but empty body, near-timeout, redacted field, redirect chain).
- You're comparing this run against a prior verdict and want to ensure consistency.

You do **not** need to invoke this skill manually as `@evaluator` — the val-calibration hook injects it. The skill exists so other agents can read calibration semantics for cross-checks.

## Algorithm

The verdict space is closed: **PASS / FAIL / pending**. Nothing else.

1. **Check critical-failure conditions first.** Any triggered → FAIL, stop.
2. **Run every probe.** One failure → FAIL.
3. **Run every adversarial fuzz input.** Pass-through → FAIL.
4. **Confirm artifact well-formedness** per `schemas/pipeline-artifact.schema.md`. Missing → pending; malformed → FAIL.
5. **Compute confidence** per the 5-signal rubric in `references/calibration-examples.md`. <80% → pending, never PASS.
6. **Write the verdict** to `verify/<NNN>-TSR.md` body sections `S-EVAL-VERDICT-001` (summary) and `S-EVAL-TABLE-001` (per-criterion table): probes run, results, rationale, confidence. Set frontmatter `eval_verdict` (PASS/FAIL/pending) + `eval_score` (0..100). Preserve `S-REV-*` and `S-SHIP-001` (other agents own them).

Default to `pending` when uncertain. Escalating is cheap; a false PASS is expensive.

## Boundary case index

The 8 worked cases in `references/calibration-examples.md`:

| # | Shape | Verdict |
|---|---|---|
| 1 | 200 + empty body where body assertion exists | FAIL |
| 2 | 4.95s response under 5s timeout | PASS |
| 3 | 3-of-4 weighted criteria pass | per-criterion stands; aggregate is `@ship`'s call |
| 4 | Replay attack passes through | FAIL |
| 5 | 302 → 200 with `follow_redirects: false` | FAIL (sees the 302) |
| 6 | DB field redacted by orchestra-probe | pending (re-spec, not FAIL) |
| 7 | Critical-fail condition triggered, probes pass | FAIL |
| 8 | Drift mid-test on `inferred:` upstream | per-criterion stands; warning logged |

Match the shape of your situation to the closest case. If yours doesn't match any, document the new boundary case in `S-EVAL-VERDICT-001` rationale and flag it for `@reviewer` to add to calibration on the next iteration.

## References

- `references/calibration-examples.md` — full PASS/FAIL semantics + 8 boundary cases with rationale (load-bearing — the val-calibration hook reads this file directly).

## Worked example

A `POST /payment/charge` probe expects status 201 + `body.transaction_id` non-empty. Server returns 201 with `body: {"transaction_id": ""}`. Criterion `payment.charges_record` lists this probe.

1. Critical-fail check: none triggered.
2. Probe ran. Status 201 ✓. Body assertion `transaction_id non-empty` ✗ — empty string fails.
3. Adversarial inputs: not run yet (this is the first probe).
4. Confidence: 95% — clear empty-string assertion failure.
5. Verdict: **FAIL**.

Matches Case 1 (200 + empty body). The pattern generalizes: status passes don't compensate for body-assertion failures. Document in `verify/<NNN>-TSR.md S-EVAL-TABLE-001` with the literal response so `@reviewer` can see why the FAIL stuck.
