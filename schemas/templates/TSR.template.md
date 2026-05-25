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
readers:
  - "@product"
  - "@analyst"
  - "@architect"
  - "@backend"
  - "@frontend"
  - "@test-author"
  - "@test-runner"
  - "@evaluator"
  - "@reviewer"
sections:
  S-TEST-001:
    writer: "@test-author"
    status: in_progress
  S-EVAL-001:
    writer: "@evaluator"
    status: pending
  S-REVIEW-001:
    writer: "@reviewer"
    status: pending
---

# {{SLUG}} — Test Summary Report

## Changelog

- {{CREATED}} | created by @test-author | {{REASON}}

> Sequential dual-writer for `S-TEST-001`: `@test-author` lays the plan rows (status+evidence cells empty); `@test-runner` fills those cells in place and locks. `@evaluator` owns `S-EVAL-001` (`| id | verdict | reason |` keyed on S-TEST-001 row ids — no column duplication); `@reviewer` owns `S-REVIEW-001` (code review + optional ADR-review subsection).

## Test plan + results <a id="S-TEST-001"></a>

<!-- FILL (@test-author): Single table, row shape `| id | criterion | axis | critical | fixture | status | evidence |`. One row per (criterion, axis) pair across happy/boundary/error/idempotency/adversarial. critical=true when the openapi description: carries `CRITICAL:`. Unprobable criteria → axis: manual, fixture empty. Leave status + evidence cells empty. Section status: in_progress. -->

<!-- FILL (@test-runner, in place): For each @test-author row, fill the status (PASS|FAIL) and evidence (last 5–10 lines stdout; append flake=N if non-zero) cells. Preserve all other plan cells verbatim. Append new rows only for white-box tests authored at run time; give each a fresh T-NNN id past the @test-author max. Flip status: locked. -->

## Evaluator verdict <a id="S-EVAL-001"></a>

<!-- FILL (@evaluator): Table `| id | verdict | reason |` — one row per S-TEST-001 row id (no criterion/axis/fixture restatement; those live in S-TEST-001). verdict ∈ PASS|FAIL|PENDING; reason ≤120 chars citing the @test-runner evidence excerpt. Set frontmatter eval_verdict + eval_score. validate.js rejects any S-EVAL-001 id absent from S-TEST-001. -->

## Reviewer verdict <a id="S-REVIEW-001"></a>

<!-- FILL (@reviewer): One-paragraph APPROVED|REQUEST_CHANGES|PENDING summary + per-severity findings (Critical|Major|Minor|Nit) referencing file:line. Set frontmatter rev_verdict + rev_round. -->

<!-- FILL (@reviewer, ADR-touched only): ## ADR review subsection — verdict per ADR + findings. Omit subsection when no ADRs in this feature. -->
