# Inter-service sequence diagram rules

Companion to `skills/c4-architecture/SKILL.md`. Read when authoring `docs/diagrams/sequence-inter-<flow>.puml` (workspace inter-service flows) or when grading one in review.

## File-per-flow naming

`docs/diagrams/sequence-inter-<flow>.puml` — one file per Journey-gate outcome category. Examples:

- `sequence-inter-forward-purchase.puml`
- `sequence-inter-abandonment.puml`
- `sequence-inter-reversal.puml`
- `sequence-inter-partial-or-failed-delivery.puml`

One file per outcome. Do NOT collapse multiple Journey outcomes into a single diagram — branching obscures the per-outcome contract.

## Request-and-response on adjacent arrows

Every cross-service call MUST show request AND response on adjacent arrows:

```
caller -> callee : <verb> <path> { <request payload skeleton> }
callee --> caller : <status-code> { <response payload skeleton> }
```

Payload skeletons carry field names only, no values — they describe contract shape, not test data. Field names lift verbatim from the corresponding `<feature-id>-openapi.yaml` schemas.

## Failure paths

Every cross-service call whose FRS row carries ≥1 error AC OR whose openapi operation declares ≥1 non-2xx response MUST sit inside an `alt` block:

- Success branch first.
- One `else` branch per distinct failure category.
- Reference the FRS `S-AC-001` row by id in the alt branch label: `else AC-014: payment declined`.

## One-way notifications

Annotate as `caller ->> callee : <event> {payload}` per PlantUML async syntax — no response arrow required. Use this for fire-and-forget Kafka publishes; the consumer-side response is its own subscribe diagram.

## Forbidden

- Synchronous arrows without response (use `->>` for async or pair request with response).
- Payload values (e.g., `amount: 100`) — only field names (`amount`).
- Reused payload aliases that hide the field set (e.g., `same-as-step-3`).

## Worked alt-block example

```plantuml
caller -> callee : POST /v1/charge { idempotency_key, amount, source_id }
alt 201 Created
  callee --> caller : 201 { charge_id, status }
else AC-014: payment declined
  callee --> caller : 402 { error, decline_code, retry_after }
else AC-015: source invalid
  callee --> caller : 422 { error, validation_errors }
end
```

Reviewer reads this and can audit: every documented failure has a dedicated branch carrying its governing AC cite.
