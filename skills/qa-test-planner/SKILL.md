---
name: qa-test-planner
description: "Builds test plans with coverage strategy and adversarial fuzz inputs. Use when @test designs verify/<NNN>-TEST.md from a CONTRACT."
origin: orchestra
---

# qa-test-planner

Designs the TSR test-plan section (S-TEST-PLAN-001): which black-box tests to author, what edge cases to cover, what adversarial inputs to send. `@test` Stage-1 writes the plan; `@test` Stage-2 executes it. Pairs with `write-contract` (criteria definition).

## When to use

- An `interfaces/<NNN>-CONTRACT.md` has been written by `@lead` and you need a test plan that grades it.
- A bug or regression was reported and you're capturing the reproduction as an adversarial fuzz input.
- You're sizing test scope for a new endpoint, migration, or refactor.

## Approach

### Step 1 — Map criteria → probes

Every CONTRACT criterion gets at least one probe. Use the orchestra-probe MCP tools:

- `http_probe` — HTTP-facing behavior (status, headers, body shape, redirects, timeouts).
- `db_state` — persistence verification (rows present/absent, field values, redaction-aware).

Probe shape (lives in CONTRACT under `criteria.<id>.probes`):

```yaml
probes:
  - tool: http_probe
    args:
      method: POST
      url: http://localhost:8080/v1/transfer
      body: '{"amount": 100, "to": "acct-2", "idempotency_key": "k1"}'
      timeout_ms: 5000
    assertions:
      status: 201
      body_contains: ["transaction_id"]
  - tool: db_state
    args:
      dsn: sqlite3:///tmp/test.db
      query: "SELECT amount FROM ledger WHERE idempotency_key=?"
      params: ["k1"]
    assertions:
      rows_count: 1
      rows[0].amount: 100
```

### Step 2 — Coverage strategy

Cover 4 axes for every feature:

| Axis | What to probe |
|---|---|
| **Happy path** | Canonical success case. Status 2xx, body shape, side effects present. |
| **Boundary** | Off-by-one on numeric inputs; empty arrays; max-length strings; first/last item; zero amounts. |
| **Error path** | Invalid auth, missing required field, wrong type, payload too large. Each error path has a probe. |
| **Idempotency / consistency** | Replay same request; check side effects not duplicated; verify retry-safe contracts. |

Skip an axis only if CONTRACT explicitly says so (e.g., a read-only GET has no idempotency axis to probe).

### Step 3 — Adversarial fuzz inputs

Each adversarial input is a probe with an explicit `expected_result` of "handled cleanly". The contract owns the answer; `@evaluator` doesn't guess, it grades against the documented expectation.

| Pattern | Probe shape |
|---|---|
| **Replay attack** | Same request twice with identical idempotency key; expect second to be no-op or 409. |
| **Malformed JSON** | `body: '{"amount":'` (truncated); expect 400 with structured error. |
| **SQL injection** | Field value `'; DROP TABLE users; --`; expect parameterized handling, no schema change. |
| **Oversized body** | Body 10× the max payload; expect 413 or graceful truncation. |
| **Race condition** | Two concurrent requests on the same resource; expect serializable outcome. |
| **Wrong content-type** | `Content-Type: text/xml` on a JSON endpoint; expect 415 or coerce-with-warning per contract. |
| **Auth bypass** | Without auth header; with expired token; with wrong scope. Each fails per contract. |
| **Boundary timeout** | `timeout_ms` at 90% of SLO; expect either response or graceful timeout per contract. |

### Step 4 — Write verify/<NNN>-TEST.md

Read the dispatcher-scaffolded `pipeline/<feature_id>/verify/<NNN>-TEST.md`. Slim frontmatter (provenance lives in paired `<artifact>.lock.yaml`); one locked anchor `S-COVERAGE-001`; FILL placeholder for the matrix.

v2.0 changes vs v1: TEST.md is coverage-matrix-ONLY. Probe DSL lives in CONTRACT `S-CRITERIA-001` (reference by criterion id, don't re-state). Verdict folded into TSR per v2.0 — `@evaluator` writes `S-EVAL-VERDICT-001` + `S-EVAL-TABLE-001`; `@reviewer` writes `S-REV-VERDICT-001` + `S-REV-FINDINGS-001`.

Frontmatter (v2.0 slim):

```yaml
---
id: <NNN>-TEST
type: TEST
created: <ISO-8601>
revision: 1
plan_author: "@test"
adversarial_input_count: <int>
---
```

Body:

```markdown
## Coverage <a id="S-COVERAGE-001"></a>

| Criterion | Source | Axis | Pytest fixture | Live probe (driven by @evaluator) |
|---|---|---|---|---|
| C-001 — transfer.persists | CONTRACT C-001 / FR-1 | happy | `tests/test_transfer.py::test_persists` | `http_probe POST /v1/transfer` → 201 |
| C-002 — transfer.idempotent | CONTRACT C-002 / FR-2 | idempotency | `tests/test_transfer.py::test_idempotent` | `http_probe POST` 2× same key → 1 row in db_state |
| ... | ... | ... | ... | ... |
```

Each row references a CONTRACT criterion id (e.g., `C-001`), the source (CONTRACT criterion + FRS FR), the axis (happy/boundary/error/idempotency), the in-suite pytest fixture if any, and the live probe `@evaluator` runs. Probe DSL itself is NOT re-stated.

## When to escalate

- A criterion is too vague to write a probe for → ask `@lead` to re-spec the criterion (Pattern B). Don't invent a probe and call it the test.
- An adversarial input is impossible in the current environment (e.g., requires production data) → document the gap, flag for `@reviewer`.
- A CONTRACT has fewer than 3 criteria total → likely under-specified; surface to `@lead` before writing the plan.

## References

- `references/coverage-strategies.md` — extended axis examples per feature shape (CRUD, batch, streaming).
- `references/fuzz-input-patterns.md` — full adversarial input library beyond the 8 standard patterns.

## Worked example

`interfaces/001-CONTRACT.md` has 3 criteria: `transfer.persists`, `transfer.emits_event`, `transfer.idempotent`. `@test` builds:

| Criterion | Probes |
|---|---|
| transfer.persists | (1) http_probe POST /v1/transfer 201 + transaction_id; (2) db_state SELECT FROM ledger; (3) **adversarial**: oversized body → 413 |
| transfer.emits_event | (1) http_probe POST → 201; (2) db_state SELECT FROM event_log WHERE topic='transfer'; **boundary**: zero-amount transfer → still emit? (per contract: yes) |
| transfer.idempotent | (1) **adversarial replay**: POST twice with same key, expect second is no-op; (2) db_state SELECT count(*) FROM ledger WHERE key='k1' = 1 |

Write `docs/<feature-id>/TSR-001.md` `S-TEST-PLAN-001` with all probes laid out. `@test` Stage-2 runs them and fills `S-TEST-RESULTS-001`; `@evaluator` then grades the recorded evidence.
