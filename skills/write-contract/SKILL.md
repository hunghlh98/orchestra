---
name: write-contract
description: "Authors CONTRACT-NNN.md with weighted criteria, probe DSL, and PASS/FAIL semantics. Use when @lead binds a spec to grading."
origin: orchestra
---

# write-contract

Produces CONTRACT-NNN.md: the artifact that binds a feature's success criteria to executable probes. `@lead` writes it after PRD/FRS are confirmed; `@test` consumes it to write the test plan; `@evaluator` uses the criteria + probes to grade. The CONTRACT is where ambiguous spec becomes machine-gradable.

## When to use

- A PRD-NNN.md or FRS-NNN.md is `confirmed: true` and the next step is execution.
- An existing CONTRACT needs revision because criteria proved unclear during testing.
- `@lead` is bootstrapping a brownfield migration and needs to lock acceptance criteria before refactor work begins.

## Approach

### Step 1 — List candidate criteria

Extract every "must"-shaped statement from the PRD/FRS. Each becomes a candidate criterion. Patterns to look for:

- "X must return Y" → criterion: `endpoint.x_returns_y`.
- "After Z, the database state shows W" → criterion: `persistence.w_after_z`.
- "Adversarial input A is rejected with B" → criterion: `security.rejects_a_with_b`.
- "Latency p95 < 500ms under load N" → criterion: `performance.latency_under_n`.

Aim for 3–8 criteria per feature. Fewer than 3 — likely under-specified, ask for re-spec. More than 8 — likely over-specified, consolidate.

### Step 2 — Assign weights

Weights sum to 100. Distribute by **business impact**, not implementation difficulty. Pattern:

| Criterion shape | Typical weight |
|---|---|
| Core behavior (the feature does the thing) | 30–40 |
| Persistence / consistency | 15–25 |
| Security / authentication | 15–25 |
| Performance | 10–15 |
| Idempotency / replay safety | 10–15 |
| Observability / metrics | 5–10 |

If two criteria have the same weight, that's a signal you might be able to merge them. If one criterion dominates (>60), the feature is probably under-decomposed — consider splitting into multiple features.

### Step 3 — Define probes per criterion

Each criterion gets a `probes:` list. Use orchestra-probe MCP tools (`http_probe`, `db_state`) — the same shape `qa-test-planner` uses. Probes must be:

- **Deterministic** — same probe twice on the same state returns the same result.
- **Self-contained** — no manual setup required beyond what the test plan documents.
- **Asserting the criterion, not the implementation** — `body.contains("ok")` not `response time was 187ms because of cache hit`.

Probe shape:

```yaml
criteria:
  transfer.persists:
    weight: 30
    probes:
      - tool: http_probe
        args:
          method: POST
          url: http://localhost:8080/v1/transfer
          body: '{"amount":100,"to":"a2","key":"k1"}'
        assertions:
          status: 201
          body_contains: ["transaction_id"]
      - tool: db_state
        args:
          dsn: sqlite3:///tmp/test.db
          query: "SELECT amount FROM ledger WHERE key=?"
          params: ["k1"]
        assertions:
          rows_count: 1
          rows[0].amount: 100
    critical: false
```

### Step 4 — Mark critical criteria

A criterion with `critical: true` triggers feature-level FAIL on its own miss. Use sparingly:

- Security criteria where a leak is unacceptable.
- Data-loss paths where partial-credit is meaningless.
- Compliance-mandated behavior.

A non-critical criterion contributes to the weighted score; failing one drops the score but doesn't auto-FAIL the feature.

### Step 5 — Set passing_score

Default: 80 (out of 100). Override per CONTRACT if:

- Compliance requires 100 (any FAIL = no ship).
- Beta feature where 70 is acceptable for limited rollout.
- Migration where 90 reflects the higher bar for production data work.

Document the rationale in the body; don't change `passing_score` casually.

### Step 6 — Write CONTRACT-NNN.md

Path: `<project>/.claude/.orchestra/pipeline/<id>/CONTRACT-<id>.md`. Shape:

```yaml
---
id: CONTRACT-<id>
type: CONTRACT
revision: 1
passing_score: 80
sections:
  S-CRITERIA-001: { hash: "TBD", confirmed: true }
  S-PROBES-001:   { hash: "TBD", confirmed: true }
references:
  - type: prd
    id: "<id>"
    section: S-FEATURE-001
    hash-at-write: "TBD"
  - type: frs
    id: "<id>"
    section: S-API-001
    hash-at-write: "TBD"
---

## Criteria <a id="S-CRITERIA-001"></a>

| ID | Description | Weight | Critical |
|---|---|---|---|
| transfer.persists | POST /v1/transfer records to ledger | 30 | false |
| transfer.idempotent | Same key produces single ledger row | 25 | false |
| transfer.emits_event | event_log contains 'transfer' topic | 20 | false |
| transfer.rejects_replay | Adversarial replay returns 409 | 15 | true |
| transfer.under_500ms | p95 latency below 500ms under N=100 | 10 | false |

Sum of weights: 100. ✓

## Probes <a id="S-PROBES-001"></a>

(per-criterion probes block as in Step 3)
```

## Probe DSL — quick reference

The DSL is intentionally narrow. v1.0.0 supports:

- `tool:` — `http_probe` | `db_state`.
- `args:` — passed to the MCP tool verbatim.
- `assertions:` — declarative; each assertion either holds or fails.
  - `status: <int>` — HTTP status equality.
  - `body_contains: ["str1", "str2"]` — substring matches in response body (post-redaction).
  - `body_equals: "..."` — full-body equality (use sparingly; brittle).
  - `header.<key>: <value>` — header value match.
  - `rows_count: <int>` — db_state row count.
  - `rows[N].<field>: <value>` — db_state row field equality.
  - `rows_count_at_least: <int>` — db_state minimum row count.

Anything not in this list is documentation, not a machine-gradable assertion. Document it as prose in the criterion description and let `@reviewer` grade it manually.

## When to escalate

- Sum of weights ≠ 100 → recompute or surface to `@product` (likely a missing criterion).
- A criterion can't be probed via http_probe or db_state → flag as "manual evaluation" and add to `@reviewer`'s checklist; don't fake a probe.
- `passing_score < 70` requested → push back; the feature is likely under-scoped.

## References

For depth, see:
- `references/probe-dsl.md` — full assertion grammar with edge cases.
- `references/criteria-examples.md` — worked CONTRACTs across feature shapes (CRUD, batch, streaming, migration).

(References are conditional; this body covers v1.0.0.)

## Worked example

PRD-001 says: *"Add `POST /v1/users/:id/transfer`. Records to ledger. Idempotent on `idempotency_key`. Emits a `transfer` event. Replay attacks rejected. p95 < 500ms at 100 RPS."*

Decompose into 5 criteria. Assign weights by impact:

| ID | Description | Weight | Critical |
|---|---|---|---|
| transfer.persists | endpoint records to ledger | 30 | false |
| transfer.idempotent | same key → single row | 25 | false |
| transfer.emits_event | event_log row appears | 20 | false |
| transfer.rejects_replay | replay → 409 | 15 | **true** |
| transfer.under_500ms | p95 < 500ms at N=100 | 10 | false |

Total: 100. `passing_score: 80` (default). transfer.rejects_replay is **critical** because a replay vulnerability is a security regression — single FAIL = feature does not ship.

Write CONTRACT-001.md per Step 6 shape. Hand off to `@test` for TEST-001.md design via `qa-test-planner`.
