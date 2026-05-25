# Coverage strategies — extended examples per feature shape

Reference for `qa-test-planner` SKILL.md Step 2 (Coverage strategy). The SKILL.md row table lists the canonical 7 axes; this file shows how each axis lands across different feature shapes.

## CRUD endpoint (POST + GET + PATCH + DELETE)

| Axis | Probes per verb |
|---|---|
| happy | POST → 201 + Location; GET → 200 + body shape; PATCH → 200 + delta applied; DELETE → 204 + GET returns 404 |
| boundary | POST empty body → 400; POST max-length string → 201 + truncation per contract; GET on `id=0` / negative id; PATCH no-op field; DELETE non-existent → 404 |
| error | POST malformed JSON → 400; GET wrong content-type → 406; PATCH on locked resource → 409; DELETE without permission → 403 |
| idempotency | POST same idempotency_key twice → second is no-op or 409; DELETE twice → second 404 (NOT 204 again) |
| adversarial | replay-after-success (no-op); SQL injection in field values; oversized PATCH body; race on PATCH + DELETE same id |
| cross-process-boundary | DB row written on POST visible to GET on read-replica within p99 lag; published event reaches downstream consumer |
| manual | latency p95 on GET under N concurrent; correctness of cascade-delete on related-rows |

## Batch endpoint (POST `/v1/items/bulk`)

| Axis | Probes |
|---|---|
| happy | 100-item batch → 201 per-item; aggregate response shape (success_count / errors[]) |
| boundary | 0-item batch → 400; max-size batch (e.g. 1000) → 201; max+1 → 413 or partial-accept per contract |
| error | One bad item in batch — atomic-fail (rollback all) OR partial-success (accept good, reject bad) per contract; never both behaviors |
| idempotency | Same batch_id twice → second returns cached result, no duplicate inserts |
| adversarial | duplicate items within batch (handled per spec); race two batches on same item ids |
| cross-process-boundary | DB rows inserted; per-item events published in order; downstream consumer sees correct count |

## Streaming endpoint (SSE / WebSocket / Kafka consumer)

| Axis | Probes |
|---|---|
| happy | open connection → receive N events in order; close cleanly |
| boundary | zero events (connection stays open, heartbeat fires); single event; high-rate burst (matches backpressure spec) |
| error | malformed event from upstream → consumer logs + skips OR halts per spec; connection drop mid-stream → reconnect with offset |
| idempotency | duplicate event id → handled exactly once (DB row count stays correct) |
| adversarial | replay attack with stale offset; out-of-order events; oversized event payload; topic-partition rebalance mid-consume |
| cross-process-boundary | offsets committed atomically with side-effects; downstream consumer sees correct ordering after restart |
| manual | p95 lag under N msg/sec sustained load; recovery time after broker restart |

## Read-only endpoint (GET `/v1/.../search`)

| Axis | Probes |
|---|---|
| happy | known query → 200 + expected results; pagination links present |
| boundary | empty query → 200 + empty array; max-size query string; page=0 vs page=1; last-page partial fill |
| error | invalid filter syntax → 400; oversized query → 414; wrong sort field → 400 |
| idempotency | N/A (read-only) — skip axis with rationale in TSR |
| adversarial | SQL-shaped query value (escaped per contract); regex-DoS query; auth bypass with stale token |
| cross-process-boundary | search against read-replica returns stale data within p99 window per contract |
| manual | p95 latency under sustained load; relevance of result ordering |

## When to skip an axis

The openapi `description:` field carries the authoritative skip rationale. A read-only GET has no idempotency axis. A service with no upstream callsites AND no Kafka surface has no cross-process-boundary axis. Mark skipped axes in the TSR row table with `axis: skipped` and `evidence: <openapi reason>`.

## Composing across axes

Adversarial inputs frequently overlap with error / boundary axes. Pick ONE primary axis per probe; let the row's `criterion` column carry the secondary classification. Two rows on the same probe = duplicated test runtime.
