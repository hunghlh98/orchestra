# Java/Spring write-side conventions

Apply when authoring or modifying Java sources. Loaded by `@backend` writing new source under `src/main/java/**` or tests under `src/test/java/**`.

## Coding style

- `final` on fields and parameters whenever possible — communicates immutability, helps JIT.
- PascalCase classes; camelCase methods/fields; SCREAMING_SNAKE_CASE constants.
- Prefer `Optional<T>` over `null` for absent values; never return `Optional<Collection>` (return empty collection).
- `var` (Java 10+) for obvious local types; spell out otherwise.
- Imports sorted; no wildcard imports except static test assertions.

```java
// Good
final Optional<User> user = repo.findById(id);
public List<User> getUsers() { return Collections.emptyList(); }

// Bad
public List<User> getUsers() { return null; }
```

Anti-patterns: `null` as sentinel; instance fields without `final` when no setter exists.

## Patterns

- Composition over inheritance; reach for `interface` first, abstract class only when shared state requires it.
- One `@Transactional` boundary per use case; nesting is a code smell.
- Builders (Lombok `@Builder` or hand-rolled) for objects with >3 fields or any optional fields.
- Constructor injection over `@Autowired` field injection.
- `record` (Java 16+) over hand-written DTO classes.

```java
// Good
public record UserDto(UUID id, String name) {}
class FooService { private final BarService bar; FooService(BarService bar) { this.bar = bar; } }

// Bad
@Service class FooService { @Autowired private BarService bar; }
```

Anti-patterns: static singletons holding mutable state; `@Transactional(REQUIRES_NEW)` as rollback workaround.

## Security

- Never concatenate user input into JPQL/SQL/JNDI — parameterized queries (`PreparedStatement`, `:param` in JPA).
- Validate at controller boundary with `@Valid` + Bean Validation; don't trust DTO contents downstream.
- Hash passwords with BCrypt or Argon2 (Spring Security `PasswordEncoder`).
- Externalize secrets to env vars or Vault.
- Redact PII and auth tokens in logs; structured logging via MDC.

```java
// Good
@Query("SELECT u FROM User u WHERE u.email = :email")
User findByEmail(@Param("email") String email);

// Bad
em.createQuery("SELECT u FROM User u WHERE u.email = '" + email + "'");
```

Anti-patterns: `@PreAuthorize("permitAll()")` on non-public endpoint; logging full request payloads unredacted.

## Testing

- One behavior per test name; 5 unrelated assertions → 5 tests.
- AssertJ (`assertThat(x).isEqualTo(y)`) over vanilla JUnit.
- `@MockBean` only when needing Spring context; prefer `@Mock` + `@InjectMocks` for pure unit tests.
- Integration tests use Testcontainers for real DB / Kafka / Redis — never mock persistence for integration scope.
- Test names describe behavior: `shouldReturnEmpty_whenUserNotFound()`, not `testGetUser1()`.

```java
// Good
@Test void shouldRejectExpiredToken() {
  assertThatThrownBy(() -> service.validate(EXPIRED))
      .isInstanceOf(TokenExpiredException.class);
}

// Bad
@Test void test1() { service.validate(t); /* no assertion */ }
```

Anti-patterns: `@MockBean` everything in integration test; `Thread.sleep(...)` for async — use Awaitility.
