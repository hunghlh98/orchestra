---
name: java-development
description: "Java + Spring code intelligence with two surfaces: read-side (caller graphs, @Transactional propagation, JPA entity blast radius, Spring injection sites, persistence-shape priority for reverse-pass) and write-side (coding style, JPA write conventions, security, testing). Use when @backend changes Java code on a Spring project, or when @architect populates TDD S-CONFIG-001 stack-shape rows and runs reverse-pass spec-correctness matching against openapi / asyncapi / clientapi call sites."
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Skill
origin: orchestra
---

# java-development

Java + Spring code intelligence and conventions. Two sides:

- **Read-side**: caller graphs, `@Transactional` boundary scans, JPA entity impact, Spring injection sites — used before changing existing code to estimate blast radius.
- **Write-side**: coding style, patterns, security, testing conventions — used while authoring or modifying code.

`@backend` invokes this skill when `local.yaml.primary_language == "java"` before either reading-for-impact or authoring code. `@architect` invokes for TDD `S-CONFIG-001` row inventory.

## When to use

Read-side triggers:

- `@backend` changing a Java method, needs callers before estimating blast radius.
- Migration touches an `@Entity`; need every JPQL/JPA query referencing it.
- `@Transactional` boundary audit — caller inside transaction? propagation level?
- Spring component refactor — find all `@Autowired` injection sites.

Write-side triggers:

- `@backend` adding new Java source under `src/main/java/**` or tests under `src/test/java/**`.
- Diff hunk introduces or modifies `@Entity`, `@Service`, `@RestController`, repository, DTO.

Skip on non-Java projects. Read `local.yaml.primary_language`; `primary_language != "java"` → no-op.

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

Walk up the graph 1–2 levels. Beyond that, narrow with the user before scanning (result set explodes).

### `@Transactional` boundary scans

Bug shape: a method assumes its caller will manage the transaction, but the caller doesn't.

```bash
# Methods annotated @Transactional (boundary owners)
rg -n -t java '@Transactional(?:\([^)]*\))?\s*$\n(?:\s*public|\s*private|\s*protected)' src/ -A 1
```

Deep-dive (propagation analysis, output-summary shape, refactor scans): `references/transactional-impact.md`.

### JPA entity impact

```bash
# Find the entity declaration
rg -n -t java '@Entity\s+(?:public\s+)?class\s+TransferLedger' src/

# All JPQL queries referencing the entity (in @Query annotations)
rg -n -t java '@Query.*\bTransferLedger\b' src/

# All repository interfaces typed on the entity
rg -n -t java 'JpaRepository<TransferLedger\s*,' src/
rg -n -t java 'CrudRepository<TransferLedger\s*,' src/

# Native SQL referencing the entity's table
rg -n -t java 'nativeQuery\s*=\s*true' src/ -A 3 | rg -i 'transfer_ledger'
```

Non-trivial entity rename or field change → also scan migration files (`db/migration/V*.sql`).

### Spring component injection sites

```bash
# All injection sites for TransferService
rg -n -t java '@Autowired\s+(?:private\s+)?(?:final\s+)?TransferService' src/

# Constructor injection (recommended Spring pattern post-4.3)
rg -n -t java 'public\s+\w+\([^)]*\bTransferService\s+\w+' src/

# Spring's qualifier-based injection
rg -n -t java '@Qualifier\s*\(\s*"transfer\w+"\s*\)' src/
```

### Persistence shape priority (reverse-pass)

Invoked by `@architect` during reverse-pass source-walk of a Java/Spring service. Read sources in PRIORITY ORDER — higher rows are canonical when they conflict with lower rows:

1. **`src/main/resources/db/migration/V*.sql` (Flyway)** OR **`db/changelog/*.xml` (Liquibase)** when present — canonical schema.
2. **Entity classes (`@Entity`)** — fallback when migrations absent.

**Entity-table parity check.** Walk each entity against the resolved schema:

- **Ghost column** — entity declares a field with `@Column` that no migration creates. Open a `DIV-NNN` row.
- **Orphan column** — migration creates a column the entity does not map. Open a separate `DIV-NNN` row.
- **Cross-service table** — entity maps a table owned by another service. Drop the local `@Entity` via `fix-source` and write `DEFECT-cross-service-entity-<slug>.md`.

Each ghost / orphan opens its OWN `DIV-NNN` (do not bundle).

---

## Write-side: conventions

