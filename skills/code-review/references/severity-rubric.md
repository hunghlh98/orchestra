# Code-review severity rubric — extended examples

Companion to `skills/code-review/SKILL.md`. Severity grading is closed: every finding tags exactly one of Critical / Major / Minor / Nit.

## Critical

**Definition**: security flaw, data-loss path, broken contract, unhandled adversarial input.

**Effect**: Auto-`REQUEST_CHANGES`. No threshold.

Examples:

- SQL injection: `em.createQuery("SELECT u FROM User u WHERE u.email = '" + input + "'")` — string concatenation of user input.
- Auth bypass: `@PreAuthorize("permitAll()")` on a privileged endpoint.
- Secret in code or log: hardcoded `password = "admin123"`, or `log.info("user: {}", user)` where user contains password hash.
- Idempotency-key violation: same key, different body → 201 (creates duplicate ledger row) instead of 409.
- Race condition: writes outside transactional boundary, dual-publish to event bus + DB without compensation.
- Missing input validation at trust boundary: HTTP handler accepts unbounded `amount: BigDecimal` without range check.

## Major

**Definition**: logic bug, missing error path, incorrect domain modeling, broken test, race condition not in critical category.

**Effect**: ≥1 → `REQUEST_CHANGES`.

Examples:

- Out-of-scope edit: PR titled "fix login bug" also reformats `OrderService.java` (Karpathy rule 2 violation).
- Unbounded memory: in-memory cache without TTL or LRU eviction.
- N+1 query: `for (order in orders) { orderRepo.findItemsForOrder(order.id) }`.
- Missing error path: `catch (Exception e) {}` swallows everything; no logging, no retry, no propagation.
- Speculative abstraction: introduces `OrderProcessorFactoryBuilder` for a single-use case.
- Missing test for a new feature path (when test coverage gate was triggered).
- Diagram missing paired SVG render (`.puml` without `.svg` next to it).

## Minor

**Definition**: idiom violation, weak naming, dead code, style drift, incomplete comments.

**Effect**: ≥3 → `REQUEST_CHANGES`, else inline comment.

Examples:

- Variable named `d` instead of `daysSinceLastLogin`.
- Function does 4 things but isn't extracted into named steps.
- Magic number `5` instead of `MAX_LOGIN_ATTEMPTS`.
- Commented-out code left behind.
- Inconsistent error-handling style (sometimes return null, sometimes throw — within the same module).
- Comment explains *what* instead of *why*: `// increment counter` above `counter++`.

## Nit

**Definition**: subjective preference, micro-optimization, formatting.

**Effect**: Inline comment, never blocking.

Examples:

- Could use `Stream.toList()` instead of `Collectors.toList()` (Java 16+).
- Single-line vs multi-line formatting on a short conditional.
- Could prefer `Map.of()` over `new HashMap<>()` for a 2-entry constant.
- Alphabetize imports.

## Edge cases — severity choice

- **Performance miss that risks data loss**: Critical (not Major). Example: unbounded queue that blocks producer until OOM.
- **Test that's broken but only tests an internal helper**: Minor (not Major). Helper-test breakage doesn't risk shipping bugs to users; production-path test breakage does.
- **"Improvement" on neighboring code that's actually a bugfix**: surface as a separate PR. Tag the original change as Major (out-of-scope); ask for the bugfix to be split into its own commit with proper test coverage.
