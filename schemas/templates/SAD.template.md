---
id: SAD
type: SAD
created: {{CREATED}}
revision: 1
status: draft
project_mode: greenfield
c4_levels_present: [1, 2]
diagrams:
  - sad-c4-context
  - sad-c4-container
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
  S-VISION-001:
    writer: "@architect"
    status: in_progress
  S-CONTEXT-001:
    writer: "@architect"
    status: in_progress
  S-CONTAINERS-001:
    writer: "@architect"
    status: in_progress
---

# Software Architecture Document

## Changelog

- {{CREATED}} | created by @architect | {{REASON}}

## Vision <a id="S-VISION-001"></a>

<!-- FILL: One paragraph. What does this system do at the smallest credible scale? What will it become? -->

## System Context <a id="S-CONTEXT-001"></a>

<!-- FILL: One paragraph naming the system, primary actors, and external systems. C4 Level 1. -->

![C4 Level 1 — System Context](diagrams/sad-c4-context.svg)

## Containers <a id="S-CONTAINERS-001"></a>

<!-- FILL: One bullet per container (deployable unit). Name + technology + responsibility. C4 Level 2. Describe each container by its architectural role and technology label only — no codebase paths. -->

![C4 Level 2 — Containers](diagrams/sad-c4-container.svg)
