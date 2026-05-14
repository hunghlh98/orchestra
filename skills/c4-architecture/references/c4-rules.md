# C4 architecture — extended rules

Depth content moved out of `SKILL.md` to keep the skill body tight. Loaded only when actively authoring tricky cases.

## Framework internals are NOT components

A Component is "a grouping of related functionality encapsulated behind a well-defined interface" — i.e., **your application's** groupings, not the framework's. The following are forbidden as components on a C4 Component diagram:

| Forbidden as component | Why |
|---|---|
| Servlet container (Tomcat, Jetty, Undertow) | Runtime infrastructure. If it matters at all, it's a Container. |
| `DispatcherServlet`, `FrontController` | Framework routing — implicit in any Spring/Rails/Flask/Express app. |
| HTTP message converters (Jackson, Gson, `MappingJackson2HttpMessageConverter`) | Serialization plumbing. |
| ORM `SessionFactory` / `EntityManagerFactory` | Framework-supplied infrastructure. |
| Framework HTTP clients (`RestTemplate`, `WebClient`, `OkHttpClient`) used as standalone boxes | These are libraries used inside your component, not components themselves. |

The arrow chain `Tomcat → DispatcherServlet → MyController → Jackson → Client` is request-flow narration, not structure. If you need to show that flow, draw it with `!include <C4/C4_Dynamic>` and numbered `Rel`s — not on a Component diagram.

## Component diagrams are optional

A Component diagram answers ONE specific question (e.g., "How does retry vs fail-fast work inside the Payment API?"). If no such question exists, do not draw one.

- **Container with one application class** (single `@RestController`): the Component diagram is one box. Skip it. Write `<!-- OMIT: trivial container; single component -->` in TDD `S-COMPONENTS-001` and set frontmatter `component_count: 0`. Mirrors the existing pattern for omitted state-machines (`<!-- OMIT: no lifecycle states -->` with `state_machine_count: 0`).
- **Long-lived containers**: prefer auto-generation (Structurizr DSL or annotation-driven). Hand-drawn Component diagrams rot.

## "What to avoid" — extended

- Confusing containers (deployable) vs components (non-deployable).
- Modeling shared libraries as containers.
- Showing message brokers as a single container instead of individual topics.
- Adding undefined abstraction levels like "subcomponents".
- Removing type labels to "simplify" diagrams.
- Modeling framework internals as components (see table above).
- Drawing a Component diagram for a single-component container — omit per the protocol above.
- Mixing transport/protocol detail into a System Context (L1) relationship label. L1 is for execs/PMs — strip protocols (`(HTTP, loopback)`, `JDBC`, etc.) and move them to L2 Container.
- Putting load balancers, replicas, K8s pods on a Container diagram — that's Deployment territory. Container = logical, not physical.

## Microservices ownership patterns

### Single-team ownership

Model each microservice as a **container** (or container group) inside one System_Boundary:

```plantuml
@startuml
!include <C4/C4_Container>

title E-commerce Platform — single team

System_Boundary(platform, "E-commerce Platform") {
  Container(orderApi, "Order Service", "Spring Boot", "Order processing")
  ContainerDb(orderDb, "Order DB", "PostgreSQL", "Order data")
  Container(inventoryApi, "Inventory Service", "Node.js", "Stock management")
  ContainerDb(inventoryDb, "Inventory DB", "MongoDB", "Stock data")
}
@enduml
```

### Multi-team ownership

Promote microservices to **software systems** when owned by separate teams:

```plantuml
@startuml
!include <C4/C4_Context>

title E-commerce Platform — multi-team

Person(customer, "Customer", "Places orders")
System(orderSystem, "Order System", "Team Alpha")
System(inventorySystem, "Inventory System", "Team Beta")
System(paymentSystem, "Payment System", "Team Gamma")

Rel(customer, orderSystem, "Places orders")
Rel(orderSystem, inventorySystem, "Checks stock")
Rel(orderSystem, paymentSystem, "Processes payment")
@enduml
```

### Event-driven architecture

Show individual topics/queues as containers, NOT a single "Kafka" box:

