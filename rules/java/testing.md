---
paths:
  - "**/*.java"
---
# Java testing

## Rules

- One behavior per test name; if a test has 5 unrelated assertions, split it into 5 tests.
- Use AssertJ (`assertThat(x).isEqualTo(y)`) over JUnit's vanilla assertions — better failure messages and fluent chaining.
- `@MockBean` only when you need Spring context wiring; prefer `@Mock` + `@InjectMocks` (Mockito) for pure unit tests.
- Integration tests use Testcontainers for real DB / Kafka / Redis — never mock the persistence layer for integration scope.
- Test names describe behavior: `shouldReturnEmpty_whenUserNotFound()`, not `testGetUser1()`.

## Examples

```java
// Good
@Test void shouldRejectExpiredToken() {
  assertThatThrownBy(() -> service.validate(EXPIRED))
      .isInstanceOf(TokenExpiredException.class);
}

// Bad
@Test void test1() { service.validate(t); /* no assertion */ }
```

## Anti-patterns

- `@MockBean` everything in an integration test — defeats the integration-test purpose.
- `Thread.sleep(...)` to wait for async events — use Awaitility with proper conditions instead.
