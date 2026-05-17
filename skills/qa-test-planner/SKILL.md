---
name: qa-test-planner
description: "Builds test plans with coverage strategy and adversarial fuzz inputs. Use when @test-author designs the TSR S-TEST-001 section from a locked openapi."
origin: orchestra
---

# qa-test-planner

Designs the TSR test section (S-TEST-001): which black-box tests to author, what edge cases to cover, what adversarial inputs to send. `@test-author` writes the row table into S-TEST-001 with `status` + `evidence` cells empty (leaves `status: in_progress`); `@test-runner` runs the suite and fills those cells in place (flips `status: locked`). Pairs with `write-contract` (criteria definition).

## When to use

- An `docs/<feature-id>/<feature-id>-openapi.yaml` has been written by `@lead` and you need a test plan that grades it.
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

Cover 6 canonical axes for every feature (matches `agents/test-author.md` canonical list):

| Axis | What to probe |
|---|---|
| **happy** | Canonical success case. Status 2xx, body shape, side effects present. |
| **boundary** | Off-by-one on numeric inputs; empty arrays; max-length strings; first/last item; zero amounts. |
| **error** | Invalid auth, missing required field, wrong type, payload too large. Each error path has a probe. |
| **idempotency** | Replay same request; check side effects not duplicated; verify retry-safe contracts. |
| **adversarial** | Targeted attack inputs (replay, malformed, SQL injection, race condition) — see Step 3. |
| **manual** | Reserved for criteria flagged `manual_evaluation: true` in openapi `description:` — `@evaluator` grades by inspection (latency p95, third-party SLA, OS-level state). |

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

### Step 4 — Fill TSR `S-TEST-001`

Read `docs/<feature-id>/<feature-id>-TSR.md` (dispatcher-scaffolded shell). Fill the `S-TEST-001` section with the row table; leave `sections.S-TEST-001.status: in_progress` after the `@test-author` write (`@test-runner` will fill the `status` + `evidence` cells and flip to `locked`).

TEST is not a separate artifact — plan + results both live in `S-TEST-001` as a single table. Probe DSL lives in `<feature-id>-openapi.yaml` `description:` fields (reference openapi criteria by id; don't re-state). `@evaluator` later writes `S-EVAL-001` keyed on `S-TEST-001` row ids; `@reviewer` writes `S-REVIEW-001` (with ADR-review subsection when ADRs touched).

Row shape (single table — `@test-author` leaves `status` + `evidence` empty; `@test-runner` fills in place):

```markdown
## Test plan + results <a id="S-TEST-001"></a>

| id | criterion | axis | critical | fixture | status | evidence |
|---|---|---|---|---|---|---|
| T-001 | transfer.persists | happy | false | tests/test_transfer.py::test_persists | | |
| T-002 | transfer.idempotent | idempotency | false | tests/test_transfer.py::test_idempotent | | |
| T-003 | transfer.replay_rejected | error | true | tests/test_transfer.py::test_replay_rejected | | |
| ... | ... | ... | ... | ... | | |
```

`id` is a stable `T-NNN` token that `@evaluator`'s `S-EVAL-001` keys on. `critical: true` when the openapi `description:` for the criterion carries inline `CRITICAL:`. The live probe / openapi binding is implied by the `criterion` column and the openapi `description:` field — don't re-state probe DSL in the table.

`@test-runner` does not append a subsection. It fills the `status` (`PASS|FAIL`) and `evidence` (last 5–10 lines of stdout; append `flake=N` if non-zero) cells in place. `@test-author`'s `id` / `criterion` / `axis` / `critical` / `fixture` cells are preserved verbatim. Newly-introduced white-box tests get new rows with fresh `T-NNN` ids past the `@test-author` max.

## When to escalate

- A criterion is too vague to write a probe for → ask `@lead` to re-spec the criterion (Pattern B). Don't invent a probe and call it the test.
- An adversarial input is impossible in the current environment (e.g., requires production data) → document the gap, flag for `@reviewer`.
- A CONTRACT has fewer than 3 criteria total → likely under-specified; surface to `@lead` before writing the plan.

## References

- `references/coverage-strategies.md` — extended axis examples per feature shape (CRUD, batch, streaming).
- `references/fuzz-input-patterns.md` — full adversarial input library beyond the 8 standard patterns.

## Worked example

`docs/001-transfer/001-transfer-openapi.yaml` has 3 criteria: `transfer.persists`, `transfer.emits_event`, `transfer.idempotent`. `@test-author` builds:

| Criterion | Probes |
|---|---|
| transfer.persists | (1) http_probe POST /v1/transfer 201 + transaction_id; (2) db_state SELECT FROM ledger; (3) **adversarial**: oversized body → 413 |
| transfer.emits_event | (1) http_probe POST → 201; (2) db_state SELECT FROM event_log WHERE topic='transfer'; **boundary**: zero-amount transfer → still emit? (per contract: yes) |
| transfer.idempotent | (1) **adversarial replay**: POST twice with same key, expect second is no-op; (2) db_state SELECT count(*) FROM ledger WHERE key='k1' = 1 |

Write `docs/<feature-id>/<feature-id>-TSR.md` `S-TEST-001` with all rows laid out per the column shape above; `status` + `evidence` cells empty; section `status: in_progress`. `@test-runner` runs the suite, fills those cells in place, flips to `status: locked`; `@evaluator` then writes `S-EVAL-001` as `| id | verdict | reason |` keyed on these row ids.