```plantuml
@startuml
!include <C4/C4_Container>

title Event-driven — order/stock

Container(orderService, "Order Service", "Java", "Creates orders")
Container(stockService, "Stock Service", "Java", "Manages inventory")
ContainerQueue(orderTopic, "order.created", "Kafka", "Order events")
ContainerQueue(stockTopic, "stock.reserved", "Kafka", "Stock events")

Rel(orderService, orderTopic, "Publishes to")
Rel(stockService, orderTopic, "Subscribes to")
Rel(stockService, stockTopic, "Publishes to")
Rel(orderService, stockTopic, "Subscribes to")
@enduml
```

## Element-syntax reference (C4-PlantUML stdlib macros)

For edge cases not covered by `SKILL.md`'s 5 quick-start templates. Quick-start templates anchor typical use; this section is exhaustive.

### People and systems

```
Person(alias, "Label", "Description")
Person_Ext(alias, "Label", "Description")          ' External person
System(alias, "Label", "Description")
System_Ext(alias, "Label", "Description")          ' External system
SystemDb(alias, "Label", "Description")            ' Database system
SystemQueue(alias, "Label", "Description")         ' Queue system
SystemDb_Ext(alias, "Label", "Description")        ' External DB
```

### Containers

```
Container(alias, "Label", "Technology", "Description")
Container_Ext(alias, "Label", "Technology", "Description")
ContainerDb(alias, "Label", "Technology", "Description")
ContainerQueue(alias, "Label", "Technology", "Description")
```

### Components

```
Component(alias, "Label", "Technology", "Description")
Component_Ext(alias, "Label", "Technology", "Description")
ComponentDb(alias, "Label", "Technology", "Description")
```

### Boundaries

```
Enterprise_Boundary(alias, "Label") { ... }
System_Boundary(alias, "Label") { ... }
Container_Boundary(alias, "Label") { ... }
Boundary(alias, "Label", "type") { ... }
```

### Relationships

```
Rel(from, to, "Label")
Rel(from, to, "Label", "Technology")
BiRel(from, to, "Label")                            ' Bidirectional
Rel_U(from, to, "Label")                            ' Upward
Rel_D(from, to, "Label")                            ' Downward
Rel_L(from, to, "Label")                            ' Leftward
Rel_R(from, to, "Label")                            ' Rightward
```

### Deployment nodes

```
Deployment_Node(alias, "Label", "Type", "Description") { ... }
Node(alias, "Label", "Type", "Description") { ... }     ' Shorthand
```

## Styling and layout

For when stdlib defaults don't match the diagram's needs.

### Layout direction

```
LAYOUT_TOP_DOWN()                ' default
LAYOUT_LEFT_RIGHT()
LAYOUT_LANDSCAPE()
LAYOUT_AS_SKETCH()              ' hand-drawn look
```

### Element-level styling

```
UpdateElementStyle("alias", $bgColor="grey", $fontColor="red", $borderColor="red")
```

### Relationship styling

```
UpdateRelStyle("from", "to", $textColor="blue", $lineColor="blue", $offsetX="5", $offsetY="-10")
```

`$offsetX` / `$offsetY` fix overlapping relationship labels when the auto-layout collides them.

## Zoom-continuity counter-examples

The Step 1b protocol in `SKILL.md` lays out the four mandatory actions; the two counter-examples below show what happens when steps 2 + 3 are skipped. Labels are abstract placeholders (`<system-name>`, `<container-A>`, `<actor-A>`) — substitute your actual domain at authoring time. Do NOT copy `<...>` placeholders into `.puml` source.

### L1 → L2 trap

L1 (`c4-context.puml`) declares one system, two persons crossing the seam, and two external systems:

```plantuml
System(systemX, "<system-name>", "<short description>")
Person(actorA, "<actor-A>", "<role>")
Person(actorB, "<actor-B>", "<role>")
System_Ext(extX, "<external-X>", "<description>")
System_Ext(extY, "<external-Y>", "<description>")

Rel(actorA, systemX, "<action>", "<protocol>")
Rel(actorB, systemX, "<action>", "<protocol>")
Rel(systemX, extX, "<action>", "<protocol>")
Rel(systemX, extY, "<action>", "<protocol>")
```

**WRONG L2** (fast-pass authoring; the structural failure to avoid):

