---
name: c4-architecture
description: "C4-model architecture diagrams (Context L1 / Container L2 / Component L3 / Code L4 / Dynamic / Deployment) authored via the PlantUML C4-PlantUML stdlib with zoom-continuity enforcement and SAD-scope routing (workspace vs service). Use when @architect authors SAD c4-context.puml / c4-container.puml, service-level c4-component.puml / c4-code.puml singletons, or per-feature highlighted L1+L2 copies. Bundles ADR-worthiness gates."
allowed-tools: Read, Glob, Grep, Skill
origin: orchestra-internal (structure adapted from .agents/skills/c4-architecture; output rewritten Mermaid → C4-PlantUML stdlib)
---

# c4-architecture

Generates C4-model diagrams (Context / Container / Component / Deployment / Dynamic) in PlantUML via the C4-PlantUML stdlib. Invoked by `@architect` (all levels: L1+L2+L3+L4 + Dynamic).

## When to use

- `@architect` authoring `docs/SAD.md` — Context (L1) + Container (L2).
- `@architect` authoring service-level singletons `docs/<service_name>/diagrams/c4-component.puml` + `c4-code.puml` (L3 + L4).
- `@architect` authoring per-feature highlighted L1+L2 copies and intra-service sequence + physical ERD under `docs/<service_name>/<feature-id>/diagrams/`.

## Approach

### Step 1 — Pick C4 level by audience

| Level | Diagram | Audience | Shows | When to create |
|---|---|---|---|---|
| 1 | **C4_Context** | Everyone | System + external actors | Always (SAD); per-feature highlighted copy on feature impact |
| 2 | **C4_Container** | Technical | Apps, databases, services | Always (SAD); per-feature highlighted copy on feature impact |
| 3 | **C4_Component** | Developers | Internal components of one container | Service-level singleton; per-feature provenance via `' #<feature-id>` line comments |
| 4 | **C4_Code** | Backend devs | Class structure aligned to clean-architecture | Service-level singleton when component count ≥ 2; omit when <3 classes |
| — | **C4_Dynamic** | Technical | Numbered request flows | Per-feature critical-path sequences |
| — | **C4_Deployment** | DevOps | Infrastructure nodes | Production systems only |

### Step 1b — Zoom continuity (MANDATORY before any non-context level)

A C4 child diagram is a literal zoom into one element of the parent. Reader scrolling L(n-1) → L(n) must see which box opened up. Four steps:

1. **Read the parent `.puml` first.** L2 → `c4-context.puml`. L3 → `c4-container.puml` (for the service zoomed) and `c4-context.puml` (for the seam-crossing actor set). L4 → matching `c4-component-<service>.puml`. Without the Read, the remaining steps cannot be verified.
2. **Wrap the child body with the parent box's name verbatim.** L1→L2: `System_Boundary(<id>, "<L1 system name>") { ... }`. L2→L3: `Container_Boundary(<id>, "<L2 container name>") { ... }`. Label MUST equal the parent's name character-for-character.
3. **Carry every seam-crossing actor + neighbor verbatim.** Every `Person`/`System_Ext`/`ContainerDb_Ext`/sibling-container that crosses the zoom boundary in the parent appears in the child with identical id, label, description. No renaming, no dropping, no merging.
4. **Highlight the zoom-target on the parent.** `UpdateElementStyle(<zoom-target-id>, $bgColor="#1168bd", $borderColor="#0b4884", $fontColor="white")` on the parent — permanent (not feature-scoped).

**L2 macro discipline.** At L2 there is exactly ONE outermost `System_Boundary` carrying the L1 system name. Internal tiers (channel-layer / core / commerce / platform) use generic `Boundary(<id>, "<tier>", "tier") { ... }` *inside* the `System_Boundary`. `Container_Boundary` belongs only at L3.

Worked WRONG/RIGHT counter-examples for the three failure modes (missing boundary, dropped actor, wrong outer-wrap) live in `references/c4-rules.md` `## Zoom-continuity counter-examples`. Read both before drafting your first non-context level.

