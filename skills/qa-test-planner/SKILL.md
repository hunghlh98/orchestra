---
name: qa-test-planner
description: "Builds test plans with coverage strategy and adversarial fuzz inputs. Use when @test designs TEST-NNN.md from a CONTRACT. Keywords: test plan, coverage strategy, adversarial fuzz, edge cases, probes."
origin: orchestra
---

# qa-test-planner

Designs the TEST-NNN.md artifact: which probes to run, what edge cases to cover, what adversarial inputs to send. Pairs with `write-contract` (criteria definition) and `evaluator-tuning` (verdict semantics). `@test` writes the plan; `@evaluator` runs it.

## When to use

- A CONTRACT-NNN.md has been written by `@lead` and you need a test plan that grades it.
- A bug or regression was reported and you're capturing the reproduction as an adversarial fuzz input.
- You're sizing test scope for a new endpoint, migration, or refactor.

## Approach

### Step 1 — Map criteria → probes

Every CONTRACT criterion gets at least one probe. Use the orchestra-probe MCP tools:

- `http_probe` — for HTTP-facing behavior (status, headers, body shape, redirects, timeouts).
- `db_state` — for persistence verification (rows present/absent, field values, redaction-aware).

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
| **Happy path** | The canonical success case. Status 2xx, body shape, side effects present. |
| **Boundary** | Off-by-one on numeric inputs; empty arrays; max-length strings; first/last item; zero amounts. |
| **Error path** | Invalid auth, missing required field, wrong type, payload too large. Each error path should have a probe. |
| **Idempotency / consistency** | Replay the same request; check that side effects are not duplicated; verify retry-safe contracts. |

Skip an axis only if the CONTRACT explicitly says so (e.g., a read-only GET has no idempotency axis to probe).

### Step 3 — Adversarial fuzz inputs

Per PRD §9.7 (qa-test-planner) and the calibration's Case 4: adversarial inputs are first-class. Each one is a probe with an explicit `expected_result` of "handled cleanly".

Standard adversarial set (apply where relevant):

| Pattern | Probe shape |
|---|---|
| **Replay attack** | Send the same request twice with identical idempotency key; expect second to be no-op or 409. |
| **Malformed JSON** | `body: '{"amount":'` (truncated); expect 400 with structured error. |
| **SQL injection** | Field value `'; DROP TABLE users; --`; expect parameterized handling, no schema change. |
| **Oversized body** | Body 10× the max payload; expect 413 or graceful truncation. |
| **Race condition** | Two concurrent requests on the same resource; expect serializable outcome. |
| **Wrong content-type** | `Content-Type: text/xml` on a JSON endpoint; expect 415 or coerce-with-warning per contract. |
| **Auth bypass** | Request without auth header; with expired token; with wrong scope. Each should fail per contract. |
| **Boundary timeout** | Probe `timeout_ms` at 90% of the SLO; expect either response or graceful timeout per contract. |

Document the *expected* behavior in the criterion. The point of an adversarial probe is **the contract owns the answer** — `@evaluator` doesn't guess; it grades against the documented expectation.

### Step 4 — Write TEST-NNN.md

Path: `<project>/.claude/.orchestra/pipeline/<id>/TEST-<id>.md`. Shape per `docs/pipeline-schema.md`:

```yaml
---
id: TEST-<id>
type: TEST
revision: 1
sections:
  S-PLAN-001:    { hash: "TBD", confirmed: true }
  S-VERDICT-001: { hash: "TBD", confirmed: true }
references:
  - type: contract
    id: "<id>"
    section: S-CRITERIA-001
    hash-at-write: "TBD"
---

## Test plan <a id="S-PLAN-001"></a>

### Coverage matrix

| Criterion | Happy | Boundary | Error | Idempotency | Adversarial |
|---|---|---|---|---|---|
| C1: transfer.persists | ✓ | ✓ | ✓ | ✓ | replay, oversized |
| C2: ... | ... | ... | ... | ... | ... |

### Probes by criterion

(per-criterion `probes:` list; same shape as in CONTRACT)

## Verdict <a id="S-VERDICT-001"></a>

(filled by @evaluator after running probes)
```

The verdict block is left empty for `@evaluator` to populate. Do not pre-grade.

## When to escalate

- A criterion is too vague to write a probe for → ask `@lead` to re-spec the criterion (Pattern B). Don't invent a probe and call it the test.
- An adversarial input is impossible to test in the current environment (e.g., requires production data) → document the gap and flag for `@reviewer`.
- A CONTRACT has fewer than 3 criteria total → likely under-specified; surface to `@lead` before writing the plan.

## References

For depth, see:
- `references/coverage-strategies.md` — extended axis examples per feature shape (CRUD, batch, streaming).
- `references/fuzz-input-patterns.md` — full adversarial input library beyond the 8 standard patterns.

(References are conditional; this body is sufficient for v1.0.0.)

## Worked example

CONTRACT-001 has 3 criteria: `transfer.persists`, `transfer.emits_event`, `transfer.idempotent`. `@test` builds the plan:

| Criterion | Probes |
|---|---|
| transfer.persists | (1) http_probe POST /v1/transfer 201 + transaction_id; (2) db_state SELECT FROM ledger; (3) **adversarial**: oversized body → 413 |
| transfer.emits_event | (1) http_probe POST → expect 201; (2) db_state SELECT FROM event_log WHERE topic='transfer'; **boundary**: zero-amount transfer → still emit? (per contract: yes) |
| transfer.idempotent | (1) **adversarial replay**: POST twice with same key, expect second is no-op; (2) db_state SELECT count(*) FROM ledger WHERE key='k1' = 1 |

TEST-001.md is written with all probes laid out. `@evaluator` runs them, fills in the verdict block, and grades each criterion PASS/FAIL/pending per `evaluator-tuning` semantics.
