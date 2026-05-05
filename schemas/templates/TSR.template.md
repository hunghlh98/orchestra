---
id: {{ID}}
type: TSR
created: {{CREATED}}
revision: 1
eval_verdict: pending
eval_score: 0
rev_verdict: pending
rev_round: 1
ship: pending
---

# {{SLUG}} — Test Summary Report

> Single-writer-per-section discipline: `@evaluator` writes `S-EVAL-*` only;
> `@reviewer` writes `S-REV-*` only; `@ship` writes `S-SHIP-001` only.

## Evaluator verdict <a id="S-EVAL-VERDICT-001"></a>

<!-- FILL (@evaluator): PASS | FAIL summary. Set frontmatter eval_verdict + eval_score. -->

## Evaluator per-criterion <a id="S-EVAL-TABLE-001"></a>

<!-- FILL (@evaluator): Per-criterion table. One row per CONTRACT criterion: id, weight, critical, observed, expected, status, reason. -->

## Reviewer verdict <a id="S-REV-VERDICT-001"></a>

<!-- FILL (@reviewer): APPROVED | REQUEST_CHANGES summary. Set frontmatter rev_verdict + rev_round (1..3). -->

## Reviewer findings <a id="S-REV-FINDINGS-001"></a>

<!-- FILL (@reviewer): Per-severity findings (blocker / major / minor / info). One bullet per finding. -->

## Ship decision <a id="S-SHIP-001"></a>

<!-- FILL (@ship): ALLOW | HOLD. AND ⟺ both halves green. Set frontmatter ship to match. -->
