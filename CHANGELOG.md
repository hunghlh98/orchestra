# Changelog

All notable changes to orchestra are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added (PR #4 — MCPs orchestra-fs + orchestra-probe)

- `scripts/mcp-servers/orchestra-fs.js` — MCP server exposing one tool: `tree`. Stdlib `fs.readdir` walker producing tree-style output. Path-escape rejection (`..` outside cwd). Ignore globs default to `node_modules`, `.git`, `.venv`. Honors `ORCHESTRA_MCP_ORCHESTRA_FS=off`.
- `scripts/mcp-servers/orchestra-probe.js` — MCP server with two tools:
  - `http_probe`: HTTP/HTTPS request via `node:http`/`node:https`. Configurable timeout, max_body_bytes (truncation), follow_redirects. Response headers filtered (`Set-Cookie`, `Authorization` stripped). Response body passes through 8-pattern secret-redaction.
  - `db_state`: SELECT-only enforced via first-significant-token check. Per-row body redaction. Row cap default 100 (max 1000). Timeout default 5s (max 30s). DSN credentials masked in any log output.
  - **R4 decision**: WITH/CTE rejected in v1.0.0 (CTE rejected with same SELECT-only message). Conservative because PostgreSQL allows DML inside CTEs (`WITH ... INSERT ...`). v1.1+ extends with proper SQL parsing.
  - **Scope reduction**: PostgreSQL and MySQL DSN dispatchers throw a clear "deferred to v1.1+" message. The MCP API surface (DSN format, tool schema) is locked now; v1.1 only adds CLI dispatch.
- `scripts/test-probe.js` — 25+ assertions: redact() unit, http_probe round-trip (status, body redaction, timeout, body truncation), db_state on tmp sqlite (parameterized SELECT, redaction in result, row_cap, INSERT rejected, WITH rejected, comments-before-SELECT allowed, postgres/mysql deferred messages), treeImpl path-escape, MCP JSON-RPC `tools/list` smoke for both servers, env-var opt-out.
- `.claude-plugin/.mcp.json` — registers both servers via `${CLAUDE_PLUGIN_ROOT}`.
- `.claude-plugin/plugin.json` — added `hooks` and `mcpServers` references (lazy until corresponding files arrived).
- `.gitignore` — `scripts/mcp-servers/*` allow-list per PRD §11.3 (only the 2 shipped MCP scripts tracked).
- `manifests/install-modules.json` += 2 mcp entries; `manifests/runtime-toggles.json` += 2 toggles. test-removability now reports 7 modules / 7 toggles.
- `package.json` — added `test:probe` to npm test chain. CI now runs 8 validators.

### Added (PR #3 — remaining 4 hooks + metrics tests)

- `hooks/scripts/pre-write-check.js` — Blocker hook. Detects 8 secret patterns (AWS keys, GitHub PATs, JWTs, RSA/EC private keys, Slack tokens, Google API keys, Bearer/Basic auth) and exits 2 on hit. Skips lines containing `process.env.`, `${`, `placeholder`, `<your-`, `example`, `test-fixture`. Per PRD §9.9 / DESIGN-001-infra §3.2.
- `hooks/scripts/post-bash-lint.js` — Observer hook. Surfaces source-modifying Bash commands (`npm/yarn/pnpm install`, `sed -i`, `tee`, source-file redirects) to stderr. Exits 0 always.
- `hooks/scripts/val-calibration.js` — Rewriter hook. Injects `<calibration-anchor>` block into `@evaluator` Task prompts when the calibration source file exists. Graceful no-op until `skills/evaluator-tuning/` ships in PR #5.
- `hooks/scripts/metrics-collector.js` — Observer hook (multi-event). Subscribed to UserPromptSubmit, PreToolUse(Task), PreToolUse(mcp__orchestra-*), SubagentStop, Stop. Routes by `hook_event_name` to one of 5 event types; appends to `<cwd>/.claude/.orchestra/metrics/events.jsonl`. 50MB rotation with 5-archive retention; configurable via `ORCHESTRA_METRICS_ROTATE_BYTES`.
- `scripts/test-metrics.js` — JSONL append safety (100 sequential), rotation (gzipped archive at threshold), retention (≤5 archives), event classification (6 cases), env-var opt-out.
- `hooks/hooks.json` — full hook registration: 5 hooks across 6 event types/matchers.
- `manifests/install-modules.json` += 4 hook entries; `manifests/runtime-toggles.json` += 4 toggles. test-removability now reports 5 modules / 5 toggles.
- `package.json` — added `test:metrics` to npm test chain.
- `scripts/test-hooks.js` — extended with pre-write-check (5 cases incl. Edit-tool branch), post-bash-lint (3), val-calibration (5).

### Added (PR #2 — hash-stamper + validate-drift)

- `hooks/lib/yaml-mini.js` — frozen-grammar YAML parser/serializer (PRD §8.13).
- `hooks/lib/section-hash.js` — canonical SHA256 over normalized section content. Shared by hash-stamper and validate-drift.
- `hooks/scripts/hash-stamper.js` — PreToolUse hook that stamps section hashes into orchestra artifact frontmatter; resolves `references[].hash-at-write: TBD` from upstream artifacts.
- `hooks/hooks.json` — registers hash-stamper for Write/Edit/MultiEdit.
- `scripts/validate-drift.js` — full drift-detection algorithm replacing PR #1's empty-tree stub. Walks artifacts, recomputes hashes, classifies findings (drift-on-confirmed → fail; drift-on-inferred → warn).
- `scripts/test-hooks.js` — yaml-mini round-trip + section-hash regression + hash-stamper integration + validate-drift fixture cases (clean / drift-on-confirmed / drift-on-inferred) + env-var opt-out.
- `docs/pipeline-schema.md` — type-specific frontmatter shapes for every artifact type per PRD §10.5.
- `manifests/install-modules.json` += `hook.hash-stamper`; `manifests/runtime-toggles.json` += `ORCHESTRA_HOOK_HASH_STAMPER`.

### Added (PR #1 — manifests + CI scaffold)

- `manifests/install-modules.json`, `manifests/runtime-toggles.json`, `manifests/known-models.json`.
- `schemas/` IDE-time JSON Schemas for the three manifests.
- `.claude-plugin/plugin.json` minimal scaffold.
- `scripts/validate.js`, `scripts/test-removability.js`, `scripts/test-hooks.js`, `scripts/test-agents.js`, `scripts/test-bash-strip.js`, `scripts/validate-drift.js`.
- GitHub Actions CI running all six validators on every push and PR.
- `.gitignore` for `node_modules`, `.venv/`, and consumer-side `.claude/.orchestra/{local.yaml, metrics, sessions}` per PRD §11.2.

## [1.0.0] — TBD

Initial release. See [`docs/PRD-001.md`](docs/PRD-001.md) for the full v1.0.0 scope.
