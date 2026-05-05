---
id: {{ID}}
type: TDD
created: {{CREATED}}
revision: 1
sad-touched: false
c4_levels_present: [3]
sequence_diagram_count: 1
state_machine_count: 0
---

# {{SLUG}} — TDD

## Components <a id="S-COMPONENTS-001"></a>

<!-- FILL: Internal modules and their responsibilities. C4 Level 3. -->

![C4 Level 3 — Components](diagrams/tdd-c4-component.svg)

## Sequence — primary flow <a id="S-SEQUENCE-001"></a>

<!-- FILL: One paragraph describing the primary request → response path. Add more sequences for additional flows. -->

![Sequence — primary flow](diagrams/tdd-sequence-primary.svg)

## Data Model <a id="S-DATA-MODEL-001"></a>

<!-- FILL: Table or DDL for persistent shapes. Index choices and uniqueness constraints called out. -->

![Data model — ER](diagrams/tdd-er.svg)

## State Machine <a id="S-STATE-001"></a>

<!-- FILL: When the design has a lifecycle (draft → live → archived, etc.), describe states + transitions. Else write `<!-- OMIT: no lifecycle states -->` and set frontmatter state_machine_count: 0. -->

![State machine](diagrams/tdd-state.svg)

## Error Handling <a id="S-ERROR-HANDLING-001"></a>

<!-- FILL: Map each error class to its response shape. Reference FRS §S-ERRORS-001 contract; do NOT re-state. -->

## Configuration <a id="S-CONFIG-001"></a>

<!-- FILL: Environment variables / config keys, defaults, and load semantics. -->

## Risks <a id="S-RISKS-001"></a>

<!-- FILL: Bullet known risks. Each risk that warrants an ADR MUST be flagged here for @lead. -->
