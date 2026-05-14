---
name: java-development
description: "Java/Spring read-side intel (caller graphs, @Transactional, JPA impact) and write-side conventions (style/patterns/security/testing). Invoked by @backend on Java projects."
origin: orchestra
---

# java-development

Java + Spring code intelligence and conventions. Two sides:

- **Read-side**: caller graphs, `@Transactional` boundary scans, JPA entity impact, Spring injection sites — used before changing existing code to estimate blast radius.
- **Write-side**: coding style, patterns, security, and testing conventions — used while authoring or modifying code.

`@backend` invokes this skill when `local.yaml.primary_language == "java"` (or analogous discovery flag) before either reading-for-impact or authoring code.

## When to use

Read-side triggers:

- `@backend` is changing a Java method and needs to see all callers before estimating blast radius.
- A migration touches an `@Entity` and you need to find every JPQL/JPA query referencing it.
- A `@Transactional` boundary needs auditing — is this method called from inside another transaction? What's the propagation level?
- A Spring component needs refactoring and you want to find all `@Autowired` injection sites.

Write-side triggers:

- `@backend` is adding new Java source under `src/main/java/**` or tests under `src/test/java/**`.
- A diff hunk introduces or modifies an `@Entity`, `@Service`, `@RestController`, repository, or DTO.

Skip on non-Java projects. Read `local.yaml.primary_language`; if `primary_language != "java"`, return a no-op.

---

## Read-side: source intel

### Caller graph (impact analysis)

```bash
# Direct calls to public method "transferFunds" on TransferService
rg -n -t java '\.transferFunds\s*\(' src/

# Calls including method-reference syntax (Java 8+)
rg -n -t java '(?:\.|::)transferFunds\b'

# Calls via Spring DI: find autowired fields, then their usage
rg -n -t java '@Autowired\s+(?:private\s+)?(?:final\s+)?TransferService\s+(\w+)' src/
# → for each captured field name: rg -n -t java "\.<field-name>\.transferFunds"
```

Walk up the graph 1–2 levels. Beyond that, narrow with the user before scanning further (result set explodes).

### `@Transactional` boundary scans

The bug shape: a method assumes its caller will manage the transaction, but the caller doesn't.

```bash
# Methods annotated @Transactional (boundary owners)
rg -n -t java '@Transactional(?:\([^)]*\))?\s*$\n(?:\s*public|\s*private|\s*protected)' src/ -A 1

# Inner calls from @Transactional methods to other @Transactional methods
# (Spring default propagation REQUIRED reuses the outer transaction; REQUIRES_NEW starts a new one)
rg -n -t java '@Transactional.*propagation\s*=\s*Propagation\.(REQUIRES_NEW|NESTED)' src/
```

Flag for `@reviewer`: any `REQUIRES_NEW` inside a method that's already `@Transactional` — outer commit happens only if outer scope completes; surprising rollback semantics.

### JPA entity impact

When changing an `@Entity`:

```bash
# Find the entity declaration
rg -n -t java '@Entity\s+(?:public\s+)?class\s+TransferLedger' src/

# All JPQL queries referencing the entity (in @Query annotations)
rg -n -t java '@Query.*\bTransferLedger\b' src/

# All repository interfaces typed on the entity
rg -n -t java 'JpaRepository<TransferLedger\s*,' src/
rg -n -t java 'CrudRepository<TransferLedger\s*,' src/

# Native SQL referencing the entity's table (may use snake_case mapping)
rg -n -t java 'nativeQuery\s*=\s*true' src/ -A 3 | rg -i 'transfer_ledger'
```

For non-trivial entity rename or field change, also scan migration files (`db/migration/V*.sql`) for the table name.

### Spring component injection sites

```bash
# All injection sites for TransferService
rg -n -t java '@Autowired\s+(?:private\s+)?(?:final\s+)?TransferService' src/

# Constructor injection (recommended Spring pattern post-4.3)
rg -n -t java 'public\s+\w+\([^)]*\bTransferService\s+\w+' src/

# Spring's qualifier-based injection
rg -n -t java '@Qualifier\s*\(\s*"transfer\w+"\s*\)' src/
```

### Common refactor scans

| Refactor | ripgrep command shape |
|---|---|
| Rename method | `rg -n '\.<old-name>\s*\('` then `\b<old-name>\b` for member-ref syntax |
| Move package | `rg -n 'import com\.acme\.<old-pkg>\.'` |
| Change method signature (add param) | `rg -n '\.<method>\s*\([^)]*\)'` — count call sites; each needs an update |
| Deprecate | `rg -n '@Deprecated' src/` then walk callers |

### Output shape (read-side)

When invoked by `@backend` for impact analysis, return a structured impact summary:

```markdown
## Impact analysis: <target>

### Direct callers
- src/main/java/com/acme/web/TransferController.java:34 — calls transferFunds in handleTransfer
- src/main/java/com/acme/scheduled/RetryJob.java:78 — calls transferFunds in retryFailed

### Transactional boundaries
- TransferController.handleTransfer is NOT @Transactional (relies on TransferService.transferFunds)
- RetryJob.retryFailed IS @Transactional (REQUIRED) — uses outer transaction

### Injected by
- 3 components autowire TransferService (TransferController, RetryJob, AdminApi)

### Test coverage
- 4 tests reference transferFunds (TransferServiceTest, IntegrationTest, ...)

### Risk flags
- ⚠ TransferController.handleTransfer adds @Transactional in this PR — was previously not transactional. Verify intent.
```

