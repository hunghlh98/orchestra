---
id: {{ID}}
type: TSR
created: {{CREATED}}
revision: 1
status: draft
verdict: PENDING
eval_verdict: PENDING
eval_score: 0
rev_verdict: PENDING
rev_round: 1
ship: PENDING
---

# {{SLUG}} — Test Summary Report

> Single-writer-per-section discipline: `@test` owns `S-TEST-001` (single row table; Stage-1 authors rows, Stage-2 fills status+evidence cells in place); `@evaluator` owns `S-EVAL-001` (`| id | verdict | reason |` keyed on S-TEST-001 row ids — no column duplication); `@reviewer` owns `S-REVIEW-001` (code review + optional ADR-review subsection); `@architect` owns `S-DIVERGENCES-001` (brownfield only — omit anchor on greenfield). Final ship verdict is in frontmatter `ship:`, not a body section.

## Test plan + results <a id="S-TEST-001"></a>

<!-- FILL (@test Stage-1): Single table, row shape `| id | criterion | axis | critical | fixture | status | evidence |`. One row per (criterion, axis) pair across happy/boundary/error/idempotency/adversarial. critical=true when the openapi description: carries `CRITICAL:`. Unprobable criteria → axis: manual, fixture empty. Leave status + evidence cells empty. Section status: in_progress. -->

<!-- FILL (@test Stage-2, in place): For each Stage-1 row, fill the status (PASS|FAIL) and evidence (last 5–10 lines stdout; append flake=N if non-zero) cells. Preserve all other Stage-1 cells verbatim. Append new rows only for white-box tests authored Stage-2; give each a fresh T-NNN id past the Stage-1 max. Flip status: locked. -->

## Evaluator verdict <a id="S-EVAL-001"></a>

<!-- FILL (@evaluator): Table `| id | verdict | reason |` — one row per S-TEST-001 row id (no criterion/axis/fixture restatement; those live in S-TEST-001). verdict ∈ PASS|FAIL|PENDING; reason ≤120 chars citing the Stage-2 evidence excerpt. Set frontmatter eval_verdict + eval_score. validate.js rejects any S-EVAL-001 id absent from S-TEST-001. -->

## Reviewer verdict <a id="S-REVIEW-001"></a>

<!-- FILL (@reviewer): One-paragraph APPROVED|ALLOW_WITH_GAP|REQUEST_CHANGES|PENDING summary + per-severity findings (Critical|Major|Minor|Nit) referencing file:line. Set frontmatter rev_verdict + rev_round. -->

<!-- FILL (@reviewer, ADR-touched only): ## ADR review subsection — verdict per ADR + findings. Omit subsection when no ADRs in this feature. -->

<!-- BROWNFIELD-ONLY: @architect appends a "Divergences" H2 with anchor S-DIVERGENCES-001 here on brownfield runs; greenfield TSRs omit the anchor entirely. Row shape: | ID | UC slug | File:line | Finding | Guard test ID | Resolution |. Resolution closes via Path A (INV-NNN ratified) or Path B (defect: <slug>) per agents/architect.md "DIV resolution paths" — never via a retroactive ADR. -->
