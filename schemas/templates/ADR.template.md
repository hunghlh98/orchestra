---
id: {{ID}}
type: ADR
created: {{CREATED}}
revision: 1
status: proposed
verdict: PENDING
scope: global
superseded_by: null
triggered_by: ""
review_round: 1
option_count: 0
diagrams:
  - adr-status
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
  S-STATUS-001:
    writer: "@architect"
    status: in_progress
  S-CONTEXT-001:
    writer: "@architect"
    status: in_progress
  S-DECISION-001:
    writer: "@architect"
    status: in_progress
  S-CONSEQUENCES-001:
    writer: "@architect"
    status: in_progress
  S-ALTERNATIVES-001:
    writer: "@architect"
    status: in_progress
---

# {{ID}} — {{SLUG}}

## Changelog

- {{CREATED}} | created by @architect | {{REASON}}

## Status <a id="S-STATUS-001"></a>

<!-- FILL (@architect): proposed | accepted | superseded | deprecated. Mirror frontmatter status. State machine MANDATORY. -->

![ADR status](diagrams/adr-status.svg)

## Context <a id="S-CONTEXT-001"></a>

<!-- FILL (@architect): What forces this decision? What constraints / risks / unknowns surfaced upstream (PRD's Open Questions / FRS / TDD's Risks section)? -->

## Decision <a id="S-DECISION-001"></a>

<!-- FILL (@architect): The chosen option, stated definitively. One paragraph. -->

## Consequences <a id="S-CONSEQUENCES-001"></a>

<!-- FILL (@architect initially; @reviewer extends with findings on review rounds): What changes because of the decision? Positive + negative. Reviewer's REQUEST_CHANGES findings land here. -->

## Alternatives considered <a id="S-ALTERNATIVES-001"></a>

<!-- FILL (@architect): Each option with one-paragraph pros/cons. Update frontmatter option_count. Include diagrams/adr-option-A.puml etc. for option sketches when comparison helps. -->
