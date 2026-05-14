---
name: write-contract
description: "Lifts PRD/FRS criteria into <feature-id>-openapi.yaml (producer endpoints) and <feature-id>-clientapi.yaml (consumer contracts on upstream). Use when @lead binds spec to grading."
origin: orchestra
---

# write-contract

Produces TWO artifacts:

- `docs/<service_name>/<feature-id>/<feature-id>-openapi.yaml` — **producer contract**: endpoints this feature *publishes*. `@lead` writes; `@test-author` lifts criteria into the TSR test plan; `@evaluator` grades each criterion PASS/FAIL.
- `docs/<service_name>/<feature-id>/<feature-id>-clientapi.yaml` — **consumer contract**: the contract this feature *requires from upstream services it calls* (one file covers all outbound HTTP deps for the feature; `info.title: "client-contract: <upstream-service>"` — one document per upstream, or a single multi-paths document with each `paths.<route>` carrying an `x-orchestra-upstream: <service>` extension). Authored when the feature's implementation diff has outbound HTTP callsites (`RestTemplate` / `WebClient` / Feign / `RestClient` / `HttpClient`).

The contract IS the openapi document — there is no separate CONTRACT.md. Acceptance criteria live as prose in `description:` fields per operation / response. Critical criteria are flagged inline. Probe DSL + grading rules live in `qa-test-planner` (TSR `S-TEST-001`) and `@evaluator`'s rubric — not in this artifact.

AsyncAPI already handles both publish + subscribe shapes natively; one `<feature-id>-asyncapi.yaml` per feature covers both directions — keep that one file and document subscribe-side requirements in its own `description:` fields as a typed contract section.

## When to use

- `docs/<feature-id>/<feature-id>-PRD.md` and `<feature-id>-FRS.md` are `status: locked` and execution is next.
- An existing openapi needs revision because criteria proved unclear during testing (`@test-author` found a coverage gap).
- Brownfield migration needs a locked interface contract before refactor.

## Approach

### Step 1 — Extract candidate criteria

Read PRD + FRS. Pull every "must"-shaped statement. Each becomes one criterion. Aim for 3–8 criteria per feature; fewer means under-specified, more means over-specified.

Patterns:

- "X must return Y" → response on a specific path/method.
- "After Z, DB shows W" → side-effect criterion (state-after-action).
- "Adversarial input A → reject with B" → error-response criterion.
- "Latency p95 < N" → non-functional criterion (lives in `description:` prose; probed manually unless instrumented).

### Step 2 — Mark critical criteria

A **critical** criterion fails the feature on a single FAIL regardless of other PASSes. Reserve for: security leaks, data-loss paths, compliance-mandated behavior, broken contracts. Mark inline in the `description:` text with the literal token `CRITICAL:` so `@evaluator`'s rubric can grep for it.

### Step 3 — Author the producer openapi document

Path: `docs/<service_name>/<feature-id>/<feature-id>-openapi.yaml`. Top-of-file `# orchestra:` comment block carries frontmatter-equivalent metadata (`pre-write-check.js` parses it). Frontmatter shape (slim):

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

Set frontmatter `sections.S-API-001.status: locked` after the body is final. `@test-author` reads this `locked` shell as its single source of truth for criteria.

### Step 3b — Author the consumer clientapi document (when outbound HTTP deps exist)

Path: `docs/<service_name>/<feature-id>/<feature-id>-clientapi.yaml`. Same OpenAPI 3.0 shape as the producer file with `info.title: "client-contract: <upstream-service>"` (or a single document carrying `x-orchestra-upstream: <service>` per route). Trigger: grep the feature's implementation diff for outbound HTTP callsites (`RestTemplate` / `WebClient` / Feign client interfaces / `RestClient` / `HttpClient`); for each upstream identified, document the route, method, request body, expected responses, and the contract assumptions this feature *requires* from the upstream. Use the inline `CRITICAL:` token for fields the feature depends on (e.g., `CRITICAL: response.idempotency_key MUST be echoed in 201 body`). Use `manual_evaluation:` for upstream behavior the feature can't probe (third-party SLA, eventual consistency window).

