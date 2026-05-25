# Changelog

All notable changes to orchestra are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [5.2.4] — 2026-05-25

Patch release. Post-audit cleanup arc (`code-reviews/audit-2026-05-25.html`) — hook security fixes, dispatcher-only skill auto-trigger demotion, maintainer-doc fold-up, hook test-gap backfill. No new behavior; defense-in-depth + context-load reduction.

### Fixed

- **`pre-write-check.js > extractContent` Edit/MultiEdit gap.** The `chain-cite-reject` / secret / codebase-token gates scanned only `new_string`; a cite already present in `old_string` (retention scan) silently passed. `extractContent` now concatenates both sides for `Edit` and walks every `edits[]` pair for `MultiEdit`. Outer `try/catch` emits `permissionDecision: "ask"` instead of fail-open on parser crash.
- **`val-calibration.js` idempotency guard.** Re-invocation on a prompt already wrapped with `<calibration-anchor>` would stack a second anchor (replay / nested-spawn shape). Now early-exits with passthrough when the prompt begins with the anchor sentinel. Opt-out branch gains `drainAndPassthrough()` so the upstream writer never sees EPIPE.
- **`scripts/tests/orchestra-utils.test.js` schema drift.** Three test fixtures + one assertion still wrote `status:` into `system.yaml` / `local.yaml` — the field was removed from both schemas in v5.2.3 (`schemas/{local,system}.schema.json`) but the tests weren't re-aligned; baseline `npm test` was red. Fixtures now use only allowed fields.
- **`skills/plantuml/SKILL.md` + `references/sequence_diagrams.md` leaky `§` cite.** Two intra-skill section references used the `§` glyph which the dev-surface `§`-anchor validator rejected. Replaced with markdown-anchor-style phrasing.
- **`skills/c4-architecture/SKILL.md` phantom heading cites.** Two cites pointed at headings that no longer exist: `plantuml/SKILL.md > ## Sequence diagrams — Operations Summary tables` → `## Sequence diagrams — authoring discipline`; `agents/architect.md "Allowed surface"` → `agents/architect.md > ## Deliverables`.
- **`skills/java-development/SKILL.md` + `references/transactional-impact.md` rg multiline gap.** The `@Transactional` boundary-scan regex spans annotation + method signature across newlines; default `rg` mode terminates patterns at `\n` so the scan silently returned zero matches. Added `-U --multiline-dotall` flags to both call sites.
- **`skills/commit-message/SKILL.md` + `references/types.md` AI trailer drift.** Worked examples carried six instances of `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>`; Anthropic guidance is the literal `Co-Authored-By: Claude Code` (no model name, no version, no email). SKILL body + 6 worked examples + rationale paragraph realigned.

### Changed

- **Dispatcher-only skills demoted to manual-only.** `business-analysis`, `c4-architecture`, `code-review`, `write-contract`, `task-breakdown` now carry `disable-model-invocation: true` — these are 100% agent-invoked (`@analyst`, `@architect`, `@reviewer`) and never user-direct. Removes their `description:` strings from Claude Code's auto-trigger matcher, cutting context bloat on every unrelated prompt that previously partial-matched "review" / "contract" / "rule" keywords.
- **`agents/evaluator.md` + `agents/reviewer.md` tools tightened.** Dropped `Edit, MultiEdit` from both — the validator's per-role forbidden-tool table treats both as CI-enforced read-only graders; their `Write` is reserved for fresh TSR-section authoring (`S-EVAL-001`, `S-REVIEW-001`), never in-place patching. Generator/evaluator separation preserved.
- **`agents/test-runner.md` skill set.** `qa-test-planner, java-development` → `qa-test-planner, clean-code`; runner already invokes Bash + Read paths that need clean-code's F.I.R.S.T. discipline more than full Java write-side guidance.
- **`agents/backend.md` skill alignment.** `<primary_language>-development` token expanded to literal `java-development` at both load + invocation sites (matches `MEMORY.md > orchestra-java-focus`).
- **`CLAUDE.md` fold-up.** 251 → 156 lines (39% reduction). Dropped duplicate `### Why` / `### How to apply` exposition under `## Two surfaces` and `## No version stamps` (the canonical `## Rules` bullets already encode them); compressed `## Audit-trail conformance` to producer table only; preserved surface inventory, fix-shape examples, release workflow, R1-R14 quick map, three-layer architecture summary, and the auto-managed `<!-- orchestra:start -->` splice block.

### Added

- **4 hook regression tests** under `scripts/tests/` — `pre-write-check.test.js` (Edit/MultiEdit retention scan on chain-cite-reject), `val-calibration.test.js` (idempotency anchor guard), `orchestra-preflight.test.js` (`/orchestra` prompt → preflight block emission), `post-write-puml.test.js` (observer-contract: never blocks). All four registered in `package.json > test` chain.
- **`skills/qa-test-planner/references/`** — `coverage-strategies.md` (7-axis worked examples per feature shape) + `fuzz-input-patterns.md` (8-pattern adversarial input catalog). Resolves the SKILL's prior phantom references.

### Removed

- **Dead plantuml workflow surfaces.** `skills/plantuml/scripts/resilient_processor.py` (638 LOC), `skills/plantuml/scripts/extract_and_convert_puml.py` (196 LOC), `skills/plantuml/references/workflows/resilient-execution-guide.md` (294 LOC). No SKILL.md cite; the resilient-execution surface has not been load-bearing in the orchestra plugin since the upstream-clone trim in v2.0.0.

## [5.2.3] — 2026-05-25

Patch release. Closes the 2026-05-23 master-audit remediation arc (`code-reviews/audit-2026-05-23.html`) across 6 surfaces — security, templates, three-layer architecture, schemas, skills, agents, hooks, command, memory. 14 commits land as 8 grouped PRs. No new behavior; defense-in-depth + fold-up + cite-don't-restate hygiene throughout.

### Fixed

