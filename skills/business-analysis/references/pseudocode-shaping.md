# Pseudocode shaping — when to use, when to strip

`@analyst` is permitted to inline pseudocode under an AC when prose alone cannot resolve assertion ambiguity. This asymmetric carve-out (FRS may carry pseudocode; PRD may not) exists because BR↔AC bridging sometimes needs code-shaped scaffolding without committing to implementation. Pseudocode shape rules below.

## When to use pseudocode

Add a pseudocode block when:

- A natural-language AC sentence requires ≥3 clauses to remain unambiguous.
- The assertion involves multi-step state transitions where ordering matters.
- A condition involves precedence or short-circuit semantics that prose obscures.
- Domain-noun resolution is non-obvious (e.g., "valid coupon" needs explicit predicate definition).

## When NOT to use pseudocode

Strip pseudocode when:

- Prose is already unambiguous.
- The block is restating an HTTP status code or response shape (that lives in openapi).
- The block names a class, method, package, or framework type — those are TDD/source surface, not FRS.
- The block is longer than ~10 lines (decompose the AC into multiple rows instead).

## Allowed vocabulary

- **Domain nouns**: `OrderId`, `Money`, `Address`, `Cart`, `Coupon`. Lift from PRD `S-STAKEHOLDERS-001` + business event names.
- **Domain operations**: `place(order)`, `attach(coupon, cart)`, `transition(order, Active → Refunded)`.
- **Domain predicates**: `is_active(account)`, `within_window(purchase, 30 days)`, `matches(input, ISO 4217)`.
- **Standard math + logic**: `≤`, `≥`, `≠`, `∈`, `if … then`, `for each … in …`.

## Forbidden vocabulary

- Class identifiers: `OrderEntity`, `OrderRepository`, `OrderValidator`.
- Method signatures: `findById(Long)`, `save(Order)`.
- Framework primitives: `Long`, `String`, `BigDecimal`, `Optional<T>`, `Map<K, V>`.
- Framework annotations: `@Transactional`, `@Component`.
- Storage identifiers: `INSERT INTO orders`, `SELECT * FROM ...`, Redis key syntax, Kafka topic names.
- File paths: `services/order/src/...`.

## Examples

### Example 1 — Sharpening a state-transition AC

Prose alone:

> AC-018: A pending order can move to active once payment confirmation arrives, but only if the order has not expired.

Sharpened with pseudocode:

```
| AC-018 | Pending order transitions to Active on payment confirmation, only when within validity window | event-trace: receive PaymentConfirmed → order.state == Active | BR-AC/BR-011 |
```

```pseudocode
on event PaymentConfirmed(OrderId):
    order = lookup(OrderId)
    if order.state ≠ Pending: reject (already terminal)
    if expired(order): reject ORD-0410
    transition(order, Pending → Active)
```

### Example 2 — Sharpening a coupon-precedence AC

Prose alone:

> AC-024: When multiple coupons attach, only one applies, and stacking is not supported.

Sharpened with pseudocode:

```pseudocode
on attach(coupon, cart):
    if cart.has_coupon(): replace existing coupon (no stacking)
    set cart.coupon = coupon
    recompute total(cart)
```

The pseudocode makes the "replace, not stack" semantic explicit without naming a class or method.

### Example 3 — When prose is enough (strip the block)

Prose:

> AC-005: Sign-up rejects email lacking `@`.

Pseudocode candidate:

```pseudocode
if "@" ∉ input.email: reject USR-0422
```

The pseudocode adds no clarity over the prose. Strip it.

### Example 4 — Leakage anti-pattern

Bad:

```pseudocode
order = orderRepository.findById(orderId);
if (order.isEmpty()) throw new OrderNotFoundException();
```

Class identifier (`orderRepository`), method name (`findById`), framework type (`Optional<T>` implied by `isEmpty()`), exception class (`OrderNotFoundException`). Strip everything; reshape as domain ops:

```pseudocode
order = lookup(OrderId)
if order is absent: reject ORD-0404
```
