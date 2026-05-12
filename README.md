# orchestra

> A Claude Code plugin that gives one developer a multi-agent SDLC pipeline behind a single entry point.

**One-line thesis:** *"The model IS the agent. Build harnesses, not prompt chains."*

Agent prompts encode roles and boundaries. The harness — hooks, MCP probes, schema-pinned artifacts, observability — encodes everything the model cannot reason about reliably alone.

## Install

Two commands inside any Claude Code session:

```
/plugin marketplace add hunghlh98/orchestra
/plugin install orchestra@orchestra-marketplace
```

The first registers the orchestra repo as a plugin marketplace (reading `.claude-plugin/marketplace.json`); the second installs the `orchestra` plugin from it. No setup wizard, no follow-up prompts.

## Usage

```
/orchestra <intent>     Smart router. Mode-detect → chain-rigor election → spec-to-code chain.
/orchestra ship         Verify gates → smoke-test install → write RELEASE / RUNBOOK + set TSR frontmatter `ship:` → draft commit message.
/orchestra report       Render Gantt + cost-by-role + cost-by-phase from events / tokens / runs.
/orchestra resume       Walk pipeline dirs; respawn the next non-terminal task in any open feature.
/orchestra help         Print usage.
```

Optional flag: `--confidence {high,medium,low}` overrides `@lead`'s automatic confidence classification.

## The chain

```
Business           Architecture        Component   Boundary
─────────────────  ─────────────────   ─────────   ────────────────────
PRD ──→ FRS ──→    SAD ──→ ADR ──→     TDD ──→     openapi.yaml
                                                        │
                                                        ▼
                                                       code + tests
                                                        │
                                                        ▼
                                                       TSR (verify)
```

Each layer is a separate, schema-pinned artifact under `<project>/docs/`. The chain runs forward for greenfield work and reverses (to a user-elected depth) for brownfield bootstrap.

**Chain rigor presets** — elected at entry:
- **Full** — all layers (PRD → FRS → SAD → ADR → TDD → openapi)
- **Standard** — skip SAD / ADR (PRD → FRS → TDD → openapi)
- **Light** — TDD only (component-internal change, no spec uplift)

## Two workflows

**Greenfield** — empty repo. `/orchestra` runs the chain forward from PRD to code.

**Brownfield** — existing codebase. `/orchestra` reverse-documents to user-elected depth (`light` = PRD only, `medium` = PRD + FRS + TDD, `full` = full chain), then runs the forward chain on every feature thereafter.

```
/orchestra (no args)
  │
  ├─ detect mode (empty repo → greenfield; src/ exists → brownfield)
  ├─ mode ambiguous?         → AskUserQuestion: greenfield | brownfield
  ├─ brownfield only?        → AskUserQuestion: depth (light | medium | full)
  ├─ always                  → AskUserQuestion: chain rigor (Full | Standard | Light)
  ├─ greenfield + no lang?   → AskUserQuestion: language + framework
  └─ spawn @lead with locked decisions
```

Each ask is **elidable** when its answer is inferable from prompt or repo state. The plugin asks only when it can't infer.

## What ships

| Surface | Count | Purpose |
|---|---|---|
| **Agents** | 8 | `@product`, `@architect`, `@lead`, `@backend`, `@frontend`, `@test`, `@evaluator`, `@reviewer` — instantiated as a TeamCreate roster on every `/orchestra` run |
| **Skills** | 8 | `task-breakdown`, `project-discovery`, `code-review`, `qa-test-planner`, `write-contract`, `c4-architecture`, `plantuml`, `java-development` |
| **Commands** | 1 | `/orchestra` with 5 subcommands (smart router, ship, report, resume, help) |
| **Schemas** | 5 | `pipeline-artifact.schema.md`, `install-modules.schema.json`, `runtime-toggles.schema.json`, `known-models.schema.json`, `routing-taxonomy.md` |

**Harness** (auto-loaded, env-var opt-out):

- **Hooks (5):** `pre-write-check`, `metrics-collector`, `val-calibration`, `post-bash-lint`, `post-write-puml`
- **MCP servers (2):** `orchestra-fs` (`tree`), `orchestra-probe` (`http_probe` + `db_state`)

Per-component opt-out via env var:

```sh
export ORCHESTRA_HOOK_METRICS_COLLECTOR=off  # disable local metrics
export ORCHESTRA_MCP_ORCHESTRA_PROBE=off     # disable runtime probes
export ORCHESTRA_SKILL_JAVA_DEVELOPMENT=off  # disable Java skill
```