- **P0 security (SSRF + DSN + bounded stdin + JSON-RPC notifications).** `mcp-servers/orchestra-probe.js > http_probe` now resolves hostname to IP and rejects loopback / `169.254.169.254` / RFC1918 / link-local (DNS-rebind defense) with opt-in `allow_localhost`; request header allowlist (`Authorization`, `Content-Type`, `Accept`, `User-Agent`, `X-Request-Id`) + 8KB cap. `db_state` DSN path restricted to `<context_path>/.orchestra/**` + opt-in `local.yaml.allowed_dsn_paths`. `isSelectOnly` comment-strip moved into the char-walker so `SELECT 'a--b' FROM t` no longer eats string contents. `spawnSync` for sqlite gains `killSignal: 'SIGKILL'` fallback. JSON-RPC 2.0 §4.1 notifications (no `id`) skipped before the `-32601` reply path in both MCP servers. All 8 hooks read stdin through `hooks/lib/stdin-bounded.js` (1 MiB cap → emit `permissionDecision: "ask"` on overflow / malformed JSON instead of fail-open). `hooks/lib/redaction.js` `import.meta.url.replace("file://", "")` → `fileURLToPath` (Windows-safe).
- **P1 templates schema-aligned; RELEASE/RUNBOOK orphans deleted.** 10 templates under `schemas/templates/` re-aligned to `schemas/pipeline-artifact.schema.md` — `status: draft` + `verdict: PENDING` + `readers` + `sections:` blocks where required; per-feature singleton-diagram embeds dropped from FRS/TDD; prepended `## Changelog` row in every template for first-write conformance with `changelog-append-only` gate. `RELEASE.template.md` + `RUNBOOK.template.md` deleted (types not in master enum; release notes derive from `CHANGELOG.md` + commits). `validate-artifacts.js` enum updated; tests added.
- **Hook lib README + cite-patterns scope.** `hooks/lib/README.md` rewritten — ESM-correct (prior text claimed CommonJS; runtime is ESM via `import`/`export`); dev-surface `scripts/tests/hooks.test.js` cite dropped; `stdin-bounded.js` row added. `hooks/lib/cite-patterns.js` header documents the three token classes + scope decision; `stripe-secret` pattern (`sk_(live|test)_...`) joins the SECRET_PATTERNS allowlist (high-signal prefix; Azure/GCP/Twilio deferred — too noisy without scope narrowing). `BRANCH_RE` anchored to `(?:^|[\s\`(])` boundary so `Release/v1 plan` prose no longer trips the codebase-token-reject gate.
- **Hook env-var + matcher + cwd + CRLF cleanup.** `agent-plan-sync.js` + `stop-plan-verify.js` env-var off-check moved from inside `main()` to module top-level (matches the 5/8 hooks that already early-exit). `post-bash-lint.js` `tee-src` matcher now requires a source-extension target (`.js|.ts|.java|...`) — bare `tee /tmp/log.txt` no longer warns. `post-write-puml.js` drops dead `via: "jar"` / `via: "path"` payload fields. `gate-d.js > readWorkspaceKind(cwd)` plumbs `input.cwd` through `checkWorkspaceSadContainerFloor` (was reading `process.cwd()`, which diverges from the hook's resolved consumer root). `plan-frontmatter.js` frontmatter regex gains `\r?\n` everywhere (CRLF tolerance for Windows-authored agent-tasks ledgers).

### Changed

- **P2 three-layer cleanup (architect bloat, sequence-diagram drift, reviewer table).** `agents/architect.md` extract: ADR-worthiness → `skills/c4-architecture/SKILL.md` Step 9; `S-DATA-001` shape → `skills/clean-architecture/SKILL.md` Entities section; persistence priority → `skills/java-development/SKILL.md` Read-side. 9-clause ratify-spec-amend sentence broken to 4-step procedure. Post-pass deliverable check moved to `commands/orchestra.md` Phase 3 (dispatcher owns walk; agents don't). Operations Summary tables canonically owned by `skills/plantuml/SKILL.md`; `skills/c4-architecture/SKILL.md` Step 6b becomes delegate-only. 15-row Structural failures table relocated from `agents/reviewer.md` to a new `## Structural failures` section in `skills/code-review/SKILL.md`; reviewer body becomes one-line cite.
- **P3 schemas consolidation.** `schemas/pipeline-artifact.schema.md` carve-outs defined once at `<a id="carve-outs">` (cited by anchor at both sites); type enum gains `INTENT` + `INVENTORY` (schemas already exist; closes the routing-taxonomy cite-vs-enum drift); literal CITE_DENYLIST regex stripped → cite `hooks/lib/cite-patterns.js > CITE_DENYLIST_RE` (single source of truth); Body-discipline storytelling stripped → delegate to `agents/<role>.md > ## Writing style`. `run-plan.schema.md:47` `run-plan-ESCALATE.md` → `run-plan-DEADLOCK.md` (matches dispatcher canonical at `commands/orchestra.md`). `features.schema.json` `artifacts` enum gains `clientapi`. `routing-taxonomy.md` clarifies dispatcher = main-thread (not spawned subagent). `local.schema.json` + `system.schema.json` drop the artifact-lifecycle `status` enum (semantically wrong for config files).
- **P4 skills polish.** All 11 skills gain `allowed-tools:` frontmatter (read-mostly → `Read, Glob, Grep, Skill`; writers → +`Write, Edit`; tool-using → +`Bash`). `description:` field expanded 110-170 → 300-500 chars (auto-discovery surface; trigger-keyword expansion needs the room); `scripts/lib/validate-skills.js` cap raised to 500 with rationale. `skills/c4-architecture/SKILL.md` Steps 7-8 extracted to `references/erd-rules.md` + `references/inter-service-sequence.md` (261 → 242 lines). `skills/plantuml/SKILL.md` Steps 2/2a/2b extracted to `references/orchestra-conventions.md` (237 → 211 lines). `skills/qa-test-planner/SKILL.md` `CONTRACT` → `openapi`/`asyncapi`/`clientapi` rename across 5 sites. Cross-skill cite delegation in `code-review` (→ clean-code + clean-architecture), `java-development` (→ write-contract for spec-correctness), `task-breakdown` (→ pipeline-artifact.schema.md for frontmatter), `write-contract` (→ plantuml sequence-discipline).
- **P5 agents polish + cross-cutting DRY.** All 10 agents gain `skills:` frontmatter (Claude Code R2-recommended; enables auto-load on spawn). Color allowlist compliance: `analyst` cyan → pink, `architect` magenta → blue, `explorer` teal → green. 7-agent uniform Changelog cite — `**Changelog row on every write.** Action enum + row format: see schemas/pipeline-artifact.schema.md#changelog-block. Producer mapping (which surface emits which row) lives there.` Body cleanups: `analyst.md` "retired" narration stripped (target state only); `explorer.md` 4-sentence Write-rationale dropped; `reviewer.md` + `test-runner.md` multi-stack enums trimmed to Java exemplars (per `MEMORY.md > orchestra-java-focus`); `backend.md` + `frontend.md` symmetry line added ("No spec authoring; no TDD/openapi/SAD/ADR/BR-AC mutation").
- **P7 command + memory polish.** `commands/orchestra.md` drops two `Why ...` narration paragraphs in Phase 2c recompose flow; ratify-spec section collapses from 5 lines + literal MCP-call signatures to 2 bullets + schema#changelog-block cite; portability contract folds to `schema#link-discipline` + `hooks/scripts/pre-write-check.js codebase-token-reject` cite (rule lives canonically in schema + hook, not restated inline); parallel-spawn discipline 4-paragraph block → 2-bullet rule; preconditions block 5-bullet enumeration → 1-line "lift Invariants" pointer (Invariants are at top of file; duplicating the rules is the very fold-up violation the rule warns against). `CLAUDE.md` audit-trail section drops the "Until then (PR 1 lands the schema body-grammar)" qualifier — grammar landed at `schemas/pipeline-artifact.schema.md#changelog-block`; rule is now active.

## [5.2.2] — 2026-05-23

Patch release. Closes 13 critical findings from the 2026-05-23 master audit (`code-reviews/review-master-audit-2026-05-23.json`). Two real defects in `mcp-servers/` (relock action-name drift; sqlite probe multi-statement bypass), one latent state-management bug in `upsert_features_yaml`, a registry gap for three shipping skills, and a consumer-surface documentation sweep completing the `@lead → dispatcher / @architect / @analyst` merge that landed structurally in v5.2.0 but never propagated to README / skills / schemas / templates. Adds plantuml sequence-diagram authoring discipline (Operations Summary tables + `ref over` reuse) on top.

### Fixed

- **`relock_artifact` action-name contract.** MCP rejected every locked-artifact amendment because it checked for the stale `path-a-amend` while every authoring producer (`agents/architect.md`, `commands/orchestra.md`, `CLAUDE.md`'s Producer table) emits `ratify-spec-amend`. Eight call sites in `mcp-servers/orchestra-utils.js` (tool descriptions + `next_step` field + `!==` guard + error message) now align on `ratify-spec-amend`. New unit test in `scripts/tests/orchestra-utils.test.js` covers happy path + stale-name reject.
- **sqlite probe multi-statement bypass (security).** `isSelectOnly` in `mcp-servers/orchestra-probe.js` only checked the first whitespace-separated token, so `SELECT 1; ATTACH DATABASE ... ; CREATE TABLE ...` passed the guard and `sqlite3 -json` executed all statements. Dual defense: engine-level (`sqlite3 -readonly` flag added to `spawnSync` argv) blocks writes against the main database; parser-level rewrite walks the stripped query character-by-character tracking string state, rejects any non-trailing `;` outside string literals. Three new test cases in `scripts/tests/probe.test.js` (multi-statement reject, trailing-semicolon allow, semicolon-in-string-literal allow).
- **`upsert_features_yaml` silent validation drop.** Existing-file load surfaced only duplicate-id errors via `UNIQUENESS_VIOLATION`; other validation failures (unknown top-level fields, malformed features array shape) were silently dropped and `findIndex` ran against possibly-invalid state. Throw widened to all load errors as `EXISTING_FILE_INVALID` with the underlying reasons inlined. Defensive dedup-by-id added before `findIndex` so upserts remain deterministic even if the throw is ever relaxed.

### Changed

- **Consumer-surface @lead sweep.** v5.2.0's structural `@lead → dispatcher` merge left README diagrams + skill bodies + schema readers + ADR/PRD/TDD templates + hook references + one agent line citing `@lead`. README now describes the 4-phase model (Discovery → Plan → Swarm → Convergence) with native PlanMode as the single user-facing gate; the Agents (10) table swaps the `@lead` row for `@explorer`. 24 files in total realigned: `@architect` now owns all TDD / openapi / asyncapi / clientapi / C4 / ADR authoring sites; `@analyst` owns per-service usecase + state-business diagrams and joins the `docs/` provenance triplet; the dispatcher owns Phase 2 Plan body composition (TASKS graph, run-plan `S-FEATURES-001`, DIV resolution routing, re-spec orchestration); `agents/test-runner.md` drops `@lead` from its bug-handoff fallback list.
- **Stale c4-architecture self-redundancy.** "Invoked by @architect (L1/L2) and @architect (L3/L4)" → "Invoked by @architect (all levels: L1+L2+L3+L4 + Dynamic)" left behind by the merge.

### Added

- **`skill.clean-code`, `skill.clean-architecture`, `skill.commit-message` registered in `manifests/install-modules.json`** (stability: stable) + matching `ORCHESTRA_SKILL_CLEAN_CODE` / `ORCHESTRA_SKILL_CLEAN_ARCHITECTURE` / `ORCHESTRA_SKILL_COMMIT_MESSAGE` toggles in `manifests/runtime-toggles.json`. All three ship and were auto-discovered by Claude Code, but the registry hid them (registry claimed 8 skills, README claimed 11) and they couldn't be opted out for air-gapped users or convention swaps. README's Skills (11) count is now consistent with both surfaces. Vendor provenance for clean-code + clean-architecture lives one level deeper in their frontmatter `origin:` field (schema enum allows only `stable | experimental`).
- **plantuml sequence-diagram authoring discipline.** New `## Sequence diagrams — authoring discipline` section in `skills/plantuml/SKILL.md` covers two content rules that ship alongside every `.puml` sequence source: (a) Operations Summary tables — every sequence diagram publishes an `<id>-ops.md` sibling listing Redis Keys / Kafka Topics / Database Tables / Lock Patterns / State machine / API endpoint Index so reviewers can audit infrastructure side-effects (TTLs, lock blast-radius, DB writes, producer/consumer topology) without re-reading the diagram syntax; worked example included; (b) `ref over <participants>` reuse — when sub-flows recur, source-of-truth lives in ONE canonical `SD-<id>: <Name>` diagram and other diagrams cite via PlantUML's `ref over` block with bold title + step-range body that reuses the canonical `[N]` numbering (fallback to `note over` pointer when ref-block is impractical). `skills/c4-architecture/SKILL.md > Step 6b` cross-references the rule (folded up, not duplicated).

## [5.2.1] — 2026-05-20

Patch release. Per-service narrowing split into two phases for DAG-aware parallelism. Phase A (`task: service-shell-author`, one spawn) authors single-writer service singletons; phase B (`task: feature-narrowing`, N spawns per topological rank) authors per-feature deliverables in parallel within each DAG rank. Replaces the flat single-spawn shape (one `@architect` ran sequentially across all features in a service) — for services with ≥2 sibling features in `features.yaml`, wall-clock divides by rank-width. Reverse-pass c4-evidence + spec-correctness audits added based on the 2026-05-20 reverse-pass run feedback.

### Added

- **Arrow-evidence on `c4-container.puml`.** `commands/orchestra.md` per-task deliverable contract now requires every `Rel(...)` between containers in the workspace SAD's `c4-container.puml` to cite source evidence (REST controller path, Kafka topic + producer/consumer class pair, outbound HTTP adapter call site, or `pom.xml` runtime dependency). Evidence lifted into a paired markdown table at the tail of SAD `S-CONTAINERS-001` — columns `source-container | dest-container | evidence file:line | relationship type`. Arrows without source evidence dropped; referenced HLDs / external design docs do NOT count.
- **Per-feature `c4-context.puml` highlighted-copy rule.** Same contract now mandates each `<feature-id>-c4-context.puml` be a verbatim copy of `<context_path>/docs/diagrams/c4-context.puml` — same `System(...)` box, same `Person(...)` / `System_Ext(...)` set, identical ids + labels + descriptions. The only delta is `UpdateElementStyle()` highlights on touched elements. NEVER `Container(...)` / `ContainerDb(...)` — those belong in `<feature-id>-c4-container.puml`. Same two-folder rule applies to the per-feature container diagram.
- **Post-pass spec-correctness audit (reverse-pass).** After deliverable-presence closes for a `feature-narrowing` spawn, dispatcher samples ≥3 endpoints per `<feature-id>-openapi.yaml`, ≥1 channel per `<feature-id>-asyncapi.yaml`, ≥1 outbound operation per `<feature-id>-clientapi.yaml`. Mismatches against the Spring controller's `@RequestBody` / `@PathVariable` / `@ExceptionHandler` source / Kafka producer-consumer types / outbound adapter call signatures append rows to TDD `S-DIVERGENCES-001` carrying `source file:line | spec field | drift type | resolution-path-hint (A=ratify-spec / B=fix-source)`. Gates feature lock; `task: spec-correctness-fix` re-spawn cycles until source + spec align (Path B) OR `S-DIVERGENCES-001` carries a ratification entry (Path A via `mcp__orchestra-utils__amend_locked_artifact`).
- **`skills/c4-architecture/SKILL.md` L3 (Component) shape.** New labelled-bullet block after L1 / L2 shape definitions: `Inbound callers` (every upstream container that calls into the zoomed-in container appears as `Container_Ext(...)` outside the boundary with inbound `Rel(...)` showing direction + protocol), `Outbound dependencies` (downstream containers as `Container_Ext` / `ContainerDb_Ext` / `ContainerQueue_Ext` outside the boundary), `Completeness` (component diagram without external callers is structurally incomplete). Step 6 self-check extended to require inbound-rel verification.

### Changed

- **`commands/orchestra.md` per-task deliverable contract.** `per-service-narrowing` row split into `service-shell-author` (phase A, service singletons: BR-AC + `c4-component` + `c4-code` + service-scope `erd-logical`) and `feature-narrowing` (phase B, per-feature: TDD + openapi + asyncapi + clientapi + 5 per-feature `.puml` files). `deliverable-gap-fill` row updated to point at both new tasks; `reverse-pass` (single-repo single-service) row now references the two-phase combination.
- **Spawn brief templates.** Two templates replace the single flat-`feature_ids:` template — phase-A brief carries no `feature_id`; phase-B brief carries ONE `feature_id` + `depends_on:` list lifted from `features.yaml` + `service_shell_inputs:` pointing at phase-A outputs as locked context.
- **DAG-aware topo-sort algorithm.** New dispatcher-side block in `commands/orchestra.md > ### code-to-spec` documents the BFS over `features.yaml` `depends_on:` edges that yields rank lists. Phase-B fan-out: ONE `Agent` tool-call message per rank, with N spawns inside; advance to next rank only after every rank-N TDD locks.
- **`agents/architect.md > ### Reverse-pass discipline`.** New bullet binds `@architect`'s two-phase contract — phase A writes service singletons, phase B reads them via `service_shell_inputs:` and writes per-feature deliverables only.
- **Auto-promote post-lock follow-on.** `commands/orchestra.md` auto-promote spawn-brief block now points at the two-phase narrowing instead of the retired `per-service-narrowing` task name.

## [5.2.0] — 2026-05-20

Minor release. Three commits since v5.1.0 close the 2026-05-19 dispatcher-session feedback (F-001 through F-016, plus F-014 / F-015 / F-016 added in plan review). Brings feature-id grammar across services (`<short-service-name>-<NNN>-<slug>`), bakes an append-only `## Changelog` audit trail into every chain artifact (Gate-F enforces, two new MCP tools handle Path-A locked-artifact amendments), and gates `metrics-collector` / `agent-plan-sync` on `.orchestra/system.yaml` existence so plugin-installed projects that never invoke `/orchestra` see no `.orchestra/` materialization. Under blank-install assumption (orchestra applies to fresh installs only); no migration shim shipped.

### Added

- **`mcp__orchestra-utils__amend_locked_artifact` + `mcp__orchestra-utils__relock_artifact`.** Dispatcher-only Path-A affordance for verification-phase ratification on `status: locked` chain artifacts. Each tool flips frontmatter `status:` AND appends the matching `## Changelog` row in the SAME write — no silent unlocks. Closed allowlist scopes `target_path` to `<context_path>/docs/**/*.{md,yaml,yml}`; src/services/.orchestra paths rejected. Audit-trail row sequence per Path-A cycle: `unlocked` (dispatcher), `path-a-amend` (authoring agent), `re-locked` (dispatcher).
- **`pre-write-check.js` Gate-F (append-only changelog).** Rejects `Write` to `docs/**/*.md` orchestra-frontmatter artifacts that mutate / remove / reorder existing `## Changelog` rows or skip the genesis `created` row on first write. Narrowed to artifacts carrying orchestra frontmatter (`id:` / `type:` / `phase:` / `generated_by:` / `artifact_id:` keys) — plain user-authored docs/ markdown bypasses. Edit/MultiEdit on docs/**/*.md is N/A (full-content diff requires Write payload).
- **F-014 cold-start gating.** `metrics-collector.js` + `agent-plan-sync.js` no-op until `<cwd>/.orchestra/system.yaml` exists (written by first `/orchestra` invocation via `mcp__orchestra-utils__write_system_yaml`). Plugin-installed projects that never invoke `/orchestra` no longer see unsolicited `.orchestra/metrics/events.jsonl` or `.orchestra/tasks/<runId>/...` materialization.
- **F-015 `## Changelog` body-grammar.** `schemas/pipeline-artifact.schema.md` now requires every `docs/**/*.md` chain artifact to open with a `## Changelog` section as the first body element (yaml variants use `# Changelog:` comment block). Row format: `- YYYY-MM-DDTHH:MM:SSZ | <action> by @<agent>|dispatcher | <one-line reason>`. Action enum: `created` | `revised` | `unlocked` | `re-locked` | `path-a-amend` | `path-b-fix` | `regenerated`. Per-agent deliverable rules now mandate the genesis `created` row on first write across `@product`, `@analyst`, `@architect`, `@lead`, `@test-author`; `@evaluator` + `@reviewer` emit `revised` rows on TSR section updates.
- **F-001 per-task deliverable contract.** `commands/orchestra.md > ### code-to-spec` now carries a per-`task:` deliverable table (rows for `provenance-marker`, `workspace-sad-author`, `per-service-narrowing`, `reverse-pass`, `deliverable-gap-fill`) lifted from `agents/architect.md > ## Deliverables`. Includes a canonical spawn-brief template for `per-service-narrowing` + a post-pass deliverable check that writes `pipeline/<feature-id>/MISSING-DELIVERABLES-<service>.md` on gaps and re-spawns `@architect` with `task: deliverable-gap-fill`. Replaces the ad-hoc follow-up-spawn pattern surfaced in the 2026-05-19 dispatcher session.
- **F-002 + F-006 Spawn brief discipline + Preconditions subsections.** `commands/orchestra.md > ## Shared rules` gains `### Spawn brief discipline` (describe-don't-prescribe with INV-003-style before/after example) and `### Preconditions to surface in run-plans` (spawn-brief discipline, Path-A affordance, single-writer surfaces, cohort-spawn rule). Dispatcher lifts the applicable bullets into the run-plan's `S-CONTEXT-001` body for human reviewer awareness pre-approval.
- **F-009 Tool prerequisites subsection.** `commands/orchestra.md` enumerates dispatcher tool surface as immediate (`Read`, `Write`, `Edit`, `Bash`, `Agent`, `AskUserQuestion`) vs deferred (require `ToolSearch select:<name>`: `TaskCreate`, `TaskUpdate`, `EnterPlanMode`, `ExitPlanMode`, all `mcp__orchestra-*`). Single-batch ToolSearch hint included.
- **CLAUDE.md audit-trail maintainer contract + plugin-authoring rule.** New top-level Rules bullets + deep sections codify (a) the audit-trail conformance obligation when adding/modifying consumer-shipped surfaces that author / mutate chain artifacts, and (b) the cross-reference to `docs/plugin-authoring.md` R1-R14 + the three-layer (knowledge / navigation / orchestration) architecture. Maintainer-side only — does not ship to consumers.
- **Test coverage.** New cold-start gate tests (`scripts/tests/metrics.test.js` + `scripts/tests/agent-plan-sync.test.js`) verify the F-014 no-op behavior when `.orchestra/system.yaml` is absent. `scripts/tests/orchestra-utils.test.js` tool-count assertion bumped to 8.

### Changed

- **Feature-id grammar.** `schemas/features.schema.json` pattern is now `^[a-z0-9]+(-[a-z0-9]+)*-[0-9]{3}-[a-z0-9]+(-[a-z0-9]+)*$` (e.g., `order-001-checkout`, `payment-001-reconcile`). The old `^[0-9]{3}-[a-z0-9]+(-[a-z0-9]+)*$` shape (e.g., `001-checkout`) is rejected by `mcp__orchestra-utils__upsert_features_yaml`. Reasoning: cross-service uniqueness in multi-repo workspaces. Path templating preserved as `docs/<service_name>/<feature-id>/<feature-id>-{PRD,FRS,TDD,openapi,asyncapi,clientapi}.{md,yaml}` — the service-name path segment carries human-grouping (`ls docs/order/` is the entry point); the prefix inside `<feature-id>` carries manifest-layer uniqueness. Cascade landed across `commands/orchestra.md`, all 10 `agents/*.md`, `schemas/pipeline-artifact.schema.md`, `schemas/routing-taxonomy.md`, `hooks/references/docs-readme.template.md`, `hooks/references/consumer-claude-md.template.md`, and the CLAUDE.md consumer-splice section.
- **`hooks/lib/safe-fs.js` `safeWrite` mode parameter.** New optional third arg (default `0o600`) lets callers opt artifacts into `0o644`. `docs/README.md` (via `mcp__orchestra-utils__docs_readme`) now opts in so its permissions match other docs files (`-rw-r--r--` instead of `-rw-------`). Path-A amend / relock writes also pass `0o644`.
- **F-003 plan-mode revision cycle.** `commands/orchestra.md > ## Run-plan + approval gate` documents the in-plan-mode native-edit affordance: rejection drives inline plan-mode revisions (multiple edits per session, single `ExitPlanMode` on accept). Replaces the prior re-spawn-per-rejection contract — eliminates one `EnterPlanMode` user-consent prompt per revision cycle. Max 3 in-plan-mode revisions before `pipeline/run-plan-ESCALATE.md`.
- **F-004 plan-mode gate-skip banner.** Reverse-pass plan-mode body now prepends a `## Auto-mode notice` block above `S-FEATURES-001` warning the reviewer that accept flips `auto_mode: true` (between-phase gates, per-feature confirmations, `DRAFT_AND_GATE` checkpoints skip). `@lead`'s run-plan deliverable rule carries the requirement.
- **F-007 manifest scope clarification.** `commands/orchestra.md > ### code-to-spec` documents that `features.yaml` carries DAG shape only (`id`, `status`, `depends_on`, `supersedes`, `artifacts`). Semantic dimensions (slug-as-prose, outcome category, journey label, business intent) live in the run-plan `S-FEATURES-001` body and per-feature PRD — never in `features.yaml`. `agents/product.md` + `agents/lead.md` carry the reminder at upsert call sites.
- **F-008 Parallel-spawn discipline promoted.** `commands/orchestra.md > ## Shared rules > ### Parallel-spawn discipline` now opens with a pre-spawn checklist (count agents at same `phase:` with no read-dependency → ONE message with N tool-use blocks). Cohort surfaces enumerated inline: feature fan-out, BR-AC fan-out, SAD pre-pass cohort, `@analyst` / `@product` reverse-pass batches.
- **`agents/architect.md > ### Reverse-pass discipline`.** New Path-A amendment bullet binds `@architect`'s `task: path-a-amend` obligation: read the now-unlocked artifact (frontmatter `status: revision_requested` after dispatcher's `amend_locked_artifact`), apply the amendment, emit the `path-a-amend` changelog row as part of the `Write`. Do NOT flip `status:` — dispatcher's `relock_artifact` re-locks and emits the `re-locked` row. Failing to emit the `path-a-amend` row blocks re-lock (Gate-F sanity check).

### Fixed

- **F-012 false-positive verified.** `schemas/local.schema.json:14` explicitly lists `auto_mode: boolean` under `additionalProperties: false`; the schema's "rejects unknown fields" description is correct because `auto_mode` IS a known field. No code change.

### Breaking (under blank-install assumption — no live migration)

- **Feature-id pattern change.** Old IDs of shape `001-checkout` are rejected by `schemas/features.schema.json` + `mcp__orchestra-utils__upsert_features_yaml`. Existing consumer projects using the old pattern must regenerate. Per CLAUDE.md blank-install policy no migration shim ships.
- **`## Changelog` body-grammar requirement.** Pre-existing chain artifacts (`docs/**/*.md` with orchestra frontmatter) that lack a `## Changelog` block become invalid under Gate-F at first re-Write. Re-author from genesis OR add a `## Changelog` section with a `created` row before the next Write.

## [5.1.0] — 2026-05-19

Minor release. Agents distilled to a hybrid ruflo + awesome-claude form (4-section body, 5-bullet best-practices, decision framework + handoff arrows); orchestra-specific procedure migrated from agent bodies to skill homes per R2.1 ("agents coordinate, skills know"). Audit ran against the plugin's own `docs/plugin-authoring.md` rulebook — every agent was found in violation (`disallowedTools:` deny-lists, `### Valid field values` tables, hook-path cites, workflow-tree counts above R2.3's 2-tree cap). Corpus halved from 1394 → 740 lines (47% reduction); orchestra-pipeline behavior unchanged; consumer-facing agent prompts re-shaped (BREAKING).

### Breaking

- **Every agent prompt body re-shaped to the ruflo skeleton.** Consumers who pinned against prior prompt phrasing or inline procedure (BR-AC singleton authoring under `@architect`, openapi criterion-weighting under `@architect`, DIV resolution mechanics under `@architect`, Logical ERD / Inter-service Sequence under `@architect`) will see those procedures invoked via `Skill(<name>)` instead of read inline. The behavior preserved verbatim — just moved tiers.
- **`disallowedTools:` deny-lists replaced with `tools:` allow-lists everywhere.** Per `docs/plugin-authoring.md` line 188: every agent now enumerates an explicit Read / Write / Edit / Bash / Skill / AskUserQuestion / `mcp__orchestra-utils__*` / `mcp__orchestra-probe__*` set. `*` is never used. CI `scripts/tests/agents.test.js` Check 4 now hard-fails on `disallowedTools:` presence.

### Added

- **Hybrid ruflo + awesome-claude skeleton.** Every agent now opens with a one-sentence role line, then a `When invoked:` 4-step numbered checklist, then `## Skills` / `## Best practices` (5 imperative one-liners) / `## Deliverables` (canonical paths + S-anchor enumeration) / `## Decision framework` (5 pre-action questions) / `## Handoff` (← spawned-by / → next / ↯ escalate arrows). One compact `<example>` block per agent (CI Check 7 still requires ≥1). Inline subsections retained only for orchestra-mechanics that have no skill home (greenfield SAD bootstrap, ADR-open subroutine, ADR-worthiness gates, structural-failures rubric, phase-tag emission, run-plan bootstrap, DEADLOCK loop on spec gaps).
- **`skills/c4-architecture/SKILL.md` Steps 7–9.** Receives Logical ERD authoring (workspace + service scope-routing per `local.yaml.scope_level`), Inter-service Sequence (req / resp / alt mandate), SAD/TDD lock-gates (`c4-context.puml` mandatory at SAD lock; `<feature-id>-erd-physical.puml` mandatory when `S-DATA-001` carries ≥1 row).
- **`skills/write-contract/SKILL.md` Step 2b.** Receives criterion weighting (per-operation weights sum to 100, `@evaluator` uses for `eval_score` computation), AC-trace mandate (every criterion ends with `(AC-NNN)`), inline `critical: true` flag.
- **`skills/business-analysis/SKILL.md` Step 7.** Receives BR-AC singleton authoring (`<service_name>-BR-AC.md` `S-BR-001` / `S-AC-001` / `S-INVARIANTS-001` anchors, BR-vs-INV test, workspace `business-invariants.md` placement rule for multi-repo + system-wide). Auto-promotes from `@analyst` `ESCALATE-BR-<slug>.md` markers via `@architect`.
- **`skills/qa-test-planner/SKILL.md` Step 5.** Receives DIV resolution discipline — Path A (ratify-as-invariant; append `INV-NNN` to BR-AC) or Path B (correct-source; write `<feature-id>-DEFECT-<slug>.md`). Source IS the spec in brownfield reverse-doc; DIV NEVER closes via ADR.

### Changed

- **Agent corpus 1394 → 740 lines (47% reduction).** Per-agent: `@evaluator` 102→55, `@frontend` 86→57, `@test-author` 106→57, `@test-runner` 92→58, `@backend` 108→64, `@lead` 146→80, `@analyst` 151→80, `@reviewer` 141→82, `@product` 181→90, `@architect` 281→117. Each agent in the 55–117 line band; corpus mean ~74 lines.
- **Frontmatter MCP-tool allow-lists.** `@product` gains `mcp__orchestra-utils__upsert_features_yaml` (manifest writes). `@architect` gains `mcp__orchestra-utils__docs_readme` (provenance marker). `@evaluator` gains `mcp__orchestra-probe__http_probe` + `mcp__orchestra-probe__db_state` (auditable runtime probes). No agent uses `*`.
- **Five-step `When invoked:` collapses to four.** Prior workflows averaged 9 numbered steps; the four-step opening (read input → apply calibration → author / grade → hand back) compresses without losing decision points (those move to `Decision framework`).
- **Restate-frontmatter tables removed.** `### Valid field values` / `### Inputs` / `### Outputs` / `### Frontmatter contract` / `### Setup` / `### Guidelines` sub-blocks dropped across all 10 agents — ~250 lines net. Anything load-bearing moved to maintainer `CLAUDE.md`; the rest was duplication against `schemas/pipeline-artifact.schema.md`.
- **`agents/reviewer.md` `Structural failures` re-shaped.** Twelve auto-REQUEST_CHANGES triggers kept verbatim as the rubric (cannot promote without losing teeth); literal `§` character removed from prose (the `validate-cite.js` cite-purity scan forbids it anywhere in `agents/` / `commands/` / `skills/`). Re-worded "§-anchor cite" → "anchor cite" with explicit token enumeration `(PRD / FRS / TDD / openapi / TSR / FR-N / AC-N / S-XXX-NNN / ADR-NNNN)`.
- **`agents/lead.md` `### Phase-tag emission` subsection retained inline.** `metrics-collector.js` reads the canonical phase values (`discovery`, `spec-draft`, `verification`, `gap-resolution`, `gate`) at runtime; subsection drop would break observability joins. Surfaced + caught by `validate-cite.js` during step-3 validation.
- **`scripts/tests/agents.test.js` Check 4** tightened to hard-fail on `disallowedTools:` presence (was: tolerated as legacy). Mutation Fixture 2b flags the deny-list shape; Check 4's complement now asserts the allow-list shape.
- **`scripts/tests/bash-strip.test.js`** rewired to prove Bash absence via allow-list inspection only (was: deny-list-and-allow-list double-check). Mutation cases reduced from 6 to 4.
- **`docs/plugin-authoring.md`** tightened: R2.5 (no restatement tables) + R2.6 (no hook-path cites) examples regenerated against the distilled agent corpus; line 188 (`tools:` role-allow-list table) cross-referenced from CI Check 4.

### Fixed

- **CI gate surfaced during validation.** `validate-cite.js` requires `### Phase-tag emission` subsection in `agents/lead.md` carrying all five canonical phase values. Step-3 distillation initially dropped the subsection; validator caught it; subsection restored inline.
- **`permissionMode: plan` correction.** The audit plan originally proposed `permissionMode: plan` on `@reviewer` and `@evaluator` (read-only-ish auditors). Both Write TSR sections (`S-REVIEW-001` / `S-EVAL-001`); plan mode would block the writes. Dropped from both; `docs/plugin-authoring.md` line 183 reserves `permissionMode: plan` for pure-read auditors.

## [5.0.1] — 2026-05-19

Patch release. Closes one audit finding (`DIST-GITIGNORE-STALE-ALLOWLIST`, MINOR, from a 96.4% PASS audit run against v5.0.0) and five reverse-pass authoring gaps surfaced by consumer feedback against a real multi-service workspace (`vngg-pay-docs/new-docs`). All changes are hygiene + prompt-tightening; no schema-shape changes, no agent/skill additions, no behavioural breaks for existing consumers.

### Fixed

- **`.gitignore` mcp-servers allow-list drift.** Swap `!scripts/mcp-servers/orchestra-fs.js` → `!scripts/mcp-servers/orchestra-utils.js` so the allow-list matches the file set actually shipped (the server was renamed earlier). Prior state: shipped `orchestra-utils.js` survived distribution only via git index tracking; a fresh clone after `git rm --cached` + recommit would silently drop the file and break the `orchestra-utils` MCP server.

### Added

- **`scripts/tests/mcp-shipping.test.js`** — regression test (11 assertions, wired into `npm test` as `test:mcp-shipping`). Parses `.claude-plugin/.mcp.json`, walks every `mcpServers[*]`, asserts the `args[0]` path uses the `${CLAUDE_PLUGIN_ROOT}/` prefix, resolves on disk, AND `git check-ignore -q --` returns non-zero (= not ignored). Catches the allow-list-drift class permanently.
- **`agents/analyst.md` `### Actor inheritance`.** FRS `S-ACTORS-001.actor` cells lift verbatim from PRD `S-USERS-001.user_segment` ∪ `<context_path>/docs/diagrams/c4-context.puml` `Person()` labels ∪ `<context_path>/docs/diagrams/c4-container.puml` Container names. Generic invented names (`End user`, `User`, `Caller`, `Client`) forbidden when the upstream artifact carries a specific role (`Storefront end user`, `Customer-service agent`, `Finance / reconciliation operator`). System-actor rows (`payment-engine`, `fulfillment`, etc.) match `c4-container.puml` Container names verbatim — no pluralization, no human-readable substitution. Drift = `actor-drift` structural finding.
- **`agents/architect.md` `### Diagram lock-gates`.** Two new gates: (a) SAD `status: locked` denied unless BOTH `c4-context.puml` AND `c4-container.puml` exist under `<context_path>/docs/diagrams/`; (b) TDD `status: locked` denied for any feature whose `S-DATA-001` carries ≥1 row unless `<feature-id>-erd-physical.puml` exists under the feature's `diagrams/` folder. Closes the reverse-pass failure mode where the model anchors to existing `src/**` topology and skips a level of design diagrams it "feels obvious".
- **`skills/c4-architecture/SKILL.md` `### Step 6b — Sequence diagram style (SD)`.** New authoring discipline for per-feature `<feature-id>-seq-<journey>.puml` and workspace `sequence-inter-<flow>.puml`: theme + three skinparams header, service-category colour palette (`#Orange` Core / `#LightYellow` Commerce / `#Plum` Financial / `#LightGreen` Platform / `#LightBlue` Channel / `#Gray` External / `#Pink` PSP / `#LightCoral` Event Bus), `[N]`-numbered steps tied to parent-journey narrative, inline cites on governed steps (`BR-NNN`, `AC-NNN`, `INV-NNN`, `ADR-NNNN`), `★SoT` / `◇Best-effort` markers on every persistence / messaging op (`hnote over <participant> #<colour>`), `group` / `opt` / `alt` / `par` block conventions, tail Data Store Operations Summary table (Redis Keys / Kafka Topics / RDBMS Tables / Lock Patterns / State Lifecycle), tail legend (palette subset + marker glossary). Missing any row = `sd-style` structural finding.

### Changed

- **`agents/product.md` `### PRD surface discipline (no tech leakage)`** — extend forbidden table with two rows: (a) Persona / boundary phrasing (allowed) vs service-name enumeration (forbidden — `"sibling services X, Y, Z..."`, `"N services collaborate"`); (b) Outcome-oriented prose (allowed) vs implementation nouns (forbidden — `aggregate`, `state machine`, `distributed lock`, `event bus`, `audit row`, `idempotency key`, `lock TTL`, `state transition`, `outbox`, `saga`, `compensation`). Pre-lock self-check added: grep PRD body for service names from `<context_path>/CLAUDE.md` Service Topology + the implementation nouns + the literal phrases `"sibling services"` / `"N services"` / `"the … service collaborates"`; ≥1 hit → rewrite before lock. Closes the failure mode where reverse-pass PRD authoring anchored to `src/**` collaboration topology and narrated it as the problem statement.
- **`package.json`** — register `test:mcp-shipping` script and wire into the `test` aggregator (now 16 sub-suites).

## [5.0.0] — 2026-05-19

Major release: intra-service feature DAG + role DAG. The chain decomposes feature requests into append-only `<feature-id>` nodes in `.orchestra/<service_name>/features.yaml` (`depends_on:` + `supersedes:` edges, status `active | deprecated`, never auto-flipped). Dispatcher drives a 5-gate state machine across a new role DAG (`@product` → `@analyst` → `@architect` → `@lead`), gating each handoff via `AskUserQuestion`. Refactor with user-observable behaviour delta surfaces as a new `<feature-id>` with `depends_on:` rather than in-place PRD modification — graph is intra-service, never cross-service. `<intent>` entry runs a tech-vs-business classifier (default business; LOW/MEDIUM confidence → `AskUserQuestion`); tech path skips spec authoring and spawns `@lead` directly with shared NNN counter (one `features.yaml` entry per feature regardless of path).

Net consumer-surface delta: 1 new agent (`@analyst`), 1 new skill (`business-analysis`), 1 new schema (`features.schema.json`), 1 new MCP tool (`upsert_features_yaml`), 4 agents reassigned (`@product` strips FRS authoring; `@architect` gains per-feature TDD + openapi + C4 L3+L4 + brownfield source-walk; `@lead` becomes pure orchestrator), 1 new env var (`ORCHESTRA_SKILL_BUSINESS_ANALYSIS`), dispatcher rewrite (classifier prompt + 5-gate state machine + manifest-aware feature-id mint + chain state recovery + brownfield R-gates). 103 assertions in `scripts/tests/orchestra-utils.test.js` (38 new) cover the new tool.

### Added

- **`agents/analyst.md` (new agent).** Authors `<feature-id>-FRS.md` from a locked PRD. Owns the BR/AC/pseudocode bridge between business intent and technical design. No PRD/TDD/openapi/manifest writes. Within-role `AskUserQuestion` frequency governed by `hooks/scripts/val-calibration.js` autonomy tier. Frontmatter: `model: opus`, `context_mode: 1m`, `disallowedTools: Bash, Edit, MultiEdit`, `color: cyan`. Allowed surface limited to `<feature-id>-FRS.md` + `<feature-id>-frs-usecase.puml` + `<feature-id>-state-business.puml` (when feature has user-facing lifecycle).
- **`skills/business-analysis/` skill (new).** `SKILL.md` + `references/br-ac-patterns.md` (worked examples of BR vs AC vs INV discrimination — refund window → BR, idempotency-key derivation → INV, sign-up email validation → AC) + `references/pseudocode-shaping.md` (allowed/forbidden vocabulary — domain nouns OK, framework primitives forbidden; ≤10 lines per AC). Invoked by `@analyst` when drafting FRS.
- **`schemas/features.schema.json` (new).** JSONSchema Draft 2020-12, closed allowlist via `additionalProperties: false`. Per-feature shape: `id` (`^[0-9]{3}-[a-z0-9]+(-[a-z0-9]+)*$`), `status` (`active|deprecated`), `depends_on: [<feature_id>]`, optional `supersedes: [<feature_id>]`, `artifacts: [PRD|FRS|TDD|openapi|asyncapi|TSR]`. Acyclicity + edge-existence + self-edge + uniqueness-by-id enforced imperatively by the MCP tool (not expressible in JSONSchema).
- **`mcp__orchestra-utils__upsert_features_yaml` MCP tool.** Sixth tool on the `orchestra-utils` server. Closed-allowlist write to `<context_path>/.orchestra/<service>/features.yaml` — no raw `Write`/`Edit` against this path. Three-color DFS detects back-edges; the offending edge is named in the error. Six error codes: `SCHEMA_VIOLATION` (shape mismatch), `UNIQUENESS_VIOLATION` (duplicate ids on file load), `UNKNOWN_REF` (`depends_on`/`supersedes` references missing id), `SELF_EDGE` (id appears in its own edge list), `CYCLE` (back-edge in `depends_on`), `WRITE_FAILED` (IO failure during atomic temp+rename). Status transitions are user-controlled, bidirectional; orchestra never auto-flips `active` ↔ `deprecated`. `supersedes` is an independent forward-pointer — does NOT imply `depends_on`. Tolerates yaml-mini's empty-array-as-null round-trip on serialize.
- **5-gate state machine + tech/business classifier (`commands/orchestra.md ## Per-feature execution model`).** Dispatcher drives gates 1–5 between agent spawns: Gate 1 = tech/business confirmation (fires only on LOW/MEDIUM classifier confidence); Gate 2 = PRD → FRS?; Gate 3 = FRS → TDD?; Gate 4 = TDD+openapi → impl?; Gate 5 = run-plan approval (existing forward-chain gate). Each gate is one dispatcher-owned `AskUserQuestion` with Approve / Re-author (flip frontmatter `locked` → `draft`, re-spawn with `Feedback:` block in spawn-context) / Halt branches. Brownfield reverse-pass adds R-2 / R-3 / R-4 gates (synthesized PRD review, derived FRS review, extracted TDD + openapi review). Classifier prompt inlined in dispatcher (default business; LOW/MEDIUM → `AskUserQuestion("Business path | Tech path")`).
- **Manifest-aware feature-id mint.** Dispatcher reads `.orchestra/<service>/features.yaml`, finds max numeric prefix across all `features[].id`, increments by 1, zero-pads to 3 digits, concatenates user-supplied slug. Tech and business paths share the counter. User-supplied slug rejected if verb-prefixed (`regen-*`, `refactor-*`, `fix-*`) or Journey-gate category label (`forward-purchase`, `abandonment`).
- **Chain state recovery (filesystem-derived).** Dispatcher carries no state between user turns; on re-invocation, derives current chain position from per-feature artifact `status: locked` presence. `features.yaml` carries the DAG; `pipeline/<feature-id>/` directory carries chain-state artifacts. No separate state file.
- **`ORCHESTRA_SKILL_BUSINESS_ANALYSIS` env var.** Per-skill opt-out for `skills/business-analysis/`. Default `on`.

### Changed

- **`agents/product.md` — PRD + manifest entry only.** FRS authoring removed (`@analyst` owns). First turn ALWAYS opens with `AskUserQuestion`: "Does this requirement relate to any existing feature?" — options populated from `features.yaml` entries plus `Standalone — net-new capability`. User answer determines `depends_on:` + `supersedes:` for the manifest entry written at step 6. Manifest entry computed at PRD-lock: `feature.id` from dispatcher spawn context (`@product` never invents); `feature.artifacts:` enumerates planned set (`PRD`, `FRS`, `TDD`, `TSR` always; `openapi` for synchronous; `asyncapi` for event-driven; both for mixed). Manifest write exclusively via `mcp__orchestra-utils__upsert_features_yaml` — raw `Write`/`Edit` against `features.yaml` is a structural violation. Consultant-mode dialogue + stack-elicitation + ESCALATE-ADR-0001 stack-choice gate retained. `Skills:` row dropped (FRS-grain diagram authoring moves to `@analyst`).
- **`agents/architect.md` — gains per-feature TDD + openapi/asyncapi/clientapi + C4 L3+L4 authoring.** Previously `@lead`'s scope. Service-level singletons (`docs/<service_name>/diagrams/{c4-component,c4-code}.puml`) + per-feature highlighted L1+L2 copies + per-feature `seq-<journey>` / `state-technical` / `erd-physical` puml all move to `@architect`. `S-DATA-001` + `S-CONFIG-001` row grammars (column lists, sentinels, ownership tags, `migration_tool` row, `ddl-auto: validate` policy) move under `@architect`'s `### Per-feature TDD authoring`. Brownfield source-walk discipline expands: TDD `S-COMPONENTS-001` per-handler error contract + `S-DATA-001` persistence-shape priority (Flyway → Liquibase → entities → ddl-auto) + entity-table parity reconciliation remain `@architect`'s. `Skills:` row inventory adds `write-contract` (primary) + `clean-code` + `java-development`. `Allowed surface` section reorganized into System-wide / Service-scope / Per-feature / Provenance / Brownfield-only blocks.
- **`agents/lead.md` — pure orchestrator.** Authors TASKS + run-plan only; spawns parallel implementer fan-out on `TDD + openapi status: locked` AND dispatcher Gate 5 approval. DEADLOCK loop simplified: gap layer routes via dispatcher to upstream owner (openapi/TDD/SAD → `@architect`; FRS → `@analyst`; PRD → `@product`); `@lead` writes `<feature-id>-ESCALATE-<layer>-<slug>.md` and ends turn. Tech-path mode added: dispatcher routes tech-classified intents directly to `@lead` with `chain: tech-path`; skips PRD/FRS/TDD/openapi reads; authors TASKS from intent + `local.yaml` + service source layout; mid-task contract-touching surfaces → `ESCALATE-tech-surfaces-contract.md` for re-classification. Run-plan authoring (`### Bootstrap: run-plan authoring`) retained as-is. `Allowed surface` shrinks to TASKS + run-plan only. `Skills:` row inventory shrinks to `task-breakdown` only.
- **`commands/orchestra.md ### spec-to-code` spawn payload + linear-chain string.** Was: `Spawn @lead with locked decisions` + chain `PRD → FRS → SAD → ADR (when triggered) → TDD → openapi/asyncapi → backend code …`. Now: dispatcher drives the chain via 5-gate state machine; first spawn is `@product` (business path) or `@lead` with `chain: tech-path` (tech path); linear chain reads `@product (PRD + features.yaml entry) → @analyst (FRS) → @architect (SAD + ADR? + TDD + openapi/asyncapi) → @lead (TASKS + run-plan) → @backend ‖ @frontend ‖ @test-author → @test-runner → @evaluator + @reviewer → TSR`. Inline `Feature-id minting` subsection removed (folded into the canonical `## Per-feature execution model > ### Feature-id mint` section).
- **`README.md`** — counts agents 9→10, skills 10→11, schemas 12→13. Added `@analyst` + `skill.business-analysis` + `schema.features` rows. Updated `@product` / `@architect` / `@lead` role descriptions to match new ownership. Added `upsert_features_yaml` to `orchestra-utils` tool list. Updated spec-to-code ASCII pipeline diagram to show dispatcher-driven 5-gate flow.
- **`manifests/install-modules.json` + `manifests/runtime-toggles.json`** — registered `agent.analyst` + `skill.business-analysis`; added `ORCHESTRA_SKILL_BUSINESS_ANALYSIS` toggle (on). `mcp.orchestra-utils` description updated to list `upsert_features_yaml` + `docs_readme` alongside existing tools.
- **`hooks/references/consumer-claude-md.template.md`** + dogfooded `CLAUDE.md` `orchestra:start..orchestra:end` splice block — documented `features.yaml` location + append-only feature graph rule + MCP-only-write contract. Added `features.yaml` to single-writer surfaces list. Surfaced tech-vs-business classifier in the workflow notes.

### Breaking

- **Role DAG.** `@product` no longer authors FRS. `@lead` no longer authors TDD or openapi (or any C4 diagram, or any per-feature puml). Consumers with pinned dispatcher prompts referencing the old role boundaries must re-spawn against the new agent set.
- **Dispatcher spawn order.** Dispatcher no longer spawns `@lead` first. New first spawn: `@product` (business path; PRD + `features.yaml` entry) or `@lead` with `chain: tech-path` (tech path). Consumers with custom dispatcher prompts referencing the old single-spawn `@lead`-driven chain must re-spawn against the new 5-gate machine.

### Why MAJOR

Two consumer-visible behavioural breaks (role DAG + dispatcher spawn order) — see `### Breaking`. Per `skills/commit-message` SemVer projection, `feat!` carries MAJOR effect; this release aggregates three commits (79a6d59 `feat`, 638b1ec `feat!`, e8da133 `feat!`), max effect = MAJOR.

### Migration

Per project CLAUDE.md "Blank-install assumption" — orchestra applies to blank installs. No migration script; no schema unions; no parallel old/new paths.

1. Pre-upgrade: no action required. Old artifacts under `docs/<feature-id>/` remain valid (PRD/FRS/TDD/openapi shapes unchanged; only the AUTHOR of each artifact moves between agents).
2. Upgrade: `claude plugin update orchestra` (or reinstall via marketplace).
3. Post-upgrade: new pipelines run through the 5-gate machine. Existing in-flight pipelines should complete via the new role assignments — pause at any `status: draft` artifact and reroute to the new owning agent.

## [4.6.3] — 2026-05-18

Patch release. Folds 17 boundary-drift findings from a `/orchestra spec-to-code` audit run (session `7dbdb286-2c59-4889-9ec8-9a2f731f4d99` on `regen/services/order`, report at `services/order/FEEDBACK-REPORT-2026-05-18.md`) into authoring discipline across `@lead` (TDD `S-DATA-001` column-list + sentinel + ownership grammar; tightened `ddl-auto` policy), `@backend` (cross-process-boundary INFO-log mandate; reference into `java-development` for JPA/Jackson/Kafka/Resilience4j/persistence-port shapes), `@evaluator` (spec-completeness FAIL grade independent of probe verdicts), `@reviewer` (entity-schema parity check, cross-process observability check), `@test-author` + `qa-test-planner` (new 7th coverage axis: `cross-process-boundary` with mandatory rows per outbound HTTP / Kafka publish / Kafka consume / JPA collection read), `code-review` (universal-gate observability bullet), and dispatcher (`commands/orchestra.md` reverse-pass approval gate gains a schema-diff-on-DB-state-change requirement). Six convention sections append to `skills/java-development/references/jpa-write-conventions.md`: JPA mapping (`mappedBy` ↔ `@ManyToOne`, `@EntityGraph` on lazy-collection reads, `open-in-view: false`), Jackson (`@JsonIgnoreProperties(ignoreUnknown=true)` for inbound DTOs, `@JsonCreator`/`@JsonProperty` for cache-round-trip immutables), Kafka topic binding (constant VALUE not symbol name), Resilience4j retry (explicit `retry-exceptions` allowlist), persistence port intent (distinct method per genesis vs transition), entity auditing (`@MappedSuperclass` for `created_at`/`updated_at`). No new files, no schema-shape changes, no component additions — rule/prompt tightening only.

### Changed

- **`skills/java-development/references/jpa-write-conventions.md`** appends six convention sections with Good/Bad pairs, matching the file's existing terse-imperative tone. JPA mapping rule names `mappedBy` ↔ `@ManyToOne` parity + `referencedColumnName` for business-key joins + `@EntityGraph` / `@Transactional(readOnly=true)` for read paths that dereference lazy collections; closes failures 11 (LazyInit) + 12 (silent empty join from malformed `mappedBy`). Jackson rule names `@JsonIgnoreProperties(ignoreUnknown=true)` for inbound event DTOs only (outbound REST stays strict) + `@JsonCreator` + `@JsonProperty` for immutable domain objects round-tripped through cache; closes failures 14 (Kafka payload schema drift) + 15 (cache `OrderMetadataSnapshot` non-deserializable). Kafka topic binding rule pins annotation defaults to the publisher's literal value + names `kafka.topics:` yml block as authority + mandates receipt + outcome INFO logs with `topic`/`partition`/`offset`; closes failures 13 (symbol-name vs value) + 17 (silent consumer happy paths). Resilience4j retry rule mandates explicit `retry-exceptions` allowlist (5xx + IO only); closes failure 2 (retry on 4xx). Persistence port intent rule mandates intent-specific methods (`save` = INSERT only, `applyTransition` = UPDATE) + `@Modifying @Query` JPQL for transition-shaped updates; closes failure 16 (port abstraction conflated INSERT-on-create with UPDATE-on-transition). Entity auditing rule extracts `created_at`/`updated_at` to `@MappedSuperclass AbstractAuditedEntity`; closes failure 7 (audit-column pattern duplicated by hand across child entities).
- **`agents/lead.md`** TDD authoring (Step 5) gains a new `S-DATA-001` row-grammar bullet: per-entity row enumerates table + ownership tag (`owned` | `cross-service:<owning-service>`) + full persisted-column list + sentinel values for every "(none)" / "(initial)" / "(unset)" label + port methods grouped by intent. Closes failures 6 (`paidAt` column referenced in code, absent from every doc), 8 (`(none) → CREATED` lacked storage-representation spec — entity wrote `null`, DB had `NOT NULL`), 10 (`OrderPromotionEntity` declared 2-field shape of a 24-column commerce table, neither the entity author nor the DBA documented which model owned the table). `S-CONFIG-001` `migration_tool` row sharpens `ddl-auto` policy: steady-state `validate`; `none` allowed only during an active reshape with an explicit DEFECT row; `update` / `create` / `create-drop` always trigger `DEFECT-ddl-auto-not-versioned.md`. Reverse-pass discipline step 5 extends with entity-table parity reconciliation (ghost columns + orphan columns both open separate `DIV-NNN` rows; cross-service tables drop the local `@Entity` via Path-B DEFECT). Closes failures 5 (schema drift via `ddl-auto: update`) + 10 (cross-service-vs-owned ambiguity).
- **`agents/backend.md`** Workflow step 5 gains two sub-bullets. **Cross-process boundary instrumentation** mandates INFO log on receipt + outcome for every outbound HTTP / Kafka publish / Kafka consumer method / DB error path; HTTP carries route + status + latency, Kafka consume carries `topic` + `partition` + `offset` on receipt + transition-or-rejection on outcome; missing instrumentation = `@reviewer` Major per `skills/code-review`. **JPA / Jackson / Kafka / Resilience4j / persistence-port discipline** references `skills/java-development/references/jpa-write-conventions.md` for the seven rules added there. Closes failures 3 (near-zero request observability) + 17 (silent Kafka consumer happy paths) + the implementation-defect class across failures 11/12/13/14/15/16.
- **`agents/evaluator.md`** per-`S-TEST-001`-row grading (Step 4) gains a new Step 4a **Spec-completeness grade**: independent of probe verdicts, FAIL any TDD `S-DATA-001` row missing a column list OR missing a sentinel for a `(none)` / `(initial)` lifecycle label OR missing an ownership tag OR overloading `save()` across both genesis AND transition contexts. Reason field carries `spec-completeness: <entity> missing <facet>`. Closes the spec-gap class across failures 6/8/10/16.
- **`agents/reviewer.md`** diff-review workflow gains two new steps. **Step 5c. Entity-schema parity check** compares each `@Column` list against TDD `S-DATA-001`; ghost columns (entity declares, DB lacks) → Critical, auto-`REQUEST_CHANGES`; orphan columns (DB has, entity lacks) → Critical when the entity is `owned`, Minor + DEFECT recommendation when `cross-service`; overloaded `save()` covering both genesis and transition → Critical. **Step 5d. Cross-process observability check** validates every outbound HTTP / Kafka publish / Kafka consumer method in the diff carries INFO log on receipt + outcome with Kafka coordinates on receipt; missing instrumentation → Major. Closes failures 6/8/10/12/16 (entity-schema parity) + 3/17 (observability).
- **`agents/test-author.md` ### Authoring discipline** swaps the 6-axis matrix line for a 7-axis line + adds a `**Cross-process-boundary rows are mandatory**` bullet enumerating ≥1 `S-TEST-001` row per outbound HTTP route in `<feature-id>-clientapi.yaml`, ≥1 per Kafka topic published, ≥1 per Kafka topic consumed, ≥1 per JPA read returning a child collection. Skippable only when both `<feature-id>-clientapi.yaml` AND `<feature-id>-asyncapi.yaml` declare no boundary. Closes the prevention-artifact gap behind failures 1/4/9/11/12/13/14.
- **`skills/qa-test-planner/SKILL.md ### Step 2 — Coverage strategy`** swaps the 6-axis canonical table for a 7-axis table; new `cross-process-boundary` axis row spells the probe shapes (Pact / WireMock against upstream openapi for HTTP; Kafka publish + consume round-trip for messaging; JPA read with non-empty child collection for ORM). Single-message change in the canonical axis list keeps `@test-author` ↔ `qa-test-planner` ↔ `S-TEST-001` cross-references in sync.
- **`skills/code-review/SKILL.md ### Step 3 — Universal gates`** appends a sixth universal-gate bullet: cross-process boundary observability — every outbound HTTP / Kafka publish / Kafka consumer method / DB error path in the diff emits INFO on receipt + outcome with HTTP carrying route+status+latency and Kafka consume carrying `topic`+`partition`+`offset`. Missing instrumentation = Major. Reinforces `@reviewer`'s 5d check at the skill level (single canonical rule, two enforcement surfaces).
- **`commands/orchestra.md ## Run-plan + approval gate`** `chain: reverse-pass` bullet gains a mid-run external-state-change carve-out: when the user signals "DB ready, restart" (or any external state change) AFTER a TDD has locked, dispatcher re-spawns `@lead` for a focused schema-diff pass against `S-DATA-001` BEFORE resuming. Restart-first is a process violation logged in the reverse-pass run report. Closes process-miss 3.6 from the feedback report.

## [4.6.2] — 2026-05-18

Patch release. Closes a defect surfaced on the v4.6.0 reverse-pass audit run (`c457eb29-2888-496e-b77f-20f6335332b5` on `vngg-pay-docs/new-docs/order`) where `@architect` improvised the `docs/README.md` provenance marker body and emitted `type: PROVENANCE-MARKER` (not in the schema's `type:` enum — canonical value is `type: README`), `S-ARTIFACT-CHAIN-001` (phantom anchor — the real run-plan section id is `S-FEATURES-001`), and a layout tree missing the `<feature-id>/` subdirectory layer, the service-singleton `c4-component.puml` / `c4-code.puml` files, and every per-feature diagram. Root cause: schema looseness left both frontmatter and body authoring to agent discretion. Fix mirrors the existing `claude_md` MCP pattern — the marker is now owned by a new `mcp__orchestra-utils__docs_readme` tool that pins frontmatter shape and ships a canonical body from a vendored template; the agent calls the tool instead of authoring via `Write`.

### Added

- **`mcp__orchestra-utils__docs_readme(context_path)` MCP tool.** Fifth tool on the orchestra-utils server. Idempotently authors `<context_path>/docs/README.md` with pinned frontmatter (`id: docs-readme`, `type: README`, `generated_by: orchestra`, `status: locked`) and the canonical body from `hooks/references/docs-readme.template.md`. Three actions: `created` (target absent), `unchanged` (target present + carries `generated_by: orchestra`), `overwritten` (target present but lacks the marker frontmatter). Refuses on symlinked target. Default `context_path` = cwd. Wired into `scripts/mcp-servers/orchestra-utils.js` and registered in the `TOOLS` array.
- **`hooks/references/docs-readme.template.md` body template.** Carries the four canonical H2 sections (Purpose, Provenance contract, Layout, Editing policy). Layout block enumerates the full `docs/` tree: workspace singletons (`SAD.md`, `business-invariants.md`, `adr/`, `diagrams/`), per-service singletons (`<service_name>-BR-AC.md`, `adr/`, `diagrams/c4-component.puml`, `c4-code.puml`, `erd-logical.puml`), per-feature `<feature-id>/` subdirectory with every artifact and diagram type. Placeholders `<service_name>` / `<feature-id>` stay literal — the marker is a contract template, not a per-workspace inventory.

### Changed

- **`schemas/pipeline-artifact.schema.md ### README.md (docs/ provenance marker)` pins frontmatter + delegates body authoring to MCP.** Frontmatter tightens from `generated_by: orchestra` only to the four-field block (`id`, `type: README`, `generated_by: orchestra`, `status: locked`). Body section drops the loose "short description of the docs/ tree layout" prose and replaces it with a bold-leading paragraph naming `mcp__orchestra-utils__docs_readme(context_path)` as the sole authoring path and explicitly forbidding `Write` against the path.
- **`agents/architect.md ### Reverse-pass discipline` step 1 + `### Allowed surface` row.** Step 1 now calls `mcp__orchestra-utils__docs_readme(context_path)` instead of authoring the marker via `Write`. The Allowed-surface row for `docs/README.md` flips to NOT-a-Write-surface with explicit structural-violation language for direct `Write` attempts.
- **`commands/orchestra.md` provenance-marker spawn rule + parent-write carve-out.** The `**Provenance marker.**` paragraph under `### code-to-spec` now directs `@architect`'s `task: provenance-marker` invocation at the MCP tool with pinned frontmatter values inlined for clarity. The `### Coordination protocol` parent-write carve-out extends to include `<context_path>/docs/README.md` via `mcp__orchestra-utils__docs_readme`, mirroring the existing carve-outs for `system.yaml`, `local.yaml`, and `CLAUDE.md`.
- **`README.md` MCP table.** `orchestra-utils` row now lists five tools (`tree`, `write_system_yaml`, `upsert_local_yaml`, `claude_md`, `docs_readme`); purpose column extends to mention the `docs/README.md` provenance-marker write.
- **`scripts/tests/orchestra-utils.test.js` covers the new tool.** Five new test blocks: `docs_readme` create / no-op-on-marker-present / overwrite-when-marker-absent / symlink reject / default-context_path-cwd. The MCP `tools/list` smoke assertion bumps from 4 tools to 5 and adds the `docs_readme` includes check.

## [4.6.1] — 2026-05-18

Patch release. Closes five `metrics-collector` observability bugs surfaced by a v4.6.0 `code-to-spec service:order` audit (run `c457eb29-2888-496e-b77f-20f6335332b5`): `runs/<id>.json.insights_count` zero despite emitted insights, `intent`/`confidence`/`pattern`/`autonomy_level`/`feature_id` null despite locked `local.yaml`, empty `artifacts_produced` despite 21 `docs/**` writes, duplicate `subagent.stopped` events fired twice per real stop with identical token totals, and `cost-by-phase` lumping Stage 3a (`@product`) + Stage 3b (`@lead`) into a single `spec-draft` bucket. Adds a `cohort.spawn.staggered` warning surfaced on `runs/<id>.json.warnings` when a cohort that should fan out in one message arrives staggered across multiple. Five consumer-surface rules tighten alongside: single-message cohort discipline, SAD pre-pass parallel cohort (`task: provenance-marker` + `task: workspace-sad-author`), per-handler error-mapping in TDD `S-COMPONENTS-001`, AC source-binding under `@product` reverse-pass (rows without source-observable behaviour route to TSR `S-DIVERGENCES-001`, not `S-AC-001`), dispatcher Phase-tag emission paragraph trim.

### Fixed

- **`runs/<id>.json.insights_count` aggregates from `insights.jsonl`.** `emitRunSummary` in `hooks/lib/metrics-aggregators.js` now reorders the parent Stop branch so `emitInsightsForSession` (dispatcher insights) fires BEFORE `emitRunSummary` reads `insights.jsonl` — the counter logic was correct, but parent insights weren't yet on disk when the summary tally ran. Reordering happens in `hooks/scripts/metrics-collector.js` Stop handler.
- **`intent` / `confidence` / `pattern` / `autonomy_level` / `feature_id` populate from `local.yaml` on `local.bootstrapped` events.** Root causes: (i) `hooks/lib/event-shapers.js` matched the wrong path shape — its `endsWith("/.orchestra/local.yaml")` rejected the real `.orchestra/<service>/local.yaml` layout. Regex extends to `/\/\.orchestra\/(?:([^/]+)\/)?local\.yaml$/` with `service_name` lift from the captured directory when not present in the YAML body. (ii) `extractBootstrapFields` in `hooks/lib/field-extract.js` lacked five fields (`service_name`, `scope_level`, `autonomy_level`, `auto_mode`, `run_plan_status`); now extracts them with appropriate regex anchors and feeds the `local.bootstrapped` event row.
- **`artifacts_produced` enumerates every `docs/**` write.** New `docsMatch` branch in `hooks/lib/event-shapers.js` emits `artifact.written` events for `Write`/`Edit`/`MultiEdit` calls under `docs/**/*.{md,yaml,yml,puml}`, lifting `feature_id` (`<NNN>-<slug>` prefix), `service_name` (parent directory excluding `diagrams`/`adr`), `artifact_type`, and `artifact_id`. `emitRunSummary` aggregates these into the `artifacts_produced` array.
- **`SubagentStop` deduped by `subagent_session_id`.** Claude Code's `SubagentStop` hook may fire twice per real subagent stop, producing duplicate `subagent.stopped` rows and double-counted `tokens.jsonl` entries with identical totals. New `isDuplicateSubagentStop(eventsPath, runId, sid)` helper in `hooks/lib/jsonl-emit.js` scans existing rows; `hooks/scripts/metrics-collector.js` short-circuits the entire emission path on the second fire.

### Changed

- **`cost-by-phase.json` splits Stage 3a (`@product`) from Stage 3b (`@lead`) by `agent_role`.** `emitCostByPhase` in `hooks/lib/metrics-aggregators.js` now produces both `by_phase` (backward-compatible) and `by_phase_role` (new) maps; the latter keys are `<phase>.<agent_role>` tuples (e.g., `spec-draft.product`, `spec-draft.lead`). Token attribution joins `tokens.jsonl` against `events.jsonl` to resolve role + phase per subagent.
- **`cohort.spawn.staggered` telemetry warning.** New `detectStaggeredCohort(events, thresholdMs = 2000)` helper in `hooks/lib/metrics-aggregators.js` groups `task.subagent.invoked` events by `(run_id, phase, agent_role)`; any cohort with ≥2 siblings whose first-to-last spawn delta exceeds the threshold surfaces a warning row on `runs/<id>.json.warnings[]`. Informational only — no block, no escalation.
- **Single-message cohort spawn discipline.** New `### Parallel-spawn discipline` subsection in `commands/orchestra.md ## Shared rules`: feature fan-out, BR-AC fan-out, SAD pre-pass cohort, and tool-call batches MUST emit ALL `Agent({...})` calls in ONE assistant message. Cross-message staggers are structural violations, flagged as `cohort.spawn.staggered` warnings on `runs/<id>.json`.
- **SAD pre-pass parallel cohort.** Dispatcher `commands/orchestra.md ### code-to-spec ## Provenance marker` gains a `**SAD pre-pass cohort.**` paragraph: when auto-promote AND provenance marker are BOTH required on a reverse-pass entry, dispatcher spawns `@architect task: provenance-marker` + `@architect task: workspace-sad-author` in ONE message (no read-dependency between them). `agents/architect.md ### Reverse-pass discipline ##3` auto-promote rule mirrors the cohort declaration.
- **AC source-binding rule on `@product` reverse-pass.** New step 4 under `agents/product.md ### Reverse-pass discipline`: every `S-AC-NNN` row MUST bind to source-observable behaviour (controller handler, consumer method, scheduler tick, transaction boundary, named configuration value). Rows without source backing flag for `@architect` to route to TSR `S-DIVERGENCES-001` as `DIV-NNN` observations — they are NOT acceptance criteria.
- **Per-handler error contract discipline on `@lead` reverse-pass.** New step 4 under `agents/lead.md ### Reverse-pass discipline`: `S-COMPONENTS-001` enumerates each controller handler (`@*Mapping` method, consumer listener, scheduled job) independently. Error-code → HTTP status mappings bind to the specific handler that throws the exception class, NOT to the controller class. One handler's mapping does NOT generalise to siblings.
- **Dispatcher Phase-tag emission paragraph trims.** `commands/orchestra.md ## Shared rules ### Phase-tag emission` drops the exposition tail explaining what happens without the line (kept the rule, kept the canonical-values list).

## [4.6.0] — 2026-05-18

Minor release. Two architecture-artifact tightenings land in `@architect` (Logical ERD shape, Inter-service Sequence req+resp + alt mandate) alongside first-class Flyway-default migration tooling threaded through schema + preflight + dispatcher + MCP + `@backend` + `@lead`. PlantUML skill's sequence reference extends with prelude / payload-shape / `break` + `critical` / step-label conventions lifted as generic technique from a mature payment-system reference. Two refactors ride along: run-plan `EnterPlanMode`/`ExitPlanMode` gate moves from `@lead` (where the toggle was a no-op on subagent frame) to the dispatcher (where the permission-mode change is real); consumer surface compresses by ~30–50% across agents + skills + commands + hooks via progressive disclosure to `references/` and `lib/`. Sixteen test suites green.

### Added

- **Architect Logical ERD + Inter-service Sequence authoring rules.** New subsections in `agents/architect.md`. Logical ERD: one entity per aggregate root (not per service), `pk(<id> : TYPE)` first row + ~5 key business attributes, cross-aggregate references rendered as PlantUML arrows stereotyped `<<by-value>>` with cardinality on every arrow; physical column lists / indexes / audit-log tables forbidden at logical scope (those belong in per-feature `erd-physical.puml`). Per-service `erd-logical` stereotypes upstream aggregates as `<<external>>`. Inter-service Sequence: every cross-service synchronous call MUST show request AND response on adjacent arrows; field-name skeletons (no values) lifted verbatim from `<feature-id>-openapi.yaml`; failure paths in `alt` blocks labeled by FRS `S-ERRORS-001` row id (`else AC-014: payment declined`); async carve-out via `->>`.
- **Flyway-default migration tooling (forward chain) + canonical schema-source (reverse chain).** `schemas/local.schema.json` gains `primary_database: string` and `migration_tool: flyway | liquibase | none` closed-allowlist fields (`ddl-auto` deliberately not in the enum — it surfaces as a DEFECT shape during reverse-pass). Preflight (`hooks/lib/preflight-detect.js`) detects both fields and lists them in the missing-fields block for greenfield bootstrap; `primary_database` is gated on `migration_tool != none` with predicate re-evaluation at prompt-time so a mid-bootstrap switch to `migration_tool: none` doesn't race. Dispatcher (`commands/orchestra.md ## Bootstrap`) defaults JVM stacks to Flyway and rejects `ddl-auto` explicitly. `mcp__orchestra-utils__upsert_local_yaml` allowlist extends to both fields in `LOCAL_FIELDS` + `inputSchema.properties`. `@backend` gets a `### Database migrations` section: forward-only `V<NNN>__<slug>.sql` under `services/<service_name>/src/main/resources/db/migration/`, baseline via `pg_dump --schema-only` / `mysqldump --no-data` for reverse-pass DEFECT closure, Liquibase carve-out via `db/changelog/`, `migration_tool: none` → ESCALATE. `@lead` reverse-pass adds a persistence-shape priority step: read `db/migration/V*.sql` first (canonical), entity classes (`@Entity`) as fallback, `ddl-auto` triggers DEFECT `<feature-id>-DEFECT-ddl-auto-not-versioned.md`; `S-CONFIG-001` row inventory gains a migration-tool row.
- **PlantUML sequence reference extended in `skills/plantuml/references/sequence_diagrams.md`.** Six additions land as generic technique (skill stays generic; orchestra-specific contract lives in `agents/architect.md::Inter-service Sequence authoring`). **Header Prelude** — copy-pasteable starter: `!theme plain` + three skinparams (`sequenceArrowThickness 1.5`, `maxMessageSize 300`, `responseMessageBelowArrow true`) + title template. **Color-coding by Architecture Layer** — group participants left-to-right (channel → domain → platform → external) and color by layer for fast visual scan. **Request / Response Payload Shape** — load-bearing rule "every synchronous request arrow must have a paired response arrow"; `->>` carve-out for fire-and-forget; both field-name skeleton (`{ userId, clientId, items[] }`) and example-values (`{ status: "PAID" }`) shapes documented with usage guidance. **`break` (Early Exit) + `critical` (Protected Region)** — previously absent from the Grouping vocabulary; cross-linked to `references/troubleshooting/sequence_diagrams_guide.md`. **Step Labels and Compensation Markers** — `[N]` and `[Comp-N]` conventions documented as free-text labels (not PlantUML keywords); cross-linked to existing `autonumber` and `ref over`. **Tips section** — bullet 7 rewrites as paired-response rule with per-glyph sub-bullets (`->` sync / `->>` fire-and-forget / `->x` crash); new bullet 9 codifies failure-path discipline (`alt` success-first, `else` per error category labeled by AC id). Verification: `plantuml -checkonly` clean on five representative fragments; `/audit-skills plantuml` 100/100 across all five categories.

### Changed

- **Run-plan `EnterPlanMode`/`ExitPlanMode` gate moves from `@lead` to dispatcher.** Subagents inherit a frozen permission frame from spawn — `EnterPlanMode` is a no-op there. Observed session `cf87b4a7` (`code-to-spec service:order`) confirmed `@lead` skipped the gate; dispatcher retro-loaded plan-mode tools at main level. The contract now matches the runtime: `@lead` becomes pure draft-author — `Read`/`Glob`/`Grep` over `source_path` for `chain: reverse-pass`, `Write` run-plan with `status: draft` + `run_plan_status: drafted`, end turn. Dispatcher Reads the draft, forks on `chain:` — `reverse-pass` → `EnterPlanMode(<body>)`/`ExitPlanMode`; `forward-chain` → `AskUserQuestion(approve | revise)` — then flips frontmatter to `status: locked` + `run_plan_status: approved` on accept. Reject path captures revision notes under `## Revision notes` and re-spawns `@lead`; max 3 cycles, cycle 4 → ESCALATE.
- **Consumer surface compresses across `agents/`, `skills/`, `commands/`, `hooks/`, `scripts/`.** Plugin-authoring templates applied without behavior change. Sixteen test suites green. Agents trim by citing canonical "Writing style" in `product.md` and dropping forward references (`architect.md` 266→185, `lead.md` 207→171, `product.md` 192→170, `reviewer.md` 149→108, `test-author.md` 105→95). Skills push deep content to `references/` subdirs for progressive disclosure (`clean-code` 258→144, `clean-architecture` 224→131, `java-development` 276→134, `write-contract` 199→85, `commit-message` 172→60, `plantuml` 201→143, `code-review` 152→138 with new `severity-rubric.md` + `language-checklists.md`). `commands/orchestra.md` replaces prose with an S1–S9 strategy dispatch table. Hooks extract lib modules: `metrics-collector.js` 1042→201 (new `event-shapers`, `field-extract`, `jsonl-emit`, `redaction`, `metrics-aggregators`); `agent-plan-sync.js` 464→173 (new `plan-frontmatter`, `plan-sync`); `pre-write-check.js` 353→129 (new `cite-patterns`, `gate-d`); `orchestra-preflight.js` 250→44 (new `preflight-detect`); `post-write-puml.js` reworded to C4-PlantUML spec language. `hooks/lib/README.md` documents the stability contract + module index. Scripts split per-surface validators: `validate.js` 1171→79 dispatcher + per-surface predicates (`validate-{schemas,frontmatter,skills,cite,hooks,artifacts}.js`); `scaffold-artifact.js` 414→139; `bump-version.js` gains Phase-3 post-write verification (re-read all three files, exit 1 on mismatch).

## [4.5.2] — 2026-05-17

Patch release. Closes a defect in `code-to-spec service:<name>` auto-promote where SAD frontmatter declared workspace scope while the body and C4 L1/L2 diagrams delivered service scope (one service as `System()`, platform siblings as `System_Ext`). Three defense layers land: a canonical auto-promote spawn brief in the dispatcher, a `### C4 scope continuity` rule in `@architect`'s `## Rules`, and Gate-E in `pre-write-check.js`. Plus a `Scope-content mismatch` structural failure in `@reviewer` and a new `S-SCOPE-UPGRADE-001` run-plan anchor (with `auto_promote_workspace_sad` frontmatter flag) so the human reviewer sees the scope upgrade before approving.

### Fixed

- **Auto-promote SAD scope on `code-to-spec service:<name>`.** Dispatcher in `commands/orchestra.md` `## code-to-spec algorithm` gains an "Auto-promote spawn brief" subsection: when multi-repo + per-service + workspace `SAD.md` absent, the `@architect` spawn prompt carries `task: workspace-sad-author` with explicit workspace-scope framing (enumerate Service-Topology entries as `Container(...)`, never as `System_Ext`). Narrowing re-spawn carries `task: per-service-narrowing` and is restricted to per-feature `{PRD, FRS, TDD, openapi.yaml}` for the named service only. The source-read-rooted service carries the richest evidence in the workspace pass; siblings cite the topology table without source inspection.
- **`@architect` C4 scope guard.** New `### C4 scope continuity` rule under `agents/architect.md` `## Rules` encodes the workspace-vs-service L1/L2 contract as a first-class agent prior: workspace SAD's `System()` = the platform with every Service-Topology entry inside `System_Boundary` as a `Container`; service SAD's `System()` = the named service with sibling services as `System_Ext`. Workflow step 1 branches on the new `task: workspace-sad-author` / `task: per-service-narrowing` / `task: reverse-pass` tags so the agent picks up the scope frame at the spawn boundary.

### Added

- **Gate-E in `hooks/scripts/pre-write-check.js`.** Reads `workspace_kind` from `<cwd>/.orchestra/system.yaml`. Under `multi-repo`, rejects `<context_path>/docs/SAD.md` writes whose `S-CONTAINERS-001` enumerates fewer than 2 Container rows, and `<context_path>/docs/diagrams/c4-container.puml` writes with fewer than 2 `Container()` entries inside `System_Boundary(...)`. Skipped silently under `single-repo` and when `system.yaml` is absent or unparseable.
- **`Scope-content mismatch on workspace SAD` structural failure in `@reviewer`.** New row in `agents/reviewer.md` `### Structural failures` covers the puml-side semantic check Gate-E can't reach: services listed in `<context_path>/CLAUDE.md` Service Topology rendered as `System_Ext` in `c4-context.puml` / `c4-container.puml` are an auto-REQUEST_CHANGES finding regardless of `auto_mode`.
- **`S-SCOPE-UPGRADE-001` anchor + `auto_promote_workspace_sad` frontmatter in `schemas/run-plan.schema.md`.** Optional flag set by the dispatcher when the auto-promote rule fires; flag `true` makes the anchor REQUIRED. Anchor body declares which scope was requested, which scope was upgraded to, the trigger, and the artifact split between the workspace pass and the narrowing pass. The human reviewer reads this anchor before approving the run-plan — explicit handshake on scope upgrade.

## [4.5.1] — 2026-05-16

Patch release. Consolidates the `orchestra-utils` MCP surface (renamed from `orchestra-fs`, plus three closed-allowlist config-write tools); routes all `.orchestra/{system,local}.yaml` + consumer `CLAUDE.md` splice writes through it. Formalizes the four parallelism granularities (intra-feature spawn, inter-feature dispatcher spawn, within-agent per-unit spawn, tool-call batch) with new within-agent parallelism blocks on `@architect` (BR-AC + ADR-open) and `@reviewer` (per-ADR review). Consumer CLAUDE.md template restructures under one `## Rules` umbrella; nine inline duplications of consumer-rules fold up across six agent files. Tone discipline pass: terse imperative, split lines, `**<Name>.** <action>` paragraphs, no §-anchor cites at call sites when the canonical home is in the same file.

### Changed

- **`orchestra-fs` MCP server renamed to `orchestra-utils`** and gains three new closed-allowlist tools: `write_system_yaml(workspace_kind, context_path, status)`, `upsert_local_yaml(context_path, service_name, ...)`, and `claude_md(context_path)` (idempotent splice of `<!-- orchestra:start -->`/`<!-- orchestra:end -->`-bracketed orchestra section into consumer `CLAUDE.md` from `hooks/references/consumer-claude-md.template.md`). Schema validation gates writes against the closed allowlists in `schemas/system.schema.json` + `schemas/local.schema.json` — unknown fields reject server-side. Tool name finalized at `claude_md` (was `bootstrap_consumer_claude_md`); the verb prefix was redundant with the namespace and the single `context_path` arg.
- **Dispatcher routes `.orchestra/system.yaml` + `.orchestra/<service>/local.yaml` + consumer `CLAUDE.md` writes exclusively through `mcp__orchestra-utils__*` tools.** Replaces free-form `Write()` to these surfaces. Bypasses `pre-write-check.js` (MCP tool path) with the rationale documented inline in `scripts/mcp-servers/orchestra-utils.js` — `.orchestra/**` is outside Gate-D's `src/**` and Gate-D-inverse's `docs/**` scan ranges, and schema validation on closed allowlists is stricter than the hook's regex set.
- **Four parallelism granularities formalized.** Intra-feature spawn fan-out (`@lead` → `@backend ‖ @frontend ‖ @test-author` on openapi lock), inter-feature dispatcher spawn (`/orchestra` → one `@lead` per `S-FEATURES-001` row with distinct aggregate roots), within-agent per-unit spawn (`@architect` per-service BR-AC + per-ADR ADR-open; `@reviewer` per-ADR review), and tool-call batch (N parallel `Write()`/`Edit()` calls in one message for `.puml` diagrams + per-feature singletons). Single-writer surfaces — SAD `S-CONTAINERS-001`, `business-invariants.md`, `inventory/adr/index.md`, `local.yaml` — stay sequential with parent serializing in one final pass.
- **Within-agent parallelism blocks added** to `agents/architect.md` (`### Within-agent parallelism` for ≥2 service BR-AC fan-out; `### Within-agent parallelism: ADR-open` for ≥2 ADR markers, with stack-choice serial carve-out and ADR-index single-writer carve-out) and `agents/reviewer.md` (`### Within-agent parallelism` for ≥2 ADRs handed off in one spawn).
- **Consumer CLAUDE.md template restructured under one `## Rules` umbrella.** `hooks/references/consumer-claude-md.template.md` folds previous H2 sections (`## src/ discipline`, `## Don't trample`) plus newly-canonical tool-call-batch + spawn-batch + single-writer-carve-outs rules into a single `## Rules` section at top; descriptive `## Source of truth` + `## Workflow` retained below.
- **Nine inline shared-rule restatements folded up** across six agent files. `agents/architect.md` (×2), `agents/lead.md` (×2), `agents/backend.md` (entire `### src/ purity` subsection), `agents/frontend.md` (entire `### src/ purity` subsection), `agents/test-author.md` (×2), `agents/test-runner.md` (×1). Agent files now carry only SubAgent-scoped rules; CRAFT-level rules (batch independent writes/spawns, no chain-artifact cites in business code) live once in the consumer template.
- **Tone discipline applied to dispatcher + agents.** Storytelling exposition trimmed, long visual lines split into `**<Name>.** <action>` paragraphs or bullets, §-anchor citations into in-file canonical homes replaced with inline imperative statements. Repo `CLAUDE.md ## Rules` adds **Tight imperative; no storytelling**, **Split lines for scannability**, **Upsert into existing files**, **Consumer CLAUDE.md is shared rules**.
- **Dispatcher slug-minting rule split into 3 bullets** in `commands/orchestra.md` `## Shared rules → ### Journey gate`: shape (`<NNN>-<slug>`), slug source (tech / CRUD / lifecycle noun), reject conditions (Journey-gate category-label slugs, verb-prefixed slugs). Replaces the previous one-line conjunction.
- **Stale `v2.*` version stamp scrubbed** from a comment in `hooks/lib/rate-card.js`.

## [4.5.0] — 2026-05-15

Minor release. Agents migrate to short-alias `model:` frontmatter (`opus` / `sonnet` / `haiku`) backed by a `model_id` field in the registry, and agent prompts reorganize into `## Workflow` + `## Rules` with inline worked `<example>` blocks. Dispatcher gains a Journey gate (outcome-category partition of aggregate terminal states); `post-write-puml` learns to detect PlantUML error-frame SVGs (C4-PlantUML escaped-quote-in-macro errors that exit 0); `pre-write-check` adds an `env-fallback-credential` SECRET pattern for Spring `${KEY:literal}` shapes. Schema layer ships per-service BR-AC `erd-logical` and a `run-plan.feature_framing` toggle (`aggregate-cohesion` ↔ `lifecycle-loop`). Skill layer adds the Java TDD `S-CONFIG-001` callsite-liveness checklist and extracts the six C4 quick-start templates to `references/` for progressive disclosure. README leads with a Why orchestra positioning section; consumer-surface scrub removes residual dev-trace cites and version stamps.

### Breaking

- **Agent `model:` frontmatter shape.** All 9 agents migrate from fully-qualified Anthropic model ids to short aliases (`opus` / `sonnet` / `haiku`). `schemas/known-models.schema.json` `id` enum tightens to `{opus, sonnet, haiku}`; a new required `model_id` field carries the fully-qualified id, and the previous `tier` field drops (subsumed into `id`). `scripts/validate.js` gates frontmatter `model:` against the new shape. Agent prompt bodies also reorganize into `## Workflow` + `## Rules` with subsections and inline worked `<example>` blocks codifying diff/ADR review steps and per-agent escalation paths. `scripts/tests/agents.test.js` fixtures updated.

### Added

- **Journey gate in `commands/orchestra.md` `## Shared rules`.** Defines a journey as one outcome-category partition of an aggregate root's terminal states. State-machine connectivity is NOT the grouping rule. Includes a stub-rejection guard and a worked value-transfer example (partition shape illustrative, not contractual).
- **`erd-logical` at per-service scope.** `pipeline-artifact.schema.md` diagram vocabulary now assigns `erd-logical` to per-service BR-AC (walked-service schemas only); the existing system-wide assignment on SAD is retained. Per-service folder layout adds `<service_name>/diagrams/erd-logical.{puml,svg}`.
- **`feature_framing` toggle on `run-plan` frontmatter.** Optional field, values `aggregate-cohesion` (default) | `lifecycle-loop`. `lifecycle-loop` swaps the one-feature-per-aggregate-root collapse rule for the Journey-gate outcome-category partition. Aggregate atomicity stays unified across sibling lifecycle features via service-scope BR-AC `S-INVARIANTS-001`.
- **PlantUML error-frame SVG detection in `hooks/scripts/post-write-puml.js`.** PlantUML often exits 0 even when the produced SVG is an error frame (e.g., C4-PlantUML preprocessor errors from escaped-quote-in-macro-arg). The hook now scans the SVG for known error signatures and emits a structured `<post-write-puml-warning>` block so a reader scanning hook output can spot a broken diagram.
- **`env-fallback-credential` SECRET pattern in `hooks/scripts/pre-write-check.js`.** Matches Spring `${KEY:literal}` shapes whose KEY names a credential (`PASSWORD` / `SECRET` / `TOKEN` / `API_KEY` / `CREDENTIAL` / `PRIVATE_KEY`). The SKIP regex narrows from `\$\{` to `\$\{[A-Z_]+\}` so bare `${KEY}` references still skip while credential-fallback shapes remain visible.
- **Java TDD `S-CONFIG-001` row checklist** in `skills/java-development/SKILL.md`. Walks `application.yml` + `pom.xml` to populate the deployable stack-shape. Every persistence/RPC/resilience instance gets a Java callsite-liveness check (grep for `@Retry` / `@CircuitBreaker` / `Registry.get`); zero callsites tag the row (`latent — no callsite`) and open a TSR `DIV-NNN` row in forward-chain or surface in reverse-pass run report in brownfield.
- **C4 quick-start templates extracted to `skills/c4-architecture/references/templates.md`** (new file). Six fenced templates (L1 Context / L2 Container / L3 Component / L4 Code / Dynamic / Deployment) lifted verbatim from `SKILL.md` with selection guidance at the head. Progressive disclosure: `SKILL.md` shrinks, templates load on demand.
- **Consumer CLAUDE.md template markers.** `CLAUDE.md` now wraps the orchestra consumer-template block in `<!-- orchestra:start -->` / `<!-- orchestra:end -->` markers so a consumer install can update the block atomically.

### Changed

- **`pipeline-artifact.schema.md` prose compression.** Placement-model, link-discipline, and body-discipline sections fold to single-paragraph summaries (full rules inline; remove duplicated bullet enumerations that already lived elsewhere).
- **`skills/c4-architecture/SKILL.md` zoom-continuity protocol** compressed from verbose 4-step form to tighter 4-step form, same semantics. New MUST-NOT rule: no escaped double quotes inside C4 macro arguments — the stdlib parses macro args as preprocessor expressions; escaped quotes fork the parser and produce an error-frame SVG (now flagged by `post-write-puml`).
- **README + consumer-surface hygiene pass.** README leads with `## Why orchestra` (harness-vs-pedagogy comparison table) and promotes `## Architecture` above `## Features`. `commands/orchestra.md` aligns its documented preflight matcher with the hook fix shipped in 4.4.2 (`^/orchestra(?::orchestra)?(\s|$)`). `scripts/mcp-servers/orchestra-{fs,probe}.js` and `hooks/scripts/metrics-collector.js` drop phantom `PRD §9.10` / `DESIGN-001-infra §4.X` dev-trace cites and `v1.0.0` / `v1.1+` / `v4.1` version stamps per the consumer-surface boundary + no-version-stamps rules.

## [4.4.2] — 2026-05-15

Patch release. Restores the preflight hook against the plugin-namespaced `/orchestra:orchestra` invocation form, which Claude Code accepts alongside the bare `/orchestra` shorthand.

### Fixed

- **`hooks/scripts/orchestra-preflight.js` prompt-prefix regex** widened from `^/orchestra(\s|$)` to `^/orchestra(?::orchestra)?(\s|$)`. The previous narrower form silently early-exited (exit 0, no stdout) when users invoked the dispatcher via the fully-qualified `/orchestra:orchestra <subcommand>` form, causing `commands/orchestra.md` to halt with "preflight hook did not emit". The fix matches both forms while still rejecting unrelated `/orchestra…`-prefixed prompts (e.g., `/orchestrasomethingelse`).

## [4.4.1] — 2026-05-15

Patch release. Tightens reverse-pass discipline against four defects observed in a real `/orchestra code-to-spec service:order` run against a multi-repo brownfield workspace (feature over-fragmentation, orphan diagrams, cross-service flow under-enumeration, forward-chain agent spawn leak), re-keys the run-plan approval gate from `mode:` to spawn-prompt `chain:` tag so `spec-to-code`-on-brownfield routes correctly, and introduces the `--source=<path>` flag required to point per-service brownfield invocations at the actual source root.

### Added

- **`--source=<path>` flag** for `/orchestra code-to-spec`. REQUIRED when scope resolves to per-service; pins the read-root for source inspection. Persisted to `local.yaml.source_path` (new field in `schemas/local.schema.json` closed allowlist). Leading `@` (Claude Code path-mention shorthand) is stripped. `hooks/scripts/orchestra-preflight.js` surfaces it under `cached_fields.source_path` and adds it to `missing_fields` when the run is brownfield AND per-service (either resolved or `service:<name>` token detected in prompt).

### Changed

- **Run-plan approval gate re-keyed from `mode:` to spawn-prompt `chain:` tag.** Dispatcher now sets `chain: reverse-pass | forward-chain` in the `task: run-plan-author` spawn prompt; `@lead` branches on it (`reverse-pass` → `EnterPlanMode` + source walk + native plan-approval pane; `forward-chain` → write directly + dispatcher `AskUserQuestion(approve|revise)`). Correctly handles `spec-to-code`-on-brownfield (existing repo, new feature) — forward-chain there gets `AskUserQuestion`, not plan mode that would walk source the chain isn't enumerating. The `Brownfield branch` / `Greenfield branch` headers in `agents/lead.md` collapse into one linear flow with inline `chain:` conditionals; step numbering 1→4, no gaps.
- **`agents/architect.md` reverse-pass workflow grew from 6 steps to 8** — two new steps inserted (Bind every authored diagram, Cross-service flow enumeration) between the artifact-set step and the no-code-no-tests-no-TSR step. System-wide example updated to show binding inline.

### Fixed

- **Aggregate-cohesion gate in `agents/lead.md` plan-mode walk** (Defect A): feature minting now groups endpoints by domain aggregate root, not per CRUD operation. Sibling slugs on the same aggregate (e.g., `001-order-creation` + `002-order-retrieval` + `003-order-cancellation` + `004-order-refund`) hard-reject and re-group into one bare-noun feature (`001-order`) whose `FRS S-USECASES-001` enumerates the operations as use-case rows. Inverse case (separate aggregates sharing a URL prefix, e.g., `/admin/users` vs `/admin/audit-logs`) NOT collapsed — aggregate identity is by domain entity, not URL path.
- **Bind-every-authored-diagram step in `agents/architect.md` reverse-pass** (Defect B): authored `.puml` files MUST appear in the parent artifact's `diagrams: [...]` array, in the same edit. Orphan diagrams (file present, array entry missing) are a structural defect, not a non-blocking warning. SAD's `diagrams:` array MUST resolve to the union of `c4-context` + `c4-container` (system-wide) + `erd-logical` (when persistence present) + every `sequence-inter-<flow>` authored under `docs/diagrams/`.
- **Scope-aware cross-service flow enumeration in `agents/architect.md`** (Defect C): "per cross-service flow" specified with four discovery heuristics — Kafka topics with ≥1 cross-service consumer; multi-hop synchronous chains crossing ≥2 service boundaries; state-transition fan-outs visible in `business-invariants.md` state machines; failure-handling contracts (saga `@Compensable`, `Resilience4j` retry+circuit-breaker, idempotency-table reads). Per-service scope narrows to flows where the named service is a participant; system-wide enumerates everything. Auto-promote case (per-service + SAD absent → system-wide first) does NOT prune flows on the subsequent narrow.
- **Authorized agent set in `commands/orchestra.md` code-to-spec algorithm** (Defect D): reverse-pass spawns restricted to `{@product, @architect, @lead}`. Forward-chain agents (`@backend`, `@frontend`, `@test-author`, `@test-runner`, `@evaluator`, `@reviewer`) forbidden during `task: reverse-pass` — they were leaking through, writing `src/test/**` test code, and emitting meaningless `eval_verdict: FAIL` scores against reverse-engineered specs (forward-chain measuring spec/source drift instead of spec correctness).

## [4.4.0] — 2026-05-15

Minor release: dispatcher collapses to a 4-subcommand surface (`spec-to-code`, `code-to-spec`, `<intent>` router, empty→usage) with code-to-spec authoring the reverse chain against the same artifact schemas. Schema layer renames CSD → BR-AC, promotes diagrams to first-class `diagrams:` relations, and adopts a strict `local.yaml` allowlist. `@test` splits into `@test-author` (spec-bound, no Bash) and `@test-runner` (impl-aware, Bash + suite execution) so anti-confirmation-bias is structural at the frontmatter layer. `@evaluator` and `@reviewer` move from `disallowedTools:` denylist to `tools:` allowlist (default-deny). README + CLAUDE.md restructure against the per-plugin reference style resolves 2026-05-14 audit findings (stale counts, phantom `project-discovery` skill, fictional subcommands, dev-surface link leaks). All three breaking shape changes are blank-install-only — no consumer migration burden.

### Breaking

- **`/orchestra` dispatcher collapses to 4 subcommands** + code-to-spec reverse pass + Gate-D inverse. The dispatcher surface is now `spec-to-code` / `code-to-spec` / `<intent>` router / empty→usage; legacy `ship` / `report` / `resume` / `help` removed. Code-to-spec authors docs from existing source against the same schemas the forward chain produces. `pre-write-check.js` adds the Gate-D inverse: blocks `src/**` path tokens, commit SHAs, branch names, repo URLs, and PRD/FRS fenced code blocks inside `docs/**/*.md`.
- **Schema collapse: CSD → BR-AC + diagrams promoted to relations + strict `local.yaml` allowlist.** `<service>-CSD.md` retires in favor of per-service `<service>-BR-AC.md` (business-rule + acceptance-criteria) with `S-INVARIANTS-001` carrying half-implemented / accidental shapes. Diagrams move from sub-artifact prose into a first-class `diagrams: [...]` relations array per parent artifact (SAD / TDD / ADR), with `post-write-puml` enforcing render-on-write and inline `![](diagrams/<id>.svg)` embed parity. `local.schema.json` becomes a closed allowlist with named-only keys; unknown keys reject at validate time.
- **`@test` → `@test-author` + `@test-runner`; `@evaluator` + `@reviewer` adopt `tools:` allowlist.** The two-stage tester becomes two distinct agents: `@test-author` is spec-bound (`tools: Read, Write, Edit, MultiEdit, Glob, Grep, Skill` — no Bash, cannot execute the suite); `@test-runner` is impl-aware (same allowlist plus Bash for `mvn test` / `npm test` / `pytest`, fills cells + locks `S-TEST-001`). `@evaluator` and `@reviewer` migrate from `disallowedTools:` denylist to `tools:` allowlist — closes the default-allow gap for new Claude Code tool kinds. Chain-artifact references updated across lead/architect/backend/frontend agents, `commands/orchestra.md`, `schemas/routing-taxonomy.md`, `schemas/pipeline-artifact.schema.md`, TSR template, qa-test-planner / write-contract / task-breakdown / java-development skills, and `scripts/tests/agents.test.js`. Agent count 8 → 9.

### Added

- **Root `LICENSE` file** — MIT text matching `package.json` / `plugin.json` declarations. Makes SPDX scanners and GitHub auto-detect work.

### Changed

- **README + CLAUDE.md restructured against the per-plugin reference style.** README: counts in section headers (`## Skills (10)`, `## Agents (9)`, `## Hooks (7)`, etc.), one table per component kind, env-var opt-out registry inlined, dev-surface markdown links removed, ASCII pipeline diagrams per `/orchestra` entry shape. CLAUDE.md: top-loaded with a tight Rules section mirroring the reference repo's discipline; substantive sections (two-surface, version-stamp, annotation-creep, release-workflow) preserved below the fold; standalone "Scope discipline" block folded into Rules; "Hook script comments — lower priority" subsection dropped (already covered by fold-up principle).
- **Consumer CLAUDE.md template aligned with the 4-entry-shape dispatcher.** `hooks/references/consumer-claude-md.template.md` now enumerates the four canonical entry shapes; legacy `/orchestra ship feat-001` example removed.

### Fixed

- **Consumer CLAUDE.md template stale references.** Dropped `CONTRACT §N` from the `src/**` denylist (replaced by `openapi.yaml` in the schema collapse); replaced `TSR §verdict-*` old terminology with the current `S-EVAL-001` / `S-REVIEW-001` section anchors; added the `<service_name>` segment to `.orchestra/local.yaml` and `.orchestra/pipeline/<feature-id>/` paths to match `local.schema.json`.

### Removed

- **`hooks/scripts/orchestra-statusline.sh`** — never wired into `plugin.json.statusLine`; trimmed as dormant orphan along with its `4i.*` test block in `scripts/tests/metrics.test.js`. The v4.1 entry below remains as the historical record of when the script was first added.

## [4.3.2] — 2026-05-14

Patch release covering the consumer-side plugin install summary, an audience-boundary seal on `docs/`, removal of the T-A/B/C/D tier enumeration from consumer surface + validator + dev docs (replaced by per-role `disallowedTools`), a terse-pass over agents and the `/orchestra` dispatcher prose, and a tightening of the C4 zoom-continuity Step 1b protocol after it failed to bite in an authoring session.

### Added

- **`docs/` link discipline** — normative section in `schemas/pipeline-artifact.schema.md` forbidding codebase paths, external URLs, `.orchestra/` siblings, and project-root files inside any `docs/*` artifact body. SAD template + CSD schema carry one-line pointers, not restatements.
- **Workspace-global ADR index** — `S-ADR-INDEX-001` relocates out of SAD and per-service CSD to `.orchestra/inventory/adr/index.md` with `S-GLOBAL-001` + `S-SERVICES-001` anchors. Schema at `schemas/inventory.adr-index.schema.md`. Individual ADR bodies stay under `docs/`; only the index relocates.

### Changed

- **Agent frontmatter shape** — all 8 agents migrate from the closed T-A/T-B/T-C/T-D tier allowlist to Claude Code's official `disallowedTools` denylist (`@product` / `@architect` / `@lead` / `@evaluator` ban Bash/Edit/MultiEdit; `@reviewer` keeps Bash for static analysis; `@backend` / `@frontend` ban Bash; `@test` declares neither). Each agent's `## Tier` body heading becomes `## Allowed surface`.
- **Agent validator** (`scripts/tests/agents.test.js`) — Check 4 drops the closed-tier toolset enumeration in favor of a per-role `FORBIDDEN_TOOLS_PER_AGENT` map; accepts either allowlist or denylist shape per agent (XOR), and now parses the comma-separated `tools:` string form documented in the official subagents docs.
- **"Tier-A" rule names** — three sites rename "Tier-A single-writer invariant" → "Single-writer invariant" (`skills/code-review/SKILL.md`, `agents/evaluator.md`, `agents/reviewer.md`). Two dev-surface narratives drop residual T-A / T-C labels (`README.md` Architecture + table row, `docs/blog-orchestra-technical.md` Tier Separation heading + table). Repo-wide `\bT-[ABCD]\b` now matches only `CHANGELOG.md` history.
- **Consumer-surface terse pass** — prose tightening across the 8 agents and `commands/orchestra.md`. Same rules, shorter wording. Stale v4.0/v4.1 planning briefs drop from `docs/`; three official-doc scrapes (agent-teams, hook-guide, skill-authoring) added under `docs/` for maintainer reference.

### Fixed

- **`plugin.json` install summary** — drop the explicit `agents` + `commands` arrays. Claude Code's manifest treats custom paths as supplements (not replacements) for the default `agents/` and `commands/` auto-discovery, so listing every file caused each component to register twice and the consumer-side "Installed components:" summary lost the Agents/Commands buckets in the dedup.
- **C4 zoom-continuity Step 1b** (`skills/c4-diagrams/SKILL.md`) — restructure the three declarative rules into a four-step numbered action protocol opening with a literal Read-parent step. Lead with the three named failure modes (missing parent boundary, dropped actor across the seam, wrong outer wrap at L2/L3). Generalize the wrong-outer-wrap rule to cover the symmetric L3 trap. Worked counter-examples relocate to `references/c4-rules.md` with abstract placeholders so consumers can't lift them as ghost templates.

## [4.3.1] — 2026-05-14

Patch release: align consumer-surface lifecycle prose with `pre-write-check.js` Gate-A semantics. Six sites where sequential `Edit` calls could trip Gate-A mid-sequence — the on-disk `status: locked` read meant the second Edit was rejected when prose listed the status-flip first. Fix shape across the family: state status-flip LAST in every ordered lifecycle; drop phantom "carve-out matching the local.yaml exception" cross-cites that referenced a hook exception that never existed.

### Fixed

- **`skills/brownfield-inventory/SKILL.md`** — inventory accept step flips `user_gate: pending → accepted` before `status: draft → locked`; `decisions.pending_count == 0` precondition moved up-front.
- **`commands/orchestra.md` run-plan approval** — both brownfield (line 208) and greenfield (line 215) branches reordered so `run_plan_status: drafted → approved` lands before `status: draft → locked` on `run-plan.md`, and `local.yaml`'s three terminal-state writes (`auto_mode`, `run_plan_status`, `status`) land with `status` last.
- **`commands/orchestra.md` lock-lifecycle invariant** (line 178) — clarified staggered lock points: `system.yaml` at step 12 cache-persist, `local.yaml` at run-plan approval (no "after first answer cache" claim that contradicted the run-plan-approval writes).
- **`commands/orchestra.md` phantom carve-outs** (lines 513, 532) — dropped "(parent-context carve-out, mirrors `system.yaml` / `local.yaml` exception)" parentheticals. Metrics-runs `<run-id>.json` has no frontmatter so no gate fires; TSR top-level `status` stays `draft` through `/orchestra ship`'s `ship:` write so Gate-A doesn't trip.
- **`hooks/scripts/pre-write-check.js` Gate-A stderr** — dropped the "or transition status to draft via Edit" suggestion. That recovery path is impossible because the corrective Edit is itself rejected by Gate-A; only `ORCHESTRA_HOOK_PRE_WRITE_CHECK=off` works.
- **`agents/architect.md` CSD lock** — explicit "then flip `status: locked`" so the three-count + status frontmatter sequence is unambiguously ordered.

## [4.3.0] — 2026-05-14

Minor release: post-v4.2 hardening across consumer-surface discipline, brownfield workflow, and artifact-grain rules. PRD/FRS gain business-rule anchors (BR/AC) and a tech-leakage prohibition; FRS use-case diagrams require an end-user actor; C4 placement moves L3/L4 into service folders with parent→child zoom continuity enforced. CSD becomes living service-grain state (no feature attribution; `S-CONTRACT-001` dropped, stability shifts to the `.yaml` extension). ADRs split global vs service-scoped, gated by a three-test worthiness check. Brownfield source-explore dual-modes implementers, mints `S-FEATURES-001` rows at user-journey grain, and folds slug-minting into the inventory accept; `local.yaml` lock flip is now atomic. Cost-tier toggles let evaluator/reviewer run on Sonnet 4.6 with a `verdict_mode` opt-back to Opus. `validate.js` adds version-stamp, phase-tag, and hook-parity predicates; `bootstrap-consumer-claude-md` moves to `hooks/lib/` for the hook-dir contract. `S-OPEN-Q-001` is dropped — open questions become a hard-pause before lock, not an artifact anchor. Workflow doc updated to commit-derived CHANGELOG aligned with Conventional Commits 1.0.0.

### Added

- **`clientapi.yaml`** — consumer-side OpenAPI doc for outbound HTTP dependencies (companion to `openapi.yaml` for inbound surface). Implementers author one per service in brownfield + greenfield.
- **BR/AC anchors** — `S-BR-001` (business rules) + `S-AC-001` (acceptance criteria) on PRD (system grain) and FRS (service grain). Anchors complement the existing chain instead of replacing it.
- **Three-gate ADR worthiness test** in `skills/write-adr/SKILL.md` — routes a decision to ADR vs lighter artifact (inline note, CSD invariant, FRS anchor). Prevents ADR sprawl on every routine choice.
- **Brownfield source-explore dual mode** — implementers (`@be`, `@fe`, etc.) run an exploratory pass before drafting, producing an `intel` artifact captured under the run. `S-FEATURES-001` rows mint at user-journey grain (not technical grain) and slug-minting folds into the inventory user-accept.
- **`verdict_mode` toggle** on `local.yaml` — `cost` (default; evaluator + reviewer on Sonnet 4.6) vs `quality` (Opus 4.7). Verdict-tier downgrade is opt-out, not opt-in.
- **`validate.js` predicates** — `findVersionStamps` (catches `v4.X`-style stamps + migration narration in consumer surface), phase-tag presence on `Agent({...})` spawns, hook-parity between `hooks/scripts/` and `hooks/lib/`. All wired into the main walk.
- **End-user actor requirement** on every FRS use-case PlantUML diagram — caught a class of diagrams that drew internal-call flows masquerading as use cases.
- **C4 parent→child zoom continuity** rule — every child diagram must zoom into a parent container/component; orphan diagrams fail diagram-lint.

### Changed

- **CSD lifecycle → living service-grain state.** `<service_name>-CSD.md` no longer attributes lines to features; it represents the *current* shape of the service. Feature-diff context moves to line comments on C4-L3/L4 diagrams.
- **C4-L3/L4 placement** — diagrams live under `docs/<service_name>/diagrams/` (not the feature folder), with feature-diff line comments tagging what changed per pipeline run.
- **ADR scope split** — global ADRs at `docs/decisions/`, service-scoped ADRs at `docs/<service_name>/decisions/`. The worthiness gate routes a decision to one or the other.
- **PRD/FRS discipline** — body MUST NOT contain tech-leakage (framework names, library choices, infra terms). Tech choices belong in TDD / ADR / CSD, never in product or functional prose.
- **Agents** — minimal-lift persona graft (each role gains a short voice block without bloating the system prompt), phase-tag emission canonical rule consolidated, tone hits added, routing taxonomy unified across `commands/orchestra.md` and per-agent prompts.
- **Hooks dir contract** — `bootstrap-consumer-claude-md` moved from `hooks/scripts/` to `hooks/lib/` (it's a library imported by other handlers, not a top-level event handler). `validate.js` enforces the script/lib split.
- **Agent frontmatter** — `context_mode` aligned across `agents/*.md`; `agents/test.md` description tightened.
- **Implementer model tier** — downgraded to Sonnet 4.6 (was Opus 4.7) for cost; quality-mode opt-in still routes Opus.
- **Manifests** — `agent-plan-sync` registered in `manifests/install-modules.json`.
- **`commands/orchestra.md` consumer-surface scrub** — version stamps + migration narration removed (matches the no-version-stamps rule in CLAUDE.md).
- **Release workflow doc** — `docs/sdlc_knowledge.md` aligned with Conventional Commits 1.0.0; CHANGELOG is now explicitly commit-derived (group by type, compute SemVer as max).

### Removed

- **`S-OPEN-Q-001` anchor** from PRD/FRS — open questions no longer materialize as a chain artifact. Authoring agents hard-pause and surface unresolved questions in the approval dialogue before lock; once locked, no open-question anchor persists. (Breaking for any consumer that referenced `S-OPEN-Q-001` cells — none exist in blank installs.)
- **`S-CONTRACT-001` anchor** from CSD — contract stability moves to file extension semantics (`.yaml` = stable, `.draft.yaml` = drafting). The anchor was double-bookkeeping with the OpenAPI file itself.

### Fixed

- **Brownfield inventory accept** — `local.yaml` lock flip is atomic on user-accept (was previously two writes with a window where lock was unset but mode was committed).
- **Consumer-surface version stamps** — removed lingering `v4.0` / `v4.2` stamps and migration narration ("X is GONE in v4.Y") missed by the v4.2.0 scrub.

---

## [4.2.0] — 2026-05-13

Minor release: bundled six-track refactor producing the v4.2 layout. Drops `scope_path` for `service_name`, collapses the two-tier `.orchestra/` into a workspace-root partition (`.orchestra/<service_name>/`), splits `inventory.md` into workspace-classification + per-service CSD, adds `scope_level` and `tsr_gate_mode` enums (deferred-TSR fan-out + ship-time tolerance), wires a completion-parity probe with `INCOMPLETE` marker, simplifies `/orchestra ship` to a commit gate (no smoke, no RELEASE/RUNBOOK authoring, no push/tag), and lands the new `commit-message` skill carrying Conventional Commits 1.0.0 + mandatory AI `Co-Authored-By:` trailer. Phase-tag emission (originally drafted as v4.1.3) merges into v4.2.0. Forensic motivation: a real 2h, $84.68 brownfield reverse-doc run on `vngg-pay-docs/new-docs/project-poc/services/order/` shipped 3 of 6 promised features with `cost-by-phase.json` collapsed to bucket `unknown`, `inventory.md` mixing workspace + per-service concerns, and `/orchestra ship` opinionated for release flows the consumer doesn't run. Spec-panel + background-swarm findings consolidated in `/Users/lap16318/.claude/plans/spicy-napping-kay.md`.

### Added

- **CSD per-service singleton** — `docs/<service_name>/<service_name>-CSD.md`. Required anchors: `S-OWNED-001` (owned schema + tables + error namespace), `S-CONTRACT-001` (frozen HTTP/Kafka surface), `S-INVARIANTS-001` (cross-feature invariants), `S-SUB-CAPABILITIES-001` (index). Authored once per service under `mode: brownfield` + `scope_level ∈ {container, service}`. New `schemas/csd.schema.md` documents the shape; `@architect` is the sole writer at `phase: discovery`.
- **`local.yaml` fields**: `service_name` (required; directory-basename identity), `scope_level` (`service | container | capability`), `tsr_gate_mode` (`blocking | deferred`, default `blocking`), `incomplete` (boolean). Closed allowlist preserved (`additionalProperties: false`).
- **`<feature-id>-DRAFT-COMPLETE.md` marker** — written by `@lead` at openapi-locked fan-out join under `tsr_gate_mode: deferred`. The dispatcher's ship-gate reads it to tolerate absent verdict cells when `@evaluator` / `@reviewer` are still running async.
- **`<run-id>-INCOMPLETE.md` artifact type** — written by the dispatcher's terminal-state parity probe when `S-FEATURES-001` rows lack their full chain-artifact set per `chain_rigor`. `runs/<id>.json.incomplete: true` patched alongside. New `INCOMPLETE` entry in the artifact-type taxonomy in `schemas/pipeline-artifact.schema.md`.
- **`skills/commit-message/SKILL.md`** — 96-line skill carrying Conventional Commits 1.0.0 canonical format (`<type>[(<scope>)][!]: <description>` + body + footers) with mandatory AI `Co-Authored-By: <model-name> <noreply@anthropic.com>` trailer. Invoked by `/orchestra ship` Step 3; usable standalone for any commit.
- **`S-GATES-001` `tsr_gate_mode_override` column** (optional) in `schemas/run-plan.schema.md` — per-run override of the default blocking gate-mode; `@lead` surfaces this row in approval dialogue when the user requested deferred mode at bootstrap.
- **Phase-tag emission canonical rule** — `commands/orchestra.md` `### Shared rules → ### Phase-tag emission` subsection. Every `Agent({...})` spawn MUST prepend a `phase: <name>\n` line; five literal values: `discovery`, `spec-draft`, `verification`, `gap-resolution`, `gate`. `metrics-collector.js:166` parser unchanged (was already correct; bug was in writers).

### Changed

- **`.orchestra/` layout** — workspace-global state (`system.yaml`, `inventory.md`, `manifest.json`, `events.jsonl`, `metrics/`) at `<context_path>/.orchestra/` root; per-service execution state partitioned under `<context_path>/.orchestra/<service_name>/` (`local.yaml`, `run-plan.md`, `pipeline/`, `tasks/`). Symmetric with the `docs/` layout: project-level singletons at `docs/` root, per-service prose under `docs/<service_name>/`.
- **`docs/` layout** — per-service partition under `docs/<service_name>/`; per-feature artifacts under `docs/<service_name>/<feature-id>/`. Single-service workspaces still nest (uniform partition, not conditional on `workspace_kind`).
- **`inventory.md`** — workspace-classification only. Required anchors restricted to `S-SCAN-001`, `S-CLASSIFICATION-001`, `S-DECISIONS-001`, `S-WARNINGS-001`. Per-service shape migrated: invariants + contract surface → CSD; feature slugs + chain plan → `run-plan.md S-FEATURES-001` / `S-PHASES-001`; per-feature open questions → PRD `S-OPEN-Q-001`.
- **`/orchestra ship` algorithm** — 5 steps → 3: (1) verify gates from TSR frontmatter with deferred-mode tolerance via `DRAFT-COMPLETE.md`; (2) set TSR `ship:` frontmatter (parent-context carve-out); (3) commit via `skills/commit-message`. **MUST NOT** `git push`, `git push --tags`, or `git tag` — those are external-visibility actions the user owns.
- **`@lead` openapi-locked fan-out join** — branches on `local.yaml.tsr_gate_mode`. `blocking` (default): Stage-2 → `@evaluator` → `@reviewer` sequential before turn end (today's behavior). `deferred`: Stage-2 runs, then `@lead` writes `DRAFT-COMPLETE.md`, spawns `@evaluator ‖ @reviewer` in parallel with `phase: verification`, hands back immediately.
- **Auto-mode invariant** (`commands/orchestra.md` `## Invariants`) — reviewer verdicts (`REVISE` / `BLOCK` / `ALLOW_WITH_GAP`) preserved as blocking by default; deferred per-run via `S-GATES-001 tsr_gate_mode: deferred` row that the user accepted at run-plan approval. Structural-failure halts and `ESCALATE` / `DEADLOCK` emission remain always-preserved (no override).
- **`run-plan.md S-FEATURES-001`** — row shape gains `Sub-capabilities`, `Source anchors`, `State-machine role` columns (absorbing what `S-REGEN-PLAN-001` used to carry in inventory).
- **`@architect`** — CSD added to allowed-set; authored once per service at `phase: discovery`. SAD scope-election precedent reused (singleton shape, scope collapsed to always-per-service for CSD).
- **`@product` PRD authorship** — references CSD by anchor (`see CSD S-INVARIANTS-001`) instead of re-narrating invariants. Soft target ~150 lines per PRD.
- **`schemas/pipeline-artifact.schema.md`** — `## Round-trip gate` → `## TSR gate mode`. Ship-verdict mapping rewritten: `eval_verdict: PASS` + `rev_verdict: APPROVED` → `ALLOW`; `rev_verdict: ALLOW_WITH_GAP` → `ALLOW_WITH_GAP`; (`eval_verdict: FAIL` OR `rev_verdict: REQUEST_CHANGES` OR `rev_verdict: PENDING`) → `HOLD`. Under `tsr_gate_mode: deferred`, absent verdict cells → `ALLOW_WITH_GAP` only when `DRAFT-COMPLETE.md` exists; otherwise `HOLD`.
- **Parent-context carve-out** (`commands/orchestra.md`) — enumerates 5 narrowly-authorized parent writes: `system.yaml`, `<service_name>/local.yaml`, pipeline `INCOMPLETE.md`, `metrics/runs/<run-id>.json incomplete: true` patch, TSR `ship:` frontmatter.

### Removed

- **`scope_path` field** from `local.yaml` (replaced by `service_name`; closed-allowlist rejection on load).
- **`round_trip` field** from `local.yaml` (replaced by `tsr_gate_mode`; v4.1's 4-state enum encoded both intent AND verdict state — split: `tsr_gate_mode` is 2-state intent-only, verdict state lives in TSR frontmatter `eval_verdict` + `rev_verdict`).
- **`registered_services` field** from `system.yaml` (per-service state lives at `.orchestra/<service_name>/` partition, no registry needed).
- **Two-tier `.orchestra/`** placement (workspace `.orchestra/` + per-scope `.orchestra/`). Collapses to single workspace-root `.orchestra/` with per-service subfolders.
- **`inventory.md` per-service anchors**: `S-REGEN-PLAN-001`, `S-INVARIANTS-001`, `S-CONTRACT-FREEZE-001`, `S-OPEN-Q-001`, `S-CHAIN-PLAN-001`. Migrated as documented above.
- **`/orchestra ship` smoke-test step** (pre-RELEASE 5-step install loop). The plugin doesn't match every consumer's deploy/release flow; smoke discipline moves to project CLAUDE.md `## Release-doc authoring` as a user-driven post-commit check.
- **`/orchestra ship` RELEASE / RUNBOOK / ANNOUNCEMENT authoring**. Release artifact authoring is opinionated for one release flow; varied consumer flows mean the plugin authors a commit only. RELEASE-vX.Y.Z.md and RUNBOOK-vX.Y.Z.md still exist as artifact types in the taxonomy for consumers who choose to author them manually.
- **`@ship` agent references** in `skills/task-breakdown/SKILL.md` (owner table, dependency-edge rules, worked example). There was no `@ship` agent in production — `/orchestra ship` is a dispatcher subcommand. T-007 row dropped from worked example; totals updated to 12 SP / 8 SP critical path.
- **Reviewer auto-soften rule** (`agents/reviewer.md`) — `APPROVED → ALLOW_WITH_GAP` conversion under `round_trip: DEFERRED` is gone. `ALLOW_WITH_GAP` remains a legitimate reviewer verdict for "approved with caveat" cases (probe-gap, accepted-as-noted finding) but is NEVER auto-converted. Deferred-mode ship-time tolerance is handled by the dispatcher via the `DRAFT-COMPLETE.md` marker, not by reviewer-side softening.

### Breaking changes (v4.1.x consumer migration)

- `scope_path` rejected by `local.yaml` closed allowlist — workspaces using it fail schema-load.
- Two-tier `.orchestra/` placement no longer recognized — `<scope_path>/.orchestra/local.yaml` won't load.
- `inventory.md` per-service anchors removed — workspaces with the old shape need a manual split per the migration script.
- `/orchestra ship` no longer authors `RELEASE-vX.Y.Z.md` / `RUNBOOK-vX.Y.Z.md` — consumers relying on automated release-doc authoring author them manually post-ship.

The v4.2 dispatcher detects v4.1.x layout (presence of `scope_path` field in any `local.yaml`) and writes `<context_path>/.orchestra/MIGRATION-REQUIRED.md` listing the steps below, halting before any chain spawn.

Manual migration (one-time, per service):

```bash
SVC=order   # repeat per service in registered_services
mkdir -p <context_path>/.orchestra/${SVC}
mv <context_path>/<scope_path>/.orchestra/local.yaml     <context_path>/.orchestra/${SVC}/
mv <context_path>/<scope_path>/.orchestra/inventory.md   <context_path>/.orchestra/${SVC}/inventory-old.md
mv <context_path>/<scope_path>/.orchestra/run-plan.md    <context_path>/.orchestra/${SVC}/
mv <context_path>/<scope_path>/.orchestra/pipeline       <context_path>/.orchestra/${SVC}/
mv <context_path>/<scope_path>/.orchestra/tasks          <context_path>/.orchestra/${SVC}/
mv <context_path>/<scope_path>/docs/*                    <context_path>/docs/${SVC}/
# edit local.yaml: replace `scope_path: <abs>` with `service_name: ${SVC}`
# edit local.yaml: rename `round_trip: DEFERRED` to `tsr_gate_mode: deferred` (or drop entirely for default blocking)
# edit system.yaml: remove `registered_services` array
# manually split inventory-old.md per the CHANGELOG: workspace-classification stays at .orchestra/inventory.md; invariants + contract → docs/${SVC}/${SVC}-CSD.md (new); feature slugs + chain plan → .orchestra/${SVC}/run-plan.md S-FEATURES-001 / S-PHASES-001
```

### Why this is a minor, not a patch

Closed-allowlist invariants of `system.yaml` + `local.yaml` shifted: existing v4.1.x `.orchestra/` layouts won't load against the v4.2 schemas (`scope_path` and `round_trip` rejected; `registered_services` rejected). The PRD / FRS / TDD / openapi / TSR + frontmatter contract is unchanged — consumers' authored chain artifacts survive bytewise. Not a major (v5.0.0) because chain-artifact shape, agent ownership, and the cross-tier write contract are all stable; only bootstrap state and the ship algorithm move.

### Coupling guards (post-merge invariants)

- `validate.js: OK` against v4.2 fixtures (inverse-sanity local.yaml uses `tsr_gate_mode: blocking`, no `round_trip` reference remains).
- Zero `round_trip` / `@ship` hits across `agents/` + `commands/` + `skills/` + `schemas/` (`grep -rn 'round_trip\|@ship' agents commands skills schemas` returns exit 1).
- `tsr_gate_mode` reachable from 7 consumer-surface files spanning agents/commands/skills/schemas.
- Track A schema landed in same commit as the auto-mode invariant rewrite (no silently-inconsistent doc state between schema + invariant).

## [4.1.2] — 2026-05-12

Patch release: run-plan approval gate splits by `local.yaml.mode`. Brownfield now uses Claude Code plan mode (`EnterPlanMode` for source exploration + `ExitPlanMode` for native approval) so `@lead` verifies the inventory's regen feature list against actual source under `<scope_path>/src/**` before proposing the run plan. Greenfield is unchanged.

### Changed

- **`agents/lead.md` §"Bootstrap: run-plan authoring"** — split into brownfield branch (`EnterPlanMode` → explore `<scope_path>/src/**` via Glob/Grep/Read → author plan body into plan-mode designated plan file → `ExitPlanMode` native approval → on accept `Write` body + orchestra frontmatter to canonical `<scope_path>/.orchestra/run-plan.md`; on reject end turn without canonical write) and greenfield branch (direct `Write` to canonical path; no plan mode). Required anchors and frontmatter shape deduped into shared steps — `run-plan.md` schema shape identical across branches.
- **`commands/orchestra.md`** — decision-tree step 14 + "Approval gate (dispatcher, not lead)" now split by `local.yaml.mode`. Brownfield path: dispatcher checks file presence at canonical path post-end-of-turn (present = ExitPlanMode accept; absent = reject + revise loop). Greenfield path: retains `AskUserQuestion(approve|revise)`. Revise-loop semantics, 3-cycle cap, and `auto_mode` / `run_plan_status` writes are unchanged across both branches.
- **`docs/v4.1-brief.md` §16, `docs/v4.1-workflow.md` row 3.5** — target-state prose + workflow row updated to describe the mode split + per-branch verification fixtures.

### Why this is a patch, not a minor

Schema shape is unchanged: `run-plan.md` body, `local.yaml` allowlist, and the dispatcher's approval-outcome contract (`auto_mode: true` + `run_plan_status: approved` on accept) are byte-identical across branches. Greenfield behavior is unchanged from v4.1.1. The brownfield branch adds a verification-only mechanism — plan mode cannot mutate the run-plan schema, skip any failure gate, or bypass the 3-cycle revise cap.

### Smoke status

**Pending.** Doc-only release. The brownfield branch assumes (a) `EnterPlanMode` / `ExitPlanMode` are exposed inside a spawned-subagent context, and (b) plan-mode-exit preserves @lead's turn-context body so the post-accept `Write` to the canonical path doesn't need to re-read the designated plan file. Both need a real brownfield smoke chain to verify; if either fails the brownfield branch needs reshape (dispatcher-side plan-mode wrapper, or two-file shape with explicit body re-read).

## [4.1.1] — 2026-05-12

Patch release: drop the `adapted_template` chain-deviation feature, tighten feature-id slug discipline so brownfield feature folders name *features of the service* (not meta-actions on the codebase), and split `<workspace>/.orchestra/` into two tiers so multi-service microservices workspaces can share workspace-level state across sessions while keeping per-service chain state isolated.

### Removed

- **`template_source` + `chain_mode` fields** — gone from `schemas/local.schema.json`, the `commands/orchestra.md` decision tree (Step 7 elicitation deleted; subsequent steps renumbered), the `local.yaml` YAML block, the `docs/v4.1-brief.md` closed-allowlist table, and the v4.1-workflow Phase 3 task spec. The plugin no longer supports authoring outputs that mirror a consumer-supplied template — agents always emit the canonical PRD/FRS/TDD/openapi/TSR shape. Consumer-supplied intake templates (e.g. `regeneration-doc-template.md`) remain READ-ONLY input whose questions answer inside PRD/FRS/TDD bodies (item #11 rule, unchanged).

### Changed

- **Feature-id minting (`commands/orchestra.md`)** — Step 2 of the minting algorithm now requires brownfield slugs to come from `<scope_path>/.orchestra/inventory.md.S-REGEN-PLAN-001` "Feature slug" column rather than the user's prompt verb. Greenfield / empty-workspace fallback still slugs from the prompt but rejects verb-prefixed names (`regen-*`, `refactor-*`, `redoc-*`, `fix-*`). The previous algorithm produced folders like `001-order-regen` (an action) instead of `001-order-placement` (a feature) because no inventory walk had constrained the slug.
- **`skills/brownfield-inventory/SKILL.md`** — `S-REGEN-PLAN-001` row spec gained a "Feature-slug discipline" clause: domain noun-phrases only, verb prefixes rejected at inventory authoring time. Candidates derive from `project-discovery`'s per-stack "Major feature" heuristic.
- **`skills/project-discovery/SKILL.md`** — "Major feature" heuristic broken out by stack (Spring/Java, Go, Node/TS, Python) with explicit slug-candidate sources (controllers, use-case handlers, domain packages, routers).
- **Two-tier `.orchestra/` for multi-* workspaces** — `<context_path>/.orchestra/` holds workspace-level state (`system.yaml` + `metrics/` aggregated rollup); `<scope_path>/.orchestra/` holds per-service chain state (`local.yaml`, `inventory.md`, `run-plan.md`, `pipeline/`, `tasks/`). Single-repo workspaces collapse both tiers into one dir. The v4.1 brief's `mv <context_path>/.orchestra <scope_path>/.orchestra` rule is replaced with create-don't-move + auto-register: bootstrap creates each tier as needed and appends each new `scope_path` to `system.yaml.registered_services` so subsequent sessions targeting other services under the same context skip the workspace-level prompts.
- **`agents/architect.md`, `skills/brownfield-inventory/SKILL.md`** — `local.yaml.workspace_kind` reads switched to `system.yaml.workspace_kind`.

### Added

- **`schemas/system.schema.json` (new)** — Closed allowlist for `<context_path>/.orchestra/system.yaml`: `workspace_kind` (enum), `context_path` (path), `registered_services` (list of `scope_path`), optional `status`. `additionalProperties: false`.
- **`scripts/validate.js` — `validateSystemYamlContent` pure function** — Mirrors `validateLocalYamlContent` against the new schema; exported for mutation testing. New mutations: (13b) `workspace_kind` in `local.yaml` rejected (must live in `system.yaml`); (13c) unknown field in `system.yaml` rejected by closed allowlist; (13d) invalid `workspace_kind` enum value rejected.

### Why this is a patch, not a minor

The `adapted_template` removal is technically a feature deletion, but the feature was never functional in production — it was schema-allowed and decision-tree-elicited but no chain logic ever branched on `chain_mode: adapted_template` (only the pilot regression at v4.0.x attempted to use it freeform). The two-tier `.orchestra/` is a corrective placement refactor — the v4.1.0 brief's `mv`-based migration was broken for the multi-session microservices case it was supposed to enable. Both changes restore intended behavior rather than ship new capability.

## [4.1.0] — 2026-05-12

Minor release: brownfield-aware bootstrap with the new `brownfield-inventory` skill, closed-allowlist `local.yaml` schema, and `run-plan.md` auto-mode gate replacing N per-phase confirmations with one upfront trust grant. TSR shape consolidated — `S-TEST-001` is a single row table (Stage-1 authors rows with empty `status`/`evidence` cells; Stage-2 fills those cells in place), `S-EVAL-001` collapses to `| id | verdict | reason |` keyed on the row ids. `CONTRACT-NNN.md` artifact type dropped — `openapi.yaml` / `asyncapi.yaml` are first-class types written directly by the `write-contract` skill, with CONTRACT narrative folded into `description:` fields. Three-tier placement (system / service / feature) for SAD / ADR / diagrams formalised in `schemas/pipeline-artifact.schema.md`.

### Added

- **`schemas/local.schema.json` (new)** — Closed 10-field allowlist for `<cwd>/.orchestra/local.yaml`. `additionalProperties: false` — unknown top-level fields fail load. Forbids freeform-prose adapter fields. Validates `autonomy.level` enum, `run_plan_status` enum, and the `auto_mode:true requires run_plan_status:approved` invariant.
- **`schemas/inventory.schema.md` (new)** — Frontmatter + body anchors for `<scope_path>/.orchestra/inventory.md`: `S-SCAN-001` (depth-limited tree), `S-CLASSIFICATION-001`, `S-DECISIONS-001`, `S-REGEN-PLAN-001` (one row per feature the chain will author), `S-WARNINGS-001`. Frontmatter counts must balance against `scan.entries_scanned` when `empty_workspace: false`.
- **`schemas/run-plan.schema.md` (new)** — Frontmatter + body anchors for `<scope_path>/.orchestra/run-plan.md`: `S-CONTEXT-001`, `S-PHASES-001`, `S-FEATURES-001`, `S-GATES-001`, `S-APPROVAL-001`. `revision_cycle ≤ 3` invariant; cycle 4 escalates.
- **`skills/brownfield-inventory/` (new)** — Adaptive-depth tree scan on `<context_path>` (L1–L5 with progressive descent), 6-row first-match classifier (plugin-equivalent SAD, plugin-equivalent ADR, diagram, redundant, stale, out-of-taxonomy), bucket-at-a-time `AskUserQuestion` for migration decisions, empty-workspace short-circuit (emits stub when zero doc-bearing entries). Output gates the chain at `user_gate: accepted` AND `status: locked`.
- **`hooks/lib/safe-fs.js` (new)** — `safeRead` / `safeWrite` / `safeAppend` with `lstat` symlink-rejection, `O_NOFOLLOW` open, and atomic `rename` on writes. `metrics-collector.js` and `agent-plan-sync.js` migrated off bare `appendFileSync` / `writeFileSync`.
- **`hooks/scripts/orchestra-statusline.sh` (new)** — Reads `<cwd>/.orchestra/local.yaml` and emits `[ORCH:<phase>]` for the user's statusline. Whitelist-validates phase name, strips non-alphanumeric, rejects symlinks, caps at 64 bytes.
- **`docs/v4.1-brief.md` (new)** + **`docs/v4.1-workflow.md` (new)** — Plan-of-record for the v4.1 refactor (dev-surface; not shipped to consumers).

### Changed

- **`commands/orchestra.md` bootstrap decision tree** — `workspace_kind` → `scope_path` (candidate-walk for `pom.xml` / `build.gradle` / `package.json` / `go.mod`; free-text fallback) → invoke `brownfield-inventory` → `template_source` → `test_depth` → chain-rigor → autonomy diagnostic → run-plan author + approval gate. `.orchestra/` migration via `mv` when `scope_path != context_path`. Approval flips `auto_mode: true` + `run_plan_status: approved`; subsequent runs skip per-phase confirmation gates while preserving `REVISE` / `BLOCK` / structural-failure halts.
- **`schemas/pipeline-artifact.schema.md`** — Added `ALLOW_WITH_GAP` verdict; `openapi.yaml` / `asyncapi.yaml` promoted to first-class artifact types under the existing taxonomy; three-tier placement table (system at `<context_path>/docs/`, service at `<scope_path>/docs/`, feature at `<scope_path>/docs/<feature-slug>/`). C4 L3 component diagrams capped at 12 components (no methods, no fields, no parameter lists).
- **Agent prompt fan-out** — `@lead` emits `pipeline.phase.start`/`end` events + gap-resolution + `retroactive_adr` handoff. `@architect` gains a Divergences row shape (brownfield, pre-TSR), the writing-style block (assertions not descriptions; no hedging), and the C3 12-component cap. `@product` / `@reviewer` / `@architect` adopt writing-style + allowed-set + diagram-allowlist rules. `@reviewer` gains `ALLOW_WITH_GAP` verdict and openapi/asyncapi presence checks.
- **TSR shape consolidation** — `S-TEST-001` collapses to a single row table; Stage-1 authors rows with empty `status` / `evidence` cells; Stage-2 fills those cells in place (no second table). `S-EVAL-001` becomes `| id | verdict | reason |` keyed on `S-TEST-001` row ids; `validate.js` rejects unknown ids. `validate.js` enforces row-id coverage from `S-TEST-001` into `S-EVAL-001`.
- **`skills/write-contract/` rewritten** — Emits `<feature-id>-openapi.yaml` / `<feature-id>-asyncapi.yaml` directly. CONTRACT narrative folds inline via `description:` fields and a top-of-file `# orchestra:` comment block.
- **`hooks/scripts/metrics-collector.js`** — `pipeline.phase.start` / `pipeline.phase.end` aggregation on spawn-phase transitions; `UserPromptSubmit` injects `local.yaml` `phase` / `round_trip` / `source_lock` context into the model's prompt; reads both subagent transcript layouts (sibling-dir `<parent_sid>/subagents/agent-*.jsonl` and project-root `<sid>.jsonl` fallback) regardless of `spawn_mode`.

### Removed

- **`CONTRACT-NNN.md` artifact type** — folded into `openapi.yaml` / `asyncapi.yaml` `description:` fields. `write-contract` skill no longer emits separate CONTRACT files.

## [4.0.6] — 2026-05-10

Patch release: per-agent execution-plan artifacts wired across all 8 agents, the dispatcher, and a new sync hook. Each spawned agent now drops a PLAN file at `<cwd>/.orchestra/tasks/<run-id>/<agent>/<feature-id>.md` BEFORE its first artifact write or `TaskCreate` call, narrating its approach in `## Approach` and (via the new `agent-plan-sync` hook) mirroring its native Claude Code task list into the file's frontmatter. `/orchestra resume` consults PLAN files first (fine-grained interrupt resumption) before walking the global TASKS.md DAG. Autonomy level (`local.yaml.autonomy.level`) gates whether the agent runs an `AskUserQuestion` to confirm its plan or proceeds silently.

### Added

- **`hooks/scripts/agent-plan-sync.js` (new, sixth hook)** — Owns mutation of per-agent PLAN files. Subscribes to `PreToolUse:TaskCreate|TaskUpdate`, `PostToolUse:TaskCreate`, and `SubagentStop`. Two-phase capture: PostToolUse on `TaskCreate` binds Claude Code's assigned taskId to a `T-NNN` entry in `tasks:` frontmatter; PreToolUse on `TaskUpdate` flips status by that bound id. `SubagentStop` with any non-`completed` task → `status: interrupted`; all completed → `status: done`. Reuses metrics-collector's parent-sid lookup pattern (walks `~/.claude/projects/<encoded-cwd>/*/subagents/agent-<sub_sid>.jsonl` to recover the dispatcher run-id from a subagent's session id). Three-tier feature-id discovery: spawn-prompt grep → most-recent `intent.yaml` → most-recent pipeline dir mtime. Crash-safe: never blocks the underlying tool; opt-out via `ORCHESTRA_HOOK_AGENT_PLAN_SYNC=off`.
- **`schemas/pipeline-artifact.schema.md`** — New artifact type `PLAN`. Stable filename `<feature-id>.md` under `<cwd>/.orchestra/tasks/<run-id>/<agent>/`. Frontmatter: `id`, `type: PLAN`, `agent: "@<role>"`, `run_id`, `feature_id`, `created`, `updated`, `status: pending|in_progress|interrupted|done`, `tasks_pending|in_progress|done` counts, `tasks: [{id, claude_task_id, description, status}]`. Body grammar: `## Approach` (agent-owned narrative) + `## Tasks` (hook-mirrored checklist). Body-grammar carve-out (no `<a id>` anchors), joining `intent.yaml` / `<feature-id>-TASKS.md` / `ESCALATE` / `DEADLOCK` as agent-internal coordination. Distinct from the v3 PLAN type (`--think` artifact under `docs/`, dropped in v4.0); this is a per-agent runtime working-memory artifact under `.orchestra/`, different audience and lifetime.
- **`commands/orchestra.md` "Per-agent plan discipline" shared rule** — Single canonical block under "Shared rules" naming the lifecycle, autonomy-gate table (5 levels × confirm-vs-skip semantics), and source-of-truth boundary (`## Approach` agent-owned; `tasks:` + counts + status + `## Tasks` checklist hook-owned). Invariants block updated to credit `agent-plan-sync` with `tasks:` mutation. Runtime-hooks table grows from 5 to 6 entries with the new hook documented. `/orchestra resume` algorithm Step 3 split into 3a (PLAN scan, fine-grained, primary) and 3b (TASKS.md walk, coarse-grained, fallback).
- **All 8 agents (`product`, `architect`, `lead`, `backend`, `frontend`, `test`, `evaluator`, `reviewer`)** — Workflow Step `0.` added as the first item in each numbered Workflow list. Single line per agent referencing the canonical block (per the project's `update-discipline — fold up, don't sprinkle` rule); `test.md` and `reviewer.md` additionally clarify that one PLAN spans both stages / both review modes.
- **`hooks/scripts/metrics-collector.js`** — Two new event shapes: `agent.plan.task` (PreToolUse on `TaskCreate|TaskUpdate`, tagged with `agent_role`, `claude_task_id`, `task_subject`, `task_status` — gives a per-agent activity audit on every Task* call) and `artifact.written` for plan-file Writes/Edits (recognizes `<cwd>/.orchestra/tasks/<run-id>/<agent>/<feature-id>.md` paths, emits `artifact_type: PLAN` with `agent_role`, `plan_run_id` keys).
- **`scripts/tests/agent-plan-sync.test.js` (new)** — 25 assertions across 6 cases: opt-out (env=off emits allow envelope), `PostToolUse(TaskCreate)` creates plan + appends `T-001` with bound `claude_task_id`, `TaskUpdate` flips status + counts + checklist annotation, last-task completion flips plan to `status: done`, `SubagentStop` with open tasks flips to `status: interrupted`, idempotent reopen on duplicate `TaskCreate`. Sandboxes a fake `~/.claude/projects/<encoded-cwd>/<parent_sid>/subagents/` layout under tmp HOME so the hook's session-walk runs deterministically against UUID-shaped parent sids and short-hex subagent ids (matches Claude Code's actual file-naming).

### Changed

- **`hooks/hooks.json`** — Three new registrations: `PreToolUse:TaskCreate|TaskUpdate` (agent-plan-sync + metrics-collector), `PostToolUse:TaskCreate` (agent-plan-sync), `SubagentStop` (agent-plan-sync runs alongside metrics-collector).
- **`scripts/tests/hooks.test.js` `KNOWN_TOOLS` allowlist** — Added `TaskCreate`, `TaskUpdate`, `TaskList`, `TaskGet`, `TaskOutput`, `TaskStop` so the hooks.json matcher-validation block accepts the new matchers.

### Why no schema revision

`schemas/pipeline-artifact.schema.md` revision unchanged (still `6`). Adding a new artifact type to the type enum is additive — older readers ignoring the new type incur no behavior change since the path namespace (`<cwd>/.orchestra/tasks/`) is also new. No frontmatter-shape changes for any pre-existing artifact. No hook-contract changes for the 5 pre-existing hooks. No env-var toggles removed. `local.yaml` schema unchanged. Existing pipelines under `<cwd>/.orchestra/pipeline/<id>/` and `<cwd>/docs/<feature-id>/` remain valid; the new `<cwd>/.orchestra/tasks/` subtree is greenfield.

### Migration

- **First spawned-agent run after upgrade** writes its PLAN under `<cwd>/.orchestra/tasks/<run-id>/<agent>/<feature-id>.md`. No retroactive backfill for in-flight runs that started under v4.0.5.
- **`/orchestra resume`** prefers PLAN files when present; falls back to the v4.0.3+ TASKS.md walk for runs that pre-date this release.
- **Opt-out**: `ORCHESTRA_HOOK_AGENT_PLAN_SYNC=off` disables the new hook entirely; agents will still narrate PLAN bodies but no `tasks:` mirroring or interrupt detection occurs. Useful for diagnosing PLAN-related test/CI failures.

### Tests

13 test files green, +1 new (`agent-plan-sync.test.js`, 25 assertions). `hooks.test.js`: 96 → 97 assertions (+1 from KNOWN_TOOLS allowlist expansion).

## [4.0.3] — 2026-05-10

Patch release driven by smoke-test feedback at `/tmp/orchestra-smoke-greenfield-v4-0-2`. Five gaps surfaced: (1) `spawn_mode` cached silently as `subagent` with no user-visible prompt; (2) `autonomy.level` never elicited (PAUSE-1 lived inside `@lead` per v4.0.2 CHANGELOG, but the smoke run produced no autonomy field in `local.yaml`); (3) C4 diagrams used inconsistent naming (`c4-l1-context` from architect alongside `001-todo-api-c4-l3-component` from lead) and were emitted into one folder; (4) C4 Level-4 (Code) absent everywhere; (5) `@product` authored PRD without `AskUserQuestion`-driven consultant dialogue at non-HIGH confidence.

### Changed

- **`commands/orchestra.md` — autonomy + spawn_mode gates promoted into the dispatcher decision tree.** Two new `AskUserQuestion` steps: spawn_mode (subagent | teams; default subagent) and autonomy.level (5-tag enum sourced from `skills/task-breakdown/references/autonomy-diagnostic.md`; suggestion derived by running the 5-Q diagnostic against `$ARGUMENTS` + `local.yaml.discovery`). `local.yaml` schema gains `autonomy:` block (`level`, `resolved_by` provenance). Two new flags: `--autonomy {EXECUTION_ONLY,JOINT_PROCESSING,OPTION_SYNTHESIS,DRAFT_AND_GATE,FULL_AUTONOMY}` and `--spawn-mode {subagent,teams}`. Resolution precedence unchanged: CLI flag > `local.yaml.autonomy.level` > diagnostic suggestion > `DRAFT_AND_GATE`. v3 PAUSE-N terminology stays forbidden — gates live in decision-tree prose, not in named pause hooks.
- **`skills/c4-architecture/SKILL.md` — diagram naming + filesystem layout rationalized.** L1/L2/L3 templates renamed to `Level N — <name>` headers with explicit filename hints (`c4-l1-context.puml`, `c4-l2-container.puml`, `c4-l3-<service>.puml`). New "Two folders, one source of truth" section: project-level singletons under `<cwd>/docs/diagrams/` (latest-state, updated in place by `@architect` for L1/L2 and `@lead` for L3/L4); per-feature copies under `<cwd>/docs/<feature-id>/diagrams/` with `<feature-id>-` prefix and feature-touched elements highlighted via `UpdateElementStyle($bgColor="LightSalmon", $borderColor="Red")`. Step 6 self-check gains the "two-folder rule" bullet. Worked example rewritten end-to-end against the Todo-service flow.
- **`agents/architect.md` — L1/L2 paths updated.** `docs/diagrams/c4-context.puml` → `c4-l1-context.puml`; same for container. New `clean-architecture` skill invocation when authoring SAD `S-CONTAINERS-001` (Dependency Rule applied to container layout).
- **`agents/lead.md` — L3/L4 ownership + per-feature copy protocol.** Outputs section enumerates project singletons (`docs/diagrams/c4-l3-<service>.puml`, `c4-l4-<service>.puml`) plus per-feature highlighted copies (`docs/<feature-id>/diagrams/<feature-id>-c4-l1-context.puml`, etc.). Workflow Step 6 ("Author TDD + diagrams") now describes the copy-with-highlight protocol explicitly. New `clean-architecture` and `clean-code` skill invocations.
- **`agents/backend.md` — Clean Architecture + Clean Code wired into authoring loop.** Skills section adds both. Workflow gains a self-score step before flipping `Status: done` (≥8/10 on each rubric, else another pass or ESCALATE).
- **`agents/reviewer.md` — `S-VERDICT-REVIEW-001` scoring rubrics added.** Two new workflow steps (5a, 5b) walk the diff against `clean-architecture` (6 principles) and `clean-code` (6 disciplines); scores recorded in the verdict body alongside the finding list.
- **`agents/product.md` — consultant-mode self-check.** Step 3 now mandates ≥1 `AskUserQuestion` at MEDIUM confidence and 2–3 at LOW (HIGH still 0). PRD `status: locked` blocks until the dialogue happened; otherwise `<feature-id>-DEADLOCK-consultant-skipped.md` is written. Frames LOW-confidence dialogue around problem-before-feature ("what problem are you trying to solve?", "MVP / production / experimental?", existing constraints).

### Added

- **`skills/clean-architecture/`** — vendored verbatim from `github.com/wondelai/skills@1.1.0` (MIT, Wondel.ai sp. z o.o.). Six principles: Dependency Rule, Entities & Use Cases, Interface Adapters & Frameworks, Component Principles (REP/CCP/CRP/ADP/SDP/SAP), SOLID, Boundaries & Humble Object. Six `references/*.md` deep-dives. `SKILL.md` frontmatter trimmed to ≤200-char description and gains `origin:` declaration; body and references unchanged. `LICENSE` file ships next to `SKILL.md`.
- **`skills/clean-code/`** — vendored verbatim from same source. Six disciplines: Meaningful Names, Functions, Comments & Formatting, Error Handling, Unit Testing (F.I.R.S.T.), Code Smells & Heuristics. Same vendoring shape: trimmed frontmatter, `origin:` declaration, paired `LICENSE`.
- **`skills/c4-architecture/SKILL.md` — Level 4 (Code) template added.** PlantUML class diagram (no `C4_Code` macro exists in stdlib) showing the full layer cake — Controller / Use Case / Port / Repository implementation / Entity — with `<<adapter>>` / `<<usecase>>` / `<<port>>` / `<<entity>>` stereotypes. Inward-pointing arrows enforce the Dependency Rule visually. Required under `chain_rigor=Full` when service has ≥3 classes; omittable with `<!-- OMIT: trivial code surface -->`.
- **`scripts/tests/hooks.test.js` — v4.0.3 assertions added.** Replaces v3-vestige guards on `--autonomy` / 5-tag / spawn_mode (regression rule inverted: now REQUIRED, not forbidden). New blocks: `c4-architecture` skill enumerates all four levels + `clean-architecture` cross-reference + highlight protocol; vendored skills load cleanly with `origin: vendored` frontmatter and shipping `LICENSE`. 78 → 97 assertions (+19).

### Why no schema revision

`schemas/pipeline-artifact.schema.md` revision unchanged. No anchor renames, no frontmatter shape changes for chain artifacts, no hook-contract changes, no removed env-var toggles. `local.yaml` schema gains `autonomy:` block as additive optional fields; the existing `validate.js` `VALID_AUTONOMY_LEVELS` enum already accommodated the 5 tags. All 11 test files green (validate, hooks, agents, bash-strip, bootstrap, cite-purity, metrics, probe, removability, report, scaffold, validate-extensions). Existing pipelines under `<cwd>/.orchestra/pipeline/<id>/` remain valid; consumers upgrading from 4.0.2 see two new dispatcher prompts on first `/orchestra` run after upgrade.

### Migration

- **First `/orchestra <intent>` run after upgrade** prompts twice for new fields (spawn_mode + autonomy.level). Both cache to `local.yaml`; subsequent runs do not re-prompt unless the user clears the file or re-elicits via `--autonomy=<tag>` / `--spawn-mode=<mode>`.
- **Existing C4 diagrams** with v4.0.2-era filenames (`c4-context.puml`, `c4-component.puml`) keep working — the `post-write-puml` hook is generic and renders any `.puml`. New feature runs author the new naming. To re-canonicalize, rename in place; no automated migration shipped.

## [3.0.0] — 2026-05-07

Major release: coordinated prompt + artifact tightening sweep across 30+ consumer-surface files (8 agents, 14 skills, `commands/orchestra.md`, 7 schema manifests). Closes the v2.* release window. The surface is rewritten end-to-end against new canonical templates documented in `docs/v3.0-canonical-{agent,skill}-template.md` (dev-trace).

Net consumer-pipeline delta: zero. Anchor IDs (`S-NAME-NNN`), frontmatter shapes, hook contracts, env-var toggles, pipeline-artifact types, and `<artifact>.lock.yaml` sidecar pairing all unchanged. `schemas/pipeline-artifact.schema.md` revision stays at `5`. Existing pipelines under `.claude/.orchestra/pipeline/<id>/` remain valid; no migration required. `claude plugin update orchestra` is a non-breaking upgrade.

Behavior change is restorative: prompts normalized to canonical templates, dev-doc cite leaks dropped (phantom anchors for consumers — `docs/` doesn't ship with the plugin install), v1→v2 fold leftovers corrected (stale references to removed `verify/<NNN>-CODE-REVIEW.md` / `verify/<NNN>-VERDICT.md` artifacts now correctly point at TSR halves `S-REV-VERDICT-001` + `S-REV-FINDINGS-001` / `S-EVAL-VERDICT-001` + `S-EVAL-TABLE-001`). Every load-bearing rule preserved.

### Changed

- **`agents/{backend,frontend,evaluator,ship,test,reviewer,product,lead}.md` — canonical agent template applied to all 8.** Section sequence normalized to Identity / Tier / Skills / Inputs / Outputs / Workflow / Example. Drop list: "You may invoke:" / "You should/must" / "Action steps:" preambles + trailing rationale narration. "Tier discipline" → "Tier" rename. Path placeholders normalized to `<NNN>`. v1→v2 fold leftovers corrected on agents that referenced removed artifacts. 616 → 622 lines (+1%; rule preservation cost lines back — word/char drop is the win). First-draft `agents/backend.md` AFTER caught 7 high-severity rule-loss bugs in audit (path glob inconsistency, lost section-anchor prefix, lost collision-prevention rule, lost rule-activation mechanism, stale verdict-file ref preserved by elision, lost author attribution, lost skill timing); fixes propagated to remaining 7 agents.
- **`skills/*/SKILL.md` × 14 + new `skills/c4-architecture/references/c4-rules.md` — canonical skill template applied to all 14.** Section sequence: Identity / When-to-use / Approach OR Algorithm / [Reference table] / [Output shape] / [Escalate] / Worked example / [References]. Bimodal reduction: `plantuml` 304 → 152 (-50%, deletion of duplicated content already in pre-existing `references/`); `c4-architecture` 404 → 319 (-21%, new `references/c4-rules.md` absorbs deep MUST/MUST-NOT framework-internals prose); `write-contract` 203 → 173 (-15%). Tool-shaped + procedure skills 1–5% line drop (rule preservation enforced). Total: 2063 → 1816 (-12%). `code-review` Step 6 corrected from removed `verify/<NNN>-CODE-REVIEW.md` to TSR halves `S-REV-VERDICT-001` + `S-REV-FINDINGS-001`. `commit-work` "per WORKFLOW PR boundaries" leaky cite dropped.
- **`commands/orchestra.md` — Step 1 / Step 5(a,a',a'') / Step 7 cost banner tightened.** ~3% word drop; lines unchanged (load-bearing routing tables + canon enumerations dominate). PAUSE-4 narration corrected from "after `@reviewer` writes CODE-REVIEW" → "fills `S-REV-VERDICT-001` + `S-REV-FINDINGS-001` in TSR" (v1→v2 fold leftover; `verify/<NNN>-CODE-REVIEW.md` was retired in v2.0). `docs/HOOKS.md` leaky cite dropped.
- **`schemas/pipeline-artifact.schema.md` — narrative tightening.** ~1% word drop. Dropped "per `docs/DESIGN-005-doc-output-overhaul.md` §S-CANON-001" leaky cite. Schema revision unchanged (still at `5`).
- **`schemas/{routing-taxonomy.md, lockfile.schema.md, install-modules.schema.json, known-models.schema.json, runtime-toggles.schema.json, templates/ADR.template.md}` — 10 surgical leaky-cite cleanups.** Consumer-surface schemas referenced `docs/PRD-*.md` / `docs/DESIGN-*.md` sections by anchor — phantom anchors for consumers (the `docs/` folder doesn't ship). Defense-in-depth grep with stricter regex (`DESIGN-[0-9]+(-[a-z-]+)?\s*§`) caught patterns the streamline fixture's narrower regex missed.

### Added

- **`skills/c4-architecture/references/c4-rules.md`** — new (100 lines). Framework-internals table, Component-diagrams-optional protocol + omission pattern, microservices ownership-pattern examples (single-team / multi-team / event-driven). Absorbs deep prose previously inline in `SKILL.md`.
- **`docs/v3.0-{prompt-tightening-brief, canonical-agent-template, canonical-skill-template}.md`** — new dev-surface planning artifacts (decision summary, per-section rules, drop list, worked BEFORE/AFTER examples, post-sweep reconciliation tables capturing predicted-vs-actual reduction gap). Not shipped to consumers — per project CLAUDE.md, `docs/` is dev-only.

### Why no schema revision

`schemas/pipeline-artifact.schema.md` revision stays at `5`. Anchor IDs (`S-NAME-NNN`), frontmatter shapes, hook contracts, env-var toggles, pipeline-artifact types, and `<artifact>.lock.yaml` sidecar pairing all unchanged. All 12 `npm test` suites (`validate / hooks / hash-stamper / scaffold / extensions / agents / bash-strip / drift / removability / metrics / bootstrap / probe`) green without modification.

### Why MAJOR

The sweep introduces no backwards-incompatible changes for consumer pipelines (no anchor renames, no frontmatter shape changes, no schema revision bump, no hook-contract changes, no removed env-var toggles, no removed pipeline-artifact types). MAJOR signal is maintainer prerogative — closes the v2.* release window per `docs/v3.0-prompt-tightening-brief.md` and signals a coordinated surface-wide refactor (30+ files touched, every agent + skill body rewritten against a new canonical template). Consumers upgrading from v2.x experience a non-breaking refactor: existing pipelines remain valid, every load-bearing rule preserved.

### Migration

1. Pre-upgrade: no action required. Existing pipelines under `.claude/.orchestra/pipeline/<id>/` remain valid.
2. Upgrade: `claude plugin update orchestra` (or reinstall via marketplace).
3. Post-upgrade: start new pipelines via `/orchestra <intent>`. Old artifacts continue to validate against `schemas/pipeline-artifact.schema.md` revision `5`.

---
*Release-time provenance: 12 internal validators + streamline fixture all green at commit time. Consumer-install smoke chain steps (b)–(e) (`/plugin marketplace add`, `/plugin install`, `/orchestra help`, `/orchestra <intent>` in throwaway dir) deferred at maintainer discretion. Step (a) (`claude plugin validate .` against `marketplace.json`) ran green prior to commit motion.*

## [2.2.2] — 2026-05-07

Patch release closing two follow-up gaps surfaced during the smoke run at `/tmp/orchestra-smoke-9` after v2.2.1 shipped. (1) The greenfield stack-elicitation override added in v2.2.1 (`agents/product.md` step 5) **existed but never fired**: bootstrap writes `primary_language` / `framework` at the top level of `local.yaml`, while the override predicate read `local.yaml.discovery.{language,framework}` — a path that never existed (predicate mismatch). Compounding this, `@lead` volunteered a stack recommendation in `intent.yaml.rationale` ("Recommended stack: Python 3.x + Flask"), which downstream `@product` read as authoritative and used to skip its own elicitation gate (context-bleed override). The result: smoke-9 wrote CHARTER + PRD + ADR-0001 with Python+Flask end-to-end, then the user intervened at PAUSE-3 to redirect to "Java + Spring Boot" — re-baking the stack across already-authored artifacts. (2) Every agent's `<example>` block carried domain-specific priors (URL shortener, `com.acme.transfer`, idempotency keys, Toast component, `transaction_id`, etc.) which biased the LLM toward pattern-matching its actual request onto the example scenario. Example was supposed to teach procedure; instead it was teaching shape.

Net consumer-surface delta: 7 agents touched (`product`, `lead`, `reviewer`, `evaluator`, `backend`, `frontend`, `test`); zero new pipeline-artifact types, flags, env-vars, or schema revisions. Behavior change is restorative: the elicitation gate now fires unconditionally on greenfield (no signal-detection clauses for the LLM to talk itself out of), and `@lead` is forbidden from naming a stack in `intent.yaml.rationale`. Examples are rewritten as numbered-step procedural cheat-sheets with generic identifiers — same procedural arc, no domain priors.

### Changed

- **`agents/product.md` — stack-elicitation gate hardened (RC1+RC2 fix).** Step 5's override predicate is now purely structural: `local.yaml.mode == greenfield` → ask, unconditionally. The previous predicate ("greenfield AND no signal in user prompt OR `local.yaml.discovery.{language,framework}`") had two failure modes: (a) the `discovery.*` path never exists in `local.yaml` (bootstrap writes top-level keys), so the predicate was structurally undefined; (b) the LLM widened "no signal" to include upstream agent recommendations, letting `intent.yaml.rationale` mentions of a stack disarm the gate. New wording adds explicit "treat upstream stack mentions in user prompt / `intent.yaml.rationale` / spawn prompt / `local.yaml` as advisory only; the user's answer is authoritative." Step 1's "read its `discovery:` block" prose dropped (no such block exists). Step 5 example context updated to drop the `discovery.{language,framework}` reference.
- **`agents/lead.md` — no stack recommendation in `intent.yaml.rationale` (RC2 source fix).** Tier discipline section gains one bullet, parallel-shaped to the existing "No PRD/FRS authoring — that's `@product`'s tier" rule: `@lead` MUST NOT name a stack in `intent.yaml.rationale`. Stack elicitation is `@product`'s gate (greenfield) or comes from existing repo signal (brownfield); `@lead` records the decision later via `ADR-0001-stack-choice` only when PRD `S-OPEN-001` carries `ADR-WORTHY:`. This closes the upstream context-bleed that disarmed `@product`'s gate even after RC1 was fixed.
- **`agents/{product,lead,reviewer,evaluator,backend,frontend,test}.md` — example-block prior scrub.** Every `<example>` block on the consumer surface now follows a `Context: <generic situation>` + numbered `Action steps:` shape with placeholder identifiers (`<NNN>`, `<lang>`, `<feature>`). Removed: URL shortener (product, lead), `com.acme.transfer` + `TransferService.transferFunds` + `IOException` (reviewer), `ADR-0001-use-sqlite-wal` + SQLite-vs-Postgres ADR walkthrough (lead, reviewer), `transaction_id` + idempotency-keys + HTTP 409 (backend, evaluator), Toast component + `useToast` hook + 500ms collapse (frontend), `transfer.audit_logs` + log-shipping side channel (test), C-001..C-005 transfer-flavored probe walkthrough (evaluator). The two-block reviewer.md (TSR review + ADR review) keeps both blocks; the two-block evaluator.md collapses to one (the second block was a per-criterion FAIL narration covered by Tier-A's existing line 18 read-only rule). `scripts/test-agents.js`'s structural invariant (`≥1 <example>...</example> per agent body`) stays satisfied.
- **`agents/test.md` — fold-up of the "never invent a fake probe" guard.** The rule lived only inside the example narration; it's now folded into Workflow step 4 as a one-liner: unprobable criteria (no `http_probe` / `db_state` path) → mark `manual_evaluation: true` and append a "Probe gap" row noting why; never invent a fake probe. Per project CLAUDE.md "fold up, don't sprinkle".

### Why no schema revision

These are prompt-content fixes inside agent bodies. No new pipeline-artifact types, frontmatter fields, anchor IDs, or hook contracts. `schemas/pipeline-artifact.schema.md` revision stays at `5`. `validate.js`, `validate-drift.js`, `test-agents.js`, `test-bootstrap.js` all green without modification.

## [2.2.1] — 2026-05-07

Patch release closing two execution-drift gaps surfaced during smoke runs at `/tmp/orchestra-smoke-7` and `/tmp/orchestra-smoke-8`: (1) `@product` silently defaulted greenfield projects to Node.js instead of asking the user for a stack, forcing a CHARTER+PRD revision round at PAUSE-2 once the user redirected to "Java + Spring Boot"; and (2) `@lead` authored `.puml` diagrams using raw `rectangle`/`actor` + `skinparam` shapes styled to look C4 but missing the C4 type semantics — including modeling Tomcat, DispatcherServlet, and Jackson as Components on the L3 Component diagram.

Net consumer-surface delta: 4 files touched (2 agents + 2 skills); zero new pipeline-artifact types, flags, env-vars, or schema revisions. Behavior change is additive: greenfield runs with no stack signal now hit one combined `language + framework` AskUserQuestion before CHARTER `S-FEASIBILITY-001`; `@lead` opens `ADR-0001-stack-choice` before SAD `S-CONTAINERS-001`; all C4 `.puml` files use C4-PlantUML stdlib macros (`Person`/`System`/`Container`/`Component`/`Rel`) — raw shapes are forbidden.

### Changed

- **`agents/product.md` — stack elicitation override (greenfield only).** Step 5 gains a hard-block: when `local.yaml.mode == greenfield` AND no language/framework signal exists in the user prompt or `local.yaml.discovery.{language,framework}`, `@product` MUST emit ONE combined AskUserQuestion (language + framework) BEFORE writing CHARTER `S-FEASIBILITY-001`. The override fires regardless of overall confidence rating and counts toward the 3-question cap (other LOW-confidence questions defer to the revision round if the cap is tight). Fixes the silent Node.js default observed at smoke-7 PAUSE-2.
- **`agents/product.md` — stack-choice ADR seeding in PRD `S-OPEN-001`.** When the stack-elicitation override fires, Step 8 now requires `@product` to (a) write CHARTER `S-FEASIBILITY-001` with the stack as a one-line user-supplied constraint (NOT as an architectural decision under debate), and (b) append `ADR-WORTHY: stack choice — <user-supplied stack> (user-supplied constraint; alternatives = "user constraint, no alternatives evaluated").` to PRD `S-OPEN-001`. This reuses the existing `ADR-WORTHY:` channel — no new trigger added to `@lead`'s ADR-open list.
- **`agents/product.md` — PRD goals stay stack-agnostic.** Step 8 now explicitly forbids stack-specific run/build commands (`./mvnw spring-boot:run`, `npm start`, `python -m uvicorn ...`) and JDK/runtime-version pins from PRD `S-GOALS-001` and `S-METRICS-001`. PRD goals describe HTTP-shaped or behavior-shaped acceptance only; build tool, runtime version, and run commands belong in TDD `S-CONFIG-001` (`@lead`'s tier).
- **`agents/lead.md` — stack-choice ADR sequencing.** Greenfield SAD bootstrap section gains a "Sequencing — stack-choice ADR" paragraph: `@lead` MUST open `ADR-0001-stack-choice.md` and resolve `Status: Accepted` BEFORE finalizing SAD `S-CONTAINERS-001`. SAD container `technology` labels reference the resolved ADR via the lockfile `references[]` array. `S-CONFIG-001` in TDD is named as the canonical home for build-tool/JDK/run commands; PRD-as-stack-agnostic constraint is restated.
- **`skills/c4-architecture/SKILL.md` — MUST/MUST-NOT block (binding).** Every C4 `.puml` MUST start with `!include <C4/C4_Context|C4_Container|C4_Component|C4_Dynamic|C4_Deployment>`, MUST use stdlib macros (`Person`/`System`/`Container`/`Component` plus `*_Ext`/`*Db`/`*Queue`/`*_Boundary` variants and `Rel(...)`), and MUST carry a `title` line. MUST NOT use raw `rectangle`/`actor`/`component`/`package`/`node`/`database` for body elements (they erase C4 type semantics), MUST NOT use raw arrow syntax (`-->`/`->`/`..>`) for relationships, MUST NOT use `skinparam` for body styling, and MUST NOT use generic relationship verbs ("Uses", "Calls"). Closes the smoke-8 violation pattern where labels said "Container" but the macro was `rectangle`.
- **`skills/c4-architecture/SKILL.md` — framework internals are NOT components.** New "What to avoid" subsection plus a forbidden-as-component table (servlet container, `DispatcherServlet`/`FrontController`, HTTP message converters like Jackson/Gson, ORM `SessionFactory`/`EntityManagerFactory`, framework HTTP clients like `RestTemplate`/`WebClient`/`OkHttpClient`). The chain `Tomcat → DispatcherServlet → MyController → Jackson → Client` is request-flow narration, not structure — if needed, it goes in a Dynamic diagram (`<C4/C4_Dynamic>`), not a Component diagram. Closes the smoke-8 TDD Component diagram which modeled all of these as Components.
- **`skills/c4-architecture/SKILL.md` — Component diagrams are optional.** Single-component containers should write `<!-- OMIT: trivial container; single component -->` in the TDD `§S-COMPONENTS` section and set frontmatter `component_count: 0` (mirrors the existing pattern for omitted state-machines: `<!-- OMIT: no lifecycle states -->` + `state_machine_count: 0`). Long-lived containers should prefer auto-generation (Structurizr DSL or annotation-driven) over hand-drawn Component diagrams that rot.
- **`skills/c4-architecture/SKILL.md` — self-check checklist (run before rendering).** New checklist before the "Summary" section enumerating: title present, stdlib `!include` used, every element has name/type-by-macro/description/technology, L1 has no transport protocols, L3 has no framework internals, `Rel(...)` carries a label and protocol/technology, no generic verbs, all arrows unidirectional, plus a stand-alone test ("could a stranger tell what it does, who uses it, and how it's built — without your narration?"). Mirrors c4model.com/diagrams/checklist with orchestra-specific additions.
- **`skills/c4-architecture/SKILL.md` — what-to-avoid additions.** Four new bullets in the "What to avoid" subsection: framework internals as components (cross-link to forbidden table); trivial Component diagrams (cross-link to omit pattern); transport/protocol detail in L1 System Context labels (move to L2); deployment detail (LBs, replicas, K8s pods) on Container diagrams (move to Deployment).
- **`skills/plantuml/SKILL.md` — Graphviz upgraded from optional to required for C4.** Prerequisites table line for Graphviz changed from "optional / Complex layouts" to "REQUIRED for C4 Container/Component diagrams". The C4-PlantUML stdlib's container/component macros invoke Graphviz layout under the hood; without it the render silently falls back to Smetana with poorer layout quality on dense diagrams.

### Why no schema revision

These changes tighten authoring rules inside agent prompts and a skill — they do not introduce new artifact types, frontmatter fields, or anchor IDs. `schemas/pipeline-artifact.schema.md` revision stays at `5` (set by v2.2.0). `validate-drift.js` and `scaffold-artifact.js` continue to pass without modification. The `ADR-WORTHY: stack choice` rule is a new instance of the existing `ADR-WORTHY:` mechanism (introduced pre-v2.0), not a new mechanism.

## [2.2.0] — 2026-05-06

Minor release shipping three coordinated themes from `docs/PRD-004` + `docs/DESIGN-007` + `docs/WORKFLOW-004` (5 PRs):

- **Theme α — backlog mechanism + curation pass.** Replaces five scattered "deferred to v1.1+" sites (PRD-001 §14, PRD-002 §8, PRD-003 §11, DESIGN-005 §14, DESIGN-006 §8, WORKFLOW-002 §5.5 + risk rows) with a single canonical `docs/BACKLOG.md` (28 entries: 12 killed + 16 deferred). Adds `scripts/validate-backlog.js` enforcing the grammar on every `npm test`. Drops consumer-surface roadmap leaks (`agents/backend.md`, `agents/frontend.md`, `commands/orchestra.md`, `skills/task-breakdown/SKILL.md`, `README.md`).
- **Theme β — opt-in design fork.** Adds `--think` and `--delegate` flags to the dispatcher, plus the **PLAN** pipeline-artifact type (5 anchors: Problem / Options ≥3 / Trade-offs / Recommendation / Open). `--think` triggers a one-shot scaffold at `<feature-dir>/planning/<NNN>-PLAN.md` before the first `@lead` spawn; `--delegate` (implies `--think`) adds one user-facing AskUserQuestion gate on `S-OPTIONS-001`, persisting the choice at `planning/PLAN.choice.yaml`. Both flags are no-ops on docs/template/hotfix/review-only intents.
- **Theme γ — consumer-observed cost.** Adds USD cost surfaces to the existing token telemetry. `hooks/lib/rate-card.js` is the single source of truth (Opus 4.7 list price); `metrics-collector.js` computes USD at write-time and persists into `tokens.jsonl` rows (`usd`) + `runs/<id>.json` (`cost_usd`). `scripts/metrics-summary.py` adds three columns (`Cost`, `Δ avg`, `Heaviest`) + cost-trend footer; `scripts/aggregate-metrics.py --cost` adds 30-day daily trend / per-intent distribution / top-5 most-expensive runs. Optional one-line cost banner at `/orchestra` Step 7 closure (default off; opt-in via `ORCHESTRA_METRICS_COST_BANNER=on`).

Net consumer-surface delta: 1 new pipeline-artifact type (PLAN), 2 new dispatcher flags (`--think`, `--delegate`), 1 new env-var toggle (`ORCHESTRA_METRICS_COST_BANNER`). Schema revision `pipeline-artifact.schema.md` 4 → 5. Word counts on the consumer surface decrease net `−37` after Sweep 2 cleanup. `npm test` green: 13/13 chain entries (`validate / hooks / hash-stamper / scaffold / extensions / backlog / agents / bash-strip / drift / removability / metrics / bootstrap / probe`), 122 scaffold + 101 metrics assertions.

### Added

- **Theme α** — `docs/BACKLOG.md` (canonical site for deferred/killed proposals; 28 entries with `BL-NNNN-<slug>` IDs, status enum `proposed | accepted | in-flight | shipped | killed | deferred`); `scripts/validate-backlog.js` (180 lines; hard-fails on missing-body / orphan-section / bad-status / bad-ID / schema-version; soft-warns on ID gaps; wired into `npm test`).
- **Theme β** — `schemas/templates/PLAN.template.md` (new template, slim frontmatter: `id / type / created / revision / feature_id / option_count / recommendation`); PLAN entry in `scripts/scaffold-artifact.js` `TYPE_SPEC` (feature-scoped, `folder=planning`, 5 anchors, no diagrams); PLAN row in `schemas/pipeline-artifact.schema.md` (revision 4 → 5: `planning/` folder layout, type→folder map, no-diagram-required list, type-specific frontmatter section); `agents/lead.md` Workflow step 7 fills the scaffolded PLAN under `--think` (subsequent steps renumbered 7→8 ... 10→11); `commands/orchestra.md` Step 4b intent gate, Step 5(a') one-shot scaffold, Step 5(a'') `--delegate` AskUserQuestion + `PLAN.choice.yaml` sidecar.
- **Theme γ** — `hooks/lib/rate-card.js` (NEW; `RATES_USD_PER_MTOK` constant — Opus 4.7 list price `input $15` / `output $75` / `cache_read $1.50` / `cache_create $18.75` per MTok — and `computeUsd(tokens)` helper); `manifests/runtime-toggles.json` entry `config.metrics-cost-banner` (envVar `ORCHESTRA_METRICS_COST_BANNER`, default off; reserves the `config.*` namespace for dispatcher-side display toggles with no `install-modules` counterpart); `commands/orchestra.md` Step 7 sub-step 2 emits a one-line banner reading `tokens.jsonl` filtered by `run_id` (banner is subagent-only — parent dispatcher cost lands later in `runs/<id>.json` after the Stop hook fires; timing constraint documented inline).
- `docs/PRD-004-backlog-mechanism-and-v2-curation.md`, `docs/DESIGN-007-backlog-and-v2-curation.md`, `docs/WORKFLOW-004-backlog-and-v2-curation.md` — dev-trace for the v2.2.0 motion (none ship to consumers).

### Changed

- **Theme α — dev-surface cleanup (Sweep 1).** `docs/PRD-001.md §14` 50-item body → 1-line pointer to BACKLOG; `docs/PRD-002` + `docs/PRD-003` frontmatter `status: planned` → `shipped` with `shipped_in:`; `docs/DESIGN-005 §14` F-6 row removed (already in BACKLOG); `docs/DESIGN-006 §8` license-clarification + frontend-component-patterns bullets dropped; `docs/WORKFLOW-002` four multi-touch edits (§5.5 list → pointer; line ~227 async PROPOSAL/PAUSE → `BL-0020`/`BL-0021`; line ~266 R12 telemetry promise dropped; lines ~317-318 R11 + R12 risk rows reworded). Net dev-surface diff: 13 insertions, 290 deletions across 7 files.
- **Theme α — consumer-surface cleanup (Sweep 2).** `agents/backend.md` ~L18 + `agents/frontend.md` ~L19 — drop `(deferred to v1.1+)` parentheticals from FE/BE separation rules (active rules retained); `agents/frontend.md` ~L27 — delete orphan FE-skill roadmap line (now `BL-0016`); `skills/task-breakdown/SKILL.md` ~L116 — reword `v1.0.0 / v1.1+` version refs to "current agent role / needs-future-specialist" preserving the defer semantic; `commands/orchestra.md` ~L257 — delete orphan `Deferred (v1.1+):` line that leaked roadmap into `/orchestra help` (`/save`, `/load`, `/orchestra-disagree` → `BL-0028`; `/orchestra legacy` → `BL-0015`); `README.md` bottom — replace `Status: v1.0.0 released 2026-05-03` with `Status: v2.1.0 (current). See CHANGELOG.md`.
- **Theme γ — metrics surfaces.** `hooks/scripts/metrics-collector.js` — `emitSubagentTokens` row gains `usd` field; `emitRunSummary` summary gains `cost_usd` field. `scripts/metrics-summary.py` — three new columns (`Cost`, `Δ avg`, `Heaviest`) + two-line cost-trend footer (median/p90 tokens + USD over last-10 + 15%-warn threshold); older runs without `cost_usd` render `—`. `scripts/aggregate-metrics.py` — new `--cost` flag triggers 30-day daily trend / per-intent distribution / top-5 most-expensive runs; reads pre-computed `cost_usd` (no rate-card duplication on the read side).
- **Theme β/γ schema additions.** `schemas/runtime-toggles.schema.json` — description docs the `config.*` namespace carve-out; `scripts/test-removability.js` skips bidirectional check on `config.*` toggles (no `install-modules` entry expected).
- **Test coverage.** `scripts/test-scaffold.js` — PLAN added to `EXPECTED_ANCHORS`, `EXPECTED_DIAGRAM_KINDS`, `typeFolder` map, `FEATURE_TYPES`, M9 anchor parity loop (113 → 122 assertions). `scripts/test-metrics.js` — 10 new assertions on `computeUsd()` unit shape + `cost_usd` integration shape (91 → 101 assertions).

### Removed

- `docs/optimization-pr-gamma-plan.md` — stale; v2.0 PR #5 already trimmed `commands/orchestra.md` beyond this plan's targets.
- Five scattered "deferred to v1.1+" sections (PRD-001 §14 body, PRD-002 §8 body, PRD-003 §11 body, DESIGN-005 §14 F-6 row, DESIGN-006 §8 follow-up bullets, WORKFLOW-002 §5.5 list) — content reconciled into `docs/BACKLOG.md` (canonical) or dropped where shipped/killed.
- Consumer-surface inline `(deferred to v1.1+)` parentheticals + roadmap lines on `agents/backend.md`, `agents/frontend.md`, `commands/orchestra.md`, `skills/task-breakdown/SKILL.md`, `README.md` (all reconciled into BACKLOG entries).

### Dev-trace

- `docs/PRD-004-backlog-mechanism-and-v2-curation.md` — `/sc:sc-brainstorm` output: problem / decisions / curation / FRS / non-goals / open Qs.
- `docs/DESIGN-007-backlog-and-v2-curation.md` — `/sc:sc-design` output: scope / infra delta / BACKLOG schema / cleanup / PLAN artifact / cost-visibility / OQ resolutions / PR sequencing / risks.
- `docs/WORKFLOW-004-backlog-and-v2-curation.md` — `/sc:sc-workflow` output: 5-PR dependency graph with task IDs, exit gates, smoke gates, risk attachments, release motion §8 hand-off.

## [2.1.0] — 2026-05-06

Minor release. Adds a single consumer-surface skill that packages Andrej Karpathy's observations on LLM coding pitfalls (via [`forrestchang/andrej-karpathy-skills`](https://github.com/forrestchang/andrej-karpathy-skills)) and wires it into the five orchestra agents whose workflows benefit. Skipped for `@evaluator`, `@reviewer`, and `@ship` — their tier-A/B invariants supersede or conflict with the rules.

Net consumer-surface delta: 1 new skill, +5 lines across 5 agent files. Zero behavior change in existing flows; consumers opting into the new skill receive light behavioral nudges during artifact authoring and code editing. See [`docs/DESIGN-006-karpathy-guidelines.md`](docs/DESIGN-006-karpathy-guidelines.md) for the full design rationale.

### Added

- `skills/karpathy-guidelines/SKILL.md` — new consumer-surface skill packaging four behavioral guidelines (*think before authoring*, *minimum surface*, *surgical edits*, *verifiable goals*) rephrased in orchestra's tier vocabulary (scaffolded artifact spans, AskUserQuestion confidence cap, `ESCALATE-<id>.md` gaps, CONTRACT criteria, structural-diff anchors). Includes a tier-by-tier applicability table so the canonical site stays single (per project `CLAUDE.md` "no annotation creep"). No license claim in frontmatter — upstream repository carries `license: null` at GitHub at time of import; text rewritten in orchestra's voice rather than copied verbatim.
- `agents/product.md`, `agents/lead.md`, `agents/backend.md`, `agents/frontend.md`, `agents/test.md` — one-line invocation entry under each agent's `## Skills` block. The same invocation text is used uniformly; per-agent emphasis lives in the skill body's applicability table, NOT duplicated into agent files.
- `README.md` — `## Acknowledgments` section crediting karpathy-guidelines, plantuml, and c4-architecture upstream sources.
- `docs/DESIGN-006-karpathy-guidelines.md` — dev-trace document persisting `/sc:sc-brainstorm` decisions (shape B + adapted-per-tier + skip-3), the tier-mapping rationale per agent, and the file-level change manifest.

### Unchanged (deliberate skip-3)

- `agents/evaluator.md`, `agents/reviewer.md`, `agents/ship.md` — these three agents do NOT invoke `karpathy-guidelines`. `@evaluator`'s `≥80% calibration-anchor` rule supersedes the new skill's "ask if uncertain" guidance; `@reviewer`'s `code-review` severity rubric is the canonical site for review wisdom and conflicts with the diff-shaped rules; `@ship`'s gate-driven release flow + `commit-work`'s "one coherent commit per logical feature" already encode the same ground. Layering the new skill on these tiers would create rule-against-rule noise.

### Attribution

- Andrej Karpathy's original observations on LLM coding pitfalls: <https://x.com/karpathy/status/2015883857489522876>
- forrestchang's compilation: <https://github.com/forrestchang/andrej-karpathy-skills>

## [2.0.0] — 2026-05-06

Major release. Two motions ship under the 2.0.0 umbrella: (1) the **doc-output overhaul** (`docs/DESIGN-005-doc-output-overhaul.md`) — pipeline artifact canon collapsed from 14 → 12 + conditional ADRs, provenance moved to `<artifact>.lock.yaml` sidecar, mandatory PlantUML diagrams, scaffold-then-fill template engine, ADR pattern, TSR fold, ANNOUNCEMENT folded into RELEASE; and (2) the **v1.0.1 streamline initiative** (originally targeted for a 1.0.1 patch that never tagged) — agent-body trims, references-file demotions, status-output compression, routing-taxonomy externalization. No automated migration — v1.x consumer projects rerun from intent.

Composite token reduction across the whole release vs pre-streamline baseline: `commands/orchestra.md` 3,141 → 2,520 words (−20%); mean `agents/*.md` 785 → ~660 words (−16%); 11-PR new-feature surface adds the lockfile primitive, scaffold engine, two new skills, validator extensions, schema rewrite, and dispatcher integration.

### BREAKING (doc-output overhaul)

- **Pipeline artifact canon collapsed from 14 → 12 (+ conditional ADRs):**
  - `verify/<NNN>-VERDICT.md` + `verify/<NNN>-CODE-REVIEW.md` → folded into `verify/<NNN>-TSR.md` (single file with single-writer-per-section discipline; `@evaluator` writes `S-EVAL-VERDICT-001` + `S-EVAL-TABLE-001`; `@reviewer` writes `S-REV-VERDICT-001` + `S-REV-FINDINGS-001`; `@ship` writes `S-SHIP-001`).
  - `ANNOUNCEMENT-<NNN>.md` / `ANNOUNCEMENT-vX.Y.Z.md` → folded into `RELEASE-vX.Y.Z.md` `S-ANNOUNCEMENT-001` section.
  - **6 routing-orphan types dropped:** `DOC`, `IMPL-NOTES`, `IMPL-BE`, `IMPL-FE`, `CODE-DESIGN-BE`, `CODE-DESIGN-FE` (declared in v1 schema but no intent ever emitted them). `COMMIT-MSG` is no longer a file artifact (string output of `commit-work` skill only).
  - **3 new types:** `<NNN>-CHARTER.md` (Planning, `mode: full | brief`), `ADR-<NNNN>-<slug>.md` (global flat numbering at `architecture/decisions/`), `<NNN>-TSR.md` (folded VERDICT + CODE-REVIEW).
- **Provenance moved from artifact frontmatter to paired `<artifact>.lock.yaml` sidecar.** Body frontmatter retains only `id`, `type`, `created`, `revision`, `status`, `version` (where applicable), and type-specific minimal fields. `sections:` and `references:` blocks are NO longer in body frontmatter — they live in the lockfile alongside a NEW `diagrams:` block tracking PlantUML source + rendered hashes.
- **Diagrams MANDATORY per artifact type** (PlantUML source `.puml` → SVG via the `/plantuml` skill; both hashed in lockfile):
  - FRS: use-case
  - SAD: C4 L1 (Context) + C4 L2 (Container)
  - TDD: C4 L3 (Component) + sequence-per-flow + ER + state-machine *(omittable when no lifecycle)*
  - CONTRACT: service-contract + sequence-per-critical-criterion
  - TASKS: DAG
  - RUNBOOK: deploy + rollback
  - ADR: status state-machine (NON-omittable)
- **Authoring switched to scaffold-then-fill.** Dispatcher (parent context, has `Bash`) runs `scripts/scaffold-artifact.js` before each agent spawn; agents fill `<!-- FILL: -->` placeholders and Write back. The validator's `structural-diff` mode rejects anchor drift; `lockfile-presence` rejects scaffold-managed artifacts without a paired lockfile.
- **`hooks/scripts/hash-stamper.js` now operates only-when-paired** — writes to `<artifact>.lock.yaml` only when one exists alongside; legacy v1 hand-authored writes pass through unstamped. `validate-drift.js` retains a backward-compat path that reads from inline frontmatter when no lockfile is paired (so v1 dev fixtures still pass).
- **v2.0 ADR workflow:** `@lead` proposes (`status: proposed`); `@reviewer` reviews (APPROVED → flip to `accepted`; REQUEST_CHANGES → bump `review_round`); 3-round circuit breaker → `DEADLOCK-ADR-<NNNN>.md`. State-machine diagram is MANDATORY for every ADR.
- **No automated migration.** v1.x consumer projects with existing `pipeline/` artifacts must rerun from intent. Mid-flight features that started under v1 should be re-routed via `/orchestra resume` after a clean `git init` of the feature dir, OR finished manually under v1 frontmatter conventions before upgrading.

### Added (doc-output overhaul, 11 commits)

- `scripts/scaffold-artifact.js` — Node ESM atomic template engine; single CLI; idempotent-by-default with `--force` override; ADR auto-numbers next NNNN; CHARTER mode dispatch; non-orchestra path refused.
- `scripts/bump-version.js` — atomic 3-file version updater (VERSION + package.json + plugin.json); surgical regex on the JSON `"version"` field preserves all other formatting + key order; SemVer 2.0.0 input validation.
- `schemas/lockfile.schema.md` — normative spec for `<artifact>.lock.yaml` (top-level keys, grammar constraint, bidirectional invariant with body anchors, diagram-kind enum).
- `schemas/templates/_lockfile.template.yaml` + 14 type templates: `CHARTER-full`, `CHARTER-brief`, `PRD`, `FRS`, `SAD`, `TDD`, `API.openapi.yaml`, `CONTRACT`, `TASKS`, `TEST`, `TSR`, `RELEASE`, `RUNBOOK`, `ADR`.
- `skills/plantuml/` — cloned from upstream `SpillwaveSolutions/plantuml@MIT` (license verified). Trimmed `examples/` (orchestra is language-agnostic). Ships `convert_puml.py` + `process_markdown_puml.py` + 19-diagram-type reference docs.
- `skills/c4-architecture/` — single-file skill with C4-PlantUML stdlib output (`!include <C4/C4_Container>` + macros). Structure adapted from Mermaid-output upstream; output is original work (`origin: orchestra-internal`).
- `scripts/validate.js` 7 new pure-function validators: `validateStructuralDiff`, `validateLockfilePresence`, `validateLockfileGrammar`, `validateDiagramHashes`, `validateOrphanTypes`, `validateFoldCorrectness`, `validateSoftCap`.
- `scripts/test-validate-extensions.js` — 45 mutation assertions across the 7 validators (M11–M19 + soft-cap warn/strict + inverse fixtures).
- `scripts/test-scaffold.js` — 116 mutation assertions covering every type's anchor parity, lockfile shape, diagram seeding, idempotency, ADR numbering, CHARTER mode dispatch, bad-input exit codes.
- `scripts/test-hash-stamper.js` — 27 mutation assertions covering only-when-paired sidecar mode, `.puml`/`.svg` whole-file hashing, references resolution, env opt-out.
- `commands/orchestra.md` Step 5(a) pre-spawn scaffold + Step 5c ADR-open subroutine + Step 6 v2 narration + Step 7 expanded terminal-state regex.
- New exception types: `ESCALATE-ADR-<NNNN>.md` (reviewer/implementer flags an undocumented system-affecting decision), `DEADLOCK-ADR-<NNNN>.md` (3-round ADR circuit-break).
- `docs/DESIGN-005-doc-output-overhaul.md` — 643-line design doc capturing the entire v2 motion (canon, schemas, scaffold-engine, validator extensions, render path, ADR workflow, TSR co-authorship, hash-stamper sidecar mode, agent + skill edit list, PR sequencing, follow-ups, decision trace).

### Changed (doc-output overhaul)

- `hooks/scripts/hash-stamper.js` — rewritten for only-when-paired sidecar mode. Writes to `<artifact>.lock.yaml` instead of inline frontmatter. Adds `.puml` + `.svg` whole-file hashing into `diagrams[]` entries. References resolution prefers upstream lockfile; falls back to upstream frontmatter for v1 legacy.
- `hooks/lib/section-hash.js` — adds `hashFile(absPath)` whole-file hasher; ANCHOR_RE regex updated from `S-[A-Z]+-\d{3}` to `S-[A-Z]+(?:-[A-Z]+)*-\d{3}` to support multi-segment IDs (`S-NON-GOALS-001`, `S-EVAL-VERDICT-001`, `S-ADR-INDEX-001`). Pre-existing v1 silent-drop bug fixed (smoke-6's PRD had `S-NON-GOALS-001: hash: TBD` invisibly because v1 regex didn't match).
- `scripts/validate-drift.js` — dual-mode read: lockfile preferred, inline frontmatter fallback for v1 legacy.
- `schemas/pipeline-artifact.schema.md` — major rewrite (revision 3 → 4): drops 9 dead/folded types, adds 3 new types, adds diagram-slot requirements table, updates body-grammar regex doc, cross-links lockfile schema.
- `schemas/routing-taxonomy.md` — per-intent updates (revision 1 → 2): TSR replaces VERDICT + CODE-REVIEW across all intents; CHARTER (mode: brief) replaces `INTENT-<id>.md` for template/docs/review-only intents; ADR conditional sub-flow added to feature/refactor.
- All 8 agents (`product`, `lead`, `backend`, `frontend`, `test`, `evaluator`, `reviewer`, `ship`): `tools:` arrays preserved (tier discipline intact); workflows switched from freehand authoring to scaffold-fill via dispatcher pre-spawn. `lead` adds full ADR-open subroutine. `reviewer` adds ADR-review subroutine + ESCALATE-ADR retroactive flagging. `evaluator`/`reviewer`/`ship` enforce single-writer-per-section discipline on TSR.
- 9 of 11 skills updated (`code-review`, `commit-work`, `cut-release`, `evaluator-tuning`, `project-discovery`, `qa-test-planner`, `resume-pipeline`, `task-breakdown`, `write-contract`): output paths updated for v2 canon (TSR, CHARTER, lockfile); diagram authoring steps added; probe DSL re-statement removed from `qa-test-planner`'s output (probes live in CONTRACT only).
- `scripts/test-streamline-fixture.sh` — adds orphan-type smoke gate (rejects `*-VERDICT.md`/`*-CODE-REVIEW.md`/`ANNOUNCEMENT-*.md`/`*-IMPL-{NOTES,BE,FE}.md`/`*-CODE-DESIGN-{BE,FE}.md` anywhere in repo) + integrates `test-validate-extensions.js`.
- `package.json` `test` chain — adds `test:hash-stamper` + `test:scaffold` + `test:validate-extensions` between existing entries; adds `bump-version` script.

### Removed (doc-output overhaul)

- Artifact types `VERDICT`, `CODE-REVIEW`, `ANNOUNCEMENT`, `DOC`, `IMPL-NOTES`, `IMPL-BE`, `IMPL-FE`, `CODE-DESIGN-BE`, `CODE-DESIGN-FE`, `COMMIT-MSG-as-file` (folded or never routed).
- Inline `sections:` and `references:` blocks from artifact body frontmatter.
- Inline probe DSL re-statement in TEST.md (probes live in CONTRACT only).
- Phantom `S-ADR-0001:` body slot from SAD (replaced by `S-ADR-INDEX-001` index table).
- `verify/<NNN>-CRITERIA.md` singleton (deprecated; just the TSR `S-EVAL-*` halves now).

### v1.0.1 streamline initiative (shipped under 2.0.0; never tagged separately)

The PR-by-PR detail below was originally documented under `[Unreleased]` for a v1.0.1 patch that never tagged. It ships under the 2.0.0 umbrella. Token reduction targets and per-PR exit gates are preserved verbatim from the original entries.

### Refactor (PR #5 v1.0.1 — streamline plugin loading: status output + routing taxonomy externalize)

Closes WORKFLOW-003 §S-PRTASKS-001 PR #5 (T-S41, T-S42, T-S43, T-S44). Implements PRD-003 §S-FRS-001 F-9 (status-output compress) and F-10 (routing taxonomy externalized to consumer-surface schema). Final PR of the v1.0.1 streamlining initiative.

Files changed:

- `schemas/routing-taxonomy.md` (new) — normative consumer-surface schema mapping `intent.yaml.intent` to authorized agents and artifact whitelist. Per-intent H2 anchors (`#feature`, `#hotfix`, `#template`, `#refactor`, `#docs`, `#review-only`). Each section: ordered agent list + full artifact whitelist + excluded-artifacts rationale. ~600 words.
- `commands/orchestra.md` `## Status output` — 23 lines → 14 lines. Replaced the bulleted prose with a 4-row event-format table (cleaner reference, same behavior). Banner template block preserved verbatim. Saves ~60 words.
- `commands/orchestra.md` Step 5 — 2-column table (intent → agents in order; whitelist anchor) replaces the previous 3-column table that inlined the full artifact list. Spawn-prompt mandate (line 153 area) updated to reference the schema by anchor with a 1-line backstop summary inline. Saves ~250 words.

Token reduction this PR (commands/orchestra.md, words; measured):

| File | Before | After | Δ |
|---|---|---|---|
| commands/orchestra.md | 2,386 | 2,273 | −113 |

WORKFLOW-003 §2.5 PR #5 exit target was ≤2,000 (down from 2,386). Landed at 2,273 — missed by 273 words. Honest delivery; the remaining content is operational and load-bearing (smart-router Steps 1-7, AskUserQuestion budget, hooks glossary, sprint subcommand, help message). The aggressive ≤2,000 target was estimated assuming additional cuts that aren't justifiable within F-9 + F-10 scope without losing semantic content.

Final cumulative state through PR #5 (vs pre-streamlining baseline):

- `commands/orchestra.md` (always-loaded L1): 3,141 → 2,273 words (−868 = **−28%**).
- Mean `agents/*.md` (per-spawn L2): 785 → 671 words (−15%, locked in PR #4).
- `agents/lead.md` (highest-leverage orchestrator): 1,128 → 689 (−39%).
- `skills/*` count: 8 → 11 (3 new skills: `resume-pipeline`, `shutdown-team`, `cut-release`).
- `skills/*/references/*` files: 1 → 3 (calibration-examples baseline + autonomy-diagnostic + smoke-checklist). routing-taxonomy.md is filed under `schemas/` not `references/`, so the references count is unchanged this PR.
- `schemas/*.md` files: 1 → 2 (pipeline-artifact.schema.md baseline + routing-taxonomy.md).

Spawn-prompt mandate change (subtle but load-bearing):

Before: dispatcher inlined the FULL artifact list into every Step-5 spawn prompt (~30-40 tokens × 6 spawns per feature run = ~200 tokens).

After: dispatcher inlines a 1-line summary + schema anchor pointer (~15 tokens × 6 spawns ≈ 90 tokens). Agents Read `schemas/routing-taxonomy.md#<intent>` only when the inline summary is insufficient — the common path skips the Read entirely.

R-3 mitigation (DESIGN-004 §S-RISKS-001): the 1-line backstop summary inline is what lets agents stay decisive without an external Read. If the summary drifts from the schema, the schema is canonical for artifact whitelists; the dispatcher table is canonical for spawn order. Both must update in sync.

Smoke gate (PR #5 exit):
- node scripts/test-agents.js: OK
- node scripts/validate.js: OK
- bash scripts/test-streamline-fixture.sh: PASS
- Manual whitelist-enforcement smoke (6-intent + 1 negative): deferred to interactive verification per fixture's printed checklist.

### Refactor (PR #4 v1.0.1 — streamline plugin loading: references demotion)

Closes WORKFLOW-003 §S-PRTASKS-001 PR #4 (T-S34, T-S35, T-S38, T-S39, T-S40). Implements PRD-003 §S-FRS-001 F-7 (autonomy diagnostic to references file per D-2 override) and a re-scoped F-8 (heavy reference material moved out of agent bodies into `skills/*/references/`).

T-S33 was removed in PR #0 per D-2 override (no `classify-autonomy` skill). T-S36/T-S37 were no-ops — the severity rubric already lives canonically in `skills/code-review/SKILL.md:25-30`, NOT duplicated in `agents/reviewer.md`. WORKFLOW-003 assumed an inline duplication that doesn't exist; pragmatic re-scope skips them.

T-S38 was re-scoped from "RELEASE/RUNBOOK/ANNOUNCEMENT body templates" (which also don't exist inline in `agents/ship.md`) to "smoke-test 5-step chain" — the actual heavy prose in ship.md is the 200-word smoke-test paragraph at line 70, not phantom body templates. Honors F-8's intent (extract heavy reference material from agent bodies) while correcting the task description.

Files changed:

- `skills/task-breakdown/references/autonomy-diagnostic.md` (new) — full 5-Q diagnostic + 3-axis decomposition + Consultant-inversion paragraph + worked example, lifted verbatim from `agents/lead.md:50-81`. Filed under `task-breakdown/` per D-2 lock-in. ~600 words.
- `skills/cut-release/references/smoke-checklist.md` (new) — canonical 5-step pre-release smoke chain, lifted from `agents/ship.md:70` and elaborated with failure-mode history + "why CI is insufficient" rationale. Loaded by `@ship` as Step 1 of its workflow when invoked via `cut-release`. ~350 words.
- `agents/lead.md` — `## Autonomy classification` section: 32 lines → 5 lines. Read-on-spawn directive + precedence rules + R-2 backstop. Saves ~470 words from `@lead`'s body per spawn after the first. Body word count: 954 → 689 (−265, measured).
- `agents/ship.md` — Step 1 of `## Workflow`: 1 paragraph (~200 words) → 3 lines. Step retains the smoke-test gate semantics; full chain lives in references file. Body word count: 854 → 766 (−88, measured).

Trigger semantics for the new references files:

- `@lead` Reads `skills/task-breakdown/references/autonomy-diagnostic.md` ONCE per feature_id, on first spawn. Subsequent spawns and `/orchestra resume` do NOT re-Read — the level is locked in `intent.yaml`. Backstop: missing Read defaults to `DRAFT_AND_GATE` + warning event.
- `@ship` Reads `skills/cut-release/references/smoke-checklist.md` exactly when the `cut-release` skill fires (i.e., `/orchestra release`). Not loaded for any other agent or any other subcommand.

Token reduction this PR (per agent, words; measured):

| Agent | Before | After | Δ |
|---|---|---|---|
| lead | 954 | 689 | −265 |
| ship | 854 | 766 | −88 |

Mean across all 8 agents: 715 → 671 (−44). Now under the WORKFLOW-003 §2.3 PR #3 mean target of ≤700 (achieved retroactively in PR #4 because lead/ship savings — particularly lead — were larger than estimated). Also caught a leaky cite I introduced during PR #4 authoring (`PRD-003 §S-DECISIONS-001` in the new autonomy-diagnostic.md references file) — validator surfaced it pre-commit; rephrased to drop the dev-trace cite per CLAUDE.md "Consumer surface MUST NOT cite developer-surface artifacts" rule.

`skills/*/references/*` files: 1 → 3 (was originally 1 baseline; +2 from this PR). PR #5's routing-taxonomy externalization will bring it to 4.

WORKFLOW-003 corrections logged (out of PR #4 scope; future workflow pass):

- T-S33 removed in PR #0 per D-2 override.
- T-S36/T-S37 were no-ops (severity rubric not duplicated inline).
- T-S38 re-scoped from "release templates" to "smoke-test chain".
- WORKFLOW-003's task descriptions assumed inline structures that don't exist in two places (PR #4 here, plus PR #1's `manifest.json` reference). Lesson: future workflow drafts should be authored after a measured pass through actual files.

### Refactor (PR #3 v1.0.1 — streamline plugin loading: tier-discipline collapse)

Closes WORKFLOW-003 §S-PRTASKS-001 PR #3 (T-S22..T-S32). Implements PRD-003 §S-FRS-001 F-5, F-6 — P1 cleanup tier of the streamlining initiative. The `## Tier discipline` + `## Hard boundaries` two-section pattern across all 8 agents collapses to a single `## Tier discipline` section: the tier letter + a one-line note that the `tools:` frontmatter is authoritative, followed by **only** agent-specific operational rules. Pure prose-only tier rules (the may/may-NOT lists that just restated the `tools:` array) are deleted per F-5: "Tier enforcement remains entirely via the `tools:` frontmatter."

Token reduction (per agent, words):

| Agent | Before | After | Δ |
|---|---|---|---|
| backend | 589 | 524 | −65 |
| frontend | 573 | 519 | −54 |
| product | 577 | 524 | −53 |
| reviewer | 867 | 744 | −123 |
| test | 808 | 761 | −47 |
| ship | 910 | 854 | −56 |
| evaluator | 974 | 840 | −134 |
| lead | 981 | 954 | −27 |
| **Total** | **6,279** | **5,720** | **−559** |
| **Mean** | **785** | **715** | **−70** |

Mean target was ≤700 (per WORKFLOW-003 §2.3 PR #3 exit). Actual landed at 715 — missed by 15 words/agent (~2%). Reviewer and evaluator saw the largest savings (−123 / −134) because their `## Hard boundaries` sections had the highest density of tier-restating bullets that collapsed cleanly. Lead saw the smallest (−27) because most of its operational rules were already concentrated in `## Hard boundaries` and survived the collapse.

T-S30/T-S31 deletes:
- `agents/evaluator.md` `## Task-status derivation (T-A; do NOT self-report)` section deleted (5 lines, ~50 words). The T-A `tools:` array (no Edit/MultiEdit) makes self-update of `plan/<NNN>-TASKS.md` structurally impossible — the prose was annotation creep, not load-bearing rule. Status derivation logic remains canonical at `commands/orchestra.md:233-236` (`/orchestra resume` Step 3).
- `agents/reviewer.md` same section deleted (5 lines, ~50 words). Same rationale.

What was preserved per agent (operational rules — NOT tier rules):
- backend: "only `@evaluator` runs verdict-bearing tests"; "do not interpret a green test run as success"; "do not touch frontend files"; upstream/release artifact scope rules; ESCALATE-ARCH for new infra.
- frontend: 4-state contract (loading/empty/error/success); accessibility AA; "do not touch backend"; ESCALATE-DESIGN for design-system mods.
- lead: "no code or tests"; CONTRACT must be probable; confidence-tier dialogue (HIGH=0/MEDIUM=1/LOW=2-3); 3 rejection rounds → DEADLOCK.
- product: "no source/tests/build config"; "no system design"; greenfield/brownfield Pattern B negotiation; "no pre-grading".
- reviewer: ≥80% confidence threshold; 4-round REQUEST_CHANGES → DEADLOCK; Critical → auto-REQUEST_CHANGES; "never patch the diff".
- ship: open DEADLOCK/gate/REQUEST_CHANGES blocks release; no review reversal; conflict-resolution between agents; drift-on-confirmed blocks release.
- test: cannot run tests yourself; mocks only at integration boundaries; every CONTRACT criterion needs ≥1 probe; 4-axis coverage matrix.
- evaluator: source/tests/CONTRACT all read-only; ≥80% confidence threshold; calibration Case 7 (critical-failure outranks probe results).

WORKFLOW-003 §2.3 estimated mean `wc -w agents/*.md` ≤ 700 (down from ~870). Actual delivery is recorded in this PR's smoke-fixture output. Pattern continues from PR #1/#2: estimates ran ~2× optimistic; actual savings positive but short of target by ~10–30%. Each PR is dialing in measurement accuracy.

### Refactor (PR #2 v1.0.1 — streamline plugin loading: subcommand demotion)

Closes WORKFLOW-003 §S-PRTASKS-001 PR #2 (T-S12..T-S14, T-S16..T-S21). Implements PRD-003 §S-FRS-001 F-4 — P0 demotion tier of the streamlining initiative. Net effect: the rare-path subcommands (`/orchestra resume|shutdown|release`) move out of the always-loaded dispatcher body into per-subcommand skills, paying their token cost only when actually invoked. Per D-1 (locked in PR #0): per-subcommand skills, not a single combined skill.

- `skills/resume-pipeline/SKILL.md` (new) — full topological-walk algorithm currently inline at `commands/orchestra.md:220-242`. ~500 words. Loaded only when `/orchestra resume` fires.
- `skills/shutdown-team/SKILL.md` (new) — in-session teardown algorithm. ~250 words. Loaded only when `/orchestra shutdown` fires.
- `skills/cut-release/SKILL.md` (new) — gate verification + RELEASE/RUNBOOK/ANNOUNCEMENT authoring + commit-work invocation. ~300 words. Loaded only when `/orchestra release` fires.
- `commands/orchestra.md` — five subcommand bodies replaced with dispatch shims:
  - `/orchestra release` (lines 196–201): 4-step body → 3-line shim invoking `cut-release`. Saves ~70 words.
  - `/orchestra commit` (lines 203–209): 6-line body → 1-line shim (commit-work skill was already in use; just trim prose). Saves ~40 words.
  - `/orchestra metrics` (lines 211–217): keep bash one-liner; cut surrounding prose. Saves ~25 words. T-S15 (skills/report-metrics/) explicitly NOT created — the metrics one-liner is too small to warrant its own skill, and T-S19 already mandates the inline keep. Caught WORKFLOW-003 internal contradiction between T-S15 and T-S19 during execution; T-S19 wins.
  - `/orchestra resume` (lines 219–242): 24-line body → 4-line shim invoking `resume-pipeline`. Saves ~430 words.
  - `/orchestra shutdown` (lines 244–254): 11-line body → 4-line shim invoking `shutdown-team`. Saves ~150 words.

T-S15 deferred (not implemented): per the contradiction above. Skills now created: 3 (resume-pipeline, shutdown-team, cut-release), not the 4 originally specified in WORKFLOW-003 §S-OVERVIEW-001.

Skill-triggering reliability (R-1 from DESIGN-004 §S-RISKS-001): each shim invokes its skill by explicit name (`invoke the cut-release skill`), not by auto-activation. Plugin-dev's auto-trigger via description-matching is a fallback, not the primary path. Subcommand parity smoke is the load-bearing exit gate; pre-PR baseline captured per `scripts/test-streamline-fixture.sh`.

### Refactor (PR #1 v1.0.1 — streamline plugin loading: P0 cleanup)

Closes WORKFLOW-003 §S-PRTASKS-001 PR #1 (T-S01..T-S09, T-S11). Implements PRD-003 §S-FRS-001 F-1, F-2, F-3 — the P0 cleanup tier of the streamlining initiative. Net effect: ~1,200 tokens saved per typical `/orchestra` feature run, with no behavior change. Smoke-test parity gated by static validators (`test-agents.js`, `validate.js`) since the smoke fixture (`scripts/test-streamline-fixture.sh` per WORKFLOW-003 P-S05) is not yet in place — full smoke chain runs before v1.0.1 RELEASE per the project's `feedback_smoke-before-release-docs` discipline.

- `agents/lead.md` — Routing-taxonomy guard collapsed from 14-line table to 3-line directive (T-S01). The dispatcher already enforces the whitelist at `commands/orchestra.md:153-156`; the agent-side restatement was defense-in-depth that cost ~150 tokens per `@lead` spawn. Schema-citation block (line 62 area) collapsed to single-line citation per F-2 (T-S02).
- `agents/product.md`, `agents/reviewer.md`, `agents/test.md`, `agents/ship.md`, `agents/evaluator.md` — schema-citation blocks each collapsed to single-line citation preserving the type-specific section list (T-S03..T-S07). Boilerplate prose explaining what `sections:` is moves into the schema doc itself; type-specific keys stay inline because they're agent-specific. ~80 tokens × 6 agents = ~480 saved per multi-agent run.
- `commands/orchestra.md` — `### Runtime hooks` table compressed from verbose 7-row prose (~600 tokens) to 5-row glossary (~150 tokens) (T-S08). Full hook prose moved to new dev-surface doc `docs/HOOKS.md`. The `## Invariants` block at line 13 already establishes hook ownership of events; the verbose table was duplicated runtime context that the model couldn't act on.
- `docs/HOOKS.md` — new dev-surface doc holding the full hook prose (T-S09). NOT loaded into consumer runtime context. Audience: plugin maintainers editing `hooks/scripts/*.js` or `hooks/hooks.json`.

WORKFLOW-003 corrections noted (will be applied in a later pass — out of PR #1 scope per surgical-changes discipline):

- T-S10 (version bump) deferred. WORKFLOW-003 referenced `manifest.json` which doesn't exist; the actual file is `.claude-plugin/plugin.json`. Per the project's `[Unreleased]` accumulation discipline (this CHANGELOG line 9), version flip happens at release-cut time, not at every PR.
- T-S11 lands as this CHANGELOG entry under `## [Unreleased]` (no per-PR version section).

Pre-existing drift NOT fixed in this change: `agents/lead.md`'s reference to `S-DAG-001` for the TASKS section persists (canonical anchor per `skills/task-breakdown/SKILL.md` is `S-TASKS-001`). Out of scope per surgical-changes discipline — same carve-out applied in the prior `/orchestra resume` PR (CHANGELOG entry above).

### Added (`/orchestra resume` + per-task Status tracking)

`plan/<NNN>-TASKS.md` `S-TASKS-001` table now carries optional `Status` / `Updated by` / `Updated at` columns. Implementer-tier owners (`@backend`, `@frontend`) self-report by flipping their row from `pending` to `in_progress` on pickup and to `done` on exit-criterion completion, re-stamping `S-TASKS-001.hash: TBD` on each write. Read-only-tier owners (`@evaluator`, `@reviewer`) do NOT self-report — their task status is derived at read time from the verdict frontmatter they own (`@evaluator` ⟺ `verify/<NNN>-TEST.md.verdict ∈ {PASS, FAIL}`; `@reviewer` ⟺ `verify/<NNN>-CODE-REVIEW.md.verdict ∈ {APPROVED, REQUEST_CHANGES}`). T-A tier discipline preserved — only T-C implementers gain a write target on TASKS.md. New `/orchestra resume [<feature-id>]` subcommand walks `pipeline/*/` dirs, identifies in-flight features by terminal-artifact absence, finds the next non-`done` task in the DAG (deriving T-A and T-B status from the artifacts they own), and respawns the owner with a resume-context prompt. Idempotent: re-spawning a partially-done owner is safe — owner Reads existing artifacts before re-writing.

Mock-test-phase delivery: ships end-to-end (state + subcommand + per-tier derivation) under `[Unreleased]`, no version flip. `S-TASKS-001.confirmed: false` is the existing escape hatch — `validate-drift` already gates on `confirmed`, so the now-mutable section requires no machinery change. Backward-compatible: TASKS.md authored before this change (no Status column) remain valid; readers treat a missing column as all rows `pending`. Schema bumped `revision: 2 → 3` per the schema's own versioning rule (type-specific keys added).

- `schemas/pipeline-artifact.schema.md` — `revision: 2 → 3`. PLAN-<id> additions: `tasks_pending` / `tasks_in_progress` / `tasks_done` derived counters; `S-TASKS-001.confirmed: false` contract; per-tier derivation rules (T-A from verdict, T-B from artifact existence, T-C self-reported); ESCALATE-on-feature-dir overrides task status with `blocked`; backward-compat note for pre-change TASKS.md.
- `skills/task-breakdown/SKILL.md` — frontmatter template flips `S-TASKS-001.confirmed: true → false` (inline rationale). Body table template gains `Status` / `Updated by` / `Updated at` columns with `pending` defaults; worked example updated; per-tier responsibility split documented inline.
- `agents/backend.md`, `agents/frontend.md` — workflow gains: pickup step flips `pending → in_progress`; exit step flips `in_progress → done` (re-stamp `S-TASKS-001.hash: TBD` on each). ESCALATE-on-block leaves Status `in_progress` so resume surfaces the ESCALATE rather than silently re-spawning.
- `agents/evaluator.md`, `agents/reviewer.md` — new `## Task-status derivation (T-A; do NOT self-report)` block (1 short paragraph each) makes the derivation contract explicit. T-A write whitelist unchanged.
- `commands/orchestra.md` — argument-parser gains `resume` branch; new `## /orchestra resume [<feature-id>]` block (6 numbered steps: enumerate candidates → validate prerequisites → find resume point → REQUEST_CHANGES gate → spawn → continue per Step 5/7); help text adds resume row; `Deferred (v1.1+)` line drops `/orchestra resume`.

Notes:

- No new hook (`task-row-guard` would be a feature add and is deferred per the Ratchet — there's no observed misbehavior to earn it; if a future test run shows an agent mutating another agent's row, ratchet it in).
- No new artifact type — state lives inline in `<NNN>-TASKS.md`, not in a companion `STATE.yaml`. The hash-stamper is untouched: `confirmed: false` is the canonical "this section is mutable by design" flag.
- REQUEST_CHANGES is a decision point, not an automatic transition: resume halts and asks via `AskUserQuestion` rather than auto-respawning the implementer for revision.
- Missing `intent.yaml` fails closed: resume writes `DEADLOCK-resume-<feature-id>.md` rather than re-classifying intent. Correctness, not phase — an unexpected missing-file state could mask a real bug at any phase, including production.
- Pre-existing drift NOT fixed in this change: `agents/lead.md:62` describes the TASKS section as `S-DAG-001` while the canonical anchor (per `skills/task-breakdown/SKILL.md`) is `S-TASKS-001`. Out of scope per surgical-changes discipline.

### Added (mid-run visibility + team shutdown — PRD-002 / DESIGN-003)

Closes spec drift against PRD-001 §347 / §561 / §627 (explicit teardown + `SUMMARY-<timestamp>.md`), which were written into the v1 PRD but never wired into the dispatcher. A user running `/orchestra <intent>` now (a) sees one-line status updates at every filesystem-coupled transition, (b) gets a multi-line banner when an exception artifact (`DEADLOCK-*.md`, `ESCALATE-*.md`, `ESCALATE-ARCH-*.md`) is read, and (c) gets automatic team teardown + a thin `SUMMARY-<feature-id>.md` closure receipt at every terminal state (success / deadlock / escalated / aborted). New `/orchestra shutdown` subcommand for in-session manual abort. The metrics-collector hook gains a `team.shutdown` event mirroring the existing `team.created` posture; SUMMARY artifact writes are enriched with `team_name` / `terminal_state` / `duration_seconds` via the same line-match-without-YAML-parser pattern used for `intent.yaml`.

Pre-flight verification surfaced one design correction: `TeamDelete` is a zero-parameter primitive (verified via ToolSearch 2026-05-05), not the TeamCreate-mirror signature initially assumed. This collapsed cross-session shutdown (structurally impossible) and slimmed the dispatcher edit by ~30 lines. Documented in DESIGN-003 §3.1.4 + §8 R6.

- `schemas/pipeline-artifact.schema.md` — `revision: 1 → 2`. New `SUMMARY-<id>.md` thin-receipt entry replaces the prior PRD-001-era thick-digest stub (`run_id` / `agents_used` / `total_token_in/out` / `features_touched` were never authored and would have duplicated `runs/<run-id>.json`). New entry: `team_name`, `started_at`, `ended_at`, `duration_seconds`, `terminal_state ∈ {success, deadlock, escalated, aborted}`, `artifact_count`. Body-grammar carve-out documented (no `<a id="S-...">` anchors required for SUMMARY since it's parent-authored bookkeeping with no `sections:` block). Layout tree + type→folder map row updated.
- `commands/orchestra.md` — new `## Status output` section (canonical contract for status lines + banners; per project CLAUDE.md folded once, not sprinkled per Step). New Step 7 (terminal-state detection → SUMMARY write → `TeamDelete()` → closing status line). New `## /orchestra shutdown` block (in-session only; rejects `<feature-id>` argument since current session has at most one active team). Argument-parse, runtime-hooks table, and help text updated to include `shutdown` and `PreToolUse:TeamDelete` / `team.shutdown` references.
- `hooks/scripts/metrics-collector.js` — minimal `PreToolUse:TeamDelete` branch emitting `team.shutdown { ts, run_id }` (zero-param primitive; nothing to lift from `tool_input`). New `extractSummaryFields()` mirroring `extractIntentFields()`. SUMMARY enrichment branch in the existing `artifact.written` flow.
- `hooks/hooks.json` — new `PreToolUse:TeamDelete` matcher routing to `metrics-collector.js`.
- `scripts/test-hooks.js` — `TeamDelete` added to the `KNOWN_TOOLS` set; new inverse-sanity check confirming `matcher: "TeamDelete"` passes the validator clean.
- `scripts/test-metrics.js` — three new event-classification cases: `TeamDelete` → `team.shutdown` (no extras); pipeline write of `SUMMARY-001-hello-world.md` → `artifact.written` enriched with `team_name` / `terminal_state` / `duration_seconds`; the SUMMARY case also pins `inferArtifactType("SUMMARY-001-...md") === "SUMMARY"` as a regression anchor for the new schema entry.
- `README.md` — usage block adds `/orchestra shutdown`; "What ships" subcommand count `5 → 6` and the inline enumeration extended.
- Test totals: `test-hooks.js` 79 → 79 (no new orchestra.md fixture assertions needed); `test-metrics.js` 82 → 91 (+9). `validate.js` 0 changes (it does not validate pipeline artifacts; SUMMARY carve-out is preventive at the schema level).

Notes:

- Pre-existing drift NOT fixed in this change: README usage block has long been missing `/orchestra metrics`. Out of scope per surgical-changes discipline.
- Smoke test of the consumer install path (`/tmp/test-orchestra-install`) is the gate before authoring RELEASE/RUNBOOK/ANNOUNCEMENT artifacts. In particular, verify `TeamDelete()` does not throw when called after agents have ended their turns — Orchestra's filesystem-coupled flow assumes SubagentStop drains active members synchronously by the time terminal state is detected; this is the failure mode flagged in DESIGN-003 §8 R6.

### Changed (insight text capture default `false` → `true`)

Flips the `capture_insight_text` default in `metrics/manifest.json` so `★ Insight` bodies emitted by the Explanatory output style are captured into `insights.jsonl` by default. Rationale: the field is the primary observability signal of the metrics pipeline, and prior smoke runs (`/tmp/orchestra-smoke-6/`) shipped 174 rows of empty `text:null` payload — the structural counts (`line_count`, `char_count`) without bodies aren't useful for tuning prompts or aggregating reasoning depth. The privacy triad is now mixed-by-design: `redact_prompts:true` (raw user input stays redacted) + `capture_insight_text:true` (model-emitted prose is captured). Consumers who want full redaction flip `capture_insight_text: false` directly in `<project>/.claude/.orchestra/metrics/manifest.json`; the existing `{...defaults, ...raw}` merge in `ensureManifest` honors that override on every subsequent hook trigger. No schema_version bump (the row shape is unchanged — only the value of an existing field shifts).

- `hooks/scripts/metrics-collector.js` — flip default in `ensureManifest`; update `=== Manifest + redaction ===` and `=== Insight extraction ===` doc-comments to describe the mixed posture and the new opt-out path.
- `scripts/test-metrics.js` — section 4c assertions invert: default capture path now asserts `text === insightBody1`; the manifest-flip half re-emits with `capture_insight_text:false` and asserts `text === null`.
- `docs/PRD-001.md` §9.9 — `manifest.json` default block (line ~810) flips; redaction-axis bullet (line ~819) rewritten to document the mixed posture intent. `body` field-name in the schema example (line 802) is pre-existing doc-drift vs the code's `text` — left untouched (orthogonal cleanup).
- `docs/DESIGN-001-infra.md` §3.6 — pre-flight + privacy-posture rows updated; mixed-posture rationale added inline so future readers don't reach for the symmetric default.
- `docs/DESIGN-002-leaves.md` §15 step 16 — single-line note flipped.

### Changed (artifact rename `<TYPE>-<id>` → `<id>-<TYPE>` + topical folder layout under feature pipeline dir)

Reorganizes pipeline artifacts for grep-ability and review-by-topic. Filenames flip so the feature id sorts first (`001-PRD.md` instead of `PRD-001.md`); per-feature artifacts move into 6 topical subfolders. Singletons (`SAD.md`, `RUNBOOK-vX.Y.Z.md`, `RELEASE-vX.Y.Z.md`) keep their existing locations and naming. Smoke-5 artifacts are not migrated — clean break, the next `/orchestra` run lands in the new layout.

**Layout** under `<project>/.claude/.orchestra/pipeline/<feature_id>/`:

| Folder | Holds | Author |
|---|---|---|
| `requirements/` | `<NNN>-PRD.md`, `<NNN>-FRS.md` | `@product` |
| `interfaces/` | `<NNN>-CONTRACT.md`, `<NNN>-API.openapi.yaml` | `@lead` |
| `design/` | `<NNN>-TDD.md` | `@lead` |
| `plan/` | `<NNN>-TASKS.md`, `<NNN>-IMPL-NOTES.md` | `@lead`, builders |
| `verify/` | `<NNN>-TEST.md`, `<NNN>-CODE-REVIEW.md`, `<NNN>-VERDICT.md` | `@test`, `@reviewer`, `@evaluator` |
| `release/` | feature-scoped `<NNN>-RELEASE.md` etc. (version-singletons stay at `releases/`) | `@ship` |

`intent.yaml` and exception files (`ESCALATE-<id>.md`, `DEADLOCK-<id>.md`) stay at the feature-dir root.

**Frontmatter `id:` flips too** — `id: 001-PRD` instead of `id: PRD-001`, matching the filename stem. The artifact's own `id:` is never used programmatically (only `references[].id` is, and that uses the feature_id matching the dir slug); the field is purely a grep/human label, so flipping it has zero code cost and pays back at search time.

- `schemas/pipeline-artifact.schema.md` — new `## Filename + folder layout` section with directory tree, type→folder map, rationale. Common-shape `id:` example flipped to `<feature_id>-<TYPE>`.
- `hooks/scripts/hash-stamper.js` — `resolveUpstream(type, id, root)` rewritten to use a `TYPE_FOLDER` map + `numericPrefix(id)` extractor. Builds `pipeline/${id}/${folder}/${num}-${TYPE}.${ext}`. Singleton paths unchanged.
- `scripts/validate-drift.js` — same resolver shape (mirrors hash-stamper). Walker still recurses `pipeline/`, `architecture/`, `runbooks/`, `releases/` — folder topology under each feature pipeline dir is implicit.
- 8 agent prompts (`product`, `lead`, `test`, `evaluator`, `reviewer`, `ship`, `backend`, `frontend`) — all path references updated to the new format. Worked examples flipped to concrete `requirements/001-PRD.md` / `verify/001-TEST.md` / `interfaces/001-CONTRACT.md` style. Frontmatter shape examples in `test.md`, `evaluator.md`, `reviewer.md` updated to `id: <NNN>-<TYPE>`.
- `commands/orchestra.md` — Step 5 routing taxonomy table updated for all 6 intents (docs/template/hotfix/feature/review-only/refactor) with new path-aware artifact lists.
- 6 skill files (`code-review`, `evaluator-tuning` + `references/calibration-examples.md`, `qa-test-planner`, `task-breakdown`, `write-contract`) — same sweep. Frontmatter shape examples and worked examples consistently flipped.
- Validator chain: 9/9 green. Counts unchanged.

### Fixed (hash-stamper grammar mismatch + greenfield SAD bootstrap gap)

Surfaced by `/tmp/orchestra-smoke-5`: every artifact landed with `hash-at-write: TBD` unresolved, and `architecture/SAD.md` was never created on the first feature of a greenfield project. Two distinct root causes:

1. **Frontmatter `sections:` shape mismatch.** `schemas/pipeline-artifact.schema.md` mandates a dict keyed by S-ID (`sections: { S-VISION-001: { hash, confirmed } }`), and `hooks/scripts/hash-stamper.js` writes through that shape. But `agents/product.md` and `agents/lead.md` only pointed at the schema doc with no inline guidance, so they emitted a list of `{name, hash-at-write}` instead — silently divergent. The four other agents (`test`, `evaluator`, `reviewer`, `ship`) had inline frontmatter examples already, all dict-keyed, all correct.
2. **Body anchor grammar was contract-only in code.** `hooks/lib/section-hash.js:8` keys section walks off the regex `/^##\s+.*<a id="(S-[A-Z]+-\d{3})"><\/a>/`, but no agent prompt or schema doc said so. Agents authored prose H2s without anchors → `hashSections()` returned `[]` → no hashes ever stamped, even when frontmatter was correct.
3. **Greenfield SAD never bootstrapped.** `agents/lead.md` routing table said feature intent produces `SAD.md (touch)`, but on the first feature of a greenfield project there's nothing to touch. No prompt branch handled the bootstrap case.

Fix shape — keep the contract in **one** place:

- `schemas/pipeline-artifact.schema.md` — new `## Body grammar` section spelling out the `<a id="S-FOO-001"></a>` H2-anchor rule, the regex from `section-hash.js`, and the bidirectional invariant (every `sections:` key needs an anchor and vice versa). Also tightened the authoring contract to state `sections:` is a dict, not a list. Single source of truth.
- `agents/product.md` — replaced the bare schema link with a sharper pointer naming the standard PRD/FRS sections (`S-VISION-001`, `S-GOALS-001`, `S-NON-GOALS-001`, `S-INVARIANTS-001`, `S-ACCEPTANCE-001`) and pointing at the new `#body-grammar` anchor. Workflow updated to remind that each H2 carries its anchor.
- `agents/lead.md` — sharper pointer naming standard CONTRACT/TDD/TASKS sections; new `## Greenfield SAD bootstrap` operational rule (if `local.yaml.mode == greenfield` AND `architecture/SAD.md` absent, bootstrap with `S-VISION-001` / `S-COMPONENTS-001` / `S-ADR-0001` before CONTRACT/TDD/TASKS).
- `agents/test.md`, `agents/evaluator.md`, `agents/reviewer.md`, `agents/ship.md` — one-line pointer to `#body-grammar` added in their frontmatter sections. No inline duplication.
- Validator chain: 9/9 green. Counts unchanged: validate, test-hooks 78, test-agents 16, test-bash-strip 6, validate-drift no-op, test-removability 36/15, test-metrics 82, test-bootstrap 37, test-probe 30. Live verification (consumer-side `/orchestra` run against fresh dir) gated on user invocation.

### Changed (consumer-surface dev/consumer separation — leaky-cite cleanup + schema relocation)

Establishes a hard line between the developer surface (`docs/`, `scripts/test-*`, `scripts/validate*`) and the consumer surface (`agents/`, `commands/`, `skills/`, `hooks/`, `schemas/`). A consumer who installs the plugin has no `docs/PRD-001.md`, `DESIGN-NNN-*.md`, or `WORKFLOW-NNN-*.md` on their machine — every cite of those by section anchor was either a phantom pointer (LLM cannot resolve) or a token-burning deferred Read. Inlining the rule and dropping the cite removes both costs. Schema doc relocated from `docs/` to `schemas/` because it's structurally consumer-facing (every agent that authors a pipeline artifact references it).

- `CLAUDE.md` (new, project-local) — codifies the dev/consumer separation rule, the inline-the-rule fix pattern, and the list of where dev-trace cites SHOULD go (CHANGELOG, commit messages, `docs/`).
- `scripts/validate.js` — new `findLeakyCites(relPath, raw)` exported function + walker over `agents/`, `commands/`, `skills/`. Canary character is `§`; 3 mutation tests assert leaky cite fails red, bare `§` (no doc prefix) fails red, clean body passes. Auto-enforces the rule on every CI run.
- Rename: `docs/pipeline-schema.md` → `schemas/pipeline-artifact.schema.md`. Joins JSON schemas under `schemas/` (existing pattern: `*.schema.json` for machine-readable, `*.schema.md` for prose). Schema is now consumer surface, not dev surface.
- 8 agent files (`backend`, `evaluator`, `lead`, `product`, `reviewer`, `ship`, `test`) — 25 leaky `§` cites stripped. Each cite's rule was already inline beside it; surgery was mostly delete-the-parenthetical.
- `commands/orchestra.md` — 12 leaky cites stripped (dispatcher header, autonomy/pause section header, step bullets, hook table cell, autonomy flag footer). Re-pointed `Step 6` and the `hash-stamper` row at `schemas/pipeline-artifact.schema.md`.
- 6 skill files (`code-review`, `commit-work`, `evaluator-tuning` + `references/calibration-examples.md`, `project-discovery`, `qa-test-planner`, `task-breakdown`) — 16 leaky cites stripped. `commit-work` worked example rewritten to a consumer-generic scenario (`feat(api): T-204 add /v1/users CRUD with cursor pagination`) — old example referenced `WORKFLOW-002-leaves §2.1` and `DESIGN-002 §3.1/§3.5`, which only exist in this repo.
- `schemas/pipeline-artifact.schema.md` (the moved file) — 6 internal `§` cites stripped (frontmatter scope line, prose intro, 4 inline YAML comments). Frontmatter `references.prd` block kept (provenance trail for repo maintainers; not LLM-read).
- 3 dev docs (`docs/PRD-001.md`, `docs/DESIGN-001-infra.md`, `docs/WORKFLOW-001-infra.md`) — path references updated to the new `schemas/` location for consistency.
- Validator chain: 9/9 green. Counts unchanged: validate (no leaks), test-hooks 78, test-agents 16, test-bash-strip 6, validate-drift no-op, test-removability 36/15, test-metrics 82, test-bootstrap 37, test-probe 30.

### Added (W2 — AI agent autonomy levels per PRD §8.14 + DESIGN-002 §10)

Implements the 5-tag autonomy surface (`EXECUTION_ONLY` / `JOINT_PROCESSING` / `OPTION_SYNTHESIS` / `DRAFT_AND_GATE` / `FULL_AUTONOMY`) with `DRAFT_AND_GATE` as the v1.0.0 hard-coded default. Pauses fire only at `DRAFT_AND_GATE`; other levels behave per PRD §8.14.3. Auto-classification by `@lead` is suggestion-only — never changes the level without user assent.

- `scripts/bootstrap-local.js` — fresh `local.yaml` now includes `autonomy:\n  level: DRAFT_AND_GATE`. Emitted by `render()` between `inferred:` and the trailing `notes:` block scalar so it groups with config-style keys.
- `scripts/validate.js` — new `validateLocalYamlContent(relPath, raw)` exported function + `VALID_AUTONOMY_LEVELS` constant. Mutation tests assert `level: BOGUS` fails red, all 5 valid tags pass, missing block passes (runtime applies the default). No file-walk in the plugin repo since `local.yaml` is consumer-side and gitignored.
- `commands/orchestra.md` — new "Autonomy resolution + pause transitions" section. Resolution precedence: `--autonomy=<tag>` CLI flag > `local.yaml.autonomy.level` > `DRAFT_AND_GATE`. Four `→ PAUSE-N` references to a single shared question-shape table (Step 3 fires PAUSE-1 after intent classification; Step 5 fires PAUSE-2/3/4 after `@product` PRD/FRS, `@lead` CONTRACT, `@reviewer` CODE-REVIEW). Compactness optimization: shared table referenced 4 times rather than 4 verbatim `AskUserQuestion` blocks (~17 net lines added vs ~30+ for verbatim). New `--autonomy <tag>` row in the Flags block.
- `agents/lead.md` — new `## Autonomy classification` body section. Vendors DESIGN-002 §10.2 (5-question diagnostic, first-yes-wins) + §10.3 (3-axis decomposition: strategy / decision / execution) for self-contained consumer installs. New Consultant-shaped `<example>` (Postgres vs DynamoDB datastore evaluation → suggested `OPTION_SYNTHESIS`). Frontmatter description unchanged at 9 words, well under the ≤30-word cap.
- `hooks/scripts/metrics-collector.js` — `extractIntentFields()` now returns `autonomy_level`; the field propagates through `artifact.written` events and lands on `runs/<run-id>.json.autonomy_level`. Privacy posture unchanged — autonomy_level is a 5-tag categorical, not user content; same `telemetry_optin: "explicit"` gate applies.
- `scripts/test-bootstrap.js` — render-shape assertion extended for `autonomy:` + `level: DRAFT_AND_GATE` (37 assertions, was 35).
- `scripts/test-metrics.js` — intent.yaml fixture now includes `autonomy_level: DRAFT_AND_GATE`; new section 4d with 4 assertions for `autonomy_level` propagation through `artifact.written` → run summary, plus inverse case for null when YAML omits the field. 82 assertions total (was 78).
- `scripts/test-hooks.js` — new doc-contract fixture asserting `commands/orchestra.md` references all 4 PAUSE-N transitions, the `--autonomy` flag, all 5 enum tags, the `AskUserQuestion` primitive, and the `local.yaml.autonomy.level` fallback. Pins spec→dispatcher fidelity. 78 assertions total.
- `CHANGELOG.md` — this entry.

### Changed (spec backfill — PRD/DESIGN/WORKFLOW revisions for W3 + W2 forward-spec)

Backfills the canonical spec for already-shipped W3 metrics work and forward-specs the W2 autonomy surface. PRD revision bumped 4→5. Commit `71e19ae`.

- `docs/PRD-001.md` — new `### 8.14 AI Agent Autonomy Levels` invariant (anchor `S-AUTONOMY-001`) with 5-tag table, default precedence, 4 pause transitions, auto-classification protocol, telemetry. §9.1 gains `/orchestra metrics` row + `--autonomy <tag>` flag. §9.9 fully rewrites the metrics schema with the shipped 5-sink reality (events.jsonl + tokens.jsonl + runs/<id>.json + insights.jsonl + manifest.json) and explicit privacy posture (`redact_prompts:true`, `capture_insight_text:false`, `telemetry_optin:"explicit"`). §9.11 reflects script-first bootstrap. §9.12 adds `autonomy: { level: <tag> }` to the `local.yaml` schema. §11.1 adds `test-bootstrap.js`, extends `test-metrics.js`, documents the aux tooling table. §12 extends the prepublishOnly chain.
- `docs/DESIGN-001-infra.md` — §2.1 plugin.json shape clarified (no redundant `hooks` field — auto-discovered by Claude Code; author as `{ "name": "..." }` object form; relative paths require `./` prefix). §3.6 metrics-collector rewritten to match shipped 5-sink reality with parent-vs-subagent disambiguation, plus the new `skill.invoked` and intent-decision enrichment events.
- `docs/DESIGN-002-leaves.md` — §4.1 bumped to 6 subcommands (added `metrics`); flag-parsing block extended for `--autonomy`/`--confidence`. §4.2 smart-router flow with explicit PAUSE-1..4 transitions and autonomy resolution at run start. New `## 10. Autonomy taxonomy` section (anchor `S-AUTONOMY-002`) with vendored 5-question diagnostic, 3-axis matrix, auto-classification protocol, pause integration table, manifest integration, telemetry.
- `docs/WORKFLOW-001-infra.md` — new §7 "Post-shipping addenda" covering W3 metrics-collector scope expansion, plugin.json hooks-field removal, script-first bootstrap, forward pointers to W2.
- `docs/WORKFLOW-002-leaves.md` — new §2.4 PR #8 with 8 streams (T-801..T-808). T-701 errata note (5 subcommands shipped, 4 originally specced). §3 dependency graph, R12 risk row, CI matrix, strict-serial cuts, effort estimate all updated for PR #8.

### Added (insight extraction — Explanatory Output style ★ Insight blocks → `metrics/insights.jsonl`)

Captures the model's reasoning depth as a first-class telemetry signal. Commit `a3dbde9`.

- `hooks/scripts/metrics-collector.js` — new `emitInsightsForSession(input, sessionPath, sessionId, role)` function. Scans the session jsonl for `★ Insight ─...─{20,}` blocks emitted by the model in `assistant` text content (regex tolerates optional backticks around the bracket lines per the canonical Explanatory Output style). Emits one `insight.emitted` row per block to `<cwd>/.claude/.orchestra/metrics/insights.jsonl` with `run_id` / `session_id` / `agent_role` / `insight_index` / `line_count` / `char_count` / `text`. Fired at `SubagentStop` (per-subagent insights) and at parent `Stop` (dispatcher's own insights), so a feature-flow run's full reasoning trail lands on disk without manual collection.
- `hooks/scripts/metrics-collector.js` — privacy default: `text: null`. Manifest gains `capture_insight_text: false` default; consumers flip to `true` to retain body text. Behaves analogously to the `redact_prompts` axis — count + length always available, body text gated.
- `hooks/scripts/metrics-collector.js` — `runs/<run-id>.json` gains `insights_count` field counting subagent insights observable at parent-Stop time (parent's own insights land a moment later, picked up by aggregators).
- `scripts/aggregate-metrics.py`, `scripts/metrics-summary.py` — both now read `insights.jsonl` and `manifest.capture_insight_text` for cross-folder rollup. `aggregate-metrics.py` adds the privacy axis (`Folders with capture_insight_text:true`) to the manifest rollup.
- `scripts/test-metrics.js` — new section 4c with 12 assertions: SubagentStop scans subagent jsonl, parses 2 insights, writes to insights.jsonl with correct `run_id`/`session_id`/`agent_role`/index; default `text:null`; flipping `capture_insight_text:true` retains body text on subsequent emissions.

### Fixed (post-1.0.0 hook matcher bug — surfaced by smoke #3)

- `hooks/hooks.json` — changed `"matcher": "Task"` to `"matcher": "Task|Agent"`. Smoke #3 of `/orchestra` revealed Claude Code's subagent-spawn tool is now named `Agent` (parent jsonl tool-name histogram: `Agent` 3×, `Task` 0×). The literal `Task` matcher silently never fired on real Agent calls, with two consequences: (1) `task.subagent.invoked` events never landed in events.jsonl, breaking the orchestration trace; (2) the `val-calibration` hook never injected the `<calibration-anchor>` block into evaluator prompts — load-bearing per PRD §9.9, would have silently failed on the first `feature` intent. Defensive `Task|Agent` alternation handles both names so older Claude Code versions (still using `Task`) keep working.
- `hooks/scripts/val-calibration.js` — same root-cause fix in the script. The line `const isTask = input.tool_name === "Task"` was the second half of the same matcher bug: even with the matcher fixed, the script would have silently passed through when invoked on `Agent` tool_name. Now accepts both literals.
- `hooks/scripts/metrics-collector.js` — classify branch updated to accept both `Task` and `Agent` for `task.subagent.invoked` emission.
- `scripts/test-hooks.js` — added "hooks.json matcher validation" section: parses hooks.json and asserts every PreToolUse matcher's atoms (split on `|`) are either a known Claude Code tool name (`Bash`/`Read`/`Write`/`Edit`/`MultiEdit`/`Glob`/`Grep`/`NotebookEdit`/`WebFetch`/`WebSearch`/`Agent`/`Task`/`TodoWrite`/`TeamCreate`) or a recognized MCP regex pattern (`mcp__*.*`). Plus mutation tests: synthetic `FakeTool` matcher fails red, alternation with one bad atom fails red, missing matcher key fails red. Plus inverse-sanity for the four real hooks.json patterns. **This closes the gap that let smoke #3's bug ship**: the prior tests called hook scripts directly with synthesized stdin, bypassing Claude Code's matcher routing layer — so the `Task` typo was invisible to CI. The validator catches future drift between hooks.json matchers and real Claude Code tool names. Plus a new `val-calibration` test case that drives the script with `tool_name: "Agent"` to assert calibration-anchor injection still works under the canonical name.

### Added (skill.invoked event + intent-decision insight enrichment)

Closes the last two observability gaps before smoke #4 (full feature flow). Smoke #3 didn't exercise either because docs intents skip both code paths.

- `hooks/hooks.json` — added `PreToolUse:Skill` matcher routing to metrics-collector. The orchestra agents author their decision-laden artifacts via skills (`task-breakdown`, `write-contract`, `qa-test-planner`, `code-review`, `project-discovery`, `commit-work`, `evaluator-tuning`, `java-source-intel`); without skill tracking, a feature-flow run's most consequential moments are invisible to events.jsonl.
- `hooks/scripts/metrics-collector.js` — new `skill.invoked` classify branch. Captures `skill` (the skill name, e.g. `write-contract`) and `args_summary` (first 200 chars of the args string). The skill cascade for a feature-intent run will emit one event per skill invocation, with `run_id` tied back to the spawning subagent via `task.subagent.invoked`.
- `hooks/scripts/metrics-collector.js` — semantic enrichment of `artifact.written` for `intent.yaml` writes. New `extractIntentFields()` helper mirrors the existing `extractBootstrapFields()` line-match-without-full-YAML-parser pattern; extracts `intent` / `confidence` / `pattern` fields and inlines them into the `artifact.written` event. This makes the routing decision (the *insight* — not just the fact-of-write) directly readable from events.jsonl. Same enrichment pattern can be applied to future artifact types (CODE-REVIEW verdict, VERDICT pass/fail, CONTRACT criteria count) without changing the event shape.
- `scripts/test-hooks.js` — `KNOWN_TOOLS` allowlist extended with `Skill`. The new matcher passes the validator clean.
- `commands/orchestra.md` — Runtime hooks table updated: `metrics-collector` row now lists 9 event kinds (added `skill.invoked` and the intent-fields enrichment of `artifact.written`).
- `scripts/test-metrics.js` — two new event-classification cases: a `Skill` invocation emits `skill.invoked` with skill_name + args_summary; an `intent.yaml` write with `intent: docs / confidence: HIGH / pattern: Pattern A` content emits `artifact.written` with all three fields populated alongside the standard `feature_id` / `artifact_type` / `file_name` / `tool` keys.

### Added (full observability via events.jsonl — replay smokes without Claude Code session jsonl)

Goal: every observable behavior of an `/orchestra` run lands in `<cwd>/.claude/.orchestra/metrics/events.jsonl` so the user (and downstream tooling) can reconstruct the trace without reading Claude Code's session jsonl. Smoke #3 forensics required `grep`-ing the parent's 200KB jsonl for `TeamCreate` input, `subagent_type` distribution, and `file_path` writes — all of which are now first-class events.

- `hooks/hooks.json` — added `PreToolUse:TeamCreate` matcher routing to metrics-collector.
- `hooks/scripts/metrics-collector.js` — three new/enriched events:
  - **`team.created`** (NEW) — fires on `PreToolUse:TeamCreate`. Captures `team_name`, `agent_type`, `description` (truncated to 200 chars). Surfaces the team boundary that previously lived only in Claude Code's session jsonl.
  - **`task.subagent.invoked`** (ENRICHED) — now also includes `agent_name` (the `name:` parameter, e.g. `@lead`), `team_name` (the team the subagent joined), `tool` (`"Task"` vs `"Agent"` — distinguishes legacy from canonical), and `prompt_summary` (first 200 chars of the prompt). Fully reconstructs the orchestration sequence: which agent role (`subagent_type`), under what handle (`agent_name`), in which team (`team_name`), with what kickoff prompt.
  - **`artifact.written`** (NEW) — fires on `PreToolUse:Write|Edit|MultiEdit` for any write under `<cwd>/.claude/.orchestra/pipeline/<feature-id>/<file>`. Captures `feature_id`, `artifact_type` (parsed from filename: `PRD`/`FRS`/`TDD`/`API`/`CONTRACT`/`CODE-REVIEW`/`ESCALATE`/`intent`/etc.), `file_name`, and `tool`. Reconstructs the artifact tree from events alone; routing-taxonomy violations become detectable as out-of-whitelist `artifact_type` values per intent.
- `hooks/scripts/metrics-collector.js` — new `inferArtifactType()` helper. Two patterns: uppercase-prefix-then-`-NNN` (e.g. `CODE-REVIEW-001-hello-world.md` → `CODE-REVIEW`), and known lowercase singletons (`intent.yaml` → `intent`). Falls back to `"unknown"` so the event is still emitted (run_id + file_name preserve traceability even when classification fails — useful signal for adding new artifact types).
- `commands/orchestra.md` — Runtime hooks table updated: `val-calibration` now documented as `PreToolUse:Task|Agent`; `metrics-collector` row enumerates all 7 emitted event kinds and states the goal explicitly ("events.jsonl alone reconstructs the full smoke trace").
- `scripts/test-metrics.js` — three new event-classification cases: canonical `Agent` invocation with full team/name fields; `TeamCreate` → `team.created`; pipeline writes (`PRD-001.md`, `CODE-REVIEW-001-hello-world.md` via Edit, `intent.yaml`) → `artifact.written` with correct artifact_type extraction.

### Fixed (post-1.0.0 install-path hotfix #3)

- `.claude-plugin/plugin.json` — removed the redundant `hooks` field. The Claude Code plugin loader auto-discovers `hooks/hooks.json` by convention; declaring it in plugin.json caused a `Hook load failed: Duplicate hooks file detected` error during install. Same root-cause class as the marketplace.json and 5-field schema fixes already documented in `[1.0.0]`: orchestra's plugin.json shape was authored from imagination rather than from the official Claude Code plugin reference. Commit `f00a415`.

### Fixed (post-1.0.0 runtime hotfix #1 — orchestration primitives)

- `commands/orchestra.md` — first runtime smoke-test on a fresh /tmp install surfaced three drift bugs against PRD §8.5/§9.4/§10.5: (a) the dispatcher had no `TeamCreate` step at all, so `/orchestra` ran solo without instantiating the persistent team; (b) Pattern B bootstrap was documented as optional rather than mandatory for first-run; (c) agent prompts didn't propagate the §10.5 frontmatter contract, so subagent writes landed without `sections:`/`references:` blocks. Rewritten with TeamCreate as Step 1, Pattern B mandate as Step 2, and an explicit "agents author frontmatter explicitly — do not rely on hash-stamper to create structural keys" note in each agent definition. Commit `fabffe6`.
- `agents/{product,lead,backend,frontend,test,evaluator,reviewer}.md` — added "Frontmatter contract" sections per PRD §10.5. Necessary because hash-stamper PreToolUse:Write hook attaches to the parent context; subagent-tier writes may bypass the hook, so the agent must author the structural keys (`sections:` + `references:`) explicitly. Hash-stamper still resolves `hash: TBD` and `hash-at-write: TBD` placeholders when it does fire. Commit `fabffe6`.

### Fixed (post-1.0.0 runtime hotfix #2 — TeamCreate primitive + filesystem comm)

- `commands/orchestra.md` — corrected the imagined `TeamCreate({members: [...]})` form (which would have failed at runtime — the actual primitive is `TeamCreate({team_name, agent_type, description})` plus per-member `Agent` calls passing `team_name`/`name`). Also locked down the inter-agent communication pattern: agents communicate via filesystem writes to designated paths, NOT via SendMessage. Reason: SendMessage is not in any tier set (T-A: `Bash/Glob/Grep/Read/Write`; T-B: `Glob/Grep/Read/Write`; T-C: `Edit/Glob/Grep/MultiEdit/Read/Write`), and adding it would break `test-agents.js` tier validation. Parent reads agent outputs on idle notification (Claude Code fires this automatically when a subagent's turn ends). Commit `0723756`.

### Added (script-first bootstrap with hook-only events.jsonl invariant)

- `scripts/bootstrap-local.js` — pure-inspector bootstrap. Runs greenfield/brownfield + language/framework detection from filesystem inspection, outputs JSON (`status`, `yaml_content`, `yaml_path`, `decision`) to stdout. **Does NOT write any files itself** — the dispatcher reads stdout and uses Claude Code's Write tool to put `yaml_content` at `yaml_path`. Confidence tiering: HIGH (clean greenfield or clean brownfield) / MEDIUM (source files but no commits) / LOW (commits but no source). Exports `listFiles`, `inspect`, `classify`, `pickLanguage`, `detectFramework`, `render`. Reason: smoke-test #2 showed the original Pattern-B-always bootstrap burned two agent contexts on every first-run for cases that filesystem inspection resolves deterministically in <50ms.
- `hooks/scripts/metrics-collector.js` — extended classify() with a PreToolUse:Write|Edit|MultiEdit branch that detects writes to `<cwd>/.claude/.orchestra/local.yaml` and emits a `local.bootstrapped` event with `mode`/`primary_language`/`framework` extracted from the proposed YAML content via line-match regexes (no full YAML parser; the hook stays stdlib-only and crash-resistant). Plus a header-comment expansion of the subscription list.
- `hooks/hooks.json` — added `metrics-collector` to the existing PreToolUse:Write|Edit|MultiEdit matcher (alongside `pre-write-check` and `hash-stamper`). The hook fires on the dispatcher's Write of local.yaml, observes the bootstrap, and emits the event.
- `commands/orchestra.md` — Step 2 rewritten as script-first tiered bootstrap. HIGH/MEDIUM confidence: dispatcher Bash-runs the script, parses JSON, Writes the yaml_content (the `metrics-collector` hook fires automatically and emits `local.bootstrapped`). LOW confidence or `status: ambiguous`: falls back to the original Pattern B two-agent flow. New "Conformance check" section locks in the **PRD §9.9 hook-only invariant**: the ONLY way `local.bootstrapped` lands in `events.jsonl` is via the metrics-collector hook firing on PreToolUse:Write of `local.yaml`. Scripts compute, the model writes, the hook observes and emits. Agents do NOT emit events.
- `scripts/test-bootstrap.js` — new contract-test file. 35 assertions across 5 scenarios: empty dir → greenfield/HIGH; src no commits → brownfield/MEDIUM; src + commits → brownfield/HIGH; commits no source → greenfield/LOW; render output shape (10 required keys + newline-termination + interpolation). Imports the module's exports directly (no subprocess) for granular assertions.
- `scripts/test-metrics.js` — added one classification case for `local.bootstrapped` (Write tool input with file_path ending `/.claude/.orchestra/local.yaml`). The existing `events.length === cases.length` assertion is self-counting, so adding the case auto-updates the expected count.
- `package.json` — `test:bootstrap` wired into the npm test chain (now 9 validators total).

### Fixed (routing-taxonomy fidelity — PRD §9.5 enforcement)

- `commands/orchestra.md` — Step 5 rewritten with an explicit per-intent artifact-whitelist table (docs / template / hotfix / feature / review-only / refactor → exact agent list + exact artifact list). The previous "for example, a feature intent spawns @product → @lead → ..." wording was non-binding; smoke-test #2 showed the dispatcher producing CONTRACT/TEST artifacts for a `docs` intent contrary to its own classification. The new table is the routing contract: dispatcher spawns ONLY the agents listed for the classified intent, and propagates the intent + whitelist into each spawned agent's prompt as a runtime invariant.
- `agents/lead.md`, `agents/product.md`, `agents/test.md` — added "Routing-taxonomy guard (PRD §9.5)" hard-boundary sections. Each agent reads `<cwd>/.claude/.orchestra/pipeline/<id>/intent.yaml` before authoring anything and refuses to write artifacts outside its per-intent whitelist (e.g., @lead refuses CONTRACT/TDD when `intent` is `docs`/`review-only`; @product refuses PRD/FRS for any intent except `feature`; @test refuses TEST-NNN.md for `docs`/`review-only` and refuses for `feature` if upstream CONTRACT is missing). Defense-in-depth pattern: dispatcher governs the happy path; agent guards catch manual invocations and future router bugs. Refusals write `ESCALATE-<id>.md` with explicit reason rather than silent no-op so routing bugs surface visibly.

## [1.0.0] — 2026-05-03

Initial release. See [`releases/RELEASE-v1.0.0.md`](releases/RELEASE-v1.0.0.md) and [`runbooks/RUNBOOK-v1.0.0.md`](runbooks/RUNBOOK-v1.0.0.md). Full v1.0.0 scope is specified in [`docs/PRD-001.md`](docs/PRD-001.md).

### Added (release-prep — install path + release artifacts)

- `.claude-plugin/marketplace.json` — Claude Code plugin marketplace manifest. Without it, `/plugin marketplace add hunghlh98/orchestra` fails with "Plugin not found in any configured marketplace" (caught during pre-tag smoke-test). Per https://code.claude.com/docs/en/plugin-marketplaces.md, Claude Code's plugin system separates marketplace discovery from plugin install — the orchestra repo acts as both (single-plugin marketplace named `orchestra-marketplace` listing the `orchestra` plugin via GitHub source). Consumer install is now a 2-step flow: `/plugin marketplace add hunghlh98/orchestra` → `/plugin install orchestra@orchestra-marketplace`. PRD §11.4 / G4 wording (single command) is technically a 2-step process; eligible for v1.0.1 PRD amendment but not blocking — both commands complete in <5 min, no setup wizard, intent of G4 satisfied.

### Fixed (release-prep — plugin.json schema)

- `.claude-plugin/plugin.json` — corrected 5 schema errors caught by `/plugin install` validation (per https://code.claude.com/docs/en/plugins-reference.md#plugin-manifest-schema):
  - `author` was a string `"hunghlh98"`; Claude Code requires an object. Fixed to `{ "name": "hunghlh98" }` (email omitted to keep PII off the public manifest).
  - `hooks`, `mcpServers`, `agents[]`, `commands[]` — all relative paths must start with `./`. Fixed all 11 path references.
- This pair of fixes (marketplace.json + plugin.json schema) both stem from the same root cause: the orchestra PRD and DESIGN docs specified manifest shapes from imagination rather than from the official Claude Code plugin reference. CI validators only checked our internal invariants — none compared against Claude Code's actual schema. v1.0.1 candidate: extend `validate.js` to walk plugin.json and assert (a) `author` is an object with `name`; (b) all relative paths in `hooks`/`mcpServers`/`agents[]`/`commands[]` start with `./`. `claude plugin validate .` only validates the marketplace manifest (not plugin.json deeply), so we cannot rely on the upstream CLI to catch this drift.
- `releases/RELEASE-v1.0.0.md` — inaugural release notes per `agents/ship.md` workflow + `docs/pipeline-schema.md` RELEASE shape. Sections: Summary, Included PRs (#1..#7 with commit refs), Gates Cleared, Composition table, Migration Notes (2-step install), Known Limitations (NoSQL probes deferred, WITH/CTE rejected, specialist agents deferred, etc.), What's Next.
- `runbooks/RUNBOOK-v1.0.0.md` — install + smoke-test runbook. Topology fully new (5 hooks + 2 MCPs + 8 agents + 8 skills + 1 cmd + 12 rules). Sections: Topology Changes, Pre-deploy Verification, Deploy Steps (2-step install), Rollback (`/plugin uninstall` + optional state cleanup), Smoke Test (5-step post-deploy verification), Observability.
- `README.md` — full rewrite from in-development scaffold. Adds: 2-step install instructions, 5-subcommand usage table, what-ships count table (8/8/12/1/5/2), 3-bullet architecture summary (gen/eval separation, doc-driven gates, capability-first models), env-var configuration, 8-validator overview.
- `CHANGELOG.md` — `[Unreleased]` flipped to `[1.0.0] — 2026-05-03` per Keep-a-Changelog spec; fresh empty `[Unreleased]` placeholder retained for v1.1+ work.

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