### Step 1c — SAD scope distinction (workspace vs service)

C4 scope is a load-bearing contract between SAD frontmatter and SAD body. Mismatch (frontmatter declares workspace scope, body delivers service scope) is a structural defect.

**L1 (Context) shape.** Exactly one `System(...)` box for the "system under design". Everything else is `Person`, `System_Ext`, or `Enterprise_Boundary` outside it.

**L2 (Container) shape.** Every `Container(...)` inside `System_Boundary(...)` is a deployable unit of the system under design. Their internals belong to L3.

**L3 (Component) shape.** Every `Component(...)` inside `Container_Boundary(...)` is an internal component of ONE zoomed-in container.

- **Inbound callers.** Every upstream container that calls into the zoomed-in container MUST appear as `Container_Ext(...)` OUTSIDE the boundary, with inbound `Rel(<upstream-ext>, <component-or-boundary>, "<verb>", "<protocol>")` showing call direction + transport.
- **Outbound dependencies.** Downstream containers the zoomed container calls (databases, message brokers, sibling services) appear as `Container_Ext` / `ContainerDb_Ext` / `ContainerQueue_Ext` outside the boundary, with outbound `Rel(...)` from the calling component.
- **Completeness.** A component diagram without external callers is structurally incomplete — the reader cannot see who triggers the flow.

**Workspace SAD** ("system under design" = the workspace / platform):

- `c4-context.puml`: one `System("<platform name>")` box. Every service in `<context_path>/CLAUDE.md` Service Topology MUST appear as a container in L2 — NOT `System_Ext`. Only entities outside the workspace (upstream merchants, third-party payment networks, end-user personas) are `System_Ext` / `Person`.
- `c4-container.puml`: `System_Boundary(<workspace>, ...)` encloses every Service-Topology service as `Container(...)`. Backing infrastructure the workspace operates (managed MySQL, Redis, Kafka clusters) is `ContainerDb(...)` / `ContainerQueue(...)` inside the boundary. Third-party hosted services remain `System_Ext`.
- SAD `S-CONTAINERS-001`: ≥2 Container rows. One Container + N `System_Ext` siblings = service-scope wearing a workspace label — rewrite.

**Service SAD** ("system under design" = the named service):

- `c4-context.puml`: one `System("<service name>")` box. Other services in the workspace ARE `System_Ext` here.
- `c4-container.puml`: containers are the service's internal deployable units (e.g. Spring Boot app + dedicated DB + dedicated cache). NOT the workspace's services.

**Verification.** Before locking SAD: re-read frontmatter `workspace_kind` (from `system.yaml`) and confirm `S-CONTAINERS-001` row count matches scope. Workspace scope with <2 rows → rewrite. `pre-write-check.js` `workspace-sad-container-floor` gate enforces the same minimum at write time.

### Step 2 — Apply MUST / MUST-NOT (binding)

Every C4 `.puml` MUST:

- Start with `!include <C4/C4_Context|C4_Container|C4_Component|C4_Dynamic|C4_Deployment>` after `@startuml`, plus a `title` line.
- Use stdlib macros: `Person` / `System` / `Container` / `Component` (plus `*_Ext` / `*Db` / `*Queue` / `*_Boundary` variants) for elements; `Rel(...)` for relationships.
- Use short, business-domain `Person` labels — `Client`, `Web`, `App`, `Customer`, `Driver`, `Merchant`, `Operator`. A `Person` is a role that uses the *running system*. Inherit from PRD `S-PERSONAS-001` / SAD `S-CONTEXT-001`; do not invent meta-narrative stand-ins like `Developer-consumer` or `Reference-impl reader`.

Every C4 `.puml` MUST NOT:

