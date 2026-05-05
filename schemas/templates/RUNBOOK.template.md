---
id: {{ID}}
type: RUNBOOK
created: {{CREATED}}
revision: 1
version: "{{SLUG}}"
topology_change_summary: ""
deploy_steps_count: 0
rollback_steps_count: 0
---

# Runbook {{SLUG}}

## Overview <a id="S-OVERVIEW-001"></a>

<!-- FILL: One paragraph naming the service shape (process count, dependencies, ports). Topology change summary mirrored in frontmatter. -->

## Lifecycle <a id="S-LIFECYCLE-001"></a>

<!-- FILL: Start / stop / restart commands. Healthy-shutdown signals. -->

## Deploy <a id="S-DEPLOY-001"></a>

<!-- FILL: Numbered deploy steps. Each step is a single command or action. -->

![Deploy activity](diagrams/runbook-deploy.svg)

## Rollback <a id="S-ROLLBACK-001"></a>

<!-- FILL: Numbered rollback steps. Same shape as deploy, reversed. -->

![Rollback activity](diagrams/runbook-rollback.svg)

## Health checks <a id="S-HEALTH-001"></a>

<!-- FILL: How to verify the service is up (curl / process check / log line). -->

## Common failures <a id="S-FAILURE-001"></a>

<!-- FILL: Symptom → cause → resolution table. -->

## Logs <a id="S-LOGS-001"></a>

<!-- FILL: Where logs live, format, useful greps. -->

## Environment variables <a id="S-ENVVARS-001"></a>

<!-- FILL: Env var table mirroring TDD §Configuration. Each row: name, default, when to override. -->
