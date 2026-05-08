---
id: BACKLOG
title: Orchestra plugin backlog (canonical)
revision: 1
created: 2026-05-06
schema_version: 1
---

# Orchestra plugin backlog

> Canonical site for deferred + killed feature proposals. Replaces scattered
> `PRD-NNN §14` / `DESIGN-NNN §<followups>` sections per v4.0-brief §6. See
> the per-row body section below the index for full rationale.

## Index

| ID | Title | Status | Source | Created | Last changed |
|---|---|---|---|---|---|
| BL-0001-pm-haiku-tier-intent | `@pm` haiku-tier intent classifier | killed | v4.0-brief §6 | 2026-05-06 | 2026-05-06 |
| BL-0002-reducing-entropy-skill-b2 | `reducing-entropy` skill | killed | v4.0-brief §6 | 2026-05-06 | 2026-05-06 |
| BL-0003-post-deploy-analytics-skill-b2 | `post-deploy-analytics` skill | killed | v4.0-brief §6 | 2026-05-06 | 2026-05-06 |
| BL-0004-save-load-skill | `save` / `load` skill | killed | v4.0-brief §6 | 2026-05-06 | 2026-05-06 |
| BL-0005-cost-profiler-hook-b3 | `cost-profiler` hook | killed | v4.0-brief §6 | 2026-05-06 | 2026-05-06 |
| BL-0006-mid-flight-checkpoint-over | Mid-flight checkpoint over end-to-end run | killed | v4.0-brief §6 | 2026-05-06 | 2026-05-06 |
| BL-0007-heartbeat-stall-detection-b7 | Heartbeat / stall-detection | killed | v4.0-brief §6 | 2026-05-06 | 2026-05-06 |
| BL-0008-external-sinks-slack | External sinks (Slack / CI / web dashboard) | killed | v4.0-brief §6 | 2026-05-06 | 2026-05-06 |
| BL-0009-install-sh-install | `install.sh` / `install.ps1` | killed | v4.0-brief §6 | 2026-05-06 | 2026-05-06 |
| BL-0010-consumer-facing-hooks-md | Consumer-facing `HOOKS.md` | killed | v4.0-brief §6 | 2026-05-06 | 2026-05-06 |
| BL-0011-adr-tools-log4brains-interop | `adr-tools` / `log4brains` interop | killed | v4.0-brief §6 | 2026-05-06 | 2026-05-06 |
| BL-0012-docs-optimization-pr-gamma-plan-md | `docs/optimization-pr-gamma-plan.md` | killed | dev-surface artifact | 2026-05-06 | 2026-05-06 |
| BL-0013-architect-ux-security | `@architect`, `@ux`, `@security`, `@debugger` specialist agents | deferred | v4.0-brief §6 | 2026-05-06 | 2026-05-06 |
| BL-0014-mechanical-fe-separation | Mechanical FE/BE separation via pre-write-check globs | deferred | agents/{backend,frontend}.md | 2026-05-06 | 2026-05-06 |
| BL-0015-migration-extraction-skill-orchestra | `migration-extraction` skill + `/orchestra legacy <path>` (B2 / B5) | deferred | v4.0-brief §6 | 2026-05-06 | 2026-05-06 |
| BL-0016-frontend-component-patterns-skill-b2 | `frontend-component-patterns` skill | deferred | v4.0-brief §6 | 2026-05-06 | 2026-05-06 |
| BL-0017-sc-spec-panel-skill-b2 | `sc-spec-panel` skill | deferred | v4.0-brief §6 | 2026-05-06 | 2026-05-06 |
| BL-0018-n-5-dimension-confidence-scorecard | 5-dimension confidence scorecard | deferred | v4.0-brief §6 | 2026-05-06 | 2026-05-06 |
| BL-0019-wave-orchestration-pattern | Wave orchestration / Pattern C integration checkpoints | deferred | v4.0-brief §6 | 2026-05-06 | 2026-05-06 |
| BL-0020-async-option-synthesis | Async `OPTION_SYNTHESIS` / `PROPOSAL-<id>.md` | deferred | v4.0-brief §6 | 2026-05-06 | 2026-05-06 |
| BL-0021-async-pause-phase | Async `PAUSE-<phase>-<id>.md` artifacts | deferred | v4.0-brief §6 | 2026-05-06 | 2026-05-06 |
| BL-0022-sprint-level-rollup-across | Sprint-level rollup across multiple issues | deferred | v4.0-brief §6 | 2026-05-06 | 2026-05-06 |
| BL-0023-empirical-ablation-loop | Empirical ablation loop | deferred | v4.0-brief §6 | 2026-05-06 | 2026-05-06 |
| BL-0024-playwright-mcp-fe | Playwright MCP for FE behavioral probes | deferred | v4.0-brief §6 | 2026-05-06 | 2026-05-06 |
| BL-0025-parallel-worktrees-pattern | Parallel worktrees pattern | deferred | v4.0-brief §6 | 2026-05-06 | 2026-05-06 |
| BL-0026-tiered-memory-memory | Tiered memory + memory consolidation | deferred | v4.0-brief §6 | 2026-05-06 | 2026-05-06 |
| BL-0027-nosql-probes-mongo | NoSQL probes (Mongo / DynamoDB / Redis) | deferred | v4.0-brief §6 | 2026-05-06 | 2026-05-06 |
| BL-0028-save-load-orchestra-disagree | `/save`, `/load`, `/orchestra-disagree` subcommands | deferred | commands/orchestra.md line ~257 | 2026-05-06 | 2026-05-06 |
| BL-0029-subagent-insight-emission | Subagent-side `★ Insight` block emission | deferred | metrics-collector smoke 2026-05-08 | 2026-05-08 | 2026-05-08 |
| BL-0030-teams-mode-dispatcher | Teams-mode dispatcher (TeamCreate at /orchestra start) | deferred | metrics-collector smoke 2026-05-08 | 2026-05-08 | 2026-05-08 |