- Use raw PlantUML primitives (`rectangle` / `actor` / `component` / `package` / `node` / `database`) for body elements.
- Use raw arrow syntax (`-->` / `->` / `..>`) or generic verbs ("Uses" / "Calls"). `Rel(...)` enforces unidirectional + labeled.
- Use `skinparam` for body styling. Use `UpdateElementStyle()` / `UpdateRelStyle()` instead, or accept stdlib defaults.
- Use **escaped double quotes** inside C4 macro arguments. The stdlib parses macro args as preprocessor expressions; escaped `\"` inside an already-quoted string forks the parser and produces an error-frame SVG. Use single quotes (`'/orders'`), unicode quotes (`«/orders»`), or drop the inner quotes.

### Step 3 — Author from quick-start templates

Six fenced templates live in `references/templates.md`: Level 1 — Context, Level 2 — Container, Level 3 — Component, Level 4 — Code, Dynamic, Deployment. Lift one verbatim and adapt the elements + relationships to your system. Level 4 — Code is a PlantUML class diagram (no `C4_Code` macro in stdlib) aligned to the `clean-architecture` skill's concentric circles.

### Step 4 — Apply mandatory rules

Five essentials (extended discussion in `references/c4-rules.md`):

1. **Every element** has name, type-by-macro, technology (where applicable), description.
2. **Unidirectional arrows only** — `Rel(from, to, ...)`. No `BiRel` unless genuinely peer-to-peer.
3. **Action verbs** on labels — "Sends payment intent via" not "Uses".
4. **Technology labels** — "JSON/HTTPS", "JDBC", "gRPC".
5. **≤20 elements per diagram** — split when dense.

Component diagrams answer ONE specific question (e.g., "How does retry vs fail-fast work inside the Payment API?"). For trivial single-component containers, omit and write `<!-- OMIT: trivial container; single component -->` in TDD `S-COMPONENTS-001` with `component_count: 0`.

Framework internals (Tomcat, DispatcherServlet, Jackson, ORM `SessionFactory`, `RestTemplate`/`WebClient` as standalone boxes) are NOT components — see `references/c4-rules.md`. To show that flow, use `C4_Dynamic` with numbered `Rel`s.

### Step 5 — Render

The `post-write-puml` hook fires on `.puml` writes and renders the paired `.svg` automatically. CI parity check fails any `.puml` without a paired `.svg`. See `skills/plantuml/SKILL.md` for hook details and the manual-fallback command (only when the hook is intentionally disabled).

### Step 6 — Self-check before declaring done

Walk this checklist; any "no" → fix the source, do not render:

- [ ] **Re-read parent `.puml` before writing this child** (Step 1b). External actors + crossing-seam neighbors reused verbatim.
- [ ] **L2 macro discipline** — exactly ONE outermost `System_Boundary` (carrying the L1 system name); internal tiers use generic `Boundary(...)`. `Container_Boundary` appears only at L3.
- [ ] **SAD scope match** (Step 1c) — frontmatter `workspace_kind` vs `S-CONTAINERS-001` row count. Workspace scope with <2 Container rows → rewrite.
- [ ] **Parent diagram highlights zoom-target** — the box the child opens up carries `UpdateElementStyle(..., $bgColor="#1168bd", ...)` on the parent.
- [ ] **Title** present (e.g., `title C4 Level 2 — Containers — hello-world`).
- [ ] **Stdlib `!include`** used; no raw `rectangle` / `actor` / `component` / `package` / `node` / `database` in body.
- [ ] **Every element**: name (1st arg), type-by-macro, description (last arg), technology (3rd arg at Container/Component level).
- [ ] **L1 Context**: no transport protocols on relationships. **L3 Component**: no framework internals; every upstream container that calls in appears as `Container_Ext(...)` outside `Container_Boundary`, with inbound `Rel(...)` showing direction + protocol.
- [ ] **Every `Rel(...)`**: label, technology arg at Container/Component level, action verb, unidirectional.
- [ ] **Stand-alone test**: a stranger reading the rendered `.svg` (no narration) can tell what the system does, who uses it, how it's built.
- [ ] **Two-folder rule**: project singleton at `docs/diagrams/c4-<noun>.puml` is unstyled; per-feature copy under `docs/<service_name>/<feature-id>/diagrams/` differs ONLY in `UpdateElementStyle()` highlights — never in element identity.

