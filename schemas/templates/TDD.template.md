---
id: {{ID}}
type: TDD
created: {{CREATED}}
revision: 1
status: draft
sad_touched: false
service_singletons_touched: []
sequence_diagram_count: 1
diagrams:
  - tdd-sequence-primary
readers:
  - "@product"
  - "@analyst"
  - "@architect"
  - "@backend"
  - "@frontend"
  - "@test-author"
  - "@test-runner"
  - "@evaluator"
  - "@reviewer"
sections:
  S-COMPONENTS-001:
    writer: "@architect"
    status: in_progress
  S-SEQUENCE-001:
    writer: "@architect"
    status: in_progress
  S-DATA-MODEL-001:
    writer: "@architect"
    status: in_progress
  S-STATE-001:
    writer: "@architect"
    status: in_progress
  S-ERROR-HANDLING-001:
    writer: "@architect"
    status: in_progress
  S-CONFIG-001:
    writer: "@architect"
    status: in_progress
  S-RISKS-001:
    writer: "@architect"
    status: in_progress
---

# {{SLUG}} — TDD

## Changelog

- {{CREATED}} | created by @architect | {{REASON}}

## Components <a id="S-COMPONENTS-001"></a>

<!-- FILL: Internal modules and their responsibilities. C4 Level 3. -->

## Sequence — primary flow <a id="S-SEQUENCE-001"></a>

<!-- FILL: One paragraph describing the primary request → response path. Add more sequences for additional flows. -->

![Sequence — primary flow](diagrams/tdd-sequence-primary.svg)

## Data Model <a id="S-DATA-MODEL-001"></a>

<!-- FILL: Table or DDL for persistent shapes. Index choices and uniqueness constraints called out. -->

## State Machine <a id="S-STATE-001"></a>

<!-- FILL: When the design has a lifecycle (draft → live → archived, etc.), describe states + transitions. Else write `<!-- OMIT: no lifecycle states -->`. -->

## Error Handling <a id="S-ERROR-HANDLING-001"></a>

<!-- FILL: Map each error class to its response shape. Reference FRS §S-ERRORS-001 contract; do NOT re-state. -->

## Configuration <a id="S-CONFIG-001"></a>

<!-- FILL: Environment variables / config keys, defaults, and load semantics. -->

## Risks <a id="S-RISKS-001"></a>

<!-- FILL: Bullet known risks. Each risk that warrants an ADR MUST be flagged here for @architect. -->