Full write-side conventions (style / patterns / security / testing with Good/Bad examples) at `references/jpa-write-conventions.md`. Apply when authoring or modifying Java sources.

---

## TDD `S-CONFIG-001` rows (Java/Spring)

Invoked when `@architect` is authoring `<feature-id>-TDD.md`. `S-CONFIG-001` is canonical home for deployable's stack-shape (NOT PRD goals). Walk `src/main/resources/application.yml` + `pom.xml` and record EVERY row below explicitly. Mark dependency scope (`production` / `test-only` / `latent — no callsite`) for every persistence + RPC framework.

Required rows:

- Build tool + runtime version + run commands.
- Persistence (RDBMS): driver FQN, connection URL pattern (env-var-substituted, no literal credentials), schema name.
- Persistence (ORM): API + provider, dialect class.
- Persistence (schema management): migration tool name OR explicit "none + `ddl-auto: update`" with risk note.
- Persistence (connection pool): impl name, every non-default-tuned key.
- Persistence (transaction manager): class + `TransactionPort` adapter wiring.
- Cache layer: client lib, every non-default connection key.
- Messaging (Kafka/AMQP): client lib + every non-default consumer/producer key (`auto-offset-reset`, etc.).
- Serialization (Jackson/etc.): every explicit override affecting wire format.
- Resilience patterns: per instance — name, retry config, circuit-breaker config, **Java callsite check (REQUIRED)**: for each instance in `application.yml`, grep source for `@Retry(name = "<x>")`, `@CircuitBreaker(name = "<x>")`, programmatic `Registry.get("<x>")`. Zero callsites → tag row `(latent — no callsite)` AND open a `DIV-NNN` row in TSR (forward-chain) or surface in reverse-pass run report. Same liveness check applies to any other instance-keyed config.
- Application identity: `spring.application.name` / equivalent.
- Test-scope dependencies: explicit row distinguishing test-only libs (H2, Testcontainers) from production driver.

---

## Spec-correctness match rules (reverse-pass audit)

Invoked by `@architect`'s post-pass spec-correctness audit after `task: feature-narrowing` deliverables close. For each sampled endpoint / channel / outbound operation, match the spec field against the Spring call site:

**openapi.yaml** — sampled endpoints:

- `paths.<route>.<method>.requestBody.content.application/json.schema` MUST match the controller's `@RequestBody <Type>` source class shape (field names + nullability).
- `parameters` MUST match `@PathVariable` / `@RequestParam` annotations on the controller method signature.
- `responses` MUST cover the controller's return-type AND every `@ExceptionHandler` mapped error code-path. Missing `responses.<status>` for an emitted `@ExceptionHandler` is a `DIV-NNN` candidate.

**asyncapi.yaml** — sampled channels:

- `channels.<topic>.publish.message.payload` MUST match the Kafka producer's `KafkaTemplate.send(<topic>, <key>, <value>)` value-type.
- `channels.<topic>.subscribe.message.payload` MUST match the `@KafkaListener(topics = "<topic>")` argument-type (or `ConsumerRecord<K,V>` `V`).

**clientapi.yaml** — sampled outbound operations:

- Each operation MUST match the adapter's `RestTemplate.exchange(<url>, <method>, <HttpEntity>, <responseType>)` call site OR `WebClient.<method>().uri(<url>).bodyValue(<req>).retrieve().bodyToMono(<resp>)`.
- Path template MUST match the call site's URL template; request body type MUST match `bodyValue` arg; expected response type MUST match `bodyToMono` arg.

**Mismatch resolution.** `@architect` appends one `DIV-NNN` row per mismatch to feature TDD `S-DIVERGENCES-001`: `source file:line | spec field | drift type | resolution-path-hint`. Hint = `ratify-spec` (lift source shape into the spec) OR `fix-source` (correct the Spring code). Dispatcher routes the chosen path.

## When to escalate

- ripgrep returns >100 hits → narrow the search. Don't dump 100 lines into impact summary.
- `@Transactional` boundary >3 propagation levels deep → flag for `@reviewer`; consider refactor PR first.
- Target is generic name colliding with stdlib (`get`, `set`, `list`) → ask user to confirm fully-qualified target.
- Diff intentionally violates a write-side rule (legacy code must stay null-returning) → leave 1-line code comment with reason.

## References

- `references/transactional-impact.md` — propagation deep-dive, impact-summary output shape, common refactor scans, worked example.
- `references/jpa-write-conventions.md` — full coding style / patterns / security / testing conventions with Good/Bad examples.
