---
name: clean-architecture
description: "Dependency-Rule layering — Entities / Use Cases / Interface Adapters / Frameworks & Drivers as concentric circles where source-code dependencies point inward — applied to SAD container layout, TDD component layout, persisted-entity shape rules, and architectural-fit review scoring. Use when @architect designs container topology, @backend writes adapters or gateways crossing layer boundaries, or @reviewer scores S-REVIEW-001 architectural fit."
allowed-tools: Read, Glob, Grep, Skill
origin: vendored from github.com/wondelai/skills@1.1.0 (MIT, Wondel.ai sp. z o.o.) — frontmatter trimmed for orchestra schema; body trimmed for orchestra surface; references/* unchanged.
license: MIT
metadata:
  author: wondelai
  version: "1.1.0"
---

# Clean Architecture Framework

A disciplined approach to structuring software so business rules remain independent of frameworks, databases, and delivery mechanisms. Apply when designing system architecture, reviewing module boundaries, or advising on dependency management.

## When to use

- `@architect` authoring SAD `S-CONTAINERS-001` — container layout follows concentric circles.
- `@architect` authoring TDD `S-COMPONENTS-001` + C4 L4 class diagram — layer cake IS the Dependency Rule made visible.
- `@backend` authoring source — controllers translate to use-case input; gateways implement repository interfaces.
- `@reviewer` grading architectural fit on review.

Skip on pure scripting / shell utilities / standalone analysis tools where no business rules exist.

## Core Principle

**Source code dependencies must point inward — toward higher-level policies.** Nothing in an inner circle can know anything about something in an outer circle. This single rule, applied consistently, produces systems that are testable, independent of frameworks, independent of the UI, independent of the database, and independent of any external agency.

Software architecture is about drawing lines — boundaries — that separate things that matter from details. Business rules are what matter. Databases, web frameworks, and delivery mechanisms are details. When details depend on policies (not the other way around), you can defer decisions, swap implementations, and test business logic in isolation.

## Scoring

**Goal: 10/10.** Rate architecture 0–10 based on adherence to the principles below. 10/10 means full alignment with all guidelines; lower scores indicate gaps to address.

## The Clean Architecture Framework

Six principles for building systems that survive time.

### 1. Dependency Rule and Concentric Circles

Architecture organized as concentric circles. Innermost: Entities (enterprise business rules). Next: Use Cases (application business rules). Then Interface Adapters. Outermost: Frameworks and Drivers. Source code dependencies always point inward.

| Context | Pattern | Example |
|---------|---------|---------|
| **Layer direction** | Inner defines interfaces; outer implements | `UserRepository` interface in Use Cases; `PostgresUserRepository` in Adapters |
| **Data crossing** | DTOs or simple structs cross boundaries, not ORM entities | Use Case returns `UserResponse` DTO, not an ActiveRecord model |
| **Framework isolation** | Wrap framework calls behind interfaces | `EmailSender` interface hides whether you use SendGrid or SES |
| **Database independence** | Repository pattern abstracts persistence | Business logic calls `repo.save(user)`, never raw SQL |
| **Dependency direction** | Import arrows always point inward | Controller imports Use Case; Use Case never imports Controller |

See: [references/dependency-rule.md](references/dependency-rule.md)

### 2. Entities and Use Cases

Entities encapsulate enterprise-wide business rules — the most general rules that would exist even if no software system existed. Use Cases contain application-specific business rules orchestrating data flow to and from Entities.

| Context | Pattern | Example |
|---------|---------|---------|
| **Entity design** | Encapsulate critical business rules with no framework dependencies | `Order.calculateTotal()` applies tax rules; knows nothing about HTTP |
| **Use Case boundary** | Define Input Port and Output Port interfaces | `CreateOrderInput` interface; `CreateOrderOutput` interface |
| **Request/Response** | Simple data structures cross the boundary | `CreateOrderRequest { items, customerId }` — no ORM models |
| **Single responsibility** | One Use Case per application operation | `PlaceOrder`, `CancelOrder`, `RefundOrder` as separate classes |
| **Interactor** | Use Case implements Input Port, calls Output Port | `PlaceOrderInteractor implements PlaceOrderInput` |

See: [references/entities-use-cases.md](references/entities-use-cases.md)

#### Persisted Entity Shape (orchestra TDD `S-DATA-001`)

Invoked by `@architect` when authoring TDD `S-DATA-001` rows. One row per persisted entity. Required columns:

| Column | Content |
|---|---|
| **Entity name** | Aggregate-root class as named in the source / spec |
| **Table** | Physical table name |
| **Ownership** | `owned` (this service is system-of-record) OR `cross-service:<owning-service>` |
| **Persisted-column list** | Every column: name + type + nullability |
| **Sentinel values** | Every `"(none)"` / `"(initial)"` / `"(unset)"` lifecycle label |
| **Port methods** | Grouped by intent: `create` / `transition` / `query` |

`cross-service` entities forbid local field invention — read shape via the owning service's API; drop the local `@Entity` if the table belongs elsewhere. Missing column list OR missing sentinel OR overloaded `save()` covering both genesis + transition contexts = TDD defect; `@evaluator` returns `eval_verdict: FAIL` with reason `spec-completeness`.

### 3. Interface Adapters and Frameworks

Interface Adapters convert data between the format convenient for Use Cases/Entities and the format required by external agencies. Frameworks and Drivers are the outermost layer — glue code connecting to the outside world.

| Context | Pattern | Example |
|---------|---------|---------|
| **Controller** | Translates delivery mechanism to Use Case input | `OrderController.create(req)` builds `CreateOrderRequest` and calls Interactor |
| **Presenter** | Translates Use Case output to view model | `OrderPresenter.present(response)` formats data for JSON/HTML |
| **Gateway** | Implements repository interface using a specific DB | `SqlOrderRepository implements OrderRepository` |
| **Framework boundary** | Framework code calls inward, never called by inner | Express route handler calls Controller; Controller never imports Express |
| **Plugin architecture** | Main component wires dependencies at startup | `main()` instantiates concrete classes and injects them |

See: [references/adapters-frameworks.md](references/adapters-frameworks.md)

### 4. Component Principles

Components are units of deployment. Three cohesion principles (REP, CCP, CRP) govern what goes inside; three coupling principles (ADP, SDP, SAP) govern relationships between.

| Context | Pattern | Example |
|---------|---------|---------|
| **Component grouping** | Group classes that change together (CCP) | All order-related Use Cases in one component |
| **Breaking cycles** | Apply DIP to invert a dependency edge | Extract interface into new component to break circular dep |
| **Stability metrics** | Measure instability: I = Ce / (Ca + Ce) | Component with many incoming and no outgoing deps has I near 0 (stable) |
| **Abstractness balance** | Stable components should be mostly interfaces | Core domain component abstract; adapter component concrete |
| **Release granularity** | Version and release components independently | `order-domain v2.1.0` released without touching `payment-adapter` |

See: [references/component-principles.md](references/component-principles.md)

### 5. SOLID Principles

Five principles for managing dependencies at the class/module level: Single Responsibility, Open-Closed, Liskov Substitution, Interface Segregation, Dependency Inversion. Mid-level building blocks that make the Dependency Rule possible.

| Context | Pattern | Example |
|---------|---------|---------|
| **SRP violation** | Class serves multiple actors | `Employee` handles pay calc (CFO), reporting (COO), and persistence (CTO) |
| **OCP via strategy** | New behavior through new classes, not edits | Add `ExpressShipping` class implementing `ShippingStrategy`, no changes to `Order` |
| **LSP violation** | Subtype changes expected behavior | `Square extends Rectangle` breaks `setWidth()`/`setHeight()` contract |
| **ISP application** | Split fat interfaces into role interfaces | `Printer`, `Scanner`, `Fax` instead of one `MultiFunctionDevice` |
| **DIP wiring** | High-level defines interface; low-level implements | `OrderService` depends on `PaymentGateway` interface, not `StripeClient` |

See: [references/solid-principles.md](references/solid-principles.md)

### 6. Boundaries and Boundary Anatomy

A boundary is a line drawn between things that matter and details. Implemented through polymorphism: source dependencies cross pointing inward; flow of control may cross either direction. Humble Object pattern makes code at boundaries testable.

| Context | Pattern | Example |
|---------|---------|---------|
| **Full boundary** | Input/Output port interfaces on both sides | Use Case defines both `PlaceOrderInput` and `PlaceOrderOutput` |
| **Partial boundary** | Strategy or Facade without full reciprocal interfaces | `ShippingCalculator` accepts `ShippingStrategy` — simpler than full ports |
| **Humble Object** | Separate testable logic from hard-to-test infra | `PresenterLogic` (testable) produces `ViewModel`; `View` (humble) renders |
| **Main as plugin** | Composition root assembles the system | `main()` wires all concrete implementations and starts the app |
| **Test boundary** | Tests depend on source; source never depends on tests | Test imports `PlaceOrderInteractor`; production never imports test code |

See: [references/boundaries.md](references/boundaries.md)

## Reference Files

- [dependency-rule.md](references/dependency-rule.md) — concentric circles, data crossing, keeping inner circle pure.
- [entities-use-cases.md](references/entities-use-cases.md) — Interactor pattern, request/response models.
- [adapters-frameworks.md](references/adapters-frameworks.md) — DB as detail, plugin architecture.
- [component-principles.md](references/component-principles.md) — REP, CCP, CRP, ADP, SDP, SAP.
- [solid-principles.md](references/solid-principles.md) — SRP, OCP, LSP, ISP, DIP with examples.
- [boundaries.md](references/boundaries.md) — Humble Object pattern, partial boundaries, Main as plugin.

Based on Robert C. Martin's *Clean Architecture: A Craftsman's Guide to Software Structure and Design* (2017).