### Step 6b — Sequence diagram style (SD)

For sequence-diagram authoring discipline (Operations Summary tables + `ref over` reuse pattern for shared sub-flows), see `skills/plantuml/SKILL.md > ## Sequence diagrams — authoring discipline`. The styling rules below cover render-side formatting only.

Per-feature sequence (`<feature-id>-seq-<journey>.puml`) and workspace inter-service sequence (`sequence-inter-<flow>.puml`) carry richer style than C4 levels. Apply this discipline before render:

**Header.** `@startuml <SD-id> <title>` → `!theme plain` → three skinparams (`sequenceArrowThickness 1.5`, `maxMessageSize 300`, `responseMessageBelowArrow true`) → `title <SD-id>: <flow name>\n(<journey> step range → <PRD or HLD anchor>)`.

**Participants.** One `actor` for the human originator (when the flow crosses the customer seam). `participant` / `database` / `queue` for systems. Background-colour every system by category:

| Hex | Category |
| --- | --- |
| `#Orange` | Core (Order, Payment Engine, Fulfillment) |
| `#LightYellow` | Commerce (Cashier, Promotion, Inventory) |
| `#Plum` | Financial (Wallet, Invoice) |
| `#LightGreen` | Platform (Identity, Configuration, Risk, Payment Gateway) |
| `#LightBlue` | Channel (BFF / WebShop) |
| `#Gray` | External (Game Store API, Game API, third-party REST) |
| `#Pink` | External PSP |
| `#LightCoral` | Event Bus / Kafka |

Re-use the same hex for the same service across every SD in the workspace.

**Step numbering.** Tag every action with `[N]` matching the parent journey's narrative numbering (PRD `S-USE-CASES-001` step list or HLD anchor). Sub-steps `[N.a]` / `[N.b]`. Numbers stay stable across diagram revisions — never renumber.

**Inline cites on governed steps.** When a step is governed by `BR-NNN`, `AC-NNN`, `INV-NNN`, `ADR-NNNN`, or a Journey-gate anchor, append the cite to the step label (`[12] Validate payment params (BR-V002)`). Inline cites permitted here — diagram is design surface.

**Source-of-truth markers.** Every persistence / messaging operation carries an `hnote over <participant> #<colour>` block stating the operation + the marker tag. Two markers only:

