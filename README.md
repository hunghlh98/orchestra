# orchestra

> A Claude Code plugin that gives one developer a multi-agent SDLC pipeline behind a single entry point.

**One-line thesis:** *"The model IS the agent. Build harnesses, not prompt chains."*

Agent prompts encode roles and boundaries. The harness — hooks, MCP probes, sprint contracts, drift detection — encodes everything the model cannot reason about reliably alone.

## Install

Two commands inside any Claude Code session:

```
/plugin marketplace add hunghlh98/orchestra
/plugin install orchestra@orchestra-marketplace
```

The first registers the orchestra repo as a plugin marketplace (reading `.claude-plugin/marketplace.json`); the second installs the `orchestra` plugin from it. No setup wizard, no follow-up prompts. PRD §11.4 / G4 zero-setup invariant.

## Usage

```
/orchestra <natural language>    Smart router. TeamCreate → @product + @lead classify → specialists work in waves.
/orchestra sprint [--size N]     Pull N issues from .claude/.orchestra/backlog/issues/ and run as a batch (default N=3).
/orchestra release               Verify gates → write RELEASE / RUNBOOK / ANNOUNCEMENT artifacts and bump VERSION.
/orchestra commit                Conventional Commits message from `git diff --staged`. No team.
/orchestra help                  Print usage.
```

Optional flag: `--confidence {high,medium,low}` overrides `@lead`'s automatic confidence classification (logged as `confidence.user-override`).

## What ships

| Surface | Count | Purpose |
|---|---|---|
| **Agents** | 8 | `@product`, `@lead`, `@backend`, `@frontend`, `@test`, `@evaluator`, `@reviewer`, `@ship` — instantiated as a TeamCreate roster on every `/orchestra` run |
| **Skills** | 8 | `task-breakdown`, `project-discovery`, `code-review`, `qa-test-planner`, `commit-work`, `write-contract`, `evaluator-tuning`, `java-source-intel` |
| **Rules** | 12 | Path-activated language rules: Java + TypeScript at P0 (4 files each), `common/coding-style.md` at P1, Go / Python / Kotlin stubs at P2 |
| **Commands** | 1 | `/orchestra` with 5 subcommands (smart router, sprint, release, commit, help) |
| **Hooks** | 5 | `pre-write-check`, `hash-stamper`, `post-bash-lint`, `val-calibration`, `metrics-collector` |
| **MCP servers** | 2 | `orchestra-fs` (`tree`), `orchestra-probe` (`http_probe` + `db_state`) |

## Architecture

The plugin is built around three load-bearing decisions:

1. **Generator/evaluator separation.** `@evaluator` is strict-read-only (T-A tier); implementer agents (`@backend`, `@frontend`, `@test`) have **no `Bash`** (T-C tier, structurally enforced by `test-bash-strip.js` in CI). Probe runs route through `@evaluator` calling the `orchestra-probe` MCP — auditable, named, capped.
2. **Document-driven gates.** Every artifact under `<project>/.claude/.orchestra/` carries `sections:` hashes. The `hash-stamper` hook stamps them on write. `validate-drift.js` checks downstream artifacts against upstream hashes. `confirmed:` vs `inferred:` flags drive merge gates: `drift-on-confirmed` blocks; `drift-on-inferred` warns.
3. **Capability-first default models.** Opus 4.7 with 1M context for spec / review tiers. Each agent declares its model in frontmatter; users override per-project in `<project>/.claude/.orchestra/local.yaml`.

See [`docs/DESIGN-001-infra.md`](docs/DESIGN-001-infra.md) for the harness; [`docs/DESIGN-002-leaves.md`](docs/DESIGN-002-leaves.md) for the agent / skill / rule / command leaves.

## Project mode

orchestra auto-bootstraps **greenfield** vs **brownfield** mode on first run via `@product` + `@lead` Pattern B negotiation (one revision round, PRD §9.11). Decision lands in `<project>/.claude/.orchestra/local.yaml`. The first `local.bootstrapped` event is appended to `metrics/events.jsonl` at the same time.

