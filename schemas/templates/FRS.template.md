---
id: {{ID}}
type: FRS
created: {{CREATED}}
revision: 1
status: draft
prd: {{FEATURE_ID}}-PRD
acceptance_criteria_count: 0
usecase_count: 0
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
  S-FRS-001:
    writer: "@analyst"
    status: in_progress
  S-ACCEPTANCE-001:
    writer: "@analyst"
    status: in_progress
  S-ERRORS-001:
    writer: "@analyst"
    status: in_progress
  S-USECASE-001:
    writer: "@analyst"
    status: in_progress
---

# {{SLUG}} — FRS

## Changelog

- {{CREATED}} | created by @analyst | {{REASON}}

## Functional Requirements <a id="S-FRS-001"></a>

<!-- FILL: Numbered FR-N list. Each FR is one MUST/SHOULD statement testable against an Acceptance Criterion. -->

## Acceptance Criteria <a id="S-ACCEPTANCE-001"></a>

<!-- FILL: Numbered AC-N list. Each AC is a deterministic input → expected output mapping. Update frontmatter acceptance_criteria_count. -->

## Error Responses <a id="S-ERRORS-001"></a>

<!-- FILL: Enumerate error conditions and their response shapes (status code + body). 5xx MUST NOT leak internals. -->

## Use Cases <a id="S-USECASE-001"></a>

<!-- FILL: One short sentence per actor → use case. Update frontmatter usecase_count to match the diagram. -->
