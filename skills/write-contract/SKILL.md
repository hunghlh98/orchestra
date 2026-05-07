---
name: write-contract
description: "Authors interfaces/<NNN>-CONTRACT.md with weighted criteria, probe DSL, and PASS/FAIL semantics. Use when @lead binds a spec to grading."
origin: orchestra
---

# write-contract

Produces `interfaces/<NNN>-CONTRACT.md`. `@lead` writes; `@test` and `@evaluator` consume.

## When to use

- A `requirements/<NNN>-PRD.md` or `<NNN>-FRS.md` is `confirmed: true` and execution is next.
- An existing CONTRACT needs revision because criteria proved unclear during testing.
- Brownfield migration needs locked acceptance criteria before refactor.

## Approach

### Step 1 — List candidate criteria

Extract every "must"-shaped statement from PRD/FRS. Each becomes one criterion. Aim for 3–8; fewer means under-specified, more means over-specified.

Patterns:

- "X must return Y" → `endpoint.x_returns_y`.
- "After Z, DB shows W" → `persistence.w_after_z`.
- "Adversarial input A → reject with B" → `security.rejects_a_with_b`.
- "Latency p95 < N" → `performance.latency_under_n`.

### Step 2 — Assign weights

Weights sum to 100. Distribute by **business impact**, not implementation difficulty.

| Criterion shape | Typical weight |
|---|---|
| Core behavior | 30–40 |
| Persistence / consistency | 15–25 |
| Security / authentication | 15–25 |
| Performance | 10–15 |
| Idempotency / replay | 10–15 |
| Observability | 5–10 |

### Step 3 — Define probes per criterion

Each criterion gets a `probes:` list using `http_probe` / `db_state`. Probes must be deterministic, self-contained, and assert the criterion (not the implementation).

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

`critical: true` triggers feature-level FAIL on miss. Reserve for: security leaks, data-loss paths, compliance-mandated behavior.

### Step 5 — Set passing_score

Default 80. Override only with rationale in body: compliance → 100; beta → 70; migration → 90.

### Step 6 — Write interfaces/<NNN>-CONTRACT.md

Read the dispatcher-scaffolded `pipeline/<feature_id>/interfaces/<NNN>-CONTRACT.md`. Anchors are locked.

Frontmatter (slim, v2.0.0; provenance lives in the paired `<artifact>.lock.yaml`):

```yaml
---
id: <NNN>-CONTRACT
type: CONTRACT
created: <ISO-8601>
revision: 1
signed: false
weighted_criteria_total: 100
passing_score: 80
probe_count: <int>
critical_failure_conditions: <int>
---
```

Body anchors (locked):

- `S-INTERFACE-001` — HTTP endpoints / events / messages enumerated; reference `<NNN>-API.openapi.yaml` for shape.
- `S-SERVICE-CONTRACT-001` — per-method contract: trigger, payload, success/error, idempotency, ordering. Embed `![Service contract](diagrams/contract-service.svg)`.
- `S-SCORING-001` — integer weights = 100; `passing_score`; critical-fail veto rules. Mirror frontmatter `weighted_criteria_total` / `passing_score` / `critical_failure_conditions`.
- `S-CRITERIA-001` — one C-NNN block per criterion: weight, `critical: true|false`, probe DSL, PASS/FAIL.

Author `diagrams/contract-service.puml` (HTTP + event tables). For each critical-path criterion, author `diagrams/contract-sequence-<criterion-id>.puml`. Add `diagrams[]` entries to the lockfile when scaffold-time defaults are insufficient. Invoke `/plantuml` to render `.svg` for each.

Final body shape after FILL:

```markdown
## Interface <a id="S-INTERFACE-001"></a>

(enumeration of HTTP/event/message surface)

## Service contract <a id="S-SERVICE-CONTRACT-001"></a>

(per-method contract prose)

![Service contract](diagrams/contract-service.svg)

## Scoring policy <a id="S-SCORING-001"></a>

Weights sum to 100. Passing score: 80. Critical-fail veto: any FAIL on a `critical: true` criterion auto-fails regardless of total.

## Criteria <a id="S-CRITERIA-001"></a>

### C-001 — transfer.persists (FR-1) — weight 30

(probe block + PASS/FAIL conditions)

### C-002 — transfer.idempotent (FR-2) — weight 25

...
```

## Probe DSL — quick reference

`tool:` — `http_probe` | `db_state`. `args:` — passed verbatim. `assertions:` — declarative:

- `status: <int>` — HTTP status equality.
- `body_contains: ["str", ...]` — substring match (post-redaction).
- `body_equals: "..."` — full-body equality (brittle; use sparingly).
- `header.<key>: <value>` — header equality.
- `rows_count: <int>` — db_state row count.
- `rows[N].<field>: <value>` — db_state row field equality.
- `rows_count_at_least: <int>` — db_state minimum row count.

Anything else is documentation, not a machine-gradable assertion. Mark as `manual_evaluation: true`; let `@reviewer` grade.

## When to escalate

- Sum of weights ≠ 100 → surface to `@product` (likely missing criterion).
- A criterion can't be probed via `http_probe` / `db_state` → mark `manual_evaluation: true`; never fake a probe.
- `passing_score < 70` requested → push back; feature likely under-scoped.

## References

- `references/probe-dsl.md` — full assertion grammar with edge cases.
- `references/criteria-examples.md` — worked CONTRACTs across CRUD, batch, streaming, migration.

## Worked example

`requirements/001-PRD.md`: *"Add `POST /v1/users/:id/transfer`. Records to ledger. Idempotent on `idempotency_key`. Emits `transfer` event. Replay rejected. p95 < 500ms at 100 RPS."*

| ID | Description | Weight | Critical |
|---|---|---|---|
| transfer.persists | endpoint records to ledger | 30 | false |
| transfer.idempotent | same key → single row | 25 | false |
| transfer.emits_event | event_log row appears | 20 | false |
| transfer.rejects_replay | replay → 409 | 15 | **true** |
| transfer.under_500ms | p95 < 500ms at N=100 | 10 | false |

Total 100. `passing_score: 80`. `transfer.rejects_replay` is critical: a replay vulnerability is a security regression — single FAIL = no ship. Write per Step 6 shape. Hand to `@test` for `verify/001-TEST.md` via `qa-test-planner`.