```plantuml
Person(actorA, "<actor-A>", "<role>")
' actorB SILENTLY DROPPED — Step 3 violated
System_Ext(extX, ...)
' ... other externals ...

Container_Boundary(tier1, "<tier-1>") {   ' Step 2 violated: Container_Boundary misused at L2
    Container(svc1, "<container-1>", "<tech>", "<responsibility>")
}
Container_Boundary(tier2, "<tier-2>") {   ' L1 system identity vanished — no System_Boundary("<system-name>")
    Container(svc2, "<container-2>", "<tech>", "<responsibility>")
    Container(svc3, "<container-3>", "<tech>", "<responsibility>")
}
```

Three failures stacked: (a) no `System_Boundary("<system-name>")` carrying the L1 name → system identity vanishes at L2; (b) `Person(actorB)` dropped without justification → seam drift; (c) `Container_Boundary` misused for L2 sub-grouping → wrong macro for the level.

**RIGHT L2:**

```plantuml
Person(actorA, "<actor-A>", "<role>")
Person(actorB, "<actor-B>", "<role>")     ' carried verbatim from L1
System_Ext(extX, ...)
System_Ext(extY, ...)                     ' all L1 externals carried verbatim

System_Boundary(systemX, "<system-name>") {    ' L1 system name verbatim; id matches L1 System() id
    Boundary(tier1, "<tier-1>", "tier") {
        Container(svc1, "<container-1>", "<tech>", "<responsibility>")
    }
    Boundary(tier2, "<tier-2>", "tier") {
        Container(svc2, "<container-2>", "<tech>", "<responsibility>")
        Container(svc3, "<container-3>", "<tech>", "<responsibility>")
    }
    ContainerQueue(broker, "<broker>", "<tech>", "<purpose>")
    ContainerDb(db, "<db>", "<tech>", "<purpose>")
}
```

Reader scrolling L1 → L2 sees `systemX` on L1 → `System_Boundary("<system-name>")` on L2 → identical actor list across the seam. The zoom trace is intact.

### L2 → L3 trap

L2 (`c4-container.puml`) declares `Container(svcA, "<container-A>", "<tech>", "<responsibility>")` and shows `svcB`, `svcC`, `svcD` as siblings calling into or being called from `svcA`.

**WRONG L3** (`c4-component.puml` for the `svcA` service):

```plantuml
System_Boundary(svcASystem, "<container-A> service") {   ' wrong macro (System_Boundary at L3) AND name diverges from L2
    Component(comp1, "<component-1>", "<tech>", "<responsibility>")
    Component(comp2, "<component-2>", "<tech>", "<responsibility>")
    Component(comp3, "<component-3>", "<tech>", "<responsibility>")
}
' L2 siblings (svcB, svcC, svcD) SILENTLY DROPPED
```

Three failures stacked: (a) `System_Boundary` instead of `Container_Boundary` → wrong macro for L3; (b) name `"<container-A> service"` ≠ L2 name `"<container-A>"` → boundary label drift; (c) every L2 sibling that crossed the boundary into `svcA` was dropped → reader cannot see callers or callees.

**RIGHT L3:**

```plantuml
Container(svcB, "<container-B>", "<tech>", "<responsibility>")    ' carried verbatim from L2 (caller of svcA)
Container(svcC, "<container-C>", "<tech>", "<responsibility>")    ' carried verbatim from L2 (called by svcA)
Container(svcD, "<container-D>", "<tech>", "<responsibility>")

Container_Boundary(svcA, "<container-A>") {              ' L2 container name verbatim; id matches L2 Container() id
    Component(comp1, "<component-1>", "<tech>", "<responsibility>")
    Component(comp2, "<component-2>", "<tech>", "<responsibility>")
    Component(comp3, "<component-3>", "<tech>", "<responsibility>")
}

Rel(svcB, comp1, "<action>", "<protocol>")
Rel(comp2, svcC, "<action>", "<protocol>")
Rel(comp3, svcD, "<action>", "<protocol>")
```

Reader scrolling L2 → L3 sees `svcA` highlighted on L2 → `Container_Boundary("<container-A>")` on L3 → identical seam-crossing siblings on both sides. The zoom trace is intact at L3 the same way it is at L2.
