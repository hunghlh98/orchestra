# OpenAPI contract patterns — full examples

Loaded by `@lead` when authoring `<feature-id>-openapi.yaml` or `<feature-id>-clientapi.yaml`. Full YAML examples for producer + consumer + stability annotation.

## Producer openapi.yaml (full example)

```yaml
# orchestra:
#   id: <feature-id>-openapi
#   type: API
#   status: draft
#   readers:
#     - "@architect"
#     - "@lead"
#     - "@backend"
#     - "@frontend"
#     - "@test-author"
#     - "@test-runner"
#     - "@evaluator"
#     - "@reviewer"
#   sections:
#     S-API-001:
#       writer: "@lead"
#       status: in_progress
openapi: 3.0.3
info:
  title: Transfer Service
  description: |
    Records signed transfers to a ledger. Idempotent on `idempotency_key`.
    Emits `transfer` events on every successful write.
  version: 1.0.0
paths:
  /v1/users/{id}/transfer:
    post:
      summary: Record a transfer
      description: |
        Records to ledger. Side effect: `event_log` row with topic=transfer.
        - Happy: 201 with `{transaction_id}`; ledger has 1 row keyed by idempotency_key.
        - Idempotent: same `idempotency_key` → single ledger row across N calls.
        - CRITICAL: replay (same key, different body) → 409 Conflict; ledger unchanged.
        - Performance (manual_evaluation): p95 < 500ms at 100 RPS.
      requestBody: { ... }
      responses:
        "201": { ... description: "Transfer recorded; transaction_id returned." }
        "409": { ... description: "Replay rejected; idempotency_key already used." }
```

Set frontmatter `sections.S-API-001.status: locked` after body is final. `@test-author` reads this `locked` shell as its single source of truth for criteria.

## Consumer clientapi.yaml (full example)

```yaml
# orchestra:
#   id: <feature-id>-clientapi
#   type: API
#   status: draft
#   readers:
#     - "@architect"
#     - "@lead"
#     - "@backend"
#     - "@test-author"
#     - "@test-runner"
#     - "@evaluator"
#     - "@reviewer"
#   sections:
#     S-CLIENT-API-001:
#       writer: "@lead"
#       status: in_progress
openapi: 3.0.3
info:
  title: "client-contract: ledger-service"
  description: |
    Contracts this feature requires from ledger-service. The feature breaks
    if any "CRITICAL:" assumption changes upstream.
  version: 1.0.0
paths:
  /v1/ledger/transfers:
    post:
      summary: Record a transfer (called by this feature)
      description: |
        - CRITICAL: 201 body MUST echo idempotency_key from request.
        - CRITICAL: replay (same key, different body) returns 409 — feature relies on this for de-dupe.
        - Latency assumption: p99 < 200ms at our call rate (manual_evaluation).
      requestBody: { ... }
      responses:
        "201": { ... }
        "409": { ... }
```

One `clientapi.yaml` covers all outbound HTTP deps for the feature. `@test-author` lifts each `CRITICAL:` clientapi criterion into a contract-test row in TSR `S-TEST-001` so a breaking change upstream is caught at the seam.

## Stability annotation

Every operation carries `x-orchestra-stability`:

```yaml
paths:
  /v1/orders:
    post:
      x-orchestra-stability: frozen
      summary: ...
```

| value | semantic |
|---|---|
| `frozen` | External consumers depend on this surface; breaking changes require a deprecation cycle. |
| `evolving` | Used only by this service's own UI / tests / internal flows; can change with this service's release cadence. |
| `internal` | Never crosses a service boundary (debug endpoints, health probes consumed by orchestrator only). |

Producer side (`openapi.yaml`, `asyncapi.yaml` publish): stability is THIS service's commitment to consumers. Consumer side (`clientapi.yaml`, `asyncapi.yaml` subscribe): stability is THIS feature's internal commitment to its dependency on the upstream — `frozen` = no migration foreseeable; `evolving` = up for review.

Reviewers grep `x-orchestra-stability: frozen` across all .yaml files for the cross-feature "frozen surface" view; cross-file inconsistencies on the same path/topic surface as a `stability-drift` finding.

## Worked example

`docs/001-transfer/001-transfer-PRD.md`: *"Add `POST /v1/users/:id/transfer`. Records to ledger. Idempotent on `idempotency_key`. Emits `transfer` event. Replay rejected. p95 < 500ms at 100 RPS."*

5 criteria extracted:

| Criterion | Operation | Critical? |
|---|---|---|
| Records to ledger | `POST /v1/users/{id}/transfer` 201 | no |
| Idempotent on key | `POST /v1/users/{id}/transfer` (replay-same) | no |
| Emits transfer event | `POST /v1/users/{id}/transfer` side effect | no |
| Rejects replay (different body) | `POST /v1/users/{id}/transfer` 409 | **yes** |
| p95 < 500ms at 100 RPS | non-functional | no (manual_evaluation) |

Author `001-transfer-openapi.yaml` with each criterion folded into the operation's `description:`. Replay criterion tagged `CRITICAL:` inline. Author `001-transfer-sequence-intra-replay-rejection.puml`. Hand to `@test-author` to build coverage matrix in TSR `S-TEST-001`.
