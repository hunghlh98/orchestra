---
name: business-analysis
description: "BR/AC authoring discipline + pseudocode shaping. Invoked by @analyst when drafting <feature-id>-FRS.md from a locked PRD."
origin: orchestra
---

# business-analysis

Turns a locked PRD into FRS-grade business rules (BR), acceptance criteria (AC), and pseudocode that sharpens AC without leaking implementation detail. `@analyst` invokes when authoring `<feature-id>-FRS.md`. The skill keeps three discriminations sharp:

- **BR vs AC** — signable rule vs observable test condition.
- **Feature-grain vs service-grain** — FRS `S-AC-001` (this feature) vs BR-AC `S-BR-001` / `S-INVARIANTS-001` (the whole service).
- **Prose vs pseudocode** — when an English sentence is enough, and when a code-shaped block clarifies behaviour.

## When to use

- `@analyst` is drafting `<feature-id>-FRS.md` `S-FR-001` / `S-AC-001` from a locked PRD.
- A surfaced rule needs deciding: feature-grain AC OR service-grain BR-AC ESCALATE.
- An AC carries ambiguity an English sentence cannot resolve — pseudocode candidates emerge.
- Reverse-pass: derive AC rows from `@architect`'s reverse-pass TDD + openapi.

## Approach

### Step 1 — Lift goals from PRD

Read PRD `S-VISION-001` + `S-GOALS-001` + `S-NON-GOALS-001` + `S-NFR-001` + `S-STAKEHOLDERS-001`. List every observable user-facing behaviour the PRD asserts. Each entry becomes one or more `FR-N` rows.

### Step 2 — BR vs AC vs INV discrimination

| Kind | Lifetime | Owner | Grain | Goes to |
|---|---|---|---|---|
| **BR** | Stable, signable | Named human (Finance, Compliance, Platform-Lead) | Service-wide | `<service_name>-BR-AC.md` `S-BR-001` via `@architect` ESCALATE-BR |
| **AC** | Feature-bound | Engineering | Feature-scope | `<feature-id>-FRS.md` `S-AC-001` |
| **INV** | Implementer-only | No human signer | Service-wide | `<service_name>-BR-AC.md` `S-INVARIANTS-001` via `@architect` ESCALATE-BR |

If a candidate row could be signed by a named human role (Finance signs refund-window policy; Compliance signs KYC threshold), it's a BR — ESCALATE-BR. If it's an implementer consistency rule (idempotency-key derivation, ordering, currency precision), it's an INV — ESCALATE-BR routes via `@architect`. Everything else is feature-grain AC and stays in FRS.

See `references/br-ac-patterns.md` for worked examples.

### Step 3 — AC row authoring

`S-AC-001` row shape:

```
| AC-NNN | <assertion> | <verification surface> | <Traces> |
```

- **assertion** — single declarative sentence. Observable input/output, no internal state references.
- **verification surface** — what test surface confirms it: `HTTP 200 with body { … }`, `event PaymentSucceeded emitted`, `aggregate state = Active`, `user-visible error code ORD-0409`.
- **Traces** — MUST cite parent `BR-AC/BR-NNN`, `BR-AC/AC-NNN`, `BR-AC/INV-NNN`, or `business-invariants.md/INV-NNN`. Empty Traces = structural failure.

For every AC row, ask: "Could a tester (black-box) confirm this without reading source?" If not, the assertion is implementation-coupled — reshape until observable.

### Step 4 — Pseudocode shaping (when an AC needs sharpening)

Pseudocode is permitted INLINE under an AC when prose alone leaves the assertion ambiguous. Pseudocode obeys:

- Field-names are domain nouns (`OrderId`, `Money`, `Address`), not framework types (`Long`, `BigDecimal`, `String`).
- No class/method/package paths.
- No framework annotations (`@Transactional`, `@Service`).
- Fenced as `pseudocode` blocks. Length ≤ 10 lines per AC.

See `references/pseudocode-shaping.md` for when pseudocode helps and when it leaks.

### Step 5 — Error-class taxonomy

`S-ERRORS-001` enumerates user-visible error classes with intended UX. Each class lifts to ≥1 AC row asserting the error surface. Naming uses uppercase namespace + 4-digit code: `ORD-0409`, `PAY-0422`. Class names are PRD/FRS grain (visible to support lead); HTTP-status binding moves to TDD/openapi (`@architect`).

### Step 6 — Lock

Self-check before flipping `status: locked`:

- Every `FR-N` cites ≥1 `AC-NNN` it satisfies.
- Every `AC-NNN.Traces` cell is non-empty.
- No `## Open Questions`, `S-OPEN-Q-*`, `TBD`, `pending`, or `?`-suffixed declarative claims.
- All `AskUserQuestion` rounds resolved.
- All `ESCALATE-BR` / `ESCALATE-ADR` markers written for surfaced cross-tier concerns.

Flip locked; hand to dispatcher.

## Outputs

- `<feature-id>-FRS.md` rows under `S-FR-001` + `S-AC-001`.
- Pseudocode blocks inline under AC rows (when applicable).
- `ESCALATE-BR` markers for cross-tier business policy surfacing.

## References

- `references/br-ac-patterns.md` — discrimination worked examples.
- `references/pseudocode-shaping.md` — pseudocode shape + anti-patterns.
