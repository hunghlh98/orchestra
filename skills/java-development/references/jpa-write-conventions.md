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

## JPA mapping

- `@OneToMany.mappedBy` references a `@ManyToOne` / `@OneToOne` on the inverse side. Scalar `@Column` on inverse = malformed; Hibernate silently joins on parent PK and returns empty collection.
- Unidirectional `@OneToMany` → `@JoinColumn(name=..., referencedColumnName=..., insertable=false, updatable=false)`. Pin `referencedColumnName` to the business key when FK targets a non-PK column.
- Read path that dereferences a lazy collection → `@EntityGraph(attributePaths = "<assoc>")` on the query method. `@Transactional(readOnly = true)` is the fallback when graph hints aren't viable.
- `spring.jpa.open-in-view: false` is the production posture. OSIV masks lazy-init footguns until the first real GET.
- `spring.jpa.hibernate.ddl-auto: validate` is the steady-state. `none` only during a reshape (with a DEFECT row tracking the gap). `update` is always a defect — it permits silent drift in both directions.

```java
// Good — unidirectional @OneToMany to a non-PK business key
@OneToMany(cascade = ALL, orphanRemoval = true)
@JoinColumn(name = "order_id", referencedColumnName = "order_id",
            insertable = false, updatable = false)
private List<OrderItemEntity> items = new ArrayList<>();

@EntityGraph(attributePaths = "items")
Optional<OrderEntity> findByOrderId(long orderId);

// Bad — mappedBy points at a scalar @Column; read returns []
@OneToMany(mappedBy = "orderId", cascade = ALL)
private List<OrderItemEntity> items;
```

Anti-patterns: `FetchType.EAGER` as a lazy-init workaround; `@Transactional` on every controller method as a session-extension trick.

## Jackson conventions

- Inbound event DTOs (Kafka consumer, third-party webhook) carry `@JsonIgnoreProperties(ignoreUnknown = true)`. The publisher owns the schema; consumers tolerate extra fields.
- Outbound REST DTOs and surfaces we author do NOT carry it. Unknown fields on our surfaces signal a bug — fail loud.
- Immutable domain objects round-tripped through a cache require `@JsonCreator` on the canonical constructor + `@JsonProperty` per parameter. Plain `final`-field constructors are non-deserializable.
- `record` types in Jackson 2.12+ are auto-discovered — prefer `record` over hand-rolled immutables when no inheritance is needed.

```java
// Good — inbound event tolerates publisher-added fields
@JsonIgnoreProperties(ignoreUnknown = true)
public class PaymentSucceededEvent {
  private final long orderId;
  private final String paymentIntentId;

  @JsonCreator
  public PaymentSucceededEvent(@JsonProperty("orderId") long orderId,
                               @JsonProperty("paymentIntentId") String paymentIntentId) {
    this.orderId = orderId;
    this.paymentIntentId = paymentIntentId;
  }
}

// Bad — Jackson cannot construct immutable without @JsonCreator
public class OrderMetadataSnapshot {
  private final UUID id;
  public OrderMetadataSnapshot(UUID id) { this.id = id; }   // → InvalidDefinitionException
}
```

Anti-patterns: global `FAIL_ON_UNKNOWN_PROPERTIES = false` (relaxes our own REST validation); annotating outbound DTOs with `@JsonIgnoreProperties(ignoreUnknown = true)`.

## Kafka topic binding

- `@KafkaListener` and `KafkaTemplate.send()` reference the topic **value**, not the publisher constant's **symbol name**. Read the producer source to confirm the literal.
- Topic strings live in `application.yml` under `kafka.topics:` and resolve via `${kafka.topics.<name>}`. Yml is authority; annotation defaults document intent and defend against accidental yml deletion.
- Every state-mutating `@KafkaListener` logs INFO on receipt with `topic` / `partition` / `offset` and a second INFO on transition outcome. Silent success is indistinguishable from "no message arrived" during bring-up.
- `auto.create.topics.enable` masks topic-name mismatches with empty auto-created topics. Confirm topic existence + producer activity via `kafka-consumer-groups --describe`.

```java
// Good — annotation default matches yml value, both equal the publisher's topic
@KafkaListener(
    topics = "${kafka.topics.payment-succeeded:billing.payment.succeeded}",
    groupId = "billing-order-payment-success")
public void onPaymentSucceeded(ConsumerRecord<String, String> record, Acknowledgment ack) {
  log.info("Received PaymentSucceeded: topic={}, partition={}, offset={}",
           record.topic(), record.partition(), record.offset());
  // ...
  log.info("Transitioned PENDING_PAYMENT->PAID: orderId={}", orderId);
  ack.acknowledge();
}

// Bad — symbol name shipped as default; subscriber binds to wrong (auto-created) topic
@KafkaListener(topics = "${kafka.topics.payment-succeeded:PAYMENT_SUCCEEDED}")
```

