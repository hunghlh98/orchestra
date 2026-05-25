---
id: {{ID}}
type: PRD
created: {{CREATED}}
revision: 1
status: draft
version: 1.0.0
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
  S-PROBLEM-001:
    writer: "@product"
    status: in_progress
  S-USERS-001:
    writer: "@product"
    status: in_progress
  S-GOALS-001:
    writer: "@product"
    status: in_progress
  S-NON-GOALS-001:
    writer: "@product"
    status: in_progress
  S-METRICS-001:
    writer: "@product"
    status: in_progress
  S-OPEN-001:
    writer: "@product"
    status: in_progress
---

# {{SLUG}} — PRD

## Changelog

- {{CREATED}} | created by @product | {{REASON}}

## Problem <a id="S-PROBLEM-001"></a>

<!-- FILL: What is the user pain? Why does it matter now? -->

## Users <a id="S-USERS-001"></a>

<!-- FILL: Bullet the user roles. One line per role. -->

## Goals <a id="S-GOALS-001"></a>

<!-- FILL: Bullet 3-7 goals. Each goal is a verifiable outcome, not a feature. -->

## Non-Goals <a id="S-NON-GOALS-001"></a>

<!-- FILL: Bullet what is intentionally OUT of scope. Each line shuts down a likely-wrong assumption. -->

## Success Metrics <a id="S-METRICS-001"></a>

<!-- FILL: Bullet 3-5 metrics. Each is a measurable threshold (≥X%, ≤Y ms, etc.). -->

## Open Questions <a id="S-OPEN-001"></a>

<!-- FILL: Numbered list of unresolved decisions. Items that warrant ADRs MUST be flagged here for @architect. -->
