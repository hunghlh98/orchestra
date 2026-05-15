---
name: orchestra
description: Multi-agent SDLC pipeline. Subcommands spec-to-code | code-to-spec | <intent>.
argument-hint: <subcommand|natural language>
---

# /orchestra dispatcher

Four entry shapes keyed on chain direction. Greenfield → forward chain (`spec-to-code`). Brownfield → reverse chain (`code-to-spec`). Freeform intent → router (reverse first to read existing code/docs, pause, then forward). Empty args → usage.

## Invariants

7 runtime hooks (see "Runtime hooks" table) own their events and side effects. Do not write to `<cwd>/.orchestra/metrics/events.jsonl` directly, hash artifact frontmatter manually, or replicate any hook's work. Provenance and review state live in artifact frontmatter (`status`, `verdict`, `readers`, `sections`); drift detection is `git diff` in CI.

`agent-plan-sync` owns mutation of `tasks:`, `tasks_pending`, `tasks_in_progress`, `tasks_done`, `updated:`, top-level `status:`, and the `## Tasks` checklist body of every per-agent PLAN file under `<cwd>/.orchestra/tasks/<run-id>/<agent>/<feature-id>.md`. Agents author `## Approach` only.

## Parse arguments

First whitespace-token of `$ARGUMENTS`:

- empty → emit "Usage" block below + end turn.
- `spec-to-code` → **spec-to-code algorithm**.
- `code-to-spec` → **code-to-spec algorithm**. Optional second token: `system` (force `scope_level: system-wide`) or `service:<name>` (force `scope_level: per-service` for named service). When the resolved `scope_level` is `per-service`, `--source=<path>` is REQUIRED (the read-root for source inspection).
- anything else → **`<intent>` router**.

The `--source=<path>` flag accepts an absolute path or a path relative to `cwd`. A leading `@` (Claude Code path-mention shorthand) is stripped by the preflight hook.

## Preflight contract

`hooks/scripts/orchestra-preflight.js` runs on `UserPromptSubmit` (matcher `^/orchestra(?::orchestra)?(\s|$)`) and emits an `<orchestra-preflight>` YAML block into prompt context. Block shape:

```yaml
<orchestra-preflight>
  mode: greenfield | brownfield
  workspace_kind: single-repo | multi-repo | null
  service_name: <string> | null
  scope_level: system-wide | per-service | null
  cached_fields:
    autonomy.level: <value> | null
    spawn_mode: <value> | null
    primary_language: <value> | null   # greenfield only
    framework: <value> | null          # greenfield only
    source_path: <value> | null        # brownfield per-service only
  missing_fields: [<field>, ...]
  docs_provenance: orchestra-generated | unknown
</orchestra-preflight>
```

**First action every dispatcher run.** Read the block. Absent → halt with `[orchestra] preflight hook did not emit — check hooks/hooks.json registration` (do not retry, do not fall back). Surface `AskUserQuestion` only for `missing_fields`. Never re-prompt resolved fields.

## Bootstrap (only for `missing_fields`)

Per-field question shape:

