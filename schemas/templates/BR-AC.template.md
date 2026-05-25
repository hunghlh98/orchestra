---
id: {{SERVICE_NAME}}-BR-AC
type: BR-AC
created: {{CREATED}}
revision: 1
status: draft
service_name: {{SERVICE_NAME}}
br_count: 0
ac_count: 0
invariant_count: 0
reverse_authoring_mode: re-author
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
  S-BR-001:
    writer: "@architect"
    status: pending
  S-AC-001:
    writer: "@architect"
    status: pending
  S-INVARIANTS-001:
    writer: "@architect"
    status: pending
---

# {{SERVICE_NAME}} — Business Rules + Acceptance Criteria

## Changelog

- {{CREATED}} | created by @architect | {{REASON}}

## Business rules <a id="S-BR-001"></a>

<!-- FILL (@architect): | ID | Rule | Owner | Source |. ID = BR-NNN. Owner = named human role (Finance, Compliance, Platform-Lead). Source = policy of record by name. -->

## Acceptance criteria <a id="S-AC-001"></a>

<!-- FILL (@architect): | ID | Assertion | Verification surface | Traces |. ID = AC-NNN. Traces cites BR-NNN (own) or business-invariants.md/INV-NNN. -->

## Service invariants <a id="S-INVARIANTS-001"></a>

<!-- FILL (@architect): | ID | Invariant | Rationale |. ID = INV-NNN. Implementer-only consistency rules — push stakeholder-signable rules to S-BR-001. -->
