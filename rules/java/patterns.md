---
paths:
  - "**/*.java"
---
# Java patterns

## Rules

- Prefer composition over inheritance; reach for `interface` first, abstract class only when shared state requires it.
- One `@Transactional` boundary per use case; nesting is a code smell — refactor into separate methods.
- Use builders (Lombok `@Builder` or hand-rolled) for objects with >3 fields or any optional fields.
- Constructor injection over `@Autowired` field injection — testable, immutable, no reflection magic at startup.
- Prefer `record` (Java 16+) over hand-written DTO classes for immutable data carriers.

## Examples

```java
// Good
public record UserDto(UUID id, String name) {}
class FooService { private final BarService bar; FooService(BarService bar) { this.bar = bar; } }

// Bad
@Service class FooService { @Autowired private BarService bar; }
```

## Anti-patterns

- Static singletons holding mutable state — replace with a Spring-managed bean or pass dependencies in.
- `@Transactional(REQUIRES_NEW)` to "fix" rollback issues — usually the wrong fix; investigate the actual boundary.