## BL-0001-pm-haiku-tier-intent — `@pm` haiku-tier intent classifier <a id="BL-0001-pm-haiku-tier-intent"></a>

**Status:** killed · **Source:** v4.0-brief §6 · **Created:** 2026-05-06

Adds a tier-0 hop in front of `@product`, complicates routing taxonomy. Cost-optimization premise unverified — `@product` calls are not the dominant cost.

---

## BL-0002-reducing-entropy-skill-b2 — `reducing-entropy` skill <a id="BL-0002-reducing-entropy-skill-b2"></a>

**Status:** killed · **Source:** v4.0-brief §6 · **Created:** 2026-05-06

Unclear failure mode; no observed regression that justifies it. Add only if a real issue surfaces.

---

## BL-0003-post-deploy-analytics-skill-b2 — `post-deploy-analytics` skill <a id="BL-0003-post-deploy-analytics-skill-b2"></a>

**Status:** killed · **Source:** v4.0-brief §6 · **Created:** 2026-05-06

Requires deployment infra orchestra explicitly disclaims (PRD-001 NG2: not a CI/CD system).

---

## BL-0004-save-load-skill — `save` / `load` skill <a id="BL-0004-save-load-skill"></a>

**Status:** killed · **Source:** v4.0-brief §6 · **Created:** 2026-05-06

PRD itself gates this on "telemetry-justified ROI"; no telemetry, no justification.

---

## BL-0005-cost-profiler-hook-b3 — `cost-profiler` hook <a id="BL-0005-cost-profiler-hook-b3"></a>

**Status:** killed · **Source:** v4.0-brief §6 · **Created:** 2026-05-06

Same telemetry-gate as save/load; explicit opt-in already documented but premature.

---

## BL-0006-mid-flight-checkpoint-over — Mid-flight checkpoint over end-to-end run <a id="BL-0006-mid-flight-checkpoint-over"></a>

**Status:** killed · **Source:** v4.0-brief §6 · **Created:** 2026-05-06

Overlaps with shipped `/orchestra resume`; would duplicate state.

---

## BL-0007-heartbeat-stall-detection-b7 — Heartbeat / stall-detection <a id="BL-0007-heartbeat-stall-detection-b7"></a>

**Status:** killed · **Source:** v4.0-brief §6 · **Created:** 2026-05-06

Adds polling/timer infrastructure to a filesystem-coupled system; architecturally awkward. PRD-002 brainstorm Q2 already declined this once.

---

## BL-0008-external-sinks-slack — External sinks (Slack / CI / web dashboard) <a id="BL-0008-external-sinks-slack"></a>