Top-of-file `# orchestra:` block:

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

### Step 3c — Annotate operation stability

Every operation in `openapi.yaml` / `clientapi.yaml` / `asyncapi.yaml` (channel in asyncapi) carries an `x-orchestra-stability` extension marking the service-grain commitment:

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

Producer side (`openapi.yaml`, `asyncapi.yaml` channels with publish): the stability is THIS service's commitment to its consumers. Consumer side (`clientapi.yaml`, `asyncapi.yaml` channels with subscribe): the stability is THIS feature's internal commitment to its dependency on the upstream — `frozen` means we won't migrate away in the foreseeable future; `evolving` means this dep is up for review.

Reviewers grep `x-orchestra-stability: frozen` across all .yaml files to get the cross-feature "frozen surface" view; cross-file inconsistencies on the same path/topic surface as a `stability-drift` finding.

### Step 4 — Author sequence diagrams for critical paths

For each `CRITICAL:` criterion (and any complex multi-component flow), author a sequence diagram at `docs/<service_name>/<feature-id>/diagrams/<feature-id>-sequence-intra-<usecase>.puml`. The `post-write-puml` hook renders each `.puml` to a paired `.svg`. Embed via `![<usecase>](diagrams/<feature-id>-sequence-intra-<usecase>.svg)` in the corresponding TDD section, NOT in the openapi (YAML can't embed images).

Filename convention matches the `c4-architecture` skill's three-scope model (system singletons under `docs/diagrams/`; service singletons under `docs/<service_name>/diagrams/`; per-feature copies under `docs/<service_name>/<feature-id>/diagrams/` with the `<feature-id>-` prefix).

## Probe DSL — quick reference

This skill does not author probes — `qa-test-planner` does, into TSR `S-TEST-001`. But `@lead` should know what's machine-probable when writing `description:` prose, so `@test-author` can later turn each criterion into a real probe row:

| `tool:` | What it probes | Assertion shapes |
|---|---|---|
| `http_probe` | HTTP request/response | `status: <int>`, `body_contains: ["str"]`, `body_equals: "..."`, `header.<key>: <value>` |
| `db_state` | Persistence side effects | `rows_count: <int>`, `rows[N].<field>: <value>`, `rows_count_at_least: <int>` |

Anything else (latency p95, third-party API behavior, OS-level state) is `manual_evaluation: true` — `@evaluator` grades manually. Mark such criteria with the inline token `manual_evaluation:` in the `description:` so `@test-author` knows to skip a probe row.

## When to escalate

- A criterion can't be probed AND can't be gauged manually (depends on production traffic, real OAuth provider, etc.) → write `<feature-id>-ESCALATE-<slug>.md` at `<context_path>/.orchestra/<service_name>/pipeline/<feature-id>/`. Do not invent a fake criterion.
- A criterion contradicts an FRS use case → escalate to `@product` for an FRS revision round.
- More than 8 criteria on one feature → split the feature; signal of over-scoping.

## References

- `schemas/pipeline-artifact.schema.md` — canonical frontmatter + body grammar for the openapi `# orchestra:` block.
- `skills/qa-test-planner/SKILL.md` — how each criterion becomes a TSR `S-TEST-001` row + probe.
- `skills/c4-architecture/SKILL.md` — diagram filename convention + render rules.

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

Author `001-transfer-openapi.yaml` per Step 3 with each criterion folded into the operation's `description:`. The replay criterion is tagged `CRITICAL:` inline. Author `001-transfer-sequence-intra-replay-rejection.puml` per Step 4 (one sequence diagram for the critical path). Hand to `@test-author` to build the coverage matrix in TSR `S-TEST-001`.