Full toggle list in [`manifests/runtime-toggles.json`](manifests/runtime-toggles.json).

## Architecture

The plugin is built around three load-bearing decisions:

1. **Generator/evaluator separation.** `@evaluator` is strict-read-only (T-A tier); implementer agents (`@backend`, `@frontend`) have **no `Bash`** (T-C tier, structurally enforced by `test-bash-strip.js` in CI). Probe runs route through `@evaluator` calling the `orchestra-probe` MCP — auditable, named, capped.
2. **Schema-pinned artifacts.** Every artifact under `<project>/docs/` validates against `schemas/pipeline-artifact.schema.md`. Frontmatter carries `phase`, `agent_role`, `artifact_id`, `subagent_session_id` so observability joins are filename arithmetic, not timestamp guesswork.
3. **Capability-first default models.** Opus 4.7 with 1M context for spec / review tiers. Each agent declares its model in frontmatter; users override per-project in `<project>/.orchestra/local.yaml`.

## Project mode

orchestra auto-bootstraps **greenfield** vs **brownfield** mode on first run. Decision lands in `<project>/.orchestra/local.yaml`. The first `local.bootstrapped` event is appended to `<project>/.orchestra/metrics/events.jsonl` at the same time.

For brownfield, the plugin produces reverse-doc artifacts at the elected depth before running the forward chain on the user's first feature ask.

## Configuration

All hooks, skills, and MCP servers ship `defaultEnabled: true`. Opt-out is env-var only — no config file required for the default path.

Agents and commands are toggled by removing entries from `plugin.json.agents` / `plugin.json.commands` (the `runtime-toggles.json` env-var surface covers hooks / skills / MCPs only).

## Validate (plugin-side)

```sh
npm test
```

Runs the validators on the orchestra repo:

| Validator | What it checks |
|---|---|
| `validate.js` | Manifests parse; `plugin.json` ↔ `CHANGELOG` ↔ `VERSION` self-consistent; skill / command frontmatter |
| `test-hooks.js` | Hook contract: yaml-mini round-trip; pre-write-check secret detection; val-calibration injection; post-bash-lint observer; post-write-puml render-on-puml |
| `test-scaffold.js` | First-run scaffold writes `<project>/.orchestra/` + `<project>/docs/` correctly |
| `test-validate-extensions.js` | Pipeline-artifact schema extension surface |
| `test-validate-backlog.js` | `docs/BACKLOG.md` shape; reject unmoderated entries |
| `test-agents.js` | Agent frontmatter (name, description ≤200 chars, tools tier, model id, context_mode, ≥1 `<example>`) |
| `test-bash-strip.js` | No implementer-tier agent has `Bash` |
| `test-removability.js` | `install-modules` ↔ `runtime-toggles` 1:1 mapping for hook / skill / mcp kinds |
| `test-metrics.js` | metrics-collector append safety, rotation, retention, event classification, observability enrichments, env-var opt-out |
| `test-bootstrap.js` | Mode-detection (empty / src / commits) and render shape |
| `test-probe.js` | orchestra-probe MCP: redaction, http_probe round-trip, db_state SELECT-only, tree path-escape, JSON-RPC smoke, env-var opt-out |
| `test-report.js` | `/orchestra report`: Gantt + role pivot + phase pivot via `subagent_session_id` join + warnings shape |

CI runs all validators on every push and PR.

## Versioning

[Semantic Versioning](https://semver.org/).

- [`CHANGELOG.md`](CHANGELOG.md) — Keep-a-Changelog format
- Version bumps run through [`scripts/bump-version.js`](scripts/bump-version.js) — atomic update across `VERSION`, `package.json`, `plugin.json`.

## License

MIT. See `package.json` for the canonical license declaration.

## Acknowledgments

Parts of orchestra borrow from or adapt upstream work. Credit where due:

- [`skills/plantuml/`](skills/plantuml/) — cloned from [`SpillwaveSolutions/plantuml`](https://github.com/SpillwaveSolutions/plantuml) (MIT). Examples trimmed; conversion scripts unchanged.
- [`skills/c4-architecture/`](skills/c4-architecture/) — structure adapted from a Mermaid-output upstream skill in `softaworks/agent-toolkit`; output rewritten for C4-PlantUML stdlib.
