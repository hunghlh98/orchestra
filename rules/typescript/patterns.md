---
paths:
  - "**/*.ts"
  - "**/*.tsx"
---
# TypeScript patterns

## Rules

- Discriminated unions over boolean flags for state machines: `{ kind: "loading" } | { kind: "ready", data: T }`.
- Use `Result<T, E>`-style returns instead of throwing for expected failure paths; reserve `throw` for invariant violations.
- Prefer `Array.prototype.map/filter/reduce` for transformation pipelines; loops are fine for side effects but call them out.
- Co-locate types with the code that uses them; move to a shared `types.ts` only when 3+ modules import the same type.
- Use enums sparingly — string-literal unions (`type Status = "open" | "closed"`) are smaller and tree-shake better.

## Examples

```ts
// Good
type State = { kind: "idle" } | { kind: "fetching" } | { kind: "error"; msg: string };

// Bad
class State { isIdle = true; isFetching = false; isError = false; }
```

## Anti-patterns

- Generic `Record<string, any>` parameter types — no IDE help, no type safety; spell out the keys you actually accept.
- Re-exporting `*` through index barrels — slows IDE, hides circular imports, breaks tree-shaking.
