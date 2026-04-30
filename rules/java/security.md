---
paths:
  - "**/*.java"
---
# Java security

## Rules

- Never concatenate user input into JPQL/SQL/JNDI queries — use parameterized queries (`PreparedStatement`, `:param` in JPA).
- Validate at the controller boundary with `@Valid` + Bean Validation annotations; do not trust DTO contents downstream.
- Hash passwords with BCrypt or Argon2 (Spring Security `PasswordEncoder`); never store plaintext or reversible cipher.
- Externalize secrets (JDBC URLs, API keys) to env vars or Vault; never commit `application-prod.yml` with credentials.
- Logging: redact PII and auth tokens; structured logging via MDC for correlation, not `String.format` of the whole DTO.

## Examples

```java
// Good
@Query("SELECT u FROM User u WHERE u.email = :email")
User findByEmail(@Param("email") String email);

// Bad
em.createQuery("SELECT u FROM User u WHERE u.email = '" + email + "'");
```

## Anti-patterns

- `@PreAuthorize("permitAll()")` on a non-public endpoint — explicit `@Secured` or method-level annotations only.
- Logging full request payloads without redaction — leaks PII to log aggregators.