## Configuration

All hooks, skills, and MCP servers ship `defaultEnabled: true`. Per-component opt-out via env var:

```sh
export ORCHESTRA_HOOK_METRICS_COLLECTOR=off  # disable local metrics
export ORCHESTRA_MCP_ORCHESTRA_PROBE=off     # disable runtime probes
export ORCHESTRA_SKILL_JAVA_SOURCE_INTEL=off # disable Java skill
```

Full list (15 toggles) in [`manifests/runtime-toggles.json`](manifests/runtime-toggles.json).

Agents, rules, and commands are toggled differently per PRD §8.7 amendment (R10 Option A): remove paths from `plugin.json.agents` / `plugin.json.commands`, or edit `paths:` globs in `rules/<lang>/*.md` to scope them down. The `runtime-toggles.json` env-var surface is reserved for hooks / skills / MCPs.

## Validate (plugin-side)

```sh
npm test
```

Runs 8 validators on the orchestra repo:

| Validator | What it checks |
|---|---|
| `validate.js` | Manifests parse; `plugin.json` ↔ `CHANGELOG` ↔ `VERSION` self-consistent; skill / rule / command frontmatter |
| `test-hooks.js` | Hook contract: yaml-mini round-trip; section-hash regression; hash-stamper integration; val-calibration injection; pre-write-check secret detection; post-bash-lint observer; validate-drift fixtures |
| `test-agents.js` | Agent frontmatter 7-check (name, description ≤30 words, tools tier, model id, context_mode, ≥1 `<example>`) |
| `test-bash-strip.js` | No implementer-tier agent has `Bash` |
| `validate-drift.js` | Document-alignment drift detection (no-op when `<cwd>/.claude/.orchestra/` is absent — pass-by-default per Q7) |
| `test-removability.js` | `install-modules` ↔ `runtime-toggles` 1:1 mapping for hook / skill / mcp kinds only (per R10 Option A) |
| `test-metrics.js` | metrics-collector append safety (100-sequential), rotation (gzipped archive at 50MB), retention (≤5 archives), event classification, env-var opt-out |
| `test-probe.js` | orchestra-probe MCP: redaction (8 patterns); http_probe round-trip; db_state SELECT-only enforcement; tree path-escape; MCP JSON-RPC smoke; env-var opt-out |

CI runs all 8 on every push and PR.

## Versioning

[Semantic Versioning](https://semver.org/). v1.0.0 is the inaugural release.

- [`CHANGELOG.md`](CHANGELOG.md) — Keep-a-Changelog format
- [`releases/`](releases/) — versioned `RELEASE-vX.Y.Z.md` notes
- [`runbooks/`](runbooks/) — versioned `RUNBOOK-vX.Y.Z.md` when topology changes

## License

MIT. See `package.json` for the canonical license declaration.

## Refs

- [`docs/PRD-001.md`](docs/PRD-001.md) — full v1.0.0 specification (the *why* and *what*)
- [`docs/DESIGN-001-infra.md`](docs/DESIGN-001-infra.md) — harness architecture (PRs #1–#4)
- [`docs/DESIGN-002-leaves.md`](docs/DESIGN-002-leaves.md) — leaf-component architecture (PRs #5–#7)
- [`docs/WORKFLOW-001-infra.md`](docs/WORKFLOW-001-infra.md) + [`docs/WORKFLOW-002-leaves.md`](docs/WORKFLOW-002-leaves.md) — PR-by-PR task graphs
- [`releases/RELEASE-v1.0.0.md`](releases/RELEASE-v1.0.0.md) + [`runbooks/RUNBOOK-v1.0.0.md`](runbooks/RUNBOOK-v1.0.0.md) — v1.0.0 release notes and install runbook

---

> **Status:** v1.0.0 released 2026-05-03. See [`CHANGELOG.md`](CHANGELOG.md).
