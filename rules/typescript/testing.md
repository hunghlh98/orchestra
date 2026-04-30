---
paths:
  - "**/*.ts"
  - "**/*.tsx"
---
# TypeScript testing

## Rules

- Test the public API, not internals; if you need to test a private function, it probably should be its own module.
- Use Vitest or Jest with `--coverage`; aim for branches >80% on business logic, lower for glue code is fine.
- Mock external boundaries (HTTP, DB, time), not your own code; use `msw` for HTTP and a fake clock for time.
- One behavior per `it(...)`; the test name is the spec — `it("rejects when password is too short")`.
- Snapshot tests are last-resort for stable rendered output; never snapshot mutable structures (timestamps, UUIDs).

## Examples

```ts
// Good
it("rejects when token is expired", async () => {
  await expect(validate(expiredToken)).rejects.toThrow(TokenExpiredError);
});

// Bad
it("works", () => { foo(); /* no assertion */ });
```

## Anti-patterns

- `jest.mock()` everything in an integration test — defeats the purpose; use real adapters with test fixtures.
- Sharing mutable state (`let user = ...`) across tests — order-dependent flakes; use `beforeEach`.
