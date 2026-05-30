# orchestra

Multi-agent SDLC pipeline behind `/orchestra`. One developer, generator/evaluator separation, document-driven gates.

> The model IS the agent. Build harnesses, not prompt chains.

## Why orchestra

The forward chain (PRD → FRS → SAD → ADR → TDD → openapi → code → TSR) is published methodology — BABOK for PRD / FRS, TOGAF / IEEE 1471 for SAD, Nygard's ADR practice, the OpenAPI Initiative for the contract layer. Any LLM can explain each artifact type on demand and draft a generic template.

What orchestra ships is the *harness* that runs on top: hooks intercept `Write` / `Edit` / `Bash` / `Task` / `Stop` events at tool-call time; 2 MCP servers — `orchestra-utils` (tree + closed-allowlist writes to `.orchestra/system.yaml`, `.orchestra/<service>/local.yaml`, and the consumer orchestra-rules file `.orchestra/claude-md/orchestra.md` `@`-imported from `CLAUDE.md`) and `orchestra-probe` (auditable runtime probes via `@evaluator`); schema-pinned frontmatter blocks malformed artifacts before they reach disk; `tools:` allowlists enforce generator/evaluator separation by capability, not convention. These are runtime behaviors — they execute during a Claude Code session, not on a documentation site you can paste prompts into.

Pedagogy is researchable; enforcement is not. The plugin is orthogonal to "ask perplexity + generate manually" because anyone can describe the chain — only the harness can gate writes against it during a session.

| Action | perplexity + Claude (manual) | orchestra harness (runtime) |
| --- | --- | --- |
| Author PRD-001 | LLM drafts free-form prose | `@product` writes; `pre-write-check` validates frontmatter against `pipeline-artifact.schema.md` at write time |
| Edit a `status: locked` artifact | LLM edits silently | `pre-write-check` `locked-status-reject` gate blocks the write |
| Probe a running service for evidence | LLM cannot reach the network | `@evaluator` routes through `orchestra-probe`'s `http_probe` (redacted) / `db_state` (SELECT-only) MCP tools |
| Cite `FR-3` from business code | LLM may inline the cite | `pre-write-check` `chain-cite-reject` gate rejects the write under `src/**` |
| Trace an artifact to its author | Author identity guessed from prose | Frontmatter `subagent_session_id` joins to `events.jsonl` via the `metrics-collector` hook |

## Architecture

Three load-bearing decisions:

1. **Generator/evaluator separation.** `@evaluator` is strict read-only; `@backend` / `@frontend` deny `Bash`. CI-enforced. Probe runs route through `@evaluator` via the `orchestra-probe` MCP — auditable, named, capped.
2. **Schema-pinned artifacts.** Every artifact under `<project>/docs/` validates against `pipeline-artifact.schema.md`. Frontmatter (`phase`, `agent_role`, `artifact_id`, `subagent_session_id`) makes observability joins filename arithmetic, not timestamp guesswork.
3. **Capability-first default models.** Opus 4.7 with 1M context for spec / review tiers. Each agent declares its model; users override per-project in `<project>/.orchestra/<service>/local.yaml`.

## Features