**Status:** killed · **Source:** v4.0-brief §6 · **Created:** 2026-05-06

Explicitly out-of-scope per v4.0-brief §6

---

## BL-0009-install-sh-install — `install.sh` / `install.ps1` <a id="BL-0009-install-sh-install"></a>

**Status:** killed · **Source:** v4.0-brief §6 · **Created:** 2026-05-06

Redundant with `claude plugin install` (the G4 acceptance criterion).

---

## BL-0010-consumer-facing-hooks-md — Consumer-facing `HOOKS.md` <a id="BL-0010-consumer-facing-hooks-md"></a>

**Status:** killed · **Source:** v4.0-brief §6 · **Created:** 2026-05-06

`manifests/runtime-toggles.json` already serves consumers; dev-surface `docs/HOOKS.md` is sufficient for maintainers.

---

## BL-0011-adr-tools-log4brains-interop — `adr-tools` / `log4brains` interop <a id="BL-0011-adr-tools-log4brains-interop"></a>

**Status:** killed · **Source:** v4.0-brief §6 · **Created:** 2026-05-06

Naming convention is already compatible; no demand has surfaced. Kill until a user asks.

---

## BL-0012-docs-optimization-pr-gamma-plan-md — `docs/optimization-pr-gamma-plan.md` <a id="BL-0012-docs-optimization-pr-gamma-plan-md"></a>

**Status:** killed · **Source:** dev-surface artifact · **Created:** 2026-05-06

Stale per D-5. Delete the file as part of the migration.

---

## BL-0013-architect-ux-security — `@architect`, `@ux`, `@security`, `@debugger` specialist agents <a id="BL-0013-architect-ux-security"></a>

**Status:** deferred · **Source:** v4.0-brief §6 · **Created:** 2026-05-06

Each requires its own design pass; routing-taxonomy implications real. Per D-1 these are also v3-shaped (breaking), so explicitly out-of-window.

---

## BL-0014-mechanical-fe-separation — Mechanical FE/BE separation via pre-write-check globs <a id="BL-0014-mechanical-fe-separation"></a>

**Status:** deferred · **Source:** agents/{backend,frontend}.md · **Created:** 2026-05-06

Useful but not Java-focus-relevant per D-2.

---

## BL-0015-migration-extraction-skill-orchestra — `migration-extraction` skill + `/orchestra legacy <path>` (B2 / B5) <a id="BL-0015-migration-extraction-skill-orchestra"></a>

**Status:** deferred · **Source:** v4.0-brief §6 · **Created:** 2026-05-06

Brownfield reverse mode; coupled. Land together when prioritized.

---

## BL-0016-frontend-component-patterns-skill-b2 — `frontend-component-patterns` skill <a id="BL-0016-frontend-component-patterns-skill-b2"></a>

**Status:** deferred · **Source:** v4.0-brief §6 · **Created:** 2026-05-06

FE-shaped per D-2.

---

## BL-0017-sc-spec-panel-skill-b2 — `sc-spec-panel` skill <a id="BL-0017-sc-spec-panel-skill-b2"></a>

**Status:** deferred · **Source:** v4.0-brief §6 · **Created:** 2026-05-06

Adds a 4th dialogue pattern; needs design spec.

---

## BL-0018-n-5-dimension-confidence-scorecard — 5-dimension confidence scorecard <a id="BL-0018-n-5-dimension-confidence-scorecard"></a>

**Status:** deferred · **Source:** v4.0-brief §6 · **Created:** 2026-05-06

Refinement of HIGH/MEDIUM/LOW; non-trivial reshape of `@lead` autonomy classification.

---

## BL-0019-wave-orchestration-pattern — Wave orchestration / Pattern C integration checkpoints <a id="BL-0019-wave-orchestration-pattern"></a>

**Status:** deferred · **Source:** v4.0-brief §6 · **Created:** 2026-05-06

Pattern C itself is v1.1+; checkpoints downstream.

---

## BL-0020-async-option-synthesis — Async `OPTION_SYNTHESIS` / `PROPOSAL-<id>.md` <a id="BL-0020-async-option-synthesis"></a>

**Status:** deferred · **Source:** v4.0-brief §6 · **Created:** 2026-05-06

New artifact type + async semantics; heavy.