- `★SoT` — write-failure BLOCKS the flow (e.g., Redis cache that is the order's authoritative state)
- `◇Best-effort` — failure logged, does NOT block (e.g., MySQL mirror, audit-trail row, metrics emit)

Example: `hnote over ORD #Salmon : Redis SET ORDER_CACHE_{orderId}\nTTL=30d | ★SoT`. Salmon hex (`#Salmon`) reserved for `★SoT`; light-tint hex (`#LightBlue`, `#LightGreen`) reserved for `◇Best-effort`.

**Block conventions.** `group ... end` for ≥3-step sub-flows. `opt ... end` for conditional branches keyed off a single boolean. `alt ... else ... end` for mutually exclusive paths (success branch first; every failure branch label cites the governing `AC-NNN` row). `par ... end` for parallel event-consumer fan-out.

**Tail — Data Store Operations Summary.** Single `note over <first>, <last>` block at end of diagram enumerating every persistence operation reached. Table list + column shapes are canonical in `skills/plantuml/SKILL.md > ## Sequence diagrams — Operations Summary tables`. When the diagram ships an `hnote`-marked persistence row, mirror the `★SoT` / `◇Best-effort` Marker in the corresponding tail-block row. Omit any sub-table whose store the diagram does not touch.

**Tail — Legend.** Bottom `legend bottom` block carrying:

1. Colour → category table (subset of the palette actually used in this diagram)
2. Marker glossary: `[N]` = parent-journey step, `★SoT` = source of truth (blocks flow), `◇Best-effort` = non-blocking
3. (optional) Cross-cutting design notes (HARD RULE / ADR-driven flow changes from the prior system)

**Self-check.** Walk the row before rendering:

- [ ] Header carries theme + 3 skinparams + title with journey anchor
- [ ] Every system participant carries a category hex
- [ ] Every action carries a `[N]` step number
- [ ] Every persistence / messaging op carries an `hnote` SoT marker
- [ ] Failure paths sit inside `alt ... else` with `AC-NNN` cites
- [ ] Tail Data Store Summary + Legend present

Missing any row = SD-style defect; `@reviewer` returns a `sd-style` structural finding.

### Step 7 — Logical ERD authoring

**Workspace-scope** (`docs/diagrams/erd-logical.puml`): one PlantUML `package` per service-owned schema. Inside each package, one `entity` per aggregate root — NOT one per table. Entity body: `pk(<id> : TYPE)` first row, then key business attributes (~5 max — logical, not physical). Cross-aggregate references drawn as PlantUML arrows stereotyped `<<by-value>>` with explicit cardinality (`||--o{`, `}o--||`, etc.); no FK lines cross service boundaries.

**Service-scope** (`docs/<service_name>/diagrams/erd-logical.puml`): single service's aggregates + every upstream aggregate it references by value. Upstream entities stereotyped `<<external>>`. Same row syntax as workspace.

Forbidden at either scope: physical column lists, indexes, audit-log tables, snapshot tables, prose-string columns. Those belong in `<feature-id>-erd-physical.puml` (per-feature).

**Scope-routing.** `per-service` → service-scope ERD only, bind to BR-AC `diagrams:`. `system-wide` → workspace ERD covering every walked service, bind to SAD `diagrams:`; skip service-scope ERDs.

### Step 8 — Inter-service Sequence authoring

`docs/diagrams/sequence-inter-<flow>.puml` — one file per Journey-gate outcome category (`forward-purchase`, `abandonment`, `reversal`, `partial-or-failed-delivery`, etc.). Every cross-service call MUST show request AND response on adjacent arrows:

```
caller -> callee : <verb> <path> { <request payload skeleton> }
callee --> caller : <status-code> { <response payload skeleton> }
```

Payload skeletons carry field names only, no values — they describe contract shape, not test data. Field names lift verbatim from the corresponding `<feature-id>-openapi.yaml` schemas.

**Failure paths.** Every cross-service call whose FRS row carries ≥1 error AC OR whose openapi operation declares ≥1 non-2xx response MUST sit inside an `alt` block with success branch first, then one `else` branch per distinct failure category. Reference the FRS `S-AC-001` row by id in the alt branch label (`else AC-014: payment declined`).

**One-way notifications.** Annotate as `caller ->> callee : <event> {payload}` per PlantUML async syntax — no response arrow required.

Forbidden: synchronous arrows without response; payload values; reused payload aliases that hide the field set.

### Step 8b — Per-feature highlighted copy rule

Each `<feature-id>-c4-context.puml` and `<feature-id>-c4-container.puml` is a **verbatim copy** of the workspace singleton with ONE delta: `UpdateElementStyle(<feature-touched-element>, $bgColor="#1168bd", $borderColor="#0b4884", $fontColor="white")` highlights on the elements the feature touches.

- Same `System(...)` / `Container(...)` boxes, same ids + labels + descriptions
- Same `Person(...)` / `System_Ext(...)` set verbatim
- NEVER introduce `Container(...)` in `c4-context.puml` (layer-mismatch defect) — those belong in `c4-container.puml`
- NEVER drop, rename, or merge upstream actors

Layer mismatch (containers inside context) is a structural defect — re-author at the L1 abstraction. The two-folder rule is symmetric for `c4-container.puml`.

### Step 8c — Arrow evidence (workspace `c4-container.puml`)

Every `Rel(...)` between containers in a workspace-scope `c4-container.puml` MUST cite source evidence:

- REST controller path, OR
- Kafka topic + producer/consumer class pair, OR
- Outbound HTTP adapter call site, OR
- `pom.xml` runtime dependency

Lift evidence into a paired markdown table at the tail of SAD `S-CONTAINERS-001` — columns `source-container | dest-container | evidence file:line | relationship type`. Arrows without source evidence are dropped from the diagram. Referenced HLDs / external design docs do NOT count as evidence — they are reference-only.

### Step 9 — ADR-worthiness gates

Invoked by `@architect` BEFORE opening an ADR (forward-chain ESCALATE-ADR trigger or self-trigger mid-TDD), and by `@reviewer` retroactively when grading a diff that introduces a system-affecting decision lacking an ADR. ALL three gates must pass; any fail → inline decision in PRD / FRS / TDD body, never an ADR.

1. **Multiple-option fingerprint** — ≥2 named alternatives realistically on the table (evidenced by source comment / commit / external spec / prior ADR / explicit product framing). Framework defaults fail. Fail → `AskUserQuestion` or pick obvious option inline.
2. **Cross-cutting consequence** — reversing forces changes across ≥2 components OR services. Local conventions fail. Fail → inline PRD / FRS / TDD body decision.
3. **Hard-to-reverse stakes** — choice carries ≥1 of: external-contract impact, data-shape migration, cross-team sign-off, production-behaviour change. Fail → `AskUserQuestion` + document in PRD / FRS body.

Brownfield reverse-pass: half-implementations + accidental shapes fail gate 1 → route to BR-AC `S-INVARIANTS-001` via `ratify-spec`, NOT an ADR. Reverse-pass DIV rows arriving as ADR proposals are always unworthy.

### Step 10 — SAD/TDD lock-gate enforcement

**SAD lock-gate (c4-context mandatory).** SAD `status: locked` is denied unless BOTH `<context_path>/docs/diagrams/c4-context.puml` AND `c4-container.puml` exist. The context diagram carries one `System(...)` box for the workspace under design, every external `Person` / `System_Ext` the workspace touches, and nothing else (per `### Step 1c`). Reverse-pass authoring routinely skips context.puml when the container topology "feels obvious from `src/**`" — this gate stops that failure mode.

**TDD lock-gate (erd-physical mandatory on persistence).** TDD `status: locked` is denied for any feature whose `S-DATA-001` carries ≥1 row unless `<feature-id>-erd-physical.puml` exists under the feature's `diagrams/` folder. The diagram enumerates every persistent entity in physical form (table name + column list + nullability + indexes + FK lines); Redis key shapes + Kafka payload envelopes belong in the same `.puml` labelled per store. Logical aggregates only → `erd-logical.puml` instead (per Step 7).

`pre-write-check.js` `workspace-sad-container-floor` gate enforces the SAD container-count floor at write time; c4-context.puml + erd-physical.puml presence is checked by the authoring agent before requesting `status: locked`.

## When to escalate

- Microservice ownership crosses team lines mid-render → consult `references/c4-rules.md` for the multi-team pattern.
- Component diagram has nothing to show beyond a single class → omit per Step 4 protocol.
- Client requests a "subcomponent" or 5th-level abstraction → C4 forbids it; clarify scope or split into multiple Component diagrams.

## References

- `references/templates.md` — 6 quick-start fenced templates plus the highlight protocol for per-feature copies.
- `references/c4-rules.md` — extended "what to avoid", framework-internals deep table, microservices ownership patterns, full element-syntax reference, styling and layout macros, zoom-continuity counter-examples.

Output paths (system-level / service-level / per-feature) are owned by `@architect` — see `agents/architect.md` "Allowed surface" for the full system-level + service-level + per-feature output table.

## Worked example

For a single feature in a fresh service, `@architect` authors `docs/diagrams/{c4-context,c4-container}.puml` (system singletons). `@architect` authors `docs/<service_name>/diagrams/{c4-component,c4-code}.puml` (service singletons) plus per-feature highlighted L1+L2 copies and `<feature-id>-seq-<usecase>.puml` / `<feature-id>-erd-physical.puml` under the feature's `diagrams/` folder. `post-write-puml` renders every `.svg`. Walk Step 6's checklist on each source; per-feature L1+L2 copies must differ from singletons ONLY in `UpdateElementStyle()` highlights.
