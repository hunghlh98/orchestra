---
name: java-source-intel
description: "Surfaces caller graphs and impact zones in Java codebases via ripgrep + structural search. Use when @backend works on Java."
origin: orchestra
---

# java-source-intel

Java-specific code intelligence: caller graphs, `@Transactional` boundary scans, JPA entity impact, Spring injection sites. `@backend` invokes when changing a Java method, entity, or component.

## When to use

- `@backend` is changing a Java method and needs to see all callers before estimating blast radius.
- A migration touches an `@Entity` and you need to find every JPQL/JPA query referencing it.
- A `@Transactional` boundary needs auditing — is this method called from inside another transaction? What's the propagation level?
- A Spring component needs refactoring and you want to find all `@Autowired` injection sites.

Skip on non-Java projects. `project-discovery` should have flagged the language; if `primary_language != "java"`, return a no-op.

## Approach

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

## Output shape

When invoked by `@backend`, return a structured impact summary:

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

## When to escalate

- ripgrep returns >100 hits for a target → narrow the search (specific package, specific signature). Don't dump 100 lines into the impact summary.
- A `@Transactional` boundary involves more than 3 propagation levels deep → flag for `@reviewer` and consider a refactor PR before continuing.
- The target is a generic name colliding with stdlib (`get`, `set`, `list`) → ask the user to confirm the fully-qualified target before scanning.

## References

- `references/ripgrep-patterns.md` — extended pattern library for Java idioms.
- `references/transactional-scans.md` — `@Transactional` propagation troubleshooting recipes.

## Worked example

`@backend` is renaming `TransferService.transferFunds` → `TransferService.executeTransfer`:

```
$ rg -n -t java '\.transferFunds\s*\(' src/
src/main/java/com/acme/web/TransferController.java:34: transferService.transferFunds(req)
src/main/java/com/acme/scheduled/RetryJob.java:78:    service.transferFunds(failed)
src/test/java/com/acme/TransferServiceTest.java:42:   service.transferFunds(buildRequest())
```

3 direct call sites. No method-reference uses (`::transferFunds`). All 3 sites need updating in this PR. `@evaluator` runs the test suite and flags any miss.

The structural rename is safe to ship as one commit. Beyond 3 sites — recommend splitting into "rename" + "callers updated" commits for cleaner review.
