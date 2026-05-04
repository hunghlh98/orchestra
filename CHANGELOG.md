# Changelog

All notable changes to orchestra are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Post-1.0.0 hotfixes and follow-ups. Stays under `[Unreleased]` until the next tag is cut. No v1.x version flip yet.

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

