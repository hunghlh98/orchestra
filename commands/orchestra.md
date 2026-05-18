---
name: orchestra
description: Multi-agent SDLC pipeline. Subcommands spec-to-code | code-to-spec | <intent>.
argument-hint: <subcommand|natural language>
---

# /orchestra dispatcher

Four entry shapes resolve to 9 strategies (S1–S9). Routing is `docs/` state × `src/**` state. Greenfield → forward; brownfield → reverse-then-forward; empty → usage.

## Invariants

7 runtime hooks (see "Runtime hooks" table) own their events and side effects. Do not write to `<cwd>/.orchestra/metrics/events.jsonl`, hash artifact frontmatter, or replicate any hook's work. Provenance and review state live in artifact frontmatter (`status`, `verdict`, `readers`, `sections`); drift detection is `git diff` in CI.

`agent-plan-sync` owns mutation of `tasks:`, `tasks_pending`, `tasks_in_progress`, `tasks_done`, `updated:`, top-level `status:`, and the `## Tasks` checklist body of every per-agent PLAN file under `<cwd>/.orchestra/tasks/<run-id>/<agent>/<feature-id>.md`. Agents author `## Approach` only.

## Strategy dispatch (S1–S9)

| Strategy | Entry | Preconditions | Action |
|---|---|---|---|
| **S1** | `/orchestra` | — | Emit Usage block. No chain. |
| **S2** | `/orchestra spec-to-code` | `docs/` empty, `src/**` empty | Full forward chain: `@product` → `@architect` → `@lead` → fan-out → TSR. |
| **S3** | `/orchestra spec-to-code` | Locked `docs/<feature-id>/` + partial impl OR partial-locked layers | Trust locked frontmatter as-is (no re-validation). Resume at first unlocked layer OR first missing implementer artifact. |
| **S4** | `/orchestra spec-to-code` | Locked N features + `src/**` empty | Enumerate every locked `<feature-id>/`. Spawn N fan-outs in one message (parallel-all). One TSR per feature. |
| **S5** | `/orchestra code-to-spec` | `src/**` exists, no second token | Scope from `system.yaml.workspace_kind`. Single-repo → per-service; multi-repo → system-wide. |
| **S6** | `/orchestra code-to-spec system` | Multi-repo | Force `scope_level: system-wide`. Authors `SAD.md` + ADRs + `business-invariants.md` + per-service BR-AC. |
| **S7** | `/orchestra code-to-spec service:<name> --source=<path>` | `--source=<path>` REQUIRED | Force `scope_level: per-service`. Skip architecture layer. Persist `source_path` to `local.yaml`. |
| **S8** | `/orchestra <intent>` | `src/**` empty (greenfield) | 3× `AskUserQuestion` (restate-intent / scope / constraints). Route to S2/S3/S4 per `docs/` state. |
| **S9** | `/orchestra <intent>` | `src/**` present (brownfield) | 1× `AskUserQuestion` (workspace-kind-adaptive permission gate). `no` → abort. `yes` → S5/S6/S7. After reverse locks: 3× `AskUserQuestion`. Route to S2/S3/S4. |

Locked decisions: S9 gate = `no` → **abort with error** (forward over non-empty `src/**` without baseline is unsafe). S3 → trust locked frontmatter (no re-validation against current `system.yaml`). S4 → parallel-all (no `clientapi.yaml` topo-sort at fan-out).

Out-of-scope: locked N features + partial `src/**` impl is undefined; defer to future brief.

## Parse arguments

First whitespace-token of `$ARGUMENTS`:

- empty → S1 (emit Usage, end turn).
- `spec-to-code` → S2/S3/S4 per `docs/` + `src/**` state.
- `code-to-spec` → S5/S6/S7. Optional second token: `system` (S6) or `service:<name>` (S7; `--source=<path>` REQUIRED).
- anything else → S8 or S9 per `src/**` state.

The `--source=<path>` flag accepts absolute or `cwd`-relative paths; leading `@` (Claude Code path-mention shorthand) is stripped by preflight.

## Preflight contract

`hooks/scripts/orchestra-preflight.js` runs on `UserPromptSubmit` (matcher `^/orchestra(?::orchestra)?(\s|$)`) and emits an `<orchestra-preflight>` YAML block:

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
    primary_database: <value> | null   # greenfield only; omitted when migration_tool: none
    migration_tool: <value> | null     # greenfield only
  missing_fields: [<field>, ...]
  docs_provenance: orchestra-generated | unknown
