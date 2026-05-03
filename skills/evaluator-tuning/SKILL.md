---
name: evaluator-tuning
description: "Calibrates @evaluator verdicts against worked PASS/FAIL boundary cases. Use when grading CONTRACT criteria or judging probes."
origin: orchestra
---

# evaluator-tuning

Anchors `@evaluator`'s judgment to consistent PASS/FAIL/pending semantics. The `val-calibration` hook reads `references/calibration-examples.md` on every `Task(subagent_type=evaluator)` spawn and prepends it as `<calibration-anchor>` — so calibration is automatic, not opt-in.

## When to use

- You are `@evaluator` grading a TEST-NNN.md or CONTRACT-NNN.md verdict block.
- A criterion's outcome is ambiguous and you're not sure whether it's PASS, FAIL, or pending.
- A probe returned partial evidence (200 status but empty body, near-timeout, redacted field, redirect chain).
- You're comparing this run against a prior verdict and want to ensure consistency.

You do **not** need to invoke this skill manually as `@evaluator` — the val-calibration hook injects it. The skill exists so other agents can read the calibration semantics for cross-checks.

## Approach

The verdict space is closed: **PASS / FAIL / pending**. Nothing else.

1. **Check critical-failure conditions first.** Any triggered → FAIL, stop.
2. **Run every probe.** One failure → FAIL.
3. **Run every adversarial fuzz input.** Pass-through → FAIL.
4. **Confirm artifact well-formedness** per `docs/pipeline-schema.md`. Missing → pending; malformed → FAIL.
5. **Compute confidence** per the 5-signal rubric in `references/calibration-examples.md`. <80% → pending, never PASS.
6. **Write the verdict** to the TEST-NNN.md verdict block: probes run, results, rationale, confidence.

Default to `pending` when uncertain. Escalating is cheap; a false PASS is expensive.

## Boundary case index

The 8 worked cases in `references/calibration-examples.md` cover:

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

Match the shape of your situation to the closest case. If yours doesn't match any, write a new boundary case into TEST-NNN.md's verdict block and flag it for `@reviewer` to add to calibration on the next iteration.

## References

For depth, see:
- `references/calibration-examples.md` — full PASS/FAIL semantics + 8 boundary cases with rationale (load-bearing — the val-calibration hook reads this file directly).

## Worked example

A `POST /payment/charge` probe expects status 201 + `body.transaction_id` non-empty. The server returns 201 with `body: {"transaction_id": ""}`. Criterion `payment.charges_record` lists this probe.

Walk the path:

1. Critical-fail check: none triggered.
2. Probe ran. Status 201 ✓. Body assertion `transaction_id non-empty` ✗ — empty string fails the assertion.
3. Adversarial inputs: not run yet (this is the first probe).
4. Confidence: 95% — clear empty-string assertion failure.
5. Verdict: **FAIL**.

Note this matches Case 1 in the calibration anchor (200 + empty body). The pattern generalizes: status passes don't compensate for body-assertion failures. Document this in the TEST-NNN.md verdict block with the probe's literal response so `@reviewer` can see exactly why the FAIL stuck.
