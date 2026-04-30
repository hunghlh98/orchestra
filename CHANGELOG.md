# Changelog

All notable changes to orchestra are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added (PR #7 — /orchestra command + 12 rule files + validator extensions)

- `commands/orchestra.md` — dispatcher per DESIGN-002-leaves §4.1. Five subcommand sections: smart-router (default natural-language path), `sprint`, `release`, `commit`, `help`. Frontmatter: `name` / `description` / `argument-hint`. Body documents the 10-step smart-router flow (PRD §9.1 + §9.4 + §9.5 + §9.11), the AskUserQuestion budget per PRD §8.11 (HIGH=0 / MEDIUM=1 / LOW=2–3, hard cap 3), and the circuit-breaker / DEADLOCK resume reference (PRD §9.6 + §9.6.1). `/orchestra commit` invokes the `commit-work` skill directly with no team.
- `rules/common/coding-style.md` (P1) — `paths: ["**/*"]`. 5 rules covering naming, single-responsibility, constants, public-API contracts, and surrounding-style consistency. Body 25 lines.
- `rules/java/coding-style.md` (P0) — `paths: ["**/*.java"]`. 5 rules: `final`, casing conventions, `Optional<T>` over null, `var` heuristics, no wildcard imports. Body 25 lines.
- `rules/java/patterns.md` (P0) — composition over inheritance, single `@Transactional` boundary per use case, builders for >3-field objects, constructor injection over `@Autowired` field injection, `record` for immutable DTOs. Body 25 lines.
- `rules/java/security.md` (P0) — parameterized JPQL/SQL, `@Valid` at controller boundary, BCrypt/Argon2 password hashing, externalized secrets, redacted PII logging via MDC. Body 25 lines.
- `rules/java/testing.md` (P0) — one behavior per test, AssertJ over vanilla JUnit, `@Mock`/`@InjectMocks` over `@MockBean` for unit tests, Testcontainers for integration scope, behavioral test names. Body 27 lines.
- `rules/typescript/coding-style.md` (P0) — `paths: ["**/*.ts","**/*.tsx"]`. `strict: true`, `type` vs `interface` heuristics, no `any` (use `unknown`), `readonly`/`as const`, `import type`. Body 25 lines.
- `rules/typescript/patterns.md` (P0) — discriminated unions over boolean flags, Result-style returns over throw, functional pipelines, co-location of types, string-literal unions over enums. Body 24 lines.
- `rules/typescript/security.md` (P0) — Zod/io-ts at boundary, output sanitization, no `eval`/`new Function(user_input)`, `process.env` validation, no `dangerouslySetInnerHTML` without DOMPurify. Body 25 lines.
- `rules/typescript/testing.md` (P0) — public-API testing, Vitest/Jest with coverage, mock external boundaries only, one behavior per `it`, snapshots last-resort. Body 26 lines.
- `rules/{go,python,kotlin}/coding-style.md` (P2 stubs) — minimal placeholder per DESIGN-002 §5.4 template (~9 body lines each). Activates path-glob (`**/*.go` / `**/*.py` / `**/*.kt` + `**/*.kts`), documents intent, points to canonical formatter/linter and language style guide. Full rule sets land in v1.1+.
- `.claude-plugin/plugin.json` — added `commands` array referencing `commands/orchestra.md`. `agents` and `commands` are independent keys per PRD §8.7 amendment (R10 Option A).
- `manifests/install-modules.json` += 13 entries: 1 command (`command.orchestra`) + 12 rules (`rule.common-coding-style`, `rule.java-{coding-style,patterns,security,testing}`, `rule.typescript-{coding-style,patterns,security,testing}`, `rule.{go,python,kotlin}-coding-style`). All `defaultEnabled: true`, `stability: stable`.
- `scripts/validate.js` — extended with two new walks:
  - `rules/**/*.md` — frontmatter parses; `paths:` is a non-empty array of non-empty strings; body ≤40 lines (PRD §10.3 + §8.8). Exported as `validateRuleContent(relPath, raw)`.
  - `commands/*.md` — frontmatter has `name` and `description` strings (PRD §10.4). Exported as `validateCommandContent(relPath, raw)`.
  - 7 inline mutation tests (run-when-main): rule body >40 lines fails red; rule missing `paths:` fails red; rule with non-array `paths:` fails red; command missing `name` / `description` fails red; clean rule + clean command fixtures pass.

Per R10 Option A: rules and commands are **not** in runtime-toggles.json (toggle by editing `paths:` globs or removing `commands` array entries). test-removability now reports **36 modules / 15 toggles** — the final v1.0.0 count.

### Added (PR #6 — 8 agents + plugin.json wiring + validator extensions)

- `agents/product.md` — T-B tier (Implementation-restricted). Authors PRD/FRS, negotiates greenfield/brownfield classification. Tools: Read/Grep/Glob/Write. Skill: project-discovery.
- `agents/lead.md` — T-B tier. Classifies routed intent, authors CONTRACT/TDD/TASKS, owns spec-phase negotiation. Skills: task-breakdown, project-discovery, write-contract.
- `agents/backend.md` — T-C tier (Implementer, Bash stripped). Server-side code + unit tests. Tools: Read/Grep/Glob/Write/Edit/MultiEdit. Skill: java-source-intel (P1).
- `agents/frontend.md` — T-C tier. UI components + state + a11y. Hard boundary: ships only with all 4 states wired (loading/empty/error/success).
- `agents/test.md` — T-C tier. Authors TEST-NNN.md and test-source files; never grades (verdict block left empty). Skill: qa-test-planner.
- `agents/evaluator.md` — T-A tier (Strict read-only +Bash +Write-verdict). Runs probes, grades CONTRACT criteria, writes TEST-NNN.md verdict block. Calibration auto-injected via val-calibration hook (PR #3 + PR #5 source).
- `agents/reviewer.md` — T-A tier. Severity-graded review (Critical/Major/Minor/Nit) with ≥80% confidence threshold and 4-strike circuit breaker. Skill: code-review.
- `agents/ship.md` — T-B tier. Authors RELEASE/RUNBOOK/ANNOUNCEMENT artifacts and Conventional Commits. Skill: commit-work. Will not ship if any gate is open or any drift-on-confirmed flag is set.
- `.claude-plugin/plugin.json` — `agents` array populated with all 8 agent paths (T-601..T-608 order: product, lead, backend, frontend, test, evaluator, reviewer, ship).
- `scripts/test-agents.js` — replaced PR #1 stub with full 7-check validation per DESIGN-002-leaves §2.3: (1) all 6 required frontmatter keys present; (2) name in valid set + matches filename; (3) description ≤30 words; (4) tools array exactly matches one of three tier sets (T-A/T-B/T-C, sorted comparison); (5) model id ∈ known-models.json; (6) context_mode ∈ that model's supportsContextMode; (7) body has ≥1 `<example>...</example>` block. Mutation tests: 7 fixtures (missing model, tools-tier mismatch, unknown model, context_mode mismatch, missing example, description over cap, invalid name) plus 1 inverse-sanity. Refactored to run-if-main pattern so test-bash-strip.js can import `parseAgentFrontmatter` without side effects.
- `scripts/test-bash-strip.js` — replaced PR #1 stub with hard-coded `IMPLEMENTER_AGENTS = {backend, frontend, test}` check. Asserts `Bash` ∉ tools for each implementer. Mutation test verifies a T-C agent gaining Bash is flagged red; inverse fixtures confirm T-A (evaluator/reviewer with Bash) and T-B (product without Bash) remain valid. Imports `parseAgentFrontmatter` from test-agents.js to avoid duplicate parser logic.
- `manifests/install-modules.json` += 8 agent entries (`agent.product`, `agent.lead`, `agent.backend`, `agent.frontend`, `agent.test`, `agent.evaluator`, `agent.reviewer`, `agent.ship`). All `kind: agent`, `defaultEnabled: true`, `stability: stable`.

Per R10 Option A: agents are **not** in runtime-toggles.json. test-removability now reports **23 modules / 15 toggles** (15 from PR #1–#5 + 8 agents). Final v1.0.0 count after PR #7 will be 36 modules / 15 toggles.

### Added (PR #5 — 8 skills + calibration source + validator extensions)

- `skills/task-breakdown/SKILL.md` — P0 skill consumed by `@lead`. Decomposes intent into a task graph with SP estimates, owner assignments, and dependency edges. Includes SP rubric (1/2/3/5/8/13) and 6-step decomposition flow.
- `skills/project-discovery/SKILL.md` — P0 skill consumed by `@product` and `@lead`. Returns `{ has_source, primary_language, framework, scope_hints, mode }` snapshot. Language/framework signature tables; brownfield/greenfield classifier.
- `skills/code-review/SKILL.md` — P0 skill consumed by `@reviewer`. Severity-graded review (Critical/Major/Minor/Nit), per-language gates via `rules/<lang>/`, security/performance checklists, 80% confidence threshold, 5-signal confidence rubric.
- `skills/qa-test-planner/SKILL.md` — P0 skill consumed by `@test`. Maps CONTRACT criteria to probes via orchestra-probe MCP; 4-axis coverage strategy (happy/boundary/error/idempotency); 8 standard adversarial fuzz patterns.
- `skills/commit-work/SKILL.md` — P0 skill consumed by `@ship` and `/orchestra commit`. Conventional Commits 1.0.0 type/scope/subject/body/trailer formatter with repo-specific scope conventions (infra, hooks, mcp, agents, skills, rules, command, spec, validators).
- `skills/write-contract/SKILL.md` — P0 skill consumed by `@lead`. CONTRACT-NNN.md authoring: weighted criteria (sum to 100), `critical:` flag semantics, Probe DSL (status / body_contains / rows_count / etc.), `passing_score:` policy.
- `skills/evaluator-tuning/SKILL.md` — P0 skill consumed indirectly by `@evaluator` via the val-calibration hook. Wraps the calibration source with verdict semantics (PASS/FAIL/pending) and an 8-case boundary index.
- `skills/evaluator-tuning/references/calibration-examples.md` — **Load-bearing.** Read by `hooks/scripts/val-calibration.js` on every `Task(subagent_type=evaluator)` spawn and prepended as `<calibration-anchor>...</calibration-anchor>`. Contains 8 worked PASS/FAIL/pending boundary cases per DESIGN-002-leaves §6.3 (empty-body assertion, near-timeout, partial-pass weighting, replay attack, redirect chain, redacted DB field, critical-fail outranking probes, drift mid-test).
- `skills/java-source-intel/SKILL.md` — P1 skill consumed by `@backend` on Java/Spring projects. ripgrep recipe library: caller graphs, `@Transactional` boundary scans, JPA entity impact, Spring component injection sites, common refactor scans.
- `scripts/validate.js` — extended to walk `skills/*/SKILL.md`. Asserts: frontmatter has `name`/`description`/`origin`; `name` === parent folder; description ≤200 chars; body ≤400 lines. Frontmatter parsing reuses `hooks/lib/yaml-mini.js`.
- `scripts/test-hooks.js` — val-calibration assertion flipped from passive (PR #3 graceful no-op: "no `updatedInput`") to active. Now asserts: calibration source exists, `updatedInput.prompt` contains `<calibration-anchor>` + `</calibration-anchor>`, original prompt preserved at end.
- `manifests/install-modules.json` += 8 skill entries (`skill.task-breakdown`, `skill.project-discovery`, `skill.code-review`, `skill.qa-test-planner`, `skill.commit-work`, `skill.write-contract`, `skill.evaluator-tuning`, `skill.java-source-intel`).
- `manifests/runtime-toggles.json` += 8 env-var toggles 1:1 with the install-modules entries (`ORCHESTRA_SKILL_*`).
- test-removability now reports **15 modules / 15 toggles** (7 from PR #1–#4 + 8 skills). Final v1.0.0 count after PR #6/#7 will be 36 modules / 15 toggles per R10 Option A scope.

### Changed (PR #5)

- `docs/PRD-001.md` — revision 4. §8.7 amendment per T-PA-01 (R10 resolution): env-var toggles cover only **skill / hook / MCP**. Agents toggle via `plugin.json.agents` removal; rules via `paths:` glob editing; commands via `plugin.json.commands` removal.

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
