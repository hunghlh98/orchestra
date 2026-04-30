---
paths:
  - "**/*"
---
# Common coding-style

## Rules

- Names describe intent (`fetchUser`, not `doIt`); avoid abbreviations except domain idioms.
- One responsibility per file; split when a file grows past ~400 lines.
- Constants live at the top of the file or in a dedicated module; never magic-number a value used twice.
- Public APIs document their contract (inputs, returns, throws); private helpers usually do not need docs.
- Match the surrounding style. If the file uses tabs, use tabs; if 2-space, use 2-space.

## Examples

```js
// Good
const RETRY_LIMIT = 3;
function fetchUser(id) { /* ... */ }

// Bad
function f(x) { for (let i = 0; i < 3; i++) { /* ... */ } }
```

## Anti-patterns

- Dead code (commented-out blocks "in case we need it") — version control already remembers; delete it.
- "Helper" / "utils" dumping grounds — split by domain instead.
