---
name: c4-architecture
description: Generates C4-model architecture diagrams (Context / Container / Component / Deployment / Dynamic) using PlantUML C4-PlantUML stdlib. Use when an orchestra agent authors C4 diagrams in SAD or TDD.
origin: orchestra-internal (structure adapted from .agents/skills/c4-architecture; output rewritten Mermaid → C4-PlantUML stdlib)
---

# c4-architecture

Generates C4-model diagrams (Context / Container / Component / Deployment / Dynamic) in PlantUML via the C4-PlantUML stdlib. Invoked by `@architect` (L1/L2) and `@lead` (L3/L4 + Dynamic).

## When to use

- `@architect` authoring `docs/SAD.md` — Context (L1) + Container (L2).
- `@lead` authoring service-level singletons `docs/<service_name>/diagrams/c4-component.puml` + `c4-code.puml` (L3 + L4).
- `@lead` authoring per-feature highlighted L1+L2 copies and intra-service sequence + physical ERD under `docs/<service_name>/<feature-id>/diagrams/`.

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

**Workspace SAD** ("system under design" = the workspace / platform):

- `c4-context.puml`: one `System("<platform name>")` box. Every service in `<context_path>/CLAUDE.md` Service Topology MUST appear as a container in L2 — NOT `System_Ext`. Only entities outside the workspace (upstream merchants, third-party payment networks, end-user personas) are `System_Ext` / `Person`.
- `c4-container.puml`: `System_Boundary(<workspace>, ...)` encloses every Service-Topology service as `Container(...)`. Backing infrastructure the workspace operates (managed MySQL, Redis, Kafka clusters) is `ContainerDb(...)` / `ContainerQueue(...)` inside the boundary. Third-party hosted services remain `System_Ext`.
- SAD `S-CONTAINERS-001`: ≥2 Container rows. One Container + N `System_Ext` siblings = service-scope wearing a workspace label — rewrite.

**Service SAD** ("system under design" = the named service):

- `c4-context.puml`: one `System("<service name>")` box. Other services in the workspace ARE `System_Ext` here.
- `c4-container.puml`: containers are the service's internal deployable units (e.g. Spring Boot app + dedicated DB + dedicated cache). NOT the workspace's services.

**Verification.** Before locking SAD: re-read frontmatter `workspace_kind` (from `system.yaml`) and confirm `S-CONTAINERS-001` row count matches scope. Workspace scope with <2 rows → rewrite. `pre-write-check.js` Gate-E enforces the same minimum at write time.

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
- [ ] **L1 Context**: no transport protocols on relationships. **L3 Component**: no framework internals.
- [ ] **Every `Rel(...)`**: label, technology arg at Container/Component level, action verb, unidirectional.
- [ ] **Stand-alone test**: a stranger reading the rendered `.svg` (no narration) can tell what the system does, who uses it, how it's built.
- [ ] **Two-folder rule**: project singleton at `docs/diagrams/c4-<noun>.puml` is unstyled; per-feature copy under `docs/<service_name>/<feature-id>/diagrams/` differs ONLY in `UpdateElementStyle()` highlights — never in element identity.

## When to escalate

- Microservice ownership crosses team lines mid-render → consult `references/c4-rules.md` for the multi-team pattern.
- Component diagram has nothing to show beyond a single class → omit per Step 4 protocol.
- Client requests a "subcomponent" or 5th-level abstraction → C4 forbids it; clarify scope or split into multiple Component diagrams.

## References

- `references/templates.md` — 6 quick-start fenced templates plus the highlight protocol for per-feature copies.
- `references/c4-rules.md` — extended "what to avoid", framework-internals deep table, microservices ownership patterns, full element-syntax reference, styling and layout macros, zoom-continuity counter-examples.

Output paths (system-level / service-level / per-feature) are owned by the calling agent — see `agents/architect.md` "Allowed surface" (system-level singletons) and `agents/lead.md` "Allowed-set / Outputs" (service-level singletons + per-feature copies).

## Worked example

For a single feature in a fresh service, `@architect` authors `docs/diagrams/{c4-context,c4-container}.puml` (system singletons). `@lead` authors `docs/<service_name>/diagrams/{c4-component,c4-code}.puml` (service singletons) plus per-feature highlighted L1+L2 copies and `<feature-id>-seq-<usecase>.puml` / `<feature-id>-erd-physical.puml` under the feature's `diagrams/` folder. `post-write-puml` renders every `.svg`. Walk Step 6's checklist on each source; per-feature L1+L2 copies must differ from singletons ONLY in `UpdateElementStyle()` highlights.