Anti-patterns: stringly-typed topic literals scattered across listener annotations; ack inside `try` without a matching outer log on success.

## Resilience4j retry

- `@Retry(name = "<x>")` requires an explicit `retry-exceptions` allowlist. Default ("retry any `Throwable`") retries 4xx and doubles upstream load on permanent client errors.
- 5xx + IO are retryable. 4xx never is — the request won't get fixed on round 2.
- `retry-exceptions` is class-FQN-list shaped. `ignore-exceptions` complements it for explicit deny.

```yaml
# Good — retry only transient categories
resilience4j.retry.instances.inventoryApi:
  max-attempts: 3
  wait-duration: 250ms
  retry-exceptions:
    - org.springframework.web.client.HttpServerErrorException
    - org.springframework.web.client.ResourceAccessException
    - java.io.IOException

# Bad — no allowlist; retries 400/401/404 forever (until max-attempts)
resilience4j.retry.instances.inventoryApi:
  max-attempts: 3
```

Anti-patterns: `retry-exceptions: [Throwable]`; `@Retry` annotation present but no yml stanza (silent default).

## Persistence port intent

- Repository / port methods are intent-specific. `save(entity)` covers genesis INSERT only. UPDATE intent uses a distinct method (`applyTransition(id, newState, ...)`, `updateStatus(id, status)`).
- Single `save()` called from both genesis and transition contexts is a defect — the adapter cannot recover the JPA `id` from a domain object that doesn't carry it, and `JpaRepository.save()` falls through to INSERT, hitting the unique constraint.
- Transition-shaped UPDATE → `@Modifying @Query` JPQL targeting only the columns the state machine actually changes (`status`, optional foreign keys, `updated_at`). Skip cascading.
- TDD `S-DATA-001` names each port method's intent (`create` / `transition` / `query`). Overloaded `save` = TDD defect; `@reviewer` rejects.

```java
// Good — distinct method per intent
public interface OrderRepositoryPort {
  void save(Order order);                                          // INSERT only
  void applyTransition(long orderId, OrderState newState,
                       String paymentIntentId);                    // UPDATE only
  Optional<Order> findByOrderId(long orderId);
}

@Modifying
@Query("UPDATE OrderEntity o SET o.status = :s, " +
       "o.paymentIntentId = COALESCE(:p, o.paymentIntentId), " +
       "o.updatedAt = :now WHERE o.orderId = :id")
int applyTransition(@Param("id") long id, @Param("s") OrderState s,
                    @Param("p") String p, @Param("now") Instant now);

// Bad — one method, two intents; UPDATE path attempts INSERT
orderRepositoryPort.save(order);   // genesis (POST)
orderRepositoryPort.save(order);   // transition (Kafka event) — Duplicate entry
```

Anti-patterns: "smart save" that does SELECT + MERGE under the hood (hides intent at the call site); transitions cascading the full aggregate when only a status column changes.

## Entity auditing

- `created_at` / `updated_at` columns live on a `@MappedSuperclass AbstractAuditedEntity` carrying `@PrePersist` / `@PreUpdate`. Per-entity duplication is a code-review Minor.
- Audit columns NOT NULL with no DB default → the lifecycle hook owns the value; missing hook = INSERT failure.

```java
// Good — one superclass owns the audit columns + hooks
@MappedSuperclass
public abstract class AbstractAuditedEntity {
  @Column(name = "created_at", nullable = false, updatable = false)
  private Instant createdAt;
  @Column(name = "updated_at", nullable = false)
  private Instant updatedAt;

  @PrePersist void onPersist() { createdAt = updatedAt = Instant.now(); }
  @PreUpdate  void onUpdate()  { updatedAt = Instant.now(); }
}

@Entity public class OrderItemEntity extends AbstractAuditedEntity { /* ... */ }
@Entity public class OrderMetadataEntity extends AbstractAuditedEntity { /* ... */ }

// Bad — pattern hand-copied across three entities; one of them missed @PreUpdate
@Entity public class OrderItemEntity {
  @Column(name = "created_at", nullable = false, updatable = false) private Instant createdAt;
  @PrePersist void onPersist() { createdAt = Instant.now(); }
  // no updated_at → DB INSERT fails on Field 'updated_at' doesn't have a default
}
```

Anti-patterns: relying on DB `DEFAULT CURRENT_TIMESTAMP` for `created_at` while Hibernate ignores generated values; mixing JPA `@PrePersist` with Spring's `AuditingEntityListener` in the same hierarchy.
