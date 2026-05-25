---
name: write-contract
description: "Lift PRD/FRS criteria into <feature-id>-openapi.yaml (producer endpoints with description: criteria + inline CRITICAL: / manual_evaluation: tokens) and <feature-id>-clientapi.yaml (consumer contracts on upstream services this feature calls). Use when @architect binds spec to grading after PRD/FRS lock; ships an <feature-id>-asyncapi.yaml when messaging endpoints exist. The contract IS the openapi document — no separate CONTRACT.md."
allowed-tools: Read, Write, Edit, Glob, Grep, Skill
origin: orchestra
---

# write-contract

Produces TWO artifacts:

- `docs/<service_name>/<feature-id>/<feature-id>-openapi.yaml` — **producer contract**: endpoints this feature *publishes*. `@architect` writes; `@test-author` lifts criteria into TSR test plan; `@evaluator` grades each criterion PASS/FAIL.
- `docs/<service_name>/<feature-id>/<feature-id>-clientapi.yaml` — **consumer contract**: the contract this feature *requires from upstream services it calls*. One file covers all outbound HTTP deps; `info.title: "client-contract: <upstream-service>"` (one document per upstream, or single multi-paths document with each route carrying `x-orchestra-upstream: <service>`). Authored when feature's diff has outbound HTTP callsites (`RestTemplate` / `WebClient` / Feign / `RestClient` / `HttpClient`).

The contract IS the openapi document — no separate CONTRACT.md. Acceptance criteria live as prose in `description:` per operation/response. Critical criteria flagged inline. Probe DSL + grading rules live in `qa-test-planner` + `@evaluator`'s rubric.

AsyncAPI handles publish + subscribe natively; one `<feature-id>-asyncapi.yaml` per feature covers both directions.

## When to use

- `<feature-id>-PRD.md` + `<feature-id>-FRS.md` are `status: locked` and execution is next.
- Existing openapi needs revision because criteria proved unclear during testing.
- Brownfield migration needs a locked interface contract before refactor.

## Approach

### Step 1 — Extract candidate criteria

Read PRD + FRS. Pull every "must"-shaped statement. Each becomes one criterion. Aim for 3–8 per feature; fewer = under-specified, more = over-specified.

Patterns:

- "X must return Y" → response on specific path/method.
- "After Z, DB shows W" → side-effect criterion (state-after-action).
- "Adversarial input A → reject with B" → error-response criterion.
- "Latency p95 < N" → non-functional (`description:` prose; probed manually unless instrumented).

### Step 2 — Mark critical criteria

A **critical** criterion fails the feature on a single FAIL regardless of other PASSes. Reserve for: security leaks, data-loss paths, compliance-mandated behavior, broken contracts. Mark inline in `description:` with the literal token `CRITICAL:` so `@evaluator`'s rubric can grep for it.

### Step 2b — Weight criteria + cite the AC row each criterion operationalizes

Per operation, every criterion in `description:` carries:

- **A weight** — integer percentage. All weights for one operation sum to **100**. The weight reflects business impact: a 70-weight criterion failing matters more than three 10-weight ones. `@evaluator` uses weights to compute `eval_score` (weighted sum of PASS rows; `passing_score` default 80).
- **A trace cite** — every criterion ends with `(AC-NNN)` naming the FRS `S-AC-001` row it operationalizes (`criterion: idempotency key echoed in response (AC-003)`). Untraced criterion fails `@reviewer`'s spec-trace gate.
- **Critical flag** — `critical: true` for security/data-loss/contract-break criteria (per Step 2's `CRITICAL:` token).

Same weight + AC-trace + critical mandate applies to `<feature-id>-asyncapi.yaml` event channels.

### Step 3 — Author the producer openapi document

Path: `docs/<service_name>/<feature-id>/<feature-id>-openapi.yaml`. Top-of-file `# orchestra:` comment block carries frontmatter-equivalent metadata (`pre-write-check.js` parses it). Full YAML example + sections shape: `references/contract-patterns.md` "Producer openapi.yaml".

### Step 3b — Author the consumer clientapi document (when outbound HTTP deps exist)

Path: `docs/<service_name>/<feature-id>/<feature-id>-clientapi.yaml`. Same OpenAPI 3.0 shape as producer with `info.title: "client-contract: <upstream-service>"` (or single document carrying `x-orchestra-upstream: <service>` per route).

Trigger: grep the feature's implementation diff for outbound HTTP callsites (`RestTemplate` / `WebClient` / Feign client interfaces / `RestClient` / `HttpClient`). For each upstream: document route, method, request body, expected responses, contract assumptions this feature *requires* from the upstream. Use inline `CRITICAL:` for fields the feature depends on (e.g., `CRITICAL: response.idempotency_key MUST be echoed in 201 body`). Use `manual_evaluation:` for upstream behavior the feature can't probe (third-party SLA, eventual consistency window).

Full YAML example: `references/contract-patterns.md` "Consumer clientapi.yaml".

### Step 3c — Annotate operation stability

Every operation in `openapi.yaml` / `clientapi.yaml` / `asyncapi.yaml` (channel in asyncapi) carries `x-orchestra-stability: frozen | evolving | internal`. Full table + cross-file semantics: `references/contract-patterns.md` "Stability annotation".

### Step 4 — Author sequence diagrams for critical paths

For each `CRITICAL:` criterion (and any complex multi-component flow), author a sequence diagram at `docs/<service_name>/<feature-id>/diagrams/<feature-id>-sequence-intra-<usecase>.puml`. The `post-write-puml` hook renders each `.puml` to a paired `.svg`. Embed via `![<usecase>](diagrams/<feature-id>-sequence-intra-<usecase>.svg)` in the corresponding TDD section, NOT in the openapi (YAML can't embed images).

Filename convention matches the `c4-architecture` skill's three-scope model. Operations Summary discipline (Redis keys / Kafka topics / DB tables / lock patterns / state machine / API endpoint index) + `ref over` reuse for shared sub-flows: `skills/plantuml/SKILL.md > ## Sequence diagrams — authoring discipline`.

## Probe DSL — quick reference

This skill does not author probes — `qa-test-planner` does, into TSR `S-TEST-001`. But `@architect` should know what's machine-probable when writing `description:` prose:

| `tool:` | What it probes | Assertion shapes |
|---|---|---|
| `http_probe` | HTTP request/response | `status: <int>`, `body_contains: ["str"]`, `body_equals: "..."`, `header.<key>: <value>` |
| `db_state` | Persistence side effects | `rows_count: <int>`, `rows[N].<field>: <value>`, `rows_count_at_least: <int>` |

Anything else (latency p95, third-party API, OS-level state) is `manual_evaluation: true`. Mark with inline token `manual_evaluation:` in `description:` so `@test-author` knows to skip the probe row.

## When to escalate

- A criterion can't be probed AND can't be gauged manually → write `<feature-id>-ESCALATE-<slug>.md`. Do not invent a fake criterion.
- A criterion contradicts an FRS use case → escalate to `@product` for an FRS revision round.
- More than 8 criteria on one feature → split the feature; over-scoping signal.

## References

- `references/contract-patterns.md` — full producer + consumer YAML examples, stability annotation table, worked example.
- `schemas/pipeline-artifact.schema.md` — canonical frontmatter + body grammar for the openapi `# orchestra:` block.
- `skills/qa-test-planner/SKILL.md` — how each criterion becomes a TSR `S-TEST-001` row + probe.
- `skills/c4-architecture/SKILL.md` — diagram filename convention + render rules.