</orchestra-preflight>
```

**First action every dispatcher run.** Read the block. Absent → halt with `[orchestra] preflight hook did not emit — check hooks/hooks.json registration`. Surface `AskUserQuestion` only for `missing_fields`. Never re-prompt resolved fields.

## Bootstrap (only for `missing_fields`)

Walk `missing_fields` in declaration order. Before each prompt, re-evaluate that field's per-field-shape predicate against in-session answers — skip the prompt when the predicate is now false (e.g. user answered `migration_tool: none`, so `primary_database` predicate fails and the prompt is skipped even though it appeared in the original list). Predicates lift from per-field shapes below.

Per-field shapes:

- `autonomy.level` — 5-option `AskUserQuestion` (`EXECUTION_ONLY | JOINT_PROCESSING | OPTION_SYNTHESIS | DRAFT_AND_GATE | FULL_AUTONOMY`). Default `DRAFT_AND_GATE`. CLI: `--autonomy=<tag>`.
- `spawn_mode` — `subagent` (default) | `teams`. CLI: `--spawn-mode=<value>`.
- `workspace_kind` (only when null) — `single-repo` | `multi-repo`. Persist to `<context_path>/.orchestra/system.yaml`.
- `service_name` (only when null AND `multi-repo`) — walk repo-root one level deep for build manifests; surface candidates. Reject names containing `/`, `\`, whitespace, `..`, or `system | metrics | inventory`.
- `scope_level` (only when null AND `multi-repo`) — `system-wide` | `per-service`. Single-repo auto-set to `per-service`.
- `primary_language`, `framework` (only when `mode: greenfield` AND null).
- `source_path` (only when `mode: brownfield` AND `scope_level: per-service` AND null) — conventional `./services/<service_name>/` default + Other option. Reject empty; require directory exists.
- `migration_tool` (only when `mode: greenfield` AND null) — `flyway` | `liquibase` | `none`. Default `flyway` when `primary_language` ∈ `{java, kotlin}`; `none` otherwise. CLI: `--migration-tool=<value>`. `ddl-auto` is not a valid value.
- `primary_database` (only when `mode: greenfield` AND `migration_tool != none` AND null) — free-text dialect tag (`postgresql` | `mysql` | `mariadb` | `sqlite` | `mssql` | Other). Drives SQL dialect for migration authoring.

Persist via `mcp__orchestra-utils__upsert_local_yaml` (`context_path`, `service_name`, optional `scope_level`, `autonomy`, `spawn_mode`, `primary_language`, `framework`, `source_path`, `primary_database`, `migration_tool`, `status`). Workspace identity via `mcp__orchestra-utils__write_system_yaml(workspace_kind, context_path, status)`. Both validate against `schemas/{system,local}.schema.json` and reject unknown fields. After both succeed, call `mcp__orchestra-utils__claude_md(context_path)` once — splices orchestra section into consumer's `CLAUDE.md`.

## Run-plan + approval gate

After bootstrap locks: spawn `@lead` with `task: run-plan-author` AND `chain: reverse-pass | forward-chain` (dispatcher sets `chain:` per algorithm — `code-to-spec` → `reverse-pass`, `spec-to-code` → `forward-chain`, `<intent>` brownfield → `reverse-pass` then `forward-chain` post-pause). `@lead` Writes `<context_path>/.orchestra/<service_name>/run-plan.md` per `schemas/run-plan.schema.md` with frontmatter `status: draft, run_plan_status: drafted` and ends turn. Dispatcher owns the approval gate — `@lead` MUST NOT call `EnterPlanMode` / `ExitPlanMode` (subagent permission frame is frozen at spawn).

On `@lead` return:

1. `Read(<context_path>/.orchestra/<service_name>/run-plan.md)`.
2. Approval splits by `chain:` (not by `mode`):
   - **`chain: reverse-pass`** — `EnterPlanMode` with the run-plan body as the plan content (`S-FEATURES-001` is the load-bearing section reviewer scans); `ExitPlanMode` collects accept/reject.
   - **`chain: forward-chain`** — `AskUserQuestion(approve | revise)`.
3. Accept → `mcp__orchestra-utils__upsert_local_yaml(context_path, service_name, auto_mode: true, run_plan_status: approved)`; flip run-plan frontmatter `run_plan_status: approved` + `status: locked` via `Write` (dispatcher has unrestricted write surface; Gate-A inapplicable to `.orchestra/**`).
4. Reject/revise → flip frontmatter `run_plan_status: revision_requested`; capture reviewer notes; re-spawn `@lead` with notes lifted into `## Revision notes` under `S-APPROVAL-001` and `revision_cycle` incremented. Max 3 cycles; cycle 4 → `pipeline/run-plan-ESCALATE.md`.

After `auto_mode: true`: between-phase "proceed?" gates, per-feature confirmations, and `DRAFT_AND_GATE` checkpoints skip. Structural-failure halts + `ESCALATE` / `DEADLOCK` emission always preserved.

## Algorithm payloads

### spec-to-code (S2/S3/S4)

Spawn `@lead` with locked decisions:

```
phase: spec-draft
task: forward-chain
inputs: <context_path>/.orchestra/<service_name>/local.yaml, run-plan.md, docs/business-invariants.md (multi-repo only), docs/<service_name>/<service_name>-BR-AC.md
chain: PRD → FRS → SAD → ADR (when triggered) → TDD → openapi/asyncapi → backend code + unit tests → @test-author → @test-runner + @evaluator + @reviewer → TSR
```

`@lead` routes hard-sequential layers + parallel fan-out (`@backend` ‖ `@frontend` ‖ `@test-author`) gated on `openapi.yaml status: locked`. Converge on `@test-runner` + `@evaluator` + `@reviewer` → `<feature-id>-TSR.md` sections locked.

**Inter-feature parallel spawn (S4).** `S-FEATURES-001` with ≥2 features, distinct aggregate roots / distinct services, no dependency edge → dispatcher spawns `@lead` per feature in ONE message.

**Feature-id minting.** Shape `<NNN>-<noun-phrase-slug>` (NNN = max existing + 1). Slug = tech / CRUD / lifecycle noun (`order`, `order-checkout`, `order-refund`, `<aggregate>-purchase-lifecycle`, `<aggregate>-termination`). Reject Journey-gate category labels (`forward-purchase`, `abandonment`, `reversal`), verb-prefixed slugs.

### code-to-spec (S5/S6/S7)

Reverse-pass. Never authors source, tests, or TSR.

**Authorized agent set.** `{@product, @architect, @lead}` only. Forbidden during `task: reverse-pass`: `{@backend, @frontend, @test-author, @test-runner, @evaluator, @reviewer}`. Dispatcher MUST NOT spawn forbidden agents; `@lead` MUST NOT fan out to them. Reverse-pass emitting `src/main/**`, `src/test/**`, or TSR = structural defect.

Authored set by scope:

| Scope | Artifacts |
|---|---|
| `single-repo` (auto `per-service`) | per-feature `{PRD, FRS, TDD, openapi.yaml}` + `<service_name>-BR-AC.md`. No SAD/ADR/`business-invariants.md`. |
| `multi-repo` + `system-wide` | workspace `SAD.md` + `docs/adr/ADR-*.md` (visible-in-source) + `docs/business-invariants.md` + per-service BR-AC + per-feature artifacts. |
| `multi-repo` + `per-service` | if workspace `SAD.md` absent → auto-promote: run `system-wide` row first, then narrow. If present → per-feature artifacts for named service only. |

**Auto-promote spawn brief.** When auto-promote fires, dispatcher composes `@architect` spawn at workspace scope:

- `task: workspace-sad-author` (not `service-sad-touch` — disambiguates scope at spawn boundary).
- `scope_frame: workspace` — brief names workspace as "system under design"; source-read-rooted service is one container among siblings.
- Container source: `<context_path>/CLAUDE.md` "Service Topology" table. Every entry → `Container(...)` row in `S-CONTAINERS-001` + `Container()` entry inside `System_Boundary(workspace, ...)` of `c4-container.puml`.
- Forbidden: any workspace-topology service rendered as `System_Ext(...)`. Only external systems (upstream merchants, third-party networks) are `System_Ext`.
- Post-lock: dispatcher re-spawns `@architect` with `task: per-service-narrowing` for originally requested service.

Auto-promote also patches run-plan: `auto_promote_workspace_sad: true` in frontmatter + `S-SCOPE-UPGRADE-001` anchor declares upgrade (human reviewer sees it before approving).

**Source read-root.** `per-service` → every chain agent reads from `local.yaml.source_path`. `system-wide` → reads from `<context_path>` (workspace root). Auto-promote inherits `system-wide` for workspace pass, reverts to `per-service` for narrowing pass.

**Provenance marker.** First run when preflight reports `docs_provenance: unknown` → spawn `@architect` with `task: provenance-marker`. `@architect` calls `mcp__orchestra-utils__docs_readme(context_path)` — the tool pins frontmatter (`id: docs-readme`, `type: README`, `generated_by: orchestra`, `status: locked`) and writes a canonical body from `hooks/references/docs-readme.template.md`. No improvisation, no `Write` author path.

**SAD pre-pass cohort.** When auto-promote AND provenance marker BOTH required on the same reverse-pass entry, dispatcher MUST spawn `@architect task: provenance-marker` + `@architect task: workspace-sad-author` in ONE message as a 2-element cohort (no read-dependency between them). Sequential spawn surfaces as `cohort.spawn.staggered` warning.

**Per-artifact classify-then-author.** For each chain artifact: Absent → `re-author`. Present + `generated_by: orchestra` AND `status: locked` → `cite-as-is`. Present + `generated_by: orchestra` AND `status: draft` → `copy-and-modify`. Present without provenance marker → `re-author`. Frontmatter `reverse_authoring_mode: <mode>` REQUIRED.

**Portability contract.** Every artifact under `docs/**/*.md` carries domain rules ONLY — no `src/**` path tokens, commit SHAs, branch names, repo URLs. PRD/FRS additionally carry no fenced code blocks. `pre-write-check.js` Gate-D-inverse enforces. Inline backtick spans (single-line snippets) always allowed.

### `<intent>` router (S8/S9)

Branches per preflight `mode:`:

- `greenfield` → S8: 3× `AskUserQuestion` upfront (Q1 restate intent / Q2 scope / Q3 constraints). Route to S2/S3/S4 per `docs/` state.
- `brownfield` → S9: 1× `AskUserQuestion` workspace-kind-adaptive permission gate. `no` → abort with error. `yes` → S5/S6/S7. After reverse locks: 3× `AskUserQuestion` post-reverse (now informed). Route to S2/S3/S4.

Router's questions cap further confidence-tier dialogue: downstream agents observe `intent_floor: cleared` in lead spawn prompt and skip their own intent-restate.

## Shared rules

### Phase-tag emission

Every `Agent({...})` call MUST prepend `phase: <name>` on its own line. Canonical values: `discovery`, `spec-draft`, `verification`, `gap-resolution`, `gate`.

### Parallel-spawn discipline

Cohort of N agents (feature fan-out, BR-AC fan-out, SAD pre-pass cohort) MUST emit ALL `Agent({...})` calls in ONE assistant message. Staggered spawns across multiple messages are a structural violation; `metrics-collector` flags them as `cohort.spawn.staggered` warnings on `runs/<id>.json`. Tool-call batching is one message containing N tool-use blocks — not N messages each containing one block.

### Status output

Model-emitted (NOT hook output): single-line at filesystem-coupled transitions; multi-line banner on exception artifacts. No ANSI, no emoji.

| Event | Format |
|---|---|
| Before `Agent({ subagent_type: "<role>" })` | `[orchestra] spawn @<role> → <artifact-target>` |
| After parent `Read(<path>)` returns | `[orchestra] read  @<role> wrote <filename>` |
| Before `AskUserQuestion` pause | `[orchestra] pause: <one-line question>` |
| Terminal state | `[orchestra] shutdown <terminal_state> feature=<feature-id> duration=<Ns>` |

Banner fires after parent `Read` returns artifact whose basename matches `<feature-id>-DEADLOCK-*.md`, `<feature-id>-ESCALATE-*.md`, or `<feature-id>-ESCALATE-ADR-*.md`:

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

9 orchestra agents are filesystem-coupled. Handoff: parent writes `Agent(...)` prompt directing spawned agent to write to designated path; spawned writes; turn ends; idle fires; parent `Read(<path>)` consumes.

Parent-write carve-out (narrow): `<context_path>/.orchestra/system.yaml` via `mcp__orchestra-utils__write_system_yaml`; `<context_path>/.orchestra/<service_name>/local.yaml` via `mcp__orchestra-utils__upsert_local_yaml`; `<context_path>/CLAUDE.md` orchestra section via `mcp__orchestra-utils__claude_md`; `<context_path>/docs/README.md` provenance marker via `mcp__orchestra-utils__docs_readme`; terminal closing event (no SUMMARY artifact; Stop hook captures terminal state).

### Journey gate

A **journey** = one **terminal-state outcome category** of an aggregate root. Multiple state-machine loops belong to the same journey when they reach the same outcome category — even when internal paths differ.

**Outcome-category partition.** Partition aggregate's terminal states into ≤4 mutually-exclusive **outcome categories**. Author asks: *"From consumer's vantage, which terminal states represent the same outcome story?"* Recurrent shapes (illustrative): forward-attempt vs abandonment vs reversal (value-transfer); decided vs abandoned (approval); succeeded-onboarding vs failed-or-abandoned (provisioning); active-with-state-X vs terminated-with-state-Y (long-running-resource). System-actor / ops-actor categories partition separately from user-actor.

**Grouping rule.** Two candidate flows reaching SAME outcome category → same journey (fold as `alt` branch). Different → sibling journeys. State-machine connectivity is NOT the criterion — outcome category is.

**Stub rejection.** One hop + no transition + no failure variant = sub-step, not journey. Fold into parent journey of its outcome category.

Worked example (value-transfer aggregate, `{PAID, DELIVERED, PARTIAL_DELIVERY, DELIVERY_FAILED, PAYMENT_FAILED, CANCELLED, EXPIRED, REFUNDED}`): yields three user-actor categories (forward-attempt / pre-completion abandonment / post-completion reversal) + operational. Four journeys: `<aggregate>-purchase-lifecycle` (happy + payment-failure as `alt`), `<aggregate>-termination` (user-cancel + TTL-expiry as `alt`), `<aggregate>-refund`, operational `<aggregate>-reconciliation`. Non-value-transfer domains partition differently — names above are NOT the contract.

## Runtime hooks

7 scripts in `hooks/hooks.json`. Do not replicate side effects.

| Hook | Events (matchers) | Side effect |
|---|---|---|
| `orchestra-preflight` | UserPromptSubmit (`^/orchestra(?::orchestra)?(\s|$)`) | Detects mode, loads cached system.yaml + local.yaml, derives workspace_kind + scope_level, reads `docs/README.md` provenance marker. Emits `<orchestra-preflight>` block. |
| `metrics-collector` | UserPromptSubmit / PreToolUse:Task\|Agent\|TeamCreate\|TeamDelete\|Skill\|Write\|Edit\|MultiEdit\|mcp__orchestra-*\|TaskCreate\|TaskUpdate / SubagentStop / Stop | Emits lifecycle events to `<cwd>/.orchestra/metrics/events.jsonl`. Groups by `run_id`. |
| `pre-write-check` | PreToolUse:Write\|Edit\|MultiEdit | Secrets matcher + Gate-A (status-locked) + Gate-B (sections-all-locked) + Gate-C (readers warning) + Gate-D (chain-cites blocked in `src/**`) + Gate-D-inverse (`src/**` tokens, SHAs, branches, repo URLs, PRD/FRS fenced code blocks blocked in `docs/**/*.md`). |
| `val-calibration` | PreToolUse:Task\|Agent | Injects `<calibration-anchor>` block into `@evaluator` spawn prompts. |
| `agent-plan-sync` | PreToolUse:TaskCreate\|TaskUpdate / PostToolUse:TaskCreate / SubagentStop | Owns per-agent PLAN file mutation. Agent body authors `## Approach` only. |
| `post-bash-lint` | PostToolUse:Bash | Surfaces source-modifying Bash to stderr (observer; never blocks). |
| `post-write-puml` | PostToolUse:Write\|Edit\|MultiEdit | Renders `.puml` → `.svg` via plantuml CLI. Warns when sibling SAD/TDD frontmatter `diagrams: [...]` omits the rendered name (non-blocking). |

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
- `--source=<path>` — read-root for source inspection. REQUIRED when `scope_level: per-service`. Accepts absolute or `cwd`-relative; leading `@` (path-mention shorthand) is stripped. Persists to `local.yaml.source_path`.
