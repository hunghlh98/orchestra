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
- `code-to-spec` → **code-to-spec algorithm**. Optional second token: `system` (force `scope_level: system-wide`) or `service:<name>` (force `scope_level: per-service` for named service).
- anything else → **`<intent>` router**.

## Preflight contract

`hooks/scripts/orchestra-preflight.js` runs on `UserPromptSubmit` (matcher `^/orchestra(\s|$)`) and emits an `<orchestra-preflight>` YAML block into prompt context. Block shape:

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
  missing_fields: [<field>, ...]
  docs_provenance: orchestra-generated | unknown
  claude_md_state: synced | bootstrapped | absent
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

Persist to `<context_path>/.orchestra/<service_name>/local.yaml` against `schemas/local.schema.json` closed allowlist. Persist `workspace_kind` + `context_path` to `<context_path>/.orchestra/system.yaml` against `schemas/system.schema.json`. Unknown fields fail schema-load.

## Run-plan + approval gate

After bootstrap locks: spawn `@lead` with `task: run-plan-author`. Output: `<context_path>/.orchestra/<service_name>/run-plan.md` per `schemas/run-plan.schema.md`. Emit `run_plan_status: drafted`.

Approval mechanism splits by `mode`:

- **Brownfield** — `@lead` validates `S-FEATURES-001` inside `EnterPlanMode` + native `ExitPlanMode` approval.
- **Greenfield** — `@lead` writes directly; dispatcher then `AskUserQuestion(approve | revise)`.

On approval: write `local.yaml.auto_mode: true` + `run_plan_status: approved`; flip `run-plan.md` frontmatter `run_plan_status: approved` + `status: locked`. On rejection: `run_plan_status: revision_requested`, collect notes, re-spawn `@lead`. Max 3 cycles; cycle 4 → `<context_path>/.orchestra/<service_name>/pipeline/run-plan-ESCALATE.md` with `resolution: pending`.

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

Reverse-pass. Never authors source code, tests, or TSR. Scope resolves from `workspace_kind` + `scope_level` + the optional second token:

| Inputs | Authored artifact set |
|---|---|
| `single-repo` (auto `per-service`) | per-feature `{PRD, FRS, TDD, openapi.yaml}` + service `<service_name>-BR-AC.md`. No SAD. No ADR. No `business-invariants.md`. |
| `multi-repo` + `system-wide` (or `code-to-spec system`) | workspace `SAD.md` + `docs/adr/ADR-*.md` (visible-in-source decisions) + `docs/business-invariants.md` + per-service `<service_name>-BR-AC.md` + per-feature `{PRD, FRS, TDD, openapi.yaml}`. |
| `multi-repo` + `per-service` (or `code-to-spec service:<name>`) | if workspace `SAD.md` absent → first run the `system-wide` row above (auto-promote), then narrow. If present → per-feature `{PRD, FRS, TDD, openapi.yaml}` for the named service only. |

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

- `<context_path>/.orchestra/system.yaml`.
- `<context_path>/.orchestra/<service_name>/local.yaml`.
- Terminal closing event (no SUMMARY artifact; Stop hook captures terminal state).

## Runtime hooks

7 hook scripts registered in `hooks/hooks.json`. Do not replicate side effects.

| Hook | Events (matchers) | Side effect |
|---|---|---|
| `orchestra-preflight` | UserPromptSubmit (matcher `^/orchestra(\s|$)`) | Detects mode, loads cached system.yaml + local.yaml, derives workspace_kind + scope_level, reads `docs/README.md` provenance marker, splices `CLAUDE.md`. Emits `<orchestra-preflight>` block to prompt context. |
| `metrics-collector` | UserPromptSubmit / PreToolUse:Task\|Agent\|TeamCreate\|TeamDelete\|Skill\|Write\|Edit\|MultiEdit\|mcp__orchestra-*\|TaskCreate\|TaskUpdate / SubagentStop / Stop | Emits lifecycle events to `<cwd>/.orchestra/metrics/events.jsonl`. Groups by `run_id`. |
| `pre-write-check` | PreToolUse:Write\|Edit\|MultiEdit | Secrets matcher + Gate-A (status-locked) + Gate-B (sections-all-locked) + Gate-C (readers warning) + Gate-D (chain-cites blocked in `src/**`) + Gate-D-inverse (`src/**` path tokens, commit SHAs, branch names, repo URLs, and PRD/FRS fenced code blocks blocked in `docs/**/*.md`). |
| `val-calibration` | PreToolUse:Task\|Agent | Injects `<calibration-anchor>` block into `@evaluator` spawn prompts. |
| `agent-plan-sync` | PreToolUse:TaskCreate\|TaskUpdate / PostToolUse:TaskCreate / SubagentStop | Owns mutation of per-agent PLAN files. Agent body authors `## Approach` only. |
| `post-bash-lint` | PostToolUse:Bash | Surfaces source-modifying Bash to stderr (observer; never blocks). |
| `post-write-puml` | PostToolUse:Write\|Edit\|MultiEdit | Renders `.puml` → `.svg` via plantuml CLI. Warns when sibling SAD/TDD frontmatter `diagrams: [...]` array omits the rendered diagram name (non-blocking). |

## Usage

```
/orchestra                              Print this usage block.
/orchestra spec-to-code <intent>        Forward chain (PRD → FRS → SAD → ADR? → TDD → openapi → code+tests → TSR).
/orchestra code-to-spec                 Reverse chain. Scope derives from workspace_kind + scope_level.
/orchestra code-to-spec system          Force scope_level: system-wide (multi-repo).
/orchestra code-to-spec service:<name>  Force scope_level: per-service for the named service.
/orchestra <intent>                     Smart router. ≥3 AskUserQuestion clarifications before any spawn.
```

Flags:
- `--autonomy={EXECUTION_ONLY,JOINT_PROCESSING,OPTION_SYNTHESIS,DRAFT_AND_GATE,FULL_AUTONOMY}` — highest-precedence autonomy resolution.
- `--spawn-mode={subagent,teams}` — override `spawn_mode`.