---

## Write-side: conventions

Apply these rules when authoring or modifying Java sources.

### Coding style

- Use `final` on fields and parameters whenever possible — communicates immutability and helps the JIT.
- Class names PascalCase; method/field names camelCase; constants SCREAMING_SNAKE_CASE.
- Prefer `Optional<T>` returns over `null` for "absent" values; never return `Optional<Collection>` (return an empty collection).
- Use `var` (Java 10+) for obvious local types; spell out the type when it is not obvious from the RHS.
- Imports sorted; no wildcard imports except for static imports of test assertions.

```java
// Good
final Optional<User> user = repo.findById(id);
public List<User> getUsers() { return Collections.emptyList(); }

// Bad
public List<User> getUsers() { return null; }
```

Anti-patterns:

- `null` as a sentinel value — use `Optional`, an empty collection, or a dedicated sentinel object.
- Instance fields without `final` modifier when no setter exists — silently allows reflection mutation.

### Patterns

- Prefer composition over inheritance; reach for `interface` first, abstract class only when shared state requires it.
- One `@Transactional` boundary per use case; nesting is a code smell — refactor into separate methods.
- Use builders (Lombok `@Builder` or hand-rolled) for objects with >3 fields or any optional fields.
- Constructor injection over `@Autowired` field injection — testable, immutable, no reflection magic at startup.
- Prefer `record` (Java 16+) over hand-written DTO classes for immutable data carriers.

```java
// Good
public record UserDto(UUID id, String name) {}
class FooService { private final BarService bar; FooService(BarService bar) { this.bar = bar; } }

// Bad
@Service class FooService { @Autowired private BarService bar; }
```

Anti-patterns:

- Static singletons holding mutable state — replace with a Spring-managed bean or pass dependencies in.
- `@Transactional(REQUIRES_NEW)` to "fix" rollback issues — usually the wrong fix; investigate the actual boundary.

### Security

- Never concatenate user input into JPQL/SQL/JNDI queries — use parameterized queries (`PreparedStatement`, `:param` in JPA).
- Validate at the controller boundary with `@Valid` + Bean Validation annotations; do not trust DTO contents downstream.
- Hash passwords with BCrypt or Argon2 (Spring Security `PasswordEncoder`); never store plaintext or reversible cipher.
- Externalize secrets (JDBC URLs, API keys) to env vars or Vault; never commit `application-prod.yml` with credentials.
- Logging: redact PII and auth tokens; structured logging via MDC for correlation, not `String.format` of the whole DTO.

```java
// Good
@Query("SELECT u FROM User u WHERE u.email = :email")
User findByEmail(@Param("email") String email);

// Bad
em.createQuery("SELECT u FROM User u WHERE u.email = '" + email + "'");
```

Anti-patterns:

- `@PreAuthorize("permitAll()")` on a non-public endpoint — explicit `@Secured` or method-level annotations only.
- Logging full request payloads without redaction — leaks PII to log aggregators.

### Testing

- One behavior per test name; if a test has 5 unrelated assertions, split it into 5 tests.
- Use AssertJ (`assertThat(x).isEqualTo(y)`) over JUnit's vanilla assertions — better failure messages and fluent chaining.
- `@MockBean` only when you need Spring context wiring; prefer `@Mock` + `@InjectMocks` (Mockito) for pure unit tests.
- Integration tests use Testcontainers for real DB / Kafka / Redis — never mock the persistence layer for integration scope.
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

Anti-patterns:

- `@MockBean` everything in an integration test — defeats the integration-test purpose.
- `Thread.sleep(...)` to wait for async events — use Awaitility with proper conditions instead.

---

## When to escalate

- ripgrep returns >100 hits for a target → narrow the search (specific package, specific signature). Don't dump 100 lines into the impact summary.
- A `@Transactional` boundary involves more than 3 propagation levels deep → flag for `@reviewer` and consider a refactor PR before continuing.
- The target is a generic name colliding with stdlib (`get`, `set`, `list`) → ask the user to confirm the fully-qualified target before scanning.
- A diff intentionally violates a write-side rule (e.g., legacy code that must stay null-returning) → leave a 1-line code comment with the reason; `@reviewer` decides whether to accept.

## Worked example

`@backend` is renaming `TransferService.transferFunds` → `TransferService.executeTransfer` and adding a new overload:

```
$ rg -n -t java '\.transferFunds\s*\(' src/
src/main/java/com/acme/web/TransferController.java:34: transferService.transferFunds(req)
src/main/java/com/acme/scheduled/RetryJob.java:78:    service.transferFunds(failed)
src/test/java/com/acme/TransferServiceTest.java:42:   service.transferFunds(buildRequest())
```

Read-side output: 3 direct call sites. No method-reference uses (`::transferFunds`). All 3 sites need updating in this PR.

Write-side application: the new overload uses constructor injection (patterns), takes `final` parameters (style), uses `:param` JPQL not string concat (security), and ships with a `shouldExecuteTransfer_whenInputValid()` test using AssertJ + `@Mock` (testing). `@test` Stage-2 runs the suite and confirms PASS.

The structural rename is safe to ship as one commit. Beyond 3 sites — recommend splitting into "rename" + "callers updated" commits for cleaner review.
