---
paths:
  - "**/*.ts"
  - "**/*.tsx"
---
# TypeScript coding-style

## Rules

- `strict: true` in `tsconfig.json` — non-negotiable; weaker mode hides null-bugs.
- Prefer `type` for unions/intersections; use `interface` for object shapes that may be extended later.
- Never use `any`; if the type is genuinely unknown use `unknown` and narrow at the boundary.
- Use `readonly` on properties and `as const` on literal arrays/objects to communicate immutability.
- `import type { Foo }` for type-only imports — keeps runtime bundles slim and signals intent.

## Examples

```ts
// Good
type Result<T> = { ok: true; value: T } | { ok: false; error: string };
const STATUS = ["open", "closed"] as const;

// Bad
function parse(input: any): any { return JSON.parse(input); }
```

## Anti-patterns

- `// @ts-ignore` to silence errors — use `// @ts-expect-error` with a comment explaining why, or fix the type.
- Mutating shared module-level state — exports become hidden globals; pass state explicitly.
