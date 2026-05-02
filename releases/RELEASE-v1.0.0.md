---
id: RELEASE-v1.0.0
type: RELEASE
created: 2026-05-03
revision: 1
version: 1.0.0
released_at: 2026-05-03
features: []
runbook_required: true
---

# RELEASE v1.0.0 — Initial release

orchestra is now feature-complete for the v1.0.0 scope defined in [`docs/PRD-001.md`](../docs/PRD-001.md). This is the inaugural release.

## Summary

Multi-agent SDLC pipeline behind one entry point (`/orchestra`). Single-developer focus, generator/evaluator separation, document-driven gates, capability-first default models. The harness encodes everything the model cannot reason about reliably alone (hooks, MCP probes, sprint contracts, drift detection); agent prompts encode roles and boundaries.

## Included PRs

| PR | Scope | Commit |
|---|---|---|
| #1 | Manifest skeletons + CI bootstrap | `2355ac5` |
| #2 | hash-stamper + validate-drift (G3 enforceable) | `36f09f8` |
| #3 | 4 remaining hooks + metrics tests | `62b2192` |
| #4 | orchestra-fs + orchestra-probe MCPs (R4 resolved) | `3aef426` |
| #5 | 8 skills + val-calibration source | `d875bcf` |
| #6 | 8 agents + tier-discipline enforcement | `6877594` |
| #7 | /orchestra dispatcher + 12 rule files | `8d4c1ce` |

Pre-flight: T-PA-01 (`fcc9fb0`) — PRD §8.7 amendment resolving R10 (rules / commands / agents toggle via `plugin.json` removal or `paths:` editing, not env vars).

## Gates Cleared

- All 8 validators green on the merge commit (validate, test-hooks, test-agents, test-bash-strip, test-drift, test-removability, test-metrics, test-probe).
- `test-removability`: 36 modules / 15 toggles (final v1.0.0 count, R10 Option A scope).
- `test-bash-strip`: 0 implementer-tier agents have `Bash` (structural enforcement of D-31 / PRD §8.5).
- `test-agents`: all 8 agent files pass 7-check validation (frontmatter + tier-tools + model + context_mode + ≥1 `<example>`).
- `validate.js` rule walk: 12 rule files pass; max body 27 lines (well under 40-line cap; R8 mitigated without invoking the PRD §8.8 amendment escape hatch).
- `validate.js` command walk: `commands/orchestra.md` passes (`name` + `description` + `argument-hint`).
- `validate-drift`: pass-by-default (orchestra repo has no consumer-side artifacts under `.claude/.orchestra/` per Q7).
- `CHANGELOG` ↔ `VERSION` ↔ `plugin.json.version` self-consistent.

## Composition

| Component | Count |
|---|---|
| Hooks | 5 |
| MCP servers | 2 |
| Agents | 8 |
| Skills | 8 |
| Commands | 1 |
| Rules | 12 |
| CI validators | 8 |
| Manifest entries | 36 |
| Runtime toggles | 15 |

## Migration Notes

This is the initial release; no migration. Consumer-side install is two commands inside any Claude Code session:

```
/plugin marketplace add hunghlh98/orchestra
/plugin install orchestra@orchestra-marketplace
```

The first registers the orchestra repo as a plugin marketplace (Claude Code reads `.claude-plugin/marketplace.json`). The second installs the `orchestra` plugin listed inside that marketplace. No setup wizard, no follow-up prompts; both commands complete in <5 min on a clean machine (G4 invariant).

After install, `<project>/.claude/.orchestra/local.yaml` is auto-bootstrapped on first `/orchestra <intent>` invocation (PRD §9.11, Pattern B negotiation between `@product` and `@lead`).

## Known Limitations

- **Java + TypeScript at P0**; Go / Python / Kotlin ship stubs only. Full rule sets land in v1.1+.
- **NoSQL probes deferred** to v1.1+. `orchestra-probe.db_state` ships SQL backends only (SQLite at P0; PostgreSQL + MySQL DSN dispatchers throw "deferred to v1.1+" until CLI dispatch lands). Mongo / DynamoDB / Redis probes deferred to separate MCPs.
- **`WITH` / CTE rejected** in `db_state` (R4 decision) to be conservative against PostgreSQL DML-inside-CTE. v1.1+ extends with proper SQL parsing.
- **`/orchestra legacy`** (brownfield migration tool), `/save`, `/load`, `/orchestra-disagree` deferred to v1.1+ (D-44).
- **Specialist agents** (`@architect`, `@ux`, `@security`, `@debugger`, `@pm`) deferred to v1.1+.
- **Pattern D** (review-only multi-expert via `sc-spec-panel` skill) deferred to v1.1.
- **`test-bash-strip.js` uses a hard-coded implementer-name set** `{backend, frontend, test}` (R11). Acceptable for v1.0.0; v1.1+ may read tier from agent frontmatter via a PRD §10.1 amendment.

## What's next (v1.1 candidates)

- Full Go / Python / Kotlin rule sets.
- PostgreSQL + MySQL CLI dispatch in `db_state`.
- Specialist agent surface (`@architect`, `@ux`, `@security`, `@debugger`).
- Brownfield `/orchestra legacy` mode.
- Behavioral fixture testing for agent prompts (R6 mitigation).
- `code-review-graph` MCP integration (third-party, MIT, Python 3.10+ via `uv`).
- Playwright MCP for FE behavioral probes.

## Refs

- [`docs/PRD-001.md`](../docs/PRD-001.md) — full v1.0.0 specification (the *why* and *what*)
- [`docs/DESIGN-001-infra.md`](../docs/DESIGN-001-infra.md) — harness architecture (PR #1–#4)
- [`docs/DESIGN-002-leaves.md`](../docs/DESIGN-002-leaves.md) — leaf-component architecture (PR #5–#7)
- [`docs/WORKFLOW-001-infra.md`](../docs/WORKFLOW-001-infra.md) + [`docs/WORKFLOW-002-leaves.md`](../docs/WORKFLOW-002-leaves.md) — PR-by-PR task graphs
- [`runbooks/RUNBOOK-v1.0.0.md`](../runbooks/RUNBOOK-v1.0.0.md) — install + smoke-test runbook
- [`CHANGELOG.md`](../CHANGELOG.md) — versioned changelog
