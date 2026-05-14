---
id: SAD
type: SAD
created: {{CREATED}}
revision: 1
project_mode: greenfield
c4_levels_present: [1, 2]
---

<!--
Link discipline: this document is part of the sealed `docs/` narrative tree.
MUST NOT link to codebase paths (src/...), external URLs, .orchestra/ siblings,
or project-root files. MAY link only to other `docs/*` artifacts by relative
path and cite ADRs by ID in plain prose ("per ADR-0007-use-postgres, ...").
ADR index lives at .orchestra/inventory/adr/index.md, NOT in this document.
Full rule: schemas/pipeline-artifact.schema.md#link-discipline.
-->

# Software Architecture Document

## Vision <a id="S-VISION-001"></a>

<!-- FILL: One paragraph. What does this system do at the smallest credible scale? What will it become? -->

## System Context <a id="S-CONTEXT-001"></a>

<!-- FILL: One paragraph naming the system, primary actors, and external systems. C4 Level 1. -->

![C4 Level 1 — System Context](diagrams/sad-c4-context.svg)

## Containers <a id="S-CONTAINERS-001"></a>

<!-- FILL: One bullet per container (deployable unit). Name + technology + responsibility. C4 Level 2. Describe each container by its architectural role and technology label only — no codebase paths. -->

![C4 Level 2 — Containers](diagrams/sad-c4-container.svg)
