# Orchestra-specific PlantUML conventions

Companion to `skills/plantuml/SKILL.md`. Read when authoring any `.puml` source under a consumer project's `docs/diagrams/` or `docs/<service>/diagrams/` tree.

## Three-scope filename model

Orchestra uses a three-scope model so chain artifacts reference diagrams by stable name across PRDs / FRSs / TDDs:

| Scope | Path | Files | Owner |
|---|---|---|---|
| System singleton | `docs/diagrams/` | `c4-context.puml`, `c4-container.puml`, `erd-logical.puml`, `sequence-inter-<flow>.puml` | `@architect` |
| Service singleton | `docs/<service_name>/diagrams/` | `c4-component.puml`, `c4-code.puml` (opt-in; ≥3 classes), `erd-logical.puml`, `state-machine.puml`, `usecase.puml` | `@architect` (most) / `@analyst` (`usecase.puml`) |
| Per-feature | `docs/<service_name>/<feature-id>/diagrams/` | `<feature-id>-{c4-context,c4-container,frs-usecase,state-business,sequence-intra-<usecase>,state-technical,erd-physical}.puml` | `@analyst` (frs-usecase, state-business) / `@architect` (others) |

## Per-feature provenance via line comments

When a new feature changes a `Component()` / `Rel()` / class line in a service-level file, leave a `' #<feature-id>` PlantUML line comment above the changed line. Provenance lives in comments; rendered diagram stays uncluttered.

## Per-feature L1+L2 highlight rule

Per-feature L1+L2 copies (`<feature-id>-c4-context.puml`, `<feature-id>-c4-container.puml`) differ from system singletons ONLY in styling (`UpdateElementStyle()` / `UpdateRelStyle()` highlights on the feature-touched elements). Never differ in element identity, ids, labels, descriptions, or actor set.

NO per-feature L3 / L4 copies; service-level L3+L4 carry feature provenance via `' #<feature-id>` line comments instead.

## Filename allowlist (enforced)

Forbidden by default:

- `AD-*` (activity diagrams — use full diagram-type name)
- `SAGA-*`
- `SD-*` (use `sequence-inter-<flow>.puml` / `<feature-id>-sequence-intra-<usecase>.puml`)
- `ERD-*` (use `erd-logical.puml` / `<feature-id>-erd-physical.puml`)
- `C2-*` / `C3-*` short-hands (use the full C4-PlantUML macro filenames)
- Ad-hoc `*-overview.puml` / `*-architecture.puml`
- **Any L3 / L4 file outside the service's own `diagrams/` folder**

Supplementary diagrams outside the allowlist require `--enable-supplementary-diagrams` AND a stated rationale in the relevant ADR or TDD section. Reviewer flags any other prefix as a structural failure.

## C3 (component) is not a class diagram

C3 component diagrams describe service-internal **components**, not Java classes. Caps when authoring `c4-component.puml`:

- 5–10 components per service. More than 10 → split the service into containers at L2 first.
- Label by responsibility (`OrderValidator`, `PaymentDispatcher`), not Java class name (`OrderServiceImpl`).
- No methods, no fields, no parameter lists in C3.
- Internal class structure belongs in TDD prose or in C4 L4 (when the service warrants L4).
- L4 (code-level) is opt-in only: code-to-spec reverse-pass defaults OFF unless TDD justifies L4 in `S-COMPONENTS-001`.

## Two-folder rule (singleton vs per-feature copy)

A project singleton at `docs/diagrams/c4-<noun>.puml` is unstyled.

The per-feature copy under `docs/<service_name>/<feature-id>/diagrams/` differs from the singleton ONLY in `UpdateElementStyle()` highlights — never in element identity. Element-identity drift between singleton and per-feature copy is a structural defect; re-author the per-feature copy from the singleton verbatim, then add the highlight delta.