- `autonomy.level` — 5-option `AskUserQuestion` enumerating `EXECUTION_ONLY | JOINT_PROCESSING | OPTION_SYNTHESIS | DRAFT_AND_GATE | FULL_AUTONOMY`. Default suggestion `DRAFT_AND_GATE`. CLI override `--autonomy=<tag>`.
- `spawn_mode` — `subagent` (default) | `teams`. CLI override `--spawn-mode=<value>`.
- `workspace_kind` (only when preflight returned `null`) — `single-repo` | `multi-repo`. Persist to `<context_path>/.orchestra/system.yaml`.
- `service_name` (only when null AND `workspace_kind: multi-repo`) — walk repo-root one level deep for build manifests; surface candidates via `AskUserQuestion`. Reject names containing `/`, `\`, whitespace, `..`, or `system | metrics | inventory`.
- `scope_level` (only when null AND `workspace_kind: multi-repo`) — `system-wide` | `per-service`. Single-repo auto-set to `per-service` by preflight.
- `primary_language`, `framework` (only when `mode: greenfield` AND null) — `AskUserQuestion`.
- `source_path` (only when `mode: brownfield` AND `scope_level: per-service` AND null) — `AskUserQuestion` with the conventional `./services/<service_name>/` path as default plus an Other option for free-text entry. Reject empty values; require the directory exists.

Persist by calling `mcp__orchestra-utils__upsert_local_yaml` with named args (`context_path`, `service_name`, optional `scope_level`, `autonomy`, `spawn_mode`, `primary_language`, `framework`, `source_path`, `status`). Persist workspace identity via `mcp__orchestra-utils__write_system_yaml(workspace_kind, context_path, status)`. Both tools validate against the closed allowlists in `schemas/system.schema.json` / `schemas/local.schema.json` and reject unknown fields server-side. After both succeed, call `mcp__orchestra-utils__bootstrap_consumer_claude_md(context_path)` once — this splices the orchestra section into the consumer's `CLAUDE.md`.

## Run-plan + approval gate

After bootstrap locks: spawn `@lead` with `task: run-plan-author` AND `chain: reverse-pass | forward-chain` (dispatcher sets `chain:` based on which algorithm follows — `code-to-spec` → `reverse-pass`, `spec-to-code` → `forward-chain`, `<intent>` router brownfield → `reverse-pass` on first spawn then `forward-chain` on the post-pause re-spawn). Output: `<context_path>/.orchestra/<service_name>/run-plan.md` per `schemas/run-plan.schema.md`. Emit `run_plan_status: drafted`.

Approval mechanism splits by `chain:` tag (not by `mode` — `mode: brownfield` may still author a forward chain, e.g. adding a new feature to an existing repo):

- **`chain: reverse-pass`** — `@lead` validates `S-FEATURES-001` inside `EnterPlanMode` + native `ExitPlanMode` approval (plan mode walks the existing source to verify the feature enumeration).
- **`chain: forward-chain`** — `@lead` writes the run-plan directly; dispatcher then `AskUserQuestion(approve | revise)` (no source to walk for a feature being minted from intent).

On approval: patch via `mcp__orchestra-utils__upsert_local_yaml(context_path, service_name, auto_mode: true, run_plan_status: approved)`; flip `run-plan.md` frontmatter `run_plan_status: approved` + `status: locked`. On rejection: `run_plan_status: revision_requested`, collect notes, re-spawn `@lead`. Max 3 cycles; cycle 4 → `<context_path>/.orchestra/<service_name>/pipeline/run-plan-ESCALATE.md` with `resolution: pending`.

After `auto_mode: true`: between-phase "proceed?" gates, per-feature confirmations, and autonomy-ladder `DRAFT_AND_GATE` intermediate checkpoints are skipped. Structural-failure halts and `ESCALATE` / `DEADLOCK` emission always preserved.

## spec-to-code algorithm

One fixed chain. Spawn `@lead` with locked decisions:

```
phase: spec-draft
task: forward-chain
inputs: <context_path>/.orchestra/<service_name>/local.yaml, run-plan.md, docs/business-invariants.md (multi-repo only), docs/<service_name>/<service_name>-BR-AC.md
chain: PRD → FRS → SAD → ADR (when triggered) → TDD → openapi/asyncapi → backend code + unit tests → @test-author → @test-runner + @evaluator + @reviewer → TSR
```

`@lead` routes hard-sequential layers and the parallel fan-out (`@backend` ‖ `@frontend` ‖ `@test-author`) gated on `openapi.yaml status: locked`. Converge on `@test-runner` + `@evaluator` + `@reviewer` → `<feature-id>-TSR.md` sections locked.

Mint `<feature-id>` per major feature: `<NNN>-<noun-phrase-slug>`. `NNN = max(existing <NNN>-... under docs/<service_name>/) + 1`. Verb-prefixed slugs rejected; re-prompt for noun-phrase.

## code-to-spec algorithm

Reverse-pass. Never authors source code, tests, or TSR.

**Authorized agent set.** Reverse-pass spawns are restricted to `{@product, @architect, @lead}` — the three documentation-tier agents. Forbidden during `task: reverse-pass`: `{@backend, @frontend, @test-author, @test-runner, @evaluator, @reviewer}`. The dispatcher MUST NOT spawn any forbidden agent; `@lead` MUST NOT fan out to forbidden agents (also stated in `agents/lead.md` "No fan-out spawn during reverse-pass"). TSR files, test code under `src/test/**`, and source files under `src/main/**` are forward-chain output only. Reverse-pass that emits any of these is a structural defect.

Scope resolves from `workspace_kind` + `scope_level` + the optional second token:

| Inputs | Authored artifact set |
|---|---|
| `single-repo` (auto `per-service`) | per-feature `{PRD, FRS, TDD, openapi.yaml}` + service `<service_name>-BR-AC.md`. No SAD. No ADR. No `business-invariants.md`. |
| `multi-repo` + `system-wide` (or `code-to-spec system`) | workspace `SAD.md` + `docs/adr/ADR-*.md` (visible-in-source decisions) + `docs/business-invariants.md` + per-service `<service_name>-BR-AC.md` + per-feature `{PRD, FRS, TDD, openapi.yaml}`. |
| `multi-repo` + `per-service` (or `code-to-spec service:<name>`) | if workspace `SAD.md` absent → first run the `system-wide` row above (auto-promote), then narrow. If present → per-feature `{PRD, FRS, TDD, openapi.yaml}` for the named service only. |

**Source read-root.** When `scope_level: per-service`, every chain agent reads source files from `local.yaml.source_path` (the value persisted from `--source=<path>`). Agents never walk above this root for source inspection. `system-wide` scope ignores `source_path` and reads from `<context_path>` (the workspace root).

**Provenance marker.** First action on first run when preflight reports `docs_provenance: unknown`: spawn `@architect` with `task: provenance-marker` to author `docs/README.md` carrying frontmatter `generated_by: orchestra`. Subsequent runs read this marker before classifying existing artifacts.

**Per-artifact classify-then-author.** For each chain artifact in the authored set:

1. **Inspect.** `Read` the candidate path. Absent → mode `re-author`. Present + frontmatter `generated_by: orchestra` AND `status: locked` → mode `cite-as-is`. Present + frontmatter `generated_by: orchestra` AND `status: draft` → mode `copy-and-modify`. Present without the provenance marker → mode `re-author`.
2. **Author.** Emit per the chosen mode. Frontmatter `reverse_authoring_mode: <mode>` REQUIRED on every code-to-spec-authored artifact (validated by `schemas/pipeline-artifact.schema.md`).
3. **Lock.** `status: draft → locked` once the body is complete.

**Portability contract.** Code-to-spec output is project-portable: every artifact under `docs/**/*.md` carries domain rules ONLY — no `src/**` path tokens, no commit SHAs, no branch names, no repo URLs. PRD/FRS additionally carry no fenced code blocks. `pre-write-check.js` Gate-D inverse enforces at write time. Inline backtick spans (single-line snippets) always allowed.

## `<intent>` router

Freeform intent (anything that isn't `spec-to-code` / `code-to-spec`). Run a minimum of three `AskUserQuestion` rounds BEFORE any agent spawn, even at HIGH confidence:

1. **Q1 — restate intent.** "My reading of the request is: <one sentence>. Is that right?" Accept | clarify.
2. **Q2 — scope.** New feature | modify existing | refactor | docs-only.
3. **Q3 — constraints.** Specific tech / patterns / non-goals (free text via AskUserQuestion's Other option).

Additional questions allowed when uncertainty remains. After the floor passes:

- `mode: brownfield` (per preflight) → run **code-to-spec algorithm** narrowed to the intent's touched service(s); pause; then run **spec-to-code algorithm** against the now-locked baseline.
- `mode: greenfield` → run **spec-to-code algorithm** directly.

The router's three questions cap further confidence-tier dialogue: downstream agents observe `intent_floor: cleared` in the lead spawn prompt and skip their own intent-restate question.

## Shared rules

### Phase-tag emission

Every `Agent({...})` call (dispatcher or agent) MUST prepend `phase: <name>` on its own line. `metrics-collector.js` parses it; without the line, cost-by-phase pivots collapse to `unknown`. Canonical values: `discovery`, `spec-draft`, `verification`, `gap-resolution`, `gate`.

### Status output

Two model-emitted channels (NOT hook output): single-line status at filesystem-coupled transitions; multi-line banner on exception artifacts. No ANSI, no emoji.

| Event | Format |
|---|---|
| Before `Agent({ subagent_type: "<role>" })` | `[orchestra] spawn @<role> → <artifact-target>` |
| After parent `Read(<path>)` returns | `[orchestra] read  @<role> wrote <filename>` |
| Before `AskUserQuestion` pause | `[orchestra] pause: <one-line question>` |
| Terminal state | `[orchestra] shutdown <terminal_state> feature=<feature-id> duration=<Ns>` |

Banner fires after parent `Read` returns an artifact whose basename matches `<feature-id>-DEADLOCK-*.md`, `<feature-id>-ESCALATE-*.md`, or `<feature-id>-ESCALATE-ADR-*.md`:

```
============================================================
[orchestra] <ARTIFACT_TYPE> detected
  triggered_by_<stage|agent>: <value-from-frontmatter>
  resolution: <value-from-frontmatter>
  path: <absolute path to artifact>
============================================================
```

### DEADLOCK / ESCALATE shape

- **DEADLOCK** — cannot make progress (spec gap; 3-rejection threshold). Write `<feature-id>-DEADLOCK-<slug>.md` at `<context_path>/.orchestra/<service_name>/pipeline/<feature-id>/`. Frontmatter: `cause:`, `triggered_by_agent: @<agent>`, `resolution: pending`.
- **ESCALATE** — misrouting or unresolvable scope. Write `<feature-id>-ESCALATE-<slug>.md` (or `-ESCALATE-ADR-<NNNN>.md`). Frontmatter: `reason:`, `triggered_by_agent: @<agent>`, `resolution: pending`.

End turn after writing — `@lead` (or dispatcher) picks up on parent Read.

### Coordination protocol

9 orchestra agents (`@product`, `@architect`, `@lead`, `@backend`, `@frontend`, `@test-author`, `@test-runner`, `@evaluator`, `@reviewer`) are filesystem-coupled. Handoff pattern: parent writes its `Agent(...)` prompt directing the spawned agent to write to a designated path; spawned agent writes; turn ends; idle fires; parent `Read(<path>)` consumes.

**Parent-write carve-out** (narrowly enumerated):

- `<context_path>/.orchestra/system.yaml` — via `mcp__orchestra-utils__write_system_yaml`.
- `<context_path>/.orchestra/<service_name>/local.yaml` — via `mcp__orchestra-utils__upsert_local_yaml`.
- `<context_path>/CLAUDE.md` orchestra section — via `mcp__orchestra-utils__bootstrap_consumer_claude_md`.
- Terminal closing event (no SUMMARY artifact; Stop hook captures terminal state).

### Journey gate

A **journey** = one **terminal-state outcome category** of an aggregate root. Multiple state-machine loops belong to the **same journey** when they reach the same outcome category — even when their internal paths differ. Sub-segments and phases of a single outcome category are NOT sibling journeys.

**Outcome-category partition (author's task).** Partition the aggregate's terminal states into ≤4 mutually-exclusive **outcome categories**. A category is a business-meaningful classification of where the state machine terminates — named from the aggregate's own vocabulary, domain-specific. The author identifies categories by asking: *"From the consumer/user's vantage, which terminal states represent the same outcome story?"* States sharing an outcome story share a category. Recurrent partition shapes (illustrative, not exhaustive): forward-attempt vs abandonment vs reversal (value-transfer domains); decided vs abandoned (approval workflows); succeeded-onboarding vs failed-or-abandoned-onboarding (provisioning); active-with-state-X vs terminated-with-state-Y (long-running-resource). System-actor / ops-actor outcome categories partition separately from user-actor categories.

**Grouping decision rule.** For any two candidate flows: do they reach the SAME outcome category? If yes → same journey, fold the second into the first as an `alt` branch. If no → sibling journeys. State-machine connectivity (do they share intermediate states?) is NOT the grouping criterion — outcome category is.

**Stub rejection.** A candidate with only one hop AND no state transition AND no failure variant is a sub-step, not a journey. Fold into the parent journey of its outcome category.

**Worked example (illustrative — value-transfer aggregate).** For an aggregate whose terminal states are `{PAID, DELIVERED, PARTIAL_DELIVERY, DELIVERY_FAILED, PAYMENT_FAILED, CANCELLED, EXPIRED, REFUNDED}`, a value-transfer partition yields three user-actor categories — *forward-attempt* `{PAID, DELIVERED, PARTIAL_DELIVERY, DELIVERY_FAILED, PAYMENT_FAILED}`, *pre-completion abandonment* `{CANCELLED, EXPIRED}`, *post-completion reversal* `{REFUNDED}` — plus an operational category for system-actor surfaces. Yielding four journeys: `<aggregate>-purchase-lifecycle` (happy + payment-failure as `alt`), `<aggregate>-termination` (user-cancel + TTL-expiry as `alt`), `<aggregate>-refund`, and operational `<aggregate>-reconciliation`. Aggregates in non-value-transfer domains partition differently. The principle is the partition + the grouping decision rule; the category names above are NOT the contract.

## Runtime hooks

7 hook scripts registered in `hooks/hooks.json`. Do not replicate side effects.

| Hook | Events (matchers) | Side effect |
|---|---|---|
| `orchestra-preflight` | UserPromptSubmit (matcher `^/orchestra(?::orchestra)?(\s|$)`) | Detects mode, loads cached system.yaml + local.yaml, derives workspace_kind + scope_level, reads `docs/README.md` provenance marker. Emits `<orchestra-preflight>` block to prompt context. |
| `metrics-collector` | UserPromptSubmit / PreToolUse:Task\|Agent\|TeamCreate\|TeamDelete\|Skill\|Write\|Edit\|MultiEdit\|mcp__orchestra-*\|TaskCreate\|TaskUpdate / SubagentStop / Stop | Emits lifecycle events to `<cwd>/.orchestra/metrics/events.jsonl`. Groups by `run_id`. |
| `pre-write-check` | PreToolUse:Write\|Edit\|MultiEdit | Secrets matcher + Gate-A (status-locked) + Gate-B (sections-all-locked) + Gate-C (readers warning) + Gate-D (chain-cites blocked in `src/**`) + Gate-D-inverse (`src/**` path tokens, commit SHAs, branch names, repo URLs, and PRD/FRS fenced code blocks blocked in `docs/**/*.md`). |
| `val-calibration` | PreToolUse:Task\|Agent | Injects `<calibration-anchor>` block into `@evaluator` spawn prompts. |
| `agent-plan-sync` | PreToolUse:TaskCreate\|TaskUpdate / PostToolUse:TaskCreate / SubagentStop | Owns mutation of per-agent PLAN files. Agent body authors `## Approach` only. |
| `post-bash-lint` | PostToolUse:Bash | Surfaces source-modifying Bash to stderr (observer; never blocks). |
| `post-write-puml` | PostToolUse:Write\|Edit\|MultiEdit | Renders `.puml` → `.svg` via plantuml CLI. Warns when sibling SAD/TDD frontmatter `diagrams: [...]` array omits the rendered diagram name (non-blocking). |

## Usage

```
/orchestra                                                       Print this usage block.
/orchestra spec-to-code <intent>                                 Forward chain (PRD → FRS → SAD → ADR? → TDD → openapi → code+tests → TSR).
/orchestra code-to-spec                                          Reverse chain. Scope derives from workspace_kind + scope_level.
/orchestra code-to-spec system                                   Force scope_level: system-wide (multi-repo).
/orchestra code-to-spec service:<name> --source=<path>           Force scope_level: per-service for the named service; --source is required.
/orchestra <intent>                                              Smart router. ≥3 AskUserQuestion clarifications before any spawn.
```

Flags:
- `--autonomy={EXECUTION_ONLY,JOINT_PROCESSING,OPTION_SYNTHESIS,DRAFT_AND_GATE,FULL_AUTONOMY}` — highest-precedence autonomy resolution.
- `--spawn-mode={subagent,teams}` — override `spawn_mode`.
- `--source=<path>` — read-root for source inspection. REQUIRED when `scope_level: per-service`. Accepts absolute or `cwd`-relative paths; leading `@` (Claude Code path-mention shorthand) is stripped. Persists to `local.yaml.source_path`.
