# C4-PlantUML quick-start templates

Six fenced templates, one per C4 level + Dynamic + Deployment. Use as starting points; element-syntax and styling-macro reference live in `c4-rules.md`.

Pick a template by audience and authoring scope:

- **L1 Context** — required for SAD; system + external actors only. No transport protocols on `Rel(...)`.
- **L2 Container** — required for SAD; apps, databases, services. Exactly one outermost `System_Boundary` carrying the L1 system name.
- **L3 Component** — required for service-level singleton `docs/<service_name>/diagrams/c4-component.puml`. Wrap body in `Container_Boundary(<id>, "<L2 container name>")`.
- **L4 Code** — PlantUML class diagram (no `C4_Code` macro in stdlib). Layered per the `clean-architecture` skill's concentric circles. Omit when service has <3 classes.
- **Dynamic** — numbered request flows. One per critical-path sequence in TDD.
- **Deployment** — production topology only. Opt-in.

## Level 1 — System Context (`c4-context.puml`)

```plantuml
@startuml
!include <C4/C4_Context>

title System Context — URL Shortener

Person(user, "Engineer", "Pastes long URLs; expects short codes back")
System(app, "URL Shortener", "Single-process FastAPI service; 302-redirects")
SystemDb_Ext(sqlite, "links.db", "SQLite file on local FS")

Rel(user, app, "POST /shorten", "JSON/HTTP")
Rel(app, sqlite, "Reads/writes", "sqlite3")
@enduml
```

## Level 2 — Container (`c4-container.puml`)

```plantuml
@startuml
!include <C4/C4_Container>

title Container Diagram — URL Shortener

Person(user, "Engineer", "API caller")

System_Boundary(app, "URL Shortener") {
  Container(api, "FastAPI app", "Python 3.11, uvicorn", "POST /shorten + GET /{code}")
  ContainerDb(db, "links.db", "SQLite (WAL mode)", "(code, long_url) pairs")
}

Rel(user, api, "Uses", "JSON/HTTP")
Rel(api, db, "Reads/writes", "sqlite3")
@enduml
```

## Level 3 — Component (`docs/<service_name>/diagrams/c4-component.puml`)

```plantuml
@startuml
!include <C4/C4_Component>

title Component Diagram — URL Shortener (FastAPI process)

Container(client, "HTTP Client", "any", "API caller")

Container_Boundary(app, "FastAPI process") {
  Component(routes, "Routes", "FastAPI", "POST /shorten + GET /{code}")
  Component(codegen, "codegen", "Python module", "secrets.choice + retry on collision")
  Component(ratelimit, "ratelimit", "Python module", "fixed-window per IP")
  Component(db, "db", "Python module", "sqlite3 wrapper")
}

ContainerDb(file, "links.db", "SQLite", "")

Rel(client, routes, "Requests")
Rel(routes, ratelimit, "Checks (write path only)")
Rel(routes, codegen, "Mints unique code")
Rel(routes, db, "Inserts/looks up")
Rel(db, file, "WAL-mode I/O")
@enduml
```

## Level 4 — Code (`docs/<service_name>/diagrams/c4-code.puml`)

PlantUML class diagram (no `C4_Code` macro exists in stdlib). Show the **full layer cake** aligned to the `clean-architecture` skill's concentric circles: Controller (interface adapter) → Service / Use Case (application business rules) → Repository interface (use-case-defined port) → Repository implementation (interface adapter) → Entity (enterprise business rule). Inner classes know nothing about outer classes — same Dependency Rule the architecture review enforces.

```plantuml
@startuml
title C4 Level 4 — Code — todo-service

skinparam class {
  BackgroundColor<<entity>> LightYellow
  BackgroundColor<<usecase>> LightCyan
  BackgroundColor<<port>> LightGray
  BackgroundColor<<adapter>> LightSalmon
}

package "interface-adapters" {
  class TodoController <<adapter>> {
    +create(req: CreateTodoRequest): TodoResponse
    +get(id: UUID): TodoResponse
  }
  class JpaTodoRepository <<adapter>> {
    +save(todo: Todo): Todo
    +findById(id: UUID): Optional<Todo>
  }
}

package "use-cases" {
  class CreateTodoInteractor <<usecase>> {
    -repo: TodoRepository
    +execute(req: CreateTodoRequest): TodoResponse
  }
  interface TodoRepository <<port>> {
    +save(todo: Todo): Todo
    +findById(id: UUID): Optional<Todo>
  }
}

package "entities" {
  class Todo <<entity>> {
    -id: UUID
    -title: String
    -completed: boolean
    +markComplete(): void
  }
}

TodoController --> CreateTodoInteractor : "delegates"
CreateTodoInteractor --> TodoRepository : "depends on (port)"
JpaTodoRepository ..|> TodoRepository : "implements"
CreateTodoInteractor --> Todo : "operates on"
@enduml
```

L4 rules:

- Arrows point **inward** (Controller → UseCase → Port; Adapter ..|> Port; never UseCase → Adapter).
- Stereotypes mark layer: `<<entity>>`, `<<usecase>>`, `<<port>>`, `<<adapter>>`. The `clean-architecture` skill defines the layers; this diagram is the visual proof.
- ≤15 classes per diagram. Split per service / per bounded context if larger.
- Omit when component has fewer than 3 classes (`<!-- OMIT: trivial code surface -->`); document `code_class_count: <N>` in TDD `S-COMPONENTS-001`.

## Dynamic Diagram (request flow)

```plantuml
@startuml
!include <C4/C4_Dynamic>

title Dynamic — POST /shorten happy path

Person(user, "Caller")
Container_Boundary(app, "FastAPI") {
  Component(routes, "Routes", "FastAPI")
  Component(rl, "RateLimiter", "in-process")
  Component(cg, "codegen", "Python")
  Component(db, "db", "Python")
}
ContainerDb(file, "links.db", "SQLite")

Rel(user, routes, "1. POST /shorten {long_url}")
Rel(routes, rl, "2. check(client_ip)")
Rel(routes, cg, "3. mint_unique(db)")
Rel(cg, db, "4. INSERT OR ABORT")
Rel(db, file, "5. WAL write")
Rel(routes, user, "6. 200 {code, short_url}")
@enduml
```

## Deployment Diagram

```plantuml
@startuml
!include <C4/C4_Deployment>

title Deployment — single-host production

Deployment_Node(host, "Production host", "Linux x86_64") {
  Deployment_Node(proc, "uvicorn process", "--workers 1") {
    Container(api, "FastAPI app", "Python 3.11", "url_shortener")
  }
  Deployment_Node(disk, "Local disk", "ext4") {
    ContainerDb(db, "links.db", "SQLite WAL", "")
  }
}

Rel(api, db, "Reads/writes", "file I/O")
@enduml
```

## Highlight protocol (per-feature copies)

In each per-feature copy under `docs/<service_name>/<feature-id>/diagrams/`, mark elements the feature impacts using stdlib styling:

```plantuml
UpdateElementStyle(<element-id>, $bgColor="LightSalmon", $borderColor="Red", $fontColor="Black")
UpdateRelStyle(<from>, <to>, $textColor="Red", $lineColor="Red")
```

System-level singletons stay unstyled; service-level L3 + L4 use line comments (`' #<feature-id>`) for feature provenance instead of color highlights.