- 4 entry shapes (`spec-to-code`, `code-to-spec`, `<intent>` router, empty→usage) — one slash command, mode-detected behavior
- Greenfield forward chain (PRD → FRS → SAD → ADR → TDD → openapi → code) + brownfield reverse chain against the same schemas
- Versioned-migration discipline — `migration_tool` (`flyway` default on JVM, `liquibase`, `none`) + `primary_database` bootstrap fields drive forward-chain migration authoring and reverse-chain schema derivation (`ddl-auto` surfaces as DEFECT)
- Runtime hooks + MCP servers, env-var opt-out per component (see [Hooks](#hooks) / [MCP Servers](#mcp-servers-2) tables)

## Installation

```bash
/plugin marketplace add hunghlh98/orchestra
/plugin install orchestra@orchestra-marketplace
```

The marketplace is intentionally single-plugin: `.claude-plugin/marketplace.json` declares only `orchestra` because the marketplace surface IS the canonical Claude Code install path. No separate registry, no follow-up wizard.

## Usage

```
/orchestra                                              Empty → usage block.
/orchestra spec-to-code                                 Greenfield forward chain.
/orchestra code-to-spec                                 Brownfield reverse chain. Optional second token: `system` | `service:<name> --source=<path>`.
/orchestra <intent>                                     Freeform router. Reverse first, pause, then forward against the locked baseline.
```

The router path runs three minimum `AskUserQuestion` rounds before any agent spawn (restate-intent / scope / constraints), even at HIGH confidence.

## Pipeline flow per entry shape

### `/orchestra spec-to-code` — greenfield forward chain

Empty repo. Dispatcher runs a 4-phase model (Discovery → Plan → Swarm → Convergence). The Plan body is composed in Phase 2 (chain manifest + TASKS graph + `run-plan.md`); native PlanMode submission via `ExitPlanMode` is the single user-facing approval gate between Phase 2 (Plan) and Phase 3 (Swarm). The parallel implementer fan-out gates on `TDD + openapi.yaml` lock. Phase 3 dispatches as ONE native workflow when available (task-DAG scheduler over the locked plan), else as a native `Agent` fan-out — same behavior either way.

```
 Business         BA Bridge      Architecture                Component        Boundary
 ─────────        ─────────      ───────────────             ──────────       ──────────────
 PRD       ──→    FRS     ──→    SAD ──→ ADR? ──→ TDD ──→    openapi.yaml ──→ TASKS + run-plan
 @product         @analyst       @architect                                   dispatcher
 + features.yaml                                                                  │ PlanMode
                                                                                  ▼
                                                          parallel:  @backend ‖ @frontend ‖ @test-author
                                                                                  │
                                                                                  ▼
                                                          converge:  @test-runner → @evaluator + @reviewer
                                                                                  │
                                                                                  ▼
                                                                              TSR (verdict locked)
```

One user-facing gate: native PlanMode submission (`ExitPlanMode`) between Phase 2 Plan and Phase 3 Swarm. Inside the Plan body the dispatcher composes the chain manifest, TASKS graph, and `run-plan.md`; the user reviews the rendered plan and approves or revises before any `Task`/`Agent` spawn. `ADR?` opens only when a non-obvious system-affecting decision surfaces in PRD / FRS / TDD. `@frontend` is skipped on projects with no UI layer.

### `/orchestra code-to-spec` — brownfield reverse chain

Existing codebase. Authors documentation only — never touches `src/`, tests, or TSR. Each artifact runs **classify → author → lock** (`re-author` / `cite-as-is` / `copy-and-modify` per provenance and status).

```
 Source                  Component             Architecture                Business
 ─────────────           ─────────             ────────────────            ──────────────────
 src/**/*.{lang}   ──→   TDD            ──→    SAD* + ADR*           ──→   PRD ──→ FRS
 existing tests          openapi.yaml          business-invariants*               │
                         clientapi.yaml                                           ▼
                                                                            BR-AC (per-service)

* SAD + ADR + business-invariants authored only when workspace_kind = multi-repo
  AND scope_level = system-wide. Single-repo and per-service scope skip the
  architecture layer entirely.
```

Optional second token narrows scope: `code-to-spec system` forces `scope_level: system-wide`; `code-to-spec service:<name> --source=<path>` forces `per-service` for the named service and pins the source read-root (the `--source=<path>` flag is REQUIRED whenever the resolved scope is per-service; it persists to `local.yaml.source_path`).

### `/orchestra <intent>` — router (reverse-then-forward)

Freeform request (anything that isn't `spec-to-code` / `code-to-spec`). Three AskUserQuestion rounds run before any agent spawn; then mode-detection decides whether to reverse-pass first.

```
 freeform intent
        │
        ▼
 3× AskUserQuestion   (restate-intent  /  scope  /  constraints)
        │
        ├─── greenfield ──────────────────────────────────────────→  spec-to-code
        │
        └─── brownfield
                  │
                  ▼
            code-to-spec  (narrowed to touched service(s))
                  │
                  ▼
            pause for review
                  │
                  ▼
            spec-to-code  (against the now-locked baseline)
```

The brownfield path is **reverse-then-forward**: document the existing surface so the spec-to-code chain runs against a real baseline instead of inventing one.

### `/orchestra` — empty

Emits the Usage block above. No chain, no agent spawn.

## Agents (10)

| Agent | Purpose |
| --- | --- |
| `@product` | Authors `<feature-id>-PRD.md` and the `features.yaml` manifest entry. Opens every spawn with "relates to existing feature?" AskUserQuestion. Flags ADR-worthy decisions for `@architect`. |
| `@analyst` | Authors `<feature-id>-FRS.md` from a locked PRD. Owns the BR/AC/pseudocode bridge between business intent and technical design. |
| `@architect` | Authors `SAD.md`, ADRs, workspace `business-invariants.md`, per-service BR-AC, C4 L1+L2+L3+L4, Logical ERD, Inter-service Sequence, per-feature TDD, per-feature `openapi.yaml`/`asyncapi.yaml`/`clientapi.yaml`. Brownfield: reads `src/**` to derive TDD + openapi. |
| `@explorer` | Surveys one service's source surface during brownfield Phase 1 Discovery. Authors `EXPLORER-REPORT-<service>.md` under `.orchestra/explorer/`; read-only on `src/**` (no writes outside its own report directory). |
| `@backend` | Server-side implementer (endpoints, services, persistence, jobs). Writes source + unit tests under `services/<name>/src/`. |
| `@frontend` | UI implementer (components, state, styles, accessibility). Ships all four states: loading / empty / error / success. |
| `@test-author` | Spec-bound test author. Lays out black-box tests + TSR `S-TEST-001` plan rows from openapi + PRD + FRS only; no Bash, no `src/main/**` read. |
| `@test-runner` | Impl-aware test runner. Reads `src/main/**`, adds white-box / edge-case tests, runs the suite via Bash, fills `status` + `evidence` cells, locks the section. |
| `@evaluator` | Evidence grader. Reads PRD / FRS / openapi / TSR `S-TEST-001` and writes `S-EVAL-001` (PASS / FAIL / PENDING per row). Strict read-only. |
| `@reviewer` | Diff and ADR reviewer. Writes TSR `S-REVIEW-001` verdict (APPROVED / REQUEST_CHANGES / PENDING); flags ADR-worthy decisions retroactively. |

## Skills (10)

| Skill | Purpose |
| --- | --- |
| `business-analysis` | BR/AC discipline + pseudocode shaping. Invoked by `@analyst` when drafting `<feature-id>-FRS.md` from a locked PRD. |
| `c4-architecture` | C4-model diagrams (Context / Container / Component / Deployment / Dynamic) via C4-PlantUML stdlib. |
| `clean-architecture` | Dependency-Rule layering (Entities / Use Cases / Adapters / Frameworks) for SAD container layout, TDD components, and review scoring. |
| `clean-code` | Meaningful names, small functions, exception-based errors, F.I.R.S.T. tests, code-smell heuristics for authoring and review. |
| `code-review` | Severity-graded checklists for correctness, idioms, performance, security — used by `@reviewer`. |
| `java-development` | Java / Spring read-side intel (caller graphs, `@Transactional`, JPA impact) and write-side conventions. Invoked by `@architect` on Java projects (forward-chain TDD authoring + reverse-pass source-walk) and `@backend` for write-side conventions. |
| `plantuml` | Generates PlantUML diagrams from text and converts `.puml` sources to PNG / SVG. |
| `qa-test-planner` | Test-plan authoring with coverage strategy and adversarial fuzz inputs. Used by `@test-author` for TSR `S-TEST-001`. |
| `task-breakdown` | Decomposes intent into a task graph with story-point estimates and agent assignments. Used by the dispatcher in Phase 2 Plan body authoring (task graph + per-spawn assignment). |
| `write-contract` | Lifts PRD/FRS criteria into `<feature-id>-openapi.yaml` (producer endpoints) and `<feature-id>-clientapi.yaml` (consumer contracts on upstream). |

## Commands (1)

| Command | Purpose |
| --- | --- |
| `/orchestra` | Dispatcher. 4 entry shapes: `spec-to-code`, `code-to-spec`, `<intent>` router, empty→usage. |

## Hooks (9)

| Hook script | Event | Purpose |
| --- | --- | --- |
| `orchestra-preflight.js` | UserPromptSubmit (`^/orchestra`) | Emit `<orchestra-preflight>` block — mode / workspace / scope / cached fields / missing fields. Dispatcher halts without it. |
| `pre-write-check.js` | PreToolUse (Write / Edit / MultiEdit) | Multi-gate guard: secret detection, `chain-cite-reject` (src/ cite denylist), `codebase-token-reject` (docs/ portability inverse), `workspace-sad-container-floor` (workspace SAD ≥2 containers), `iid-pairing-reject` (`x-orchestra-iid` presence + clientapi→producer pairing), `graph-backing-reject` (locked openapi vs Java code-graph completeness + staleness), `changelog-append-only` (docs/ append-only `## Changelog`), `locked-status-reject` + `all-sections-locked-reject` + `readers-scope-warning` frontmatter gates. |
| `metrics-collector.js` | All major events | Append `events.jsonl` for observability joins. |
| `val-calibration.js` | PreToolUse (Task / Agent) | Inject confidence-tier calibration into agent prompts. |
| `stop-plan-verify.js` | Stop | Silent-approval gate. Scans the just-ended main-agent turn for `ExitPlanMode` followed by `Task`/`Agent`/`Workflow` spawn in the SAME turn — the dangerous shape from anthropics/claude-code#50110 (model receives `"User has approved"` with no UI interaction). `Workflow` is caught because the Phase 3 swarm dispatches as ONE workflow on the preferred path. On detection, returns `decision: "block"` so the user can verify approval via the PlanMode UI before any swarm dispatch. |
| `agent-plan-sync.js` | SubagentStop | Projects each finished subagent's `TaskCreate` / `TaskUpdate` activity from its transcript into the session-level ledger at `.orchestra/plans/<session-id>/agent-tasks.md`. Single writer; subagents never author the file. |
| `post-bash-lint.js` | PostToolUse (Bash) | Observe Bash output; surface lint issues. |
| `post-write-puml.js` | PostToolUse (Write / Edit / MultiEdit) | Render-on-write for `.puml` files. |
| `code-graph-stale.js` | SessionStart + PostToolUse (Bash) | Notice hook: when a persisted Java code-graph baseline (`.orchestra/<service>/code-graph/meta.json`) was built at a commit other than HEAD, surface a one-line staleness notice (SessionStart → additionalContext; post-commit → stderr). Silent when no graph exists or not a git repo. Never blocks. |

## MCP Servers (2)

| Server | Tools | Purpose |
| --- | --- | --- |
| `orchestra-utils` | `tree`, `write_system_yaml`, `upsert_local_yaml`, `claude_md`, `docs_readme`, `upsert_features_yaml` | Read-only directory listing via `tree`; closed-allowlist schema-validated writes to `.orchestra/system.yaml`, `.orchestra/<service>/local.yaml`, the consumer orchestra-rules file `.orchestra/claude-md/orchestra.md` (`@`-imported from `CLAUDE.md`), the `docs/README.md` provenance marker, and the `.orchestra/<service>/features.yaml` intra-service feature DAG manifest. |
| `orchestra-probe` | `http_probe`, `db_state` | Auditable runtime probes for `@evaluator` (SELECT-only DB, redacted HTTP). |

## Schemas (<!-- ORCHESTRA:COUNT:schemas-table -->17<!-- ORCHESTRA:COUNT:schemas-table:END -->)

<!-- ORCHESTRA:GEN:schemas-table:START -->

| Schema | Purpose |
| --- | --- |
| `br-ac.schema.md` | shape of `<context_path>/docs/<service_name>/<service_name>-BR-AC.md` (per-service singleton). |
| `business-invariants.schema.md` | shape of `<context_path>/docs/business-invariants.md` (workspace singleton). |
| `canonical.schema.json` | Closed registry of canonical content blocks. Each entry declares where a rule body lives (file + anchor) and what purpose it serves. Consumed by scripts/canonical-sync.js --check to flag restate-without-pointer drift across the consumer surface. |
| `code-graph.schema.json` | Deterministic structural graph emitted by skills/java-development/scripts/extract-java-graph.mjs. Shape only. |
| `cross-features.schema.json` | Closed allowlist for <context_path>/.orchestra/cross-features.yaml — workspace-grain cross-service feature DAG manifest. Each entry binds one logical feature across >=2 services. Member existence (each (service_name, feature_id) resolves in that service's features.yaml), acyclicity, edge-existence, self-edge, member uniqueness, and id uniqueness are enforced imperatively by the orchestra-utils MCP tool, not by this schema. |
| `features.schema.json` | Closed allowlist for <context_path>/.orchestra/<service_name>/features.yaml — intra-service feature DAG manifest. Acyclicity, edge-existence, self-edge, and uniqueness-by-id are enforced imperatively by the orchestra-utils MCP tool, not by this schema. |
| `glossary.schema.md` | shape of `<context_path>/docs/glossary.md` (workspace singleton). |
| `install-modules.schema.json` | Inventory of plugin components grouped by module with installation defaults. |
| `inventory.adr-index.schema.md` | shape of `<context_path>/.orchestra/inventory/adr/index.md` (workspace-global ADR index). |
| `inventory.schema.md` | shape of `<context_path>/.orchestra/inventory.md` (workspace-global). |
| `known-models.schema.json` | Closed list of short canonical model names that agent frontmatter may reference. Short names (opus/sonnet/haiku) are canonical; the fully-qualified Anthropic id lives in model_id for API routing. |
| `local.schema.json` | Closed allowlist for <context_path>/.orchestra/<service_name>/local.yaml — per-service bootstrap fields surfaced by the orchestra-preflight hook. |
| `pipeline-artifact.schema.md` | type-specific frontmatter shapes for every artifact authored by the orchestra agents. |
| `routing-taxonomy.md` | Intent to authorized-agents map + per-intent artifact whitelist; referenced by /orchestra dispatcher spawn prompts. |
| `run-plan.schema.md` | shape of `<context_path>/.orchestra/plans/<session_id>/run-plan.md`. |
| `runtime-toggles.schema.json` | Env-var opt-out registry. Each entry pairs a module-or-config-namespace identifier with an ORCHESTRA_* env var and on/off default. |
| `system.schema.json` | Closed allowlist for <context_path>/.orchestra/system.yaml — workspace-wide facts shared across all services. |

<!-- ORCHESTRA:GEN:schemas-table:END -->

## Environment Variables (opt-out)

All hooks, MCP servers, and skills ship `defaultEnabled: true`. Opt out by setting any of these to `off`:

<!-- ORCHESTRA:GEN:env-vars-table:START -->

| Variable | Effect |
| --- | --- |
| `ORCHESTRA_HOOK_AGENT_PLAN_SYNC` | On SubagentStop, reads the finished subagent's transcript and projects every TaskCreate/TaskUpdate event into the session-level ledger at <cwd>/.orchestra/plans/<session-id>/agent-tasks.md — rows keyed on (agent, feature_id, task_id). Single writer; subagents never author this file. Disable to skip ledger projection. |
| `ORCHESTRA_HOOK_CODE_GRAPH_STALE` | On SessionStart and after git commit/merge/rebase (PostToolUse Bash), checks whether a persisted Java code-graph baseline at <cwd>/.orchestra/<service>/code-graph/meta.json was built at a commit other than HEAD; if so, surfaces a one-line staleness notice (SessionStart: additionalContext; PostToolUse: stderr). Silent when no code-graph exists or not a git repo. Never blocks. Disable to suppress the notice. |
| `ORCHESTRA_HOOK_METRICS_COLLECTOR` | Local-only JSONL telemetry to <project>/.claude/.orchestra/metrics/events.jsonl. Disable for fully air-gapped runs. |
| `ORCHESTRA_HOOK_POST_BASH_LINT` | Surfaces source-modifying Bash commands (npm install, sed -i, etc.) to stderr. Observer; never blocks. |
| `ORCHESTRA_HOOK_POST_WRITE_PUML` | Renders .puml → .svg via plantuml CLI on PostToolUse(Write\|Edit\|MultiEdit). Non-blocking; warns to stderr when the puml id is not declared in any sibling SAD/TDD frontmatter `diagrams: [...]` array. |
| `ORCHESTRA_HOOK_PRE_WRITE_CHECK` | Blocks Write/Edit/MultiEdit containing detectable secrets and enforces the locked-status-reject / all-sections-locked-reject / readers-scope-warning / chain-cite-reject / codebase-token-reject / workspace-sad-container-floor / changelog-append-only gates. Disable for fixtures that must contain secret-shaped values (rare). |
| `ORCHESTRA_HOOK_PREFLIGHT` | On UserPromptSubmit, when the prompt starts with `/orchestra`, emits an <orchestra-preflight> YAML block to additional context: mode (greenfield/brownfield), workspace_kind, service_name, scope_level, cached fields, missing_fields, docs provenance, CLAUDE.md state. The dispatcher reads it to skip already-resolved bootstrap prompts. |
| `ORCHESTRA_HOOK_STOP_PLAN_VERIFY` | On Stop event, scans the just-ended main-agent turn for ExitPlanMode followed by Task spawn in the SAME turn — the silent-approval pattern from anthropics/claude-code#50110. On detection, emits `decision: block` to halt the turn so the user can verify the plan was actually approved via the PlanMode UI before any subagent dispatch. Disable when an upstream Claude Code fix lands. |
| `ORCHESTRA_HOOK_VAL_CALIBRATION` | Injects calibration anchor into @evaluator Task prompts. Reads hooks/calibration/calibration-examples.md. |
| `ORCHESTRA_MCP_ORCHESTRA_PROBE` | Runtime probes MCP (http_probe + db_state). Disable when network/database access is undesirable. |
| `ORCHESTRA_MCP_ORCHESTRA_UTILS` | Utilities MCP exposing tree (directory listing) + write_system_yaml / upsert_local_yaml / claude_md / docs_readme / upsert_features_yaml (schema-validated closed-allowlist writes). Dispatcher persists system.yaml / local.yaml / orchestra-rules import / docs/README.md provenance / features.yaml manifest exclusively through these tools — disabling halts /orchestra bootstrap and feature-manifest writes. |
| `ORCHESTRA_METRICS_COST_BANNER` | Emit a one-line token + USD cost banner at the end of every /orchestra run (Step 7 closure). Reads cost_usd persisted by the metrics-collector hook from runs/<id>.json. config.* namespace has no install-modules counterpart — it's a dispatcher-side display toggle only. |
| `ORCHESTRA_SKILL_BUSINESS_ANALYSIS` | BR/AC discipline + pseudocode shaping consumed by @analyst when authoring <feature-id>-FRS.md from a locked PRD. |
| `ORCHESTRA_SKILL_C4_ARCHITECTURE` | C4 L1 (workspace context) + L2 (workspace container) + L3 (per-service component) + Logical ERD + per-service state-machine + cross-service/per-feature sequence diagram authoring guide consumed by @architect. |
| `ORCHESTRA_SKILL_CLEAN_ARCHITECTURE` | Dependency-Rule layering (Entities / Use Cases / Adapters / Frameworks) consumed by @architect for SAD container + TDD component layout, @backend for write-side conventions, @reviewer for layering-violation scoring. |
| `ORCHESTRA_SKILL_CLEAN_CODE` | Meaningful names + small functions + F.I.R.S.T. tests + code-smell heuristics consumed by @backend (authoring) and @reviewer (S-REVIEW-001 scoring). |
| `ORCHESTRA_SKILL_CODE_REVIEW` | Severity-graded review checklist consumed by @reviewer. |
| `ORCHESTRA_SKILL_COMMIT_MESSAGE` | Conventional Commits 1.0.0 message authoring with mandatory AI Co-Authored-By trailer; consumed by the dispatcher at chain closure to draft the commit message. |
| `ORCHESTRA_SKILL_JAVA_DEVELOPMENT` | Java/Spring read-side intel + write-side conventions consumed by @backend on Java/Spring projects. |
| `ORCHESTRA_SKILL_PLANTUML` | PlantUML grammar + render-target authoring guide consumed by @architect (workspace + per-service diagrams + per-feature sd) and @analyst (per-service usecase.puml singleton). |
| `ORCHESTRA_SKILL_QA_TEST_PLANNER` | Test plan + coverage + adversarial fuzz inputs consumed by @test. |
| `ORCHESTRA_SKILL_TASK_BREAKDOWN` | Decomposition + SP estimation for the main agent's Phase 2 — Plan body authoring (task graph + per-spawn assignments). |
| `ORCHESTRA_SKILL_WRITE_CONTRACT` | openapi/asyncapi/clientapi description: schema + Probe DSL authoring guide consumed by @architect for per-service contract singletons + per-feature endpoint append-mode. |

<!-- ORCHESTRA:GEN:env-vars-table:END -->

`ORCHESTRA_SKILL_<NAME>` exposes per-skill opt-out (10 skills, e.g. `ORCHESTRA_SKILL_JAVA_DEVELOPMENT`, `ORCHESTRA_SKILL_BUSINESS_ANALYSIS`). The table above is auto-rendered from `manifests/runtime-toggles.json`.

Agents and the dispatcher command have no env-var opt-out. Plugin manifest declares no per-component arrays (Claude Code auto-discovers from convention directories); to remove an agent or command, delete its file from `agents/` or `commands/` directly.

## Requirements

### Required

- Claude Code ≥ 2.1.85 (orchestra relies on prompt-based hooks, MCP slash commands, schema-pinned frontmatter, and native `PlanMode` enforcement at the tool-permission layer; regression range `2.1.83` – `2.1.84` enforced `PlanMode` via `<system-reminder>` only and is known-unsafe — see [#39713](https://github.com/anthropics/claude-code/issues/39713))
- Node.js 18+ on `$PATH` (Claude Code launches hook scripts and MCP servers with `node`; ESM imports under `mcp-servers/*.js` fail silently on older runtimes)
- Opus-class model with a **1M context window** for multi-feature runs. The Phase 3 swarm accumulates the locked plan plus every feature's structured return on the main thread — a five-feature reverse run peaks around 270K tokens. On a 200K window such a run will auto-compact mid-swarm; compaction is lossy and can degrade in-flight orchestration state (the locked `run-plan.md` and `agent-tasks.md` ledger survive on disk, but working context is summarized), so prefer the 1M window. Single- or few-feature runs fit 200K.

### Optional

- Native dynamic workflows (Claude Code ≥ 2.1.154, paid plan) — when available, the Phase 3 swarm dispatches as ONE schema-validated workflow whose task-DAG scheduler runs the locked plan's `## Agent assignments` (dep-gated, verdict-gated, single-writer-mutexed). Absent it, orchestra falls back to the native `Agent` fan-out with no loss of behavior; floor stays 2.1.85.
- PlantUML CLI on `$PATH` — for `post-write-puml` render-on-write (`.puml` → `.svg`)
- C toolchain (node-gyp / python3 / compiler) + npm — required ONLY for the Java reverse chain (`code-to-spec` on a Java project). The `java-development` skill preflight runs `npm install` to provision native `tree-sitter` bindings for the code-graph extractor; absent a toolchain the extractor STOPs with an explicit message. Not needed for greenfield, non-Java, or any other entry shape.

## Versioning

[Semantic Versioning](https://semver.org/). Version bumps run through the bump script, which atomically updates `VERSION`, `package.json`, and `.claude-plugin/plugin.json`. See [`CHANGELOG.md`](CHANGELOG.md) for release notes.

## License

MIT — see [`LICENSE`](LICENSE).

## Acknowledgments

- `skills/plantuml/` — cloned from [`SpillwaveSolutions/plantuml`](https://github.com/SpillwaveSolutions/plantuml) (MIT). Examples trimmed; conversion scripts unchanged.
- `skills/c4-architecture/` — structure adapted from a Mermaid-output upstream skill; output rewritten for C4-PlantUML stdlib.
- `skills/clean-architecture/` and `skills/clean-code/` — vendored from [`wondelai/skills`](https://github.com/wondelai/skills) (MIT, Wondel.ai sp. z o.o.); frontmatter trimmed for orchestra schema; body and references unchanged.
