# BR vs AC vs INV — worked patterns

How to discriminate between a business rule (BR), an acceptance criterion (AC), and an invariant (INV). Used by `@analyst` when authoring FRS `S-AC-001` rows and deciding what to ESCALATE-BR.

## The discrimination test

Three questions, in order:

1. **Could a named human role sign this row?** Finance signing refund-window. Compliance signing KYC threshold. If yes → **BR**.
2. **Is it implementer-consistency, not user-observable?** Idempotency-key derivation. Ordering guarantee. Currency precision. If yes → **INV**.
3. **Is it feature-bound, observable, and verifiable black-box?** → **AC**.

Rows can move tiers as a system matures: a feature-level AC that recurs across ≥2 features hardens into a service-wide BR or INV.

## Worked examples

### Example 1 — Refund window

> "Customer can request refund within 30 days of purchase."

- Signable by Finance? Yes.
- → **BR**. ESCALATE-BR to `@architect`; lands as `BR-NNN` in `<service_name>-BR-AC.md`.

FRS-grain AC references the rule:

```
| AC-014 | Refund request returns ORD-0409 when purchase is older than 30 days | HTTP 409 with body { error_code: "ORD-0409" } | BR-AC/BR-005 |
```

### Example 2 — Idempotency-key derivation

> "Order-create uses request body hash as idempotency-key when client omits the header."

- Signable by named human? No (no business owner cares).
- Implementer-consistency? Yes.
- → **INV**. ESCALATE-BR routes to `S-INVARIANTS-001`.

### Example 3 — Sign-up email validation

> "Sign-up rejects requests where email lacks `@`."

- Signable by human? No (technical syntactic check).
- Implementer-consistency? No (user-observable rejection).
- Feature-bound? Yes (lives in sign-up feature).
- → **AC**. Lands in `S-AC-001`.

```
| AC-003 | Sign-up rejects email lacking @ with USR-0422 | HTTP 422 with body { error_code: "USR-0422" } | BR-AC/AC-009 |
```

`BR-AC/AC-009` would be the service-grain "valid-email" rule, if BR-AC carries one.

### Example 4 — Multi-feature recurrence

A feature surfaces "max page-size = 200" in AC. The next two features surface the same cap.

- After feature 1: AC in FRS.
- After feature 3: candidate for hardening. ESCALATE-BR with `proposed_tier: INV`. `@architect` decides whether to lift into `S-INVARIANTS-001`.

## Anti-patterns

### Re-narrating BR as AC

```
| AC-022 | Refund window is 30 days | — | — |
```

Wrong: BR-AC carries the rule; FRS only references. Should be:

```
| AC-022 | Refund request older than 30 days returns ORD-0409 | HTTP 409 | BR-AC/BR-005 |
```

### Untraced AC

```
| AC-031 | Order accepts negative quantity | HTTP 200 | — |
```

Empty Traces. Structural failure. Either the AC traces to a parent rule, or the AC is asserting net-new policy → ESCALATE-BR first.

### Tech leakage in AC

```
| AC-040 | OrderValidator.validateQuantity() throws IllegalArgumentException | unit test | — |
```

`OrderValidator.validateQuantity()` is a codebase identifier; `IllegalArgumentException` is a framework type. Reshape to observable surface:

```
| AC-040 | Order create with quantity ≤ 0 rejects with ORD-0422 | HTTP 422 with body { error_code: "ORD-0422" } | BR-AC/BR-008 |
```
