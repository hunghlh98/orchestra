# Adversarial fuzz inputs — extended library

Reference for `qa-test-planner` SKILL.md Step 3. The SKILL.md table lists 8 canonical patterns; this file extends with shape-specific inputs the canonical list doesn't cover.

Every fuzz probe carries an explicit `expected_result`. The contract owns the answer; `@evaluator` grades against the documented expectation, not against what "should" happen.

## Network-layer

| Pattern | Probe shape | Expected result |
|---|---|---|
| **Slow body** | Send request body byte-by-byte over N seconds | Server respects body-read timeout; closes with 408 or graceful disconnect |
| **HTTP/2 RST flood** | Open + immediately RST many streams | Rate-limit kicks; subsequent requests get 429 |
| **Range header abuse** | `Range: bytes=0-9999999999` on small resource | Server clamps OR returns 416 |
| **Conditional request mismatch** | `If-Match: <wrong-etag>` on PATCH | 412 Precondition Failed |
| **Trailer injection** | Trailers carrying duplicate Content-Length | Server uses canonical header, ignores trailer |

## Payload-shape

| Pattern | Probe shape | Expected result |
|---|---|---|
| **Deep JSON nesting** | `{"a":{"a":{"a":{...}}}}` 1000 levels deep | Parser rejects with 400, no stack overflow |
| **Big-decimal precision** | `{"amount": 0.1 + 0.2}` (i.e. `0.30000000000000004`) | Server rounds per contract spec; never silent truncation |
| **Unicode normalization** | Same character in NFC vs NFD form | Server canonicalizes both to same key (or rejects per contract) |
| **Surrogate pair split** | Mismatched UTF-16 surrogate | 400 with parse error, no panic |
| **Zip-bomb body** | Compressed body that expands 1000× | Server reads compressed size, not decompressed; rejects per max-body-bytes |
| **Polyglot file upload** | File that parses as both JPEG and PHP | Server stores by declared content-type, never executes |

## State-machine

| Pattern | Probe shape | Expected result |
|---|---|---|
| **Out-of-order transitions** | POST → PATCH-to-state-D before PATCH-to-state-B | Server rejects with 409; state stays at A |
| **Concurrent transitions** | Two PATCHes to different states fired in parallel | Serializable outcome; one wins, the other 409s |
| **Resurrection** | DELETE → POST (same id) | Per contract: either 409 (deleted is permanent) or 201 (resurrection allowed) |
| **Pre-creation update** | PATCH on `id` that doesn't exist yet (was POSTed but not yet committed) | 404, not 409 |

## Auth/session

| Pattern | Probe shape | Expected result |
|---|---|---|
| **Token reuse cross-tenant** | Valid token for tenant A used on tenant B's resource | 403, NOT 404 (404 would leak existence) |
| **Expired refresh-with-grace** | Refresh token at expiry+1s | Per contract grace window: success OR 401 |
| **Replay across regions** | Same token sent to region A then region B within seconds | Per contract: dual-region allowed OR jti-blocklist denies |
| **Privilege escalation via referrer** | API call with admin token in Referer header (not Authorization) | Server reads only Authorization, ignores Referer |

## Concurrency

| Pattern | Probe shape | Expected result |
|---|---|---|
| **Lost update** | Read row → modify → write back; second writer reads between read-and-write | Per contract: optimistic lock 409 OR last-write-wins (documented) |
| **Phantom read in transaction** | Transaction T1 reads row count; T2 inserts; T1 reads count again | Per isolation level: same count (SERIALIZABLE) OR different (READ COMMITTED) |
| **Connection-pool exhaustion** | N+1 concurrent requests where N = pool size | Server queues or fails fast per contract; never hangs indefinitely |
| **Deadlock recovery** | Two transactions acquire locks in opposite order | DB rolls back one; server returns 409 + retry-after, never 500 |

## Resource exhaustion

| Pattern | Probe shape | Expected result |
|---|---|---|
| **File-descriptor leak** | N requests that open + don't close streams | Server reaps FDs at GC OR enforces per-request limit |
| **Slow loris** | Open N connections, send 1 byte/sec | Server applies idle-timeout; closes after N seconds |
| **Cache poisoning** | Request with weird header → cached → next request sees same response | Cache key includes Vary headers per contract |

## Composition

Combine patterns to stress real scenarios:
- **Replay + Race** — fire same idempotent request 10× concurrently. Expect exactly one success, nine no-ops or 409s.
- **Auth bypass + SQL injection** — invalid token + SQL-shaped field. Server returns 401 BEFORE parsing body (no SQL exposure).
- **Oversized body + Slow body** — N MB body sent at 1 byte/sec. Server rejects on size OR timeout, never both panics.

## When to stop adding patterns

Cap fuzz probes per criterion at ~5. Beyond that, returns diminish. Track which patterns surfaced bugs in past releases; bias toward those for new endpoints in the same domain.
