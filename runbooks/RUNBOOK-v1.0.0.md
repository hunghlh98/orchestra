---
id: RUNBOOK-v1.0.0
type: RUNBOOK
created: 2026-05-03
revision: 1
version: 1.0.0
topology_change_summary: "Inaugural release. Net-new plugin: 5 hooks, 2 MCP servers, 8 agents, 8 skills, 1 command, 12 rules, 8 CI validators, 36 manifest entries, 15 runtime toggles. No prior orchestra version exists; all topology is new."
deploy_steps_count: 4
rollback_steps_count: 2
---

# RUNBOOK v1.0.0 — Install + smoke test

orchestra has no server-side deployment surface — it ships as a Claude Code plugin distributed via `claude plugin install`. This runbook covers (1) the consumer-side install path, (2) what changes in a consumer's environment after install, and (3) rollback if install regresses an existing project.

## Topology changes

**Before:** no `orchestra` plugin installed.

**After:**

| Surface | What lands |
|---|---|
| Slash commands | `/orchestra` with 5 subcommands (smart router, sprint, release, commit, help) |
| Subagents (TeamCreate) | 8 (`@product`, `@lead`, `@backend`, `@frontend`, `@test`, `@evaluator`, `@reviewer`, `@ship`) |
| Skills | 8 (loaded on-demand by agents) |
| Rules | 12 path-activated language rule files |
| Hooks | 5 (pre-write-check, hash-stamper, post-bash-lint, val-calibration, metrics-collector) |
| MCP servers | 2 (orchestra-fs, orchestra-probe) |
| Consumer filesystem footprint | `<project>/.claude/.orchestra/` (auto-created on first run; gitignored per PRD §11.2) |
| Env vars | 15 `ORCHESTRA_*` toggles (all default `on`; opt-out only) |

No DB schema changes. No network listeners opened. No background processes spawned. Hooks invoke local Node.js subprocesses synchronously per Claude Code event.

## Pre-deploy verification

Run on a clean machine before promoting to users:

1. `node --version` ≥ 18.0.0 (required by `package.json` engines).
2. `claude --version` (Claude Code installed and on `$PATH`).
3. `git --version` (required by `hash-stamper` for repo-relative paths and by the `commit-work` skill).
4. **Optional:** `sqlite3 --version` (P0 backend for `orchestra-probe.db_state`); `psql --version` and `mysql --version` are NOT required at install — both DSN dispatchers ship as "deferred to v1.1+" stubs.

## Deploy steps

Run by the consumer in their own shell:

1. **Register the marketplace, then install the plugin** (two commands inside any Claude Code session):
   ```
   /plugin marketplace add hunghlh98/orchestra
   /plugin install orchestra@orchestra-marketplace
   ```
   The first command clones the orchestra repo, reads `.claude-plugin/marketplace.json`, and registers `orchestra-marketplace` as a known plugin source. The second command installs the `orchestra` plugin listed inside that marketplace.

   *Expected:* plugin manifest registered; `~/.claude/plugins/orchestra/` populated; no follow-up prompts. Per G4, both commands complete in <5 minutes on a clean machine.

   *Why two commands:* Claude Code's plugin system separates marketplace discovery (where to look for plugins) from plugin install (which plugin to install). For a single-plugin repo, both commands point at the same GitHub URL, but the model still requires both steps.

2. **Verify install:** open Claude Code in any directory and run:
   ```
   /orchestra help
   ```
   *Expected:* the usage block prints (5-row subcommand table). If you see "Unknown command", install did not register the `commands` array — check `~/.claude/plugins/orchestra/.claude-plugin/plugin.json` for `"commands": ["commands/orchestra.md"]`.

3. **Bootstrap a project:** `cd <your-project>` then run any natural-language `/orchestra` invocation:
   ```
   /orchestra explain this codebase
   ```
   *Expected:* on first invocation, `@product` + `@lead` create `<project>/.claude/.orchestra/local.yaml` via Pattern B (one revision round, PRD §9.11). The `metrics-collector` hook writes the first `local.bootstrapped` event to `<project>/.claude/.orchestra/metrics/events.jsonl`.

4. **Test the validator chain (plugin-side, optional):**
   ```sh
   cd <orchestra-clone> && npm test
   ```
   *Expected:* all 8 validators green; `test-removability: 36 modules / 15 toggles`. Only relevant if you cloned the repo for development; consumers don't need this step.

## Rollback

If install regresses an existing project (e.g., a hook conflicts with a project-local hook; a rule path-glob unexpectedly applies):

1. **Uninstall the plugin** (inside Claude Code):
   ```
   /plugin uninstall orchestra
   ```
   Optionally also remove the marketplace registration:
   ```
   /plugin marketplace remove orchestra-marketplace
   ```
   Removes the plugin from Claude Code's registry. No consumer files are deleted; only the plugin install path is cleaned up.

2. **Clean consumer state (optional):**
   ```sh
   rm -rf <project>/.claude/.orchestra/
   ```
   Removes the local pipeline state: `local.yaml`, `pipeline/`, `metrics/`, `architecture/SAD.md`, `releases/`, `runbooks/`, `backlog/`. This step is optional — leaving the directory in place lets a re-install resume from prior state.

No database migrations to reverse. No remote services to decommission. Recovery from rollback is full-fidelity (re-install reconstructs all behavior).

## Smoke test (post-deploy)

On a clean throwaway directory:

```sh
mkdir /tmp/orchestra-smoke && cd /tmp/orchestra-smoke && git init
```

Then in Claude Code with that directory open:

1. `/orchestra help` → confirm usage prints (5-row table).
2. `/orchestra add a hello-world README.md` → confirm `@product` + `@lead` bootstrap fires; `<cwd>/.claude/.orchestra/local.yaml` is created; `metrics/events.jsonl` has at least 2 events (`prompt.submitted`, `local.bootstrapped`).
3. Inspect events:
   ```sh
   cat .claude/.orchestra/metrics/events.jsonl
   ```
   Confirm structural events only — no prompt text, no tool args, no file paths beyond schema-allowed ids per PRD §9.9.

If all three steps succeed, install is healthy.

## Observability

Local-only by design (no remote telemetry; G-M5 invariant):

- `<project>/.claude/.orchestra/metrics/events.jsonl` — structural events with 50MB rotation, 5-archive retention. Schema in PRD §9.9.
- `<project>/.claude/.orchestra/metrics/events-<ISO>.jsonl.gz` — rotated archives.

Disable for fully air-gapped runs:

```sh
export ORCHESTRA_HOOK_METRICS_COLLECTOR=off
```

Per-component opt-out via the 15 `ORCHESTRA_*` env vars in [`manifests/runtime-toggles.json`](../manifests/runtime-toggles.json) (covers hooks / skills / MCPs only; rules + commands + agents toggle by editing `plugin.json` / `paths:` per PRD §8.7).

## Refs

- [`releases/RELEASE-v1.0.0.md`](../releases/RELEASE-v1.0.0.md) — release summary
- [`docs/PRD-001.md`](../docs/PRD-001.md) §11 — quality gates and install requirements
- [`commands/orchestra.md`](../commands/orchestra.md) — subcommand contract
- [`manifests/runtime-toggles.json`](../manifests/runtime-toggles.json) — full env-var matrix