---

## BL-0021-async-pause-phase — Async `PAUSE-<phase>-<id>.md` artifacts <a id="BL-0021-async-pause-phase"></a>

**Status:** deferred · **Source:** v4.0-brief §6 · **Created:** 2026-05-06

Pairs with B6 OPTION_SYNTHESIS.

---

## BL-0022-sprint-level-rollup-across — Sprint-level rollup across multiple issues <a id="BL-0022-sprint-level-rollup-across"></a>

**Status:** deferred · **Source:** v4.0-brief §6 · **Created:** 2026-05-06

Multi-feature aggregation; current scope is per-feature-id.

---

## BL-0023-empirical-ablation-loop — Empirical ablation loop <a id="BL-0023-empirical-ablation-loop"></a>

**Status:** deferred · **Source:** v4.0-brief §6 · **Created:** 2026-05-06

High-leverage but standalone tooling motion; deserves its own design.

---

## BL-0024-playwright-mcp-fe — Playwright MCP for FE behavioral probes <a id="BL-0024-playwright-mcp-fe"></a>

**Status:** deferred · **Source:** v4.0-brief §6 · **Created:** 2026-05-06

FE-shaped per D-2.

---

## BL-0025-parallel-worktrees-pattern — Parallel worktrees pattern <a id="BL-0025-parallel-worktrees-pattern"></a>

**Status:** deferred · **Source:** v4.0-brief §6 · **Created:** 2026-05-06

Workflow guidance; can wait.

---

## BL-0026-tiered-memory-memory — Tiered memory + memory consolidation <a id="BL-0026-tiered-memory-memory"></a>

**Status:** deferred · **Source:** v4.0-brief §6 · **Created:** 2026-05-06

Touches the memory system; high-blast-radius.

---

## BL-0027-nosql-probes-mongo — NoSQL probes (Mongo / DynamoDB / Redis) <a id="BL-0027-nosql-probes-mongo"></a>

**Status:** deferred · **Source:** v4.0-brief §6 · **Created:** 2026-05-06

Out-of-scope for SQL-focused user; defer until asked.

---

## BL-0028-save-load-orchestra-disagree — `/save`, `/load`, `/orchestra-disagree` subcommands <a id="BL-0028-save-load-orchestra-disagree"></a>

**Status:** deferred · **Source:** commands/orchestra.md line ~257 · **Created:** 2026-05-06

Couple to telemetry / save-load skill — gated similarly.

---

## BL-0029-subagent-insight-emission — Subagent-side `★ Insight` block emission <a id="BL-0029-subagent-insight-emission"></a>

**Status:** deferred · **Source:** metrics-collector smoke 2026-05-08 · **Created:** 2026-05-08

The metrics hook captures `★ Insight ─...─` blocks from any session jsonl into `metrics/insights.jsonl`. In v4.0 the parent dispatcher emits them (Explanatory output style) but no `agents/*.md` instructs the spawned agent to emit them, so subagent jsonls contain zero blocks and `insights.jsonl` is dispatcher-only. Decide whether the signal value of per-role reasoning capture justifies the token tax of asking every agent to render insight blocks on every consumer load. Test: empirical 2026-05-08 smoke produced 0 insights across 6 subagent jsonls.

---

## BL-0030-teams-mode-dispatcher — Teams-mode dispatcher (TeamCreate at `/orchestra` start) <a id="BL-0030-teams-mode-dispatcher"></a>

**Status:** deferred · **Source:** metrics-collector smoke 2026-05-08 · **Created:** 2026-05-08

`local.yaml.spawn_mode: teams` is documented but currently informational — the dispatcher always operates in subagent mode regardless. Implementing the active branch means: at the start of a run, call `TeamCreate({team_name: "orchestra-<feature-id>", agent_type: "orchestra-coordinator"})` after `intent.yaml` is locked; pass `team_name` on every `Agent({...})` spawn; call `TeamDelete` at terminal state. The v3 baseline ran this exact pattern, and `events.jsonl` already classifies `team.created` / `team.shutdown` (hooks/scripts/metrics-collector.js:132,141), so the lift is dispatcher-prompt only. Risk: prompt-engineering change to consumer-shipping `commands/orchestra.md` with no automated regression test for LLM-driven dispatcher behavior.

---

