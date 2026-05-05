---
id: {{ID}}
type: CONTRACT
created: {{CREATED}}
revision: 1
signed: false
weighted_criteria_total: 100
passing_score: 80
probe_count: 0
critical_failure_conditions: 0
---

# {{SLUG}} — CONTRACT

## Interface <a id="S-INTERFACE-001"></a>

<!-- FILL: Enumerate the interface surface. HTTP endpoints / events / messages. Reference API.openapi.yaml for HTTP shape; this section names them. -->

## Service contract <a id="S-SERVICE-CONTRACT-001"></a>

<!-- FILL: Per-method/topic contract: what triggers it, payload shape, success/error responses, idempotency, ordering. -->

![Service contract](diagrams/contract-service.svg)

## Scoring policy <a id="S-SCORING-001"></a>

<!-- FILL: Integer weights summing to 100; passing_score (default 80); critical-fail veto rules. Update frontmatter weighted_criteria_total / passing_score / critical_failure_conditions. -->

## Criteria <a id="S-CRITERIA-001"></a>

<!-- FILL: One C-NNN block per criterion. Each block: weight, critical:true|false, probe DSL (orchestra-probe.http_probe / db_state), PASS/FAIL conditions. Add a sequence diagram per critical-path criterion under diagrams/contract-sequence-<criterion-id>.puml. Update probe_count. -->
