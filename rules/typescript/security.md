---
paths:
  - "**/*.ts"
  - "**/*.tsx"
---
# TypeScript security

## Rules

- Validate untrusted input at the boundary with Zod / io-ts; never `as` cast a parsed JSON to a typed shape and trust it.
- Sanitize output for the destination (HTML escape for DOM, parameterize for SQL, JSON.stringify for JSON contexts).
- Never `eval` or `new Function(...)` user input; import dynamic modules only from a controlled allowlist.
- Treat `process.env` as untrusted strings — coerce + validate (`z.string().url().parse(env.DATABASE_URL)`); fail-fast on bad config.
- React: avoid `dangerouslySetInnerHTML`; if unavoidable, sanitize through DOMPurify with an explicit allowlist.

## Examples

```ts
// Good
const Body = z.object({ email: z.string().email() });
const { email } = Body.parse(req.body);

// Bad
const email = (req.body as any).email; // unchecked
```

## Anti-patterns

- Storing JWTs in `localStorage` — XSS-readable; use httpOnly cookies for session tokens in browser apps.
- `cors({ origin: "*", credentials: true })` — the spec disallows it; either pin origins or drop credentials.
