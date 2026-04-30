---
paths:
  - "**/*.java"
---
# Java coding-style

## Rules

- Use `final` on fields and parameters whenever possible — communicates immutability and helps the JIT.
- Class names PascalCase; method/field names camelCase; constants SCREAMING_SNAKE_CASE.
- Prefer `Optional<T>` returns over `null` for "absent" values; never return `Optional<Collection>` (return an empty collection).
- Use `var` (Java 10+) for obvious local types; spell out the type when it is not obvious from the RHS.
- Imports sorted; no wildcard imports except for static imports of test assertions.

## Examples

```java
// Good
final Optional<User> user = repo.findById(id);
public List<User> getUsers() { return Collections.emptyList(); }

// Bad
public List<User> getUsers() { return null; }
```

## Anti-patterns

- `null` as a sentinel value — use `Optional`, an empty collection, or a dedicated sentinel object.
- Instance fields without `final` modifier when no setter exists — silently allows reflection mutation.
