---
name: orchestra
description: 4-phase pipeline. Discovery → Plan (PlanMode) → Swarm → Convergence. Greenfield forward, brownfield reverse-then-forward, freeform intent router.
argument-hint: [spec-to-code|code-to-spec [system|service:<name> --source=<path>]|<intent>] [tail]
allowed-tools: ["Read", "Glob", "Grep", "Write", "Edit", "Bash", "Agent", "AskUserQuestion", "Workflow"]
---

# /orchestra

Routes `/orchestra` invocations to a 4-phase pipeline. Main thread owns orchestration; subagents are single-purpose authors. One approval gate via native PlanMode; one parallel swarm under a locked plan.

## Usage

```
/orchestra                                              Print this block. No chain.
/orchestra spec-to-code [<intent>]                      Greenfield forward chain.
/orchestra code-to-spec                                 Brownfield reverse chain. Scope auto-detects.
/orchestra code-to-spec system                          Force scope_level: system-wide (multi-repo).
/orchestra code-to-spec service:<name> --source=<path>  Force scope_level: per-service. --source REQUIRED.
/orchestra <intent>                                     Freeform router. Three AskUserQuestion rounds (restate-intent / scope / constraints) before any spawn.
```

**Flags:**

- `--autonomy={EXECUTION_ONLY,JOINT_PROCESSING,OPTION_SYNTHESIS,DRAFT_AND_GATE,FULL_AUTONOMY}` — autonomy resolution.
- `--spawn-mode={subagent,teams}` — spawn shape.
- `--source=<path>` — read-root for source inspection. REQUIRED with `scope_level: per-service`. Absolute or `cwd`-relative; leading `@` stripped.

## Parse `$1` / `$ARGUMENTS`

`$1` (first whitespace-token) is the subcommand selector. `$ARGUMENTS` is the full tail (Q1 restate-intent seed for the router path).

| `$1` | Entry | `$ARGUMENTS` use |
|---|---|---|
| empty | print Usage block, end turn | — |
| `spec-to-code` | greenfield forward chain | tail = feature-slug seed + PRD title seed |
| `code-to-spec` | brownfield reverse chain | scope from `system.yaml.workspace_kind` |
| `code-to-spec system` | brownfield, force `scope_level: system-wide` | — |
| `code-to-spec service:<name> --source=<path>` | brownfield, force `scope_level: per-service` | `--source=<path>` REQUIRED |
| anything else | freeform router; 3× `AskUserQuestion` before any spawn | full `$ARGUMENTS` = Q1 restate-intent seed (never re-asked) |

The router path runs three minimum clarifications even at HIGH classifier confidence (restate-intent / scope / constraints). Q1 seeds from `$ARGUMENTS` — confirms instead of re-asking.

## Preflight contract

`hooks/scripts/orchestra-preflight.js` runs on `UserPromptSubmit` (matcher `^/orchestra(?::orchestra)?(\s|$)`) and emits an `<orchestra-preflight>` YAML block to additional context. Block fields:

- `session_id` — Claude Code session-id (from hook stdin `input.session_id`); used as run-id and as the key under `.orchestra/plans/<session-id>/`.
- `mode` — `greenfield` | `brownfield`
- `workspace_kind` — `single-repo` | `multi-repo` | `null`
- `service_name` — `<string>` | `null`
- `scope_level` — `system-wide` | `per-service` | `null`
- `cached_fields` — `autonomy.level`, `spawn_mode`, `primary_language`, `framework`, `source_path`, `primary_database`, `migration_tool` (each `<value>` or `null`)
- `missing_fields` — `[<field>, ...]`
- `docs_provenance` — `orchestra-generated` | `unknown`

**First action every `/orchestra` run.** Read the block. Absent → halt with `[orchestra] preflight hook did not emit — check hooks/hooks.json registration`. Surface `AskUserQuestion` only for `missing_fields`. Never re-prompt resolved fields.

## Bootstrap

Walk `missing_fields` in declaration order. Before each prompt, re-evaluate per-field predicate against in-session answers — skip when false.

| Field | Shape | Default / predicate |
|---|---|---|
| `autonomy.level` | 5-option `AskUserQuestion`: `EXECUTION_ONLY` \| `JOINT_PROCESSING` \| `OPTION_SYNTHESIS` \| `DRAFT_AND_GATE` \| `FULL_AUTONOMY` | Default `DRAFT_AND_GATE`. CLI: `--autonomy=<tag>`. |
| `spawn_mode` | `subagent` \| `teams` | Default `subagent`. CLI: `--spawn-mode=<value>`. |
| `workspace_kind` | `single-repo` \| `multi-repo` | Only when null. Persist via `mcp__orchestra-utils__write_system_yaml`. |
| `service_name` | walk repo-root for build manifests; surface candidates | Only when null AND `multi-repo`. Reject names containing `/`, `\`, whitespace, `..`, or `system` \| `metrics` \| `inventory`. |
| `scope_level` | `system-wide` \| `per-service` | Only when null AND `multi-repo`. Single-repo auto-set to `per-service`. |
| `primary_language`, `framework` | free-text + Other | Only when `mode: greenfield` AND null. |
| `source_path` | conventional `./services/<service_name>/` default + Other | Only when `mode: brownfield` AND `scope_level: per-service` AND null. Reject empty; require directory exists. |
| `migration_tool` | `flyway` \| `liquibase` \| `none` | Only when `mode: greenfield` AND null. Default `flyway` when `primary_language` ∈ `{java, kotlin}`; `none` otherwise. `ddl-auto` is invalid. CLI: `--migration-tool=<value>`. |
| `primary_database` | `postgresql` \| `mysql` \| `mariadb` \| `sqlite` \| `mssql` \| Other | Only when `mode: greenfield` AND `migration_tool != none` AND null. Drives SQL dialect. |

Persist via `mcp__orchestra-utils__upsert_local_yaml`. Workspace identity via `mcp__orchestra-utils__write_system_yaml`. After both succeed, call `mcp__orchestra-utils__claude_md(context_path)` — splices orchestra section into consumer's `CLAUDE.md`.

## Phase 1 — Discovery

Main agent in default tool frame (NOT plan mode). Full tools available.

1. Read `<orchestra-preflight>` block from additional context. Classify entry shape from `$1` × `mode`.
2. Execute Bootstrap above for any `missing_fields`.
3. (Brownfield only) Spawn `@explorer` fan-out in ONE message — one spawn per service in scope. Each `@explorer` reads `src/**` for its service and authors a report at `.orchestra/plans/<session-id>/discovery/<service>.md`.
4. Read every discovery report after `SubagentStop` fires for the last explorer.
5. (Greenfield) Skip step 3-4. Phase 1 closes after Bootstrap.

Brownfield reverse-pass per-service classifier: single-repo → `per-service`; multi-repo + no second token → `system-wide`. Authored set by scope:

| Scope | Phase-3 authored set |
|---|---|
| `single-repo` (auto `per-service`) | per-feature `{PRD, FRS, TDD, openapi.yaml}` + `<service_name>-BR-AC.md`. No SAD/ADR/`business-invariants.md`. |
| `multi-repo` + `system-wide` | workspace `SAD.md` + `docs/adr/ADR-*.md` + `docs/business-invariants.md` + per-service BR-AC + per-feature artifacts. |
| `multi-repo` + `per-service` | if workspace `SAD.md` absent → auto-promote: run `system-wide` first, then narrow. Else per-feature artifacts for named service only. |

Router path (S8/S9 freeform intent): execute three `AskUserQuestion` rounds (restate-intent / scope / constraints) BEFORE any agent spawn. Q1 seeds from `$ARGUMENTS`. Cleared confidence-floor surfaces as `intent_floor: cleared` in downstream spawn prompts; downstream agents skip their own intent-restate.

## Phase 2 — Plan (split: 2a Author + 2b Lock + 2c Revision, around a turn boundary)

Phase 2 spans a turn boundary because `ExitPlanMode` is async — the tool submits the plan body, the assistant turn ends, and approval arrives in the next user message.

### Phase 2a — Author (Turn 1, ends with ExitPlanMode)

6. Main agent calls `EnterPlanMode`. Tool returns; plan-mode UI engages. Read-only research tools remain available (`Read`, `Grep`, `Glob`, read-only `Bash`); `Write` / `Edit` / `Task` blocked while plan mode active.
7. Main agent composes the run-plan body INLINE in conversation context (cannot `Write` to disk while in plan mode). Reads required inputs: preflight block, `<service>/features.yaml`, `.orchestra/cross-features.yaml` (workspace-grain cross-service feature DAG; emit `cross_feature` cell on features whose `<service_name>:<feature-id>` pair appears in any `cross_features[].members` entry), discovery reports (brownfield), `<service>/local.yaml`. Invokes `skills/task-breakdown` for assignment decomposition.

The composed body MUST carry three sections per `schemas/run-plan.schema.md`:

- **`## Features`** — DAG of features to author. Per-feature: `<feature-id>`, `classifier` (`business` | `tech`), `depends_on`, `supersedes`, per-feature artifact slots + per-service singleton touches. Apply the `@explorer` Feature-boundary test to discovery rows before lifting them: merge shared-pipeline endpoints into one feature, demote no-endpoint internal code to a component of its caller. The discovery table is an input, not a verdict; the user confirms the resulting boundaries at the PlanMode gate.
- **`## Agent assignments`** — per-artifact mapping of output path to authoring subagent. Plan author (main agent) lifts the relevant subset from the canonical ownership matrix per scope + chain direction + classifier. Author lines REFERENCE the agent by handle (`"@product"`); never inline agent prompts.
- **`## Risks + decisions`** — ADR-worthy decisions surfaced upfront, preflight constraints (autonomy / spawn-mode / language), revision cycle cap (3, per Phase 2c), auto-mode behavior on approval, known unknowns.

8. Main agent calls `ExitPlanMode({plan: <run-plan body>})`. Tool submits; turn ends.

═══ **Turn boundary** — user reviews plan in native PlanMode panel ═══

Approval-signal routing on next user message:

- **Clear approve** → Phase 2b Lock; next turn restores full tool access.
- **Clear reject (with feedback)** → Phase 2c Revision loop; next turn begins still in plan mode.
- **Ambiguous** (mixed approve+reject tokens — e.g. "approved but change X") → main agent fires ONE clarifying `AskUserQuestion` (Approve as-is / Reject with these changes); routes from answer.
- **4th cycle still rejected** → main agent Writes `.orchestra/plans/<session-id>/run-plan-DEADLOCK.md` documenting rejection causes; ends turn for user intervention.

### Phase 2b — Lock (Turn 2, default mode restored on approval)

9. Main agent Writes `.orchestra/plans/<session-id>/run-plan.md` with `status: locked`, `run_plan_status: approved`, plus full plan body lifted from the approved `ExitPlanMode` submission.
10. **Task ledger — select the path's ledger; no `TaskCreate` emitted at lock.** The Agent-fallback path uses a `TaskCreate` ledger: one row per `## Agent assignments` entry — `agent` (e.g., `@architect`), `feature_id`, `artifact_path`, `status: pending` — emitted at Phase-3 dispatch (step 11), batched in the SAME message as the `Agent` spawns, never here at lock. The Workflow path carries its ledger in the workflow's `args.tasks` DAG and structured return; it emits no `TaskCreate`.

### Phase 2c — Revision (reject path, ≤3 cycles)

Fires only on Reject from the Phase 2a turn-boundary signal routing above. Main agent remains in plan mode (no `ExitPlanMode` returns success on reject; tool frame stays read-only-research). Loop body per cycle `N ∈ {1, 2, 3}`:

R1. **Read** reject-comment from the next user message. Classify scope hint: `per-service` (names a service), `per-feature` (names a feature-id), `cross-cutting` (workspace-level), or `unclassified`.

R2. **Self-explore.** Main agent runs targeted `Read` / `Grep` / read-only `Bash` against the hinted scope. NOT a subagent respawn — main agent already holds Phase 1 reports in context; cheap targeted reads fill the gap faster than rebuilding via swarm.

- `per-service` → `Read` named service's `local.yaml`, `features.yaml`, prior discovery report; `Grep` source surface for the missed concern.
- `per-feature` → `Read` the feature's prior chain artifacts; `Grep` cross-references.
- `cross-cutting` → `Read` SAD / business-invariants if present; `Glob` for missed services.
- `unclassified` → main agent infers scope from comment prose; if still unable, fires ONE `AskUserQuestion` to disambiguate (counts as part of cycle).

R3. **Append supplemental finding** at `.orchestra/plans/<session-id>/discovery/supplemental-cycle-<N>.md`. Brownfield + greenfield both Write this file; the path documents the new evidence so subsequent cycles + audit trail see it.

R4. **Recompose** plan body inline (still in plan mode). Incorporate new evidence; recompute `## Features` / `## Agent assignments` / `## Risks + decisions` deltas.

R5. **Re-submit** via `ExitPlanMode({plan: <revised body>})`. Turn ends; approval-signal evaluation repeats per the Phase 2a turn-boundary block above.

**Cycle == 3 still rejected → DEADLOCK.** Main agent Writes `.orchestra/plans/<session-id>/run-plan-DEADLOCK.md` containing: (a) original plan body; (b) per-cycle reject comment + supplemental evidence; (c) summary of unresolved cause. Ends turn. User takes over (manual triage, plan revision in a fresh session via `claude --fork-session`).

## Phase 3 — Swarm (Turn 2, default mode, same turn as Phase 2b Lock)

Main agent has full tool access post-approval. Same turn as Phase 2b.

11. **Swarm dispatch — two execution paths, picked by `Workflow`-tool availability.**

**Workflow path (preferred — native workflows available).** Main agent emits ONE `Workflow({...})` call. The script is a task-DAG scheduler built from the locked plan's `## Agent assignments` + `S-FEATURES-001`. `args.tasks` carries one node per swarm participant per feature: `{ id: task_id, owner, blockedBy (feature `depends_on` ∪ intra-feature edges), writes (`service_singletons_touched` ∪ owned paths), exit, status, is_verdict }`. The script promise-memoizes each node (run-once even under diamond deps), gates a node on its `blockedBy` parents, drops a node's subtree to `skipped` when a verdict parent (`@evaluator` / `@reviewer`) returns non-PASS, and serializes nodes with intersecting `writes` via a per-path mutex. Each node spawns its owner via `agent({ agentType, schema })`; structured returns replace prose re-parsing. Keep each node's return `schema` lean — `{ artifact_path, status, note }`, `note` ≤ ~200 chars — so the main thread folds back a pointer, not the work: full rationale, corrections, and artifact bodies live in the on-disk artifact and are re-read on demand, never inlined into the return. Phase 4 convergence folds in as verdict-tail nodes. On return, the main agent runs the Post-pass deliverable check against the structured `artifacts_written` summary — the structured return is the Workflow path's ledger of record (no `TaskCreate` / `TaskList` on this path).

**Agent-fallback path (workflows unavailable).** Main agent emits ONE message with N × `Agent({...})` calls — one per swarm participant per feature per `## Agent assignments`. Each spawn prompt carries: `phase: spec-draft` (or `discovery` / `verification` / `gap-resolution` per intent), `feature_id`, `task_id` (matching the `TaskCreate` ledger row emitted in this same message, per step 10), owned-path list. Steps 12-14 govern this path.

12. Subagents execute in parallel. Each opens with `TaskUpdate(task_id, status: in_progress)`; authors assigned artifact(s); closes with `TaskUpdate(task_id, status: completed)` on success or `status: cancelled` on ESCALATE escape.
13. `SubagentStop` hook fires per subagent termination, projecting the subagent's `TaskCreate` / `TaskUpdate` activity into the session-level ledger at `.orchestra/plans/<session-id>/agent-tasks.md`.
14. Main agent verifies Phase 3 completion before advancing to Phase 4 — Agent-fallback path reads `TaskList` (all Phase-3 tasks in `completed` status); Workflow path checks the structured return covers every `## Agent assignments` row.

**Single-writer surfaces stay serial.** Concurrent features touching the same per-service singleton (`<service>-openapi.yaml` / `c4-component.puml` / `erd-logical.puml` / `state-machine.puml` / `usecase.puml` / `<service>-BR-AC.md`) or workspace singleton (`SAD.md` / `business-invariants.md` / `c4-context.puml` / `c4-container.puml` / `erd-logical.puml`) serialize at the authoring agent's spawn level. Agent-fallback path: main agent enforces by NOT batching parallel spawns when their `service_singletons_touched` paths intersect. Workflow path: the emitted script's per-path write-mutex enforces the same serialization (intersecting `writes` → mutual exclusion).

**Brownfield Phase 3 ordering.** Within each feature, authors run sequentially: `@architect` (derives TDD + appends to per-service openapi / c4-component / erd / state-machine) → `@analyst` (derives FRS + appends to per-service usecase) → `@product` (synthesizes PRD + writes `features.yaml` entry). Inter-feature parallelism preserved: features at the same DAG rank spawn in parallel cohorts. Workflow path: this ordering is encoded as `blockedBy` edges in `args.tasks` — the intra-feature author chain plus feature `depends_on`.

**Per-artifact `reverse_authoring_mode`.** Every brownfield reverse-pass author runs **classify → author → lock** against each target artifact path. Provenance + on-disk status drive a three-value frontmatter enum:

- **`cite-as-is`** — artifact at this path is `present-locked` AND already in plugin format (frontmatter shape matches [pipeline-artifact.schema.md](../schemas/pipeline-artifact.schema.md)). Lift unchanged as input to subsequent chain authors; no re-write.
- **`copy-and-modify`** — artifact present but format-drift in frontmatter / anchors. Adapt frontmatter + anchors; preserve body content.
- **`re-author`** — artifact absent OR `present-draft` with structural divergence. Full rewrite.

`docs/README.md` `generated_by: orchestra` provenance marker (read by `orchestra-preflight`) decides eligibility — absent marker pins every reverse-pass author to `re-author`. `spec-to-code`-authored artifacts omit the field; the forward chain has no prior state to classify against.

**Post-pass deliverable check.** Main agent walks each spawn's owned paths (lifted from the locked plan's `## Agent assignments`) after the subagent returns. Absent paths → `Write(<context_path>/.orchestra/<service_name>/pipeline/<feature-id>/MISSING-DELIVERABLES-<service>.md)` listing the absent paths; re-spawn the same `subagent_type` with `task: deliverable-gap-fill` and the absent-path list. Cycles until coverage closes or the gap-fill spawn returns ESCALATE.

**Incremental reverse-pass (Java).** If `<context_path>/.orchestra/<service_name>/code-graph/fingerprints.json` exists from a prior run, narrow scope before spawning: re-extract the service graph (`skills/java-development/scripts/extract-java-graph.mjs`), run `classify-graph-diff.mjs fingerprints.json <new-graph> diff.json`, and pin Phase-3 reverse-pass authoring to features touching `diff.structural` + `diff.added` files only — `unchanged` features keep their locked artifacts. The `code-graph-stale` hook surfaces when a refresh is due. Absent baseline → full reverse pass. `@architect` rebuilds the baseline at close.

## Phase 4 — Convergence (forward chain only) <a id="phase-3-to-4-handoff"></a>

Reverse-pass produces no source impl; no convergence in reverse mode. Phase 4 trivially completes when last `@product` returns. Forward-chain `spec-to-code` follow-up against the locked reverse-derived baseline carries the full convergence.

For forward chain:

15. Main agent spawns `@test-runner` (sequential — needs all impl present).
16. `@test-runner` returns. Main agent spawns `@evaluator` ‖ `@reviewer` in ONE message (parallel — independent verdicts).
17. TSR `S-TEST-001` / `S-EVAL-001` / `S-REVIEW-001` sections lock. Terminal state.

## Ratify-spec on locked artifacts

Two resolutions for verification-phase divergence:

- **`ratify-spec`** — invariant correct, artifact locked. Unlock → re-author → re-lock via `mcp__orchestra-utils__amend_locked_artifact` + `relock_artifact`. Producer-mapping + row format + append-only contract: [changelog-block](../schemas/pipeline-artifact.schema.md#changelog-block).
- **`fix-source`** — source diverged from a still-correct spec; main thread writes corrections to `src/**`; artifact stays untouched.

**Portability contract.** `docs/**/*.md` carries domain rules only — no `src/**` paths, commit SHAs, branch names, repo URLs; PRD/FRS additionally no fenced code blocks. Shape: [link-discipline](../schemas/pipeline-artifact.schema.md#link-discipline). Enforced by `hooks/scripts/pre-write-check.js codebase-token-reject`.

## Folder layout

```
.orchestra/
  system.yaml                          # workspace identity (workspace_kind, context_path)
  plans/
    <session-id>/                      # = Claude Code session-id, from preflight hook
      run-plan.md                      # unified PlanMode artifact (status: draft | locked)
      run-plan-DEADLOCK.md             # written on 4th-cycle rejection only
      discovery/                       # brownfield only; absent for greenfield
        <service>.md                   # @explorer report per service
        supplemental-cycle-<N>.md      # Phase 2c reject-loop supplemental findings (only if cycles >0)
      agent-tasks.md                   # session-level task ledger; hook-projected on SubagentStop
    <prior-session-id>/...             # archival across sessions
  <service>/
    local.yaml                         # workspace-persistent service config
    features.yaml                      # intra-service feature DAG manifest
    pipeline/<feature-id>/             # chain-state artifacts; persists across runs
```

**Two scopes:** per-session (`.orchestra/plans/<session-id>/`) and workspace-persistent (`.orchestra/system.yaml`, `.orchestra/<service>/`). Filesystem state IS chain state; no separate state file.

Multi-`/orchestra`-per-session: same `<session-id>` reuses the dir. Second invocation = partial-resume against the existing plan (re-author with feature appended) — appended features re-enter Phase 2a and re-lock via `ExitPlanMode` before any Phase 3 dispatch. Hard escape: `claude --fork-session` for a new run-id.

## Shared rules

### Phase-tag emission

Every `Agent({...})` call MUST prepend `phase: <name>` on its own line. Canonical values: `discovery`, `spec-draft`, `verification`, `gap-resolution`, `gate`.

### Parallel-spawn discipline

- Cohort of N agents at the same `phase:` with no read-dependency emit ONE assistant message with N `Agent({...})` blocks. Staggered emission warns as `cohort.spawn.staggered` in `metrics-collector`.
- Same rule for `TaskCreate` on the Agent-fallback path: N independent calls = ONE message.

### Spawn brief discipline

Spawn briefs describe what to look for, not what to find. Prescriptive findings risk fabrication; descriptive briefs let well-behaved agents flag divergences instead of confirming pre-supplied conclusions.

- ❌ `the cancel/refund path enforces X-User-Id ownership matching the order's owner (lift from BR-AC INV-*)`
- ✅ `verify whether cancel/refund endpoints enforce ownership; if observed, lift the constraint to BR-AC. If absent, raise as a divergence candidate.`

### Preconditions surfaced in run-plan `## Risks + decisions`

Lift relevant Invariants (final section of this file) into the plan body's `## Risks + decisions` pre-approval.

### Status output

Model-emitted single-line at filesystem-coupled transitions; multi-line banner on exception artifacts. No ANSI, no emoji.

| Event | Format |
|---|---|
| Before `Agent({ subagent_type: "<role>" })` | `[orchestra] spawn @<role> → <artifact-target>` |
| Before `EnterPlanMode` | `[orchestra] plan-mode enter` |
| Before `ExitPlanMode` | `[orchestra] plan-mode submit (cycle <N>)` |
| After parent `Read(<path>)` returns | `[orchestra] read  @<role> wrote <filename>` |
| Before `AskUserQuestion` pause | `[orchestra] pause: <one-line question>` |
| Terminal state | `[orchestra] shutdown <terminal_state> feature=<feature-id> duration=<Ns>` |

Banner fires after parent `Read` returns artifact whose basename matches `<feature-id>-DEADLOCK-*.md`, `run-plan-DEADLOCK.md`, `<feature-id>-ESCALATE-*.md`, or `<feature-id>-ESCALATE-ADR-*.md`. Frontmatter shape lives in [pipeline-artifact.schema.md](../schemas/pipeline-artifact.schema.md) — `triggered_by_<stage|agent>`, `resolution`, `direction`, `strike_count`.

```
============================================================
[orchestra] <ARTIFACT_TYPE> detected
  triggered_by_<stage|agent>: <value-from-frontmatter>
  resolution: <value-from-frontmatter>
  path: <absolute path to artifact>
============================================================
```

### DEADLOCK / ESCALATE writers

- **Plan DEADLOCK** — 4th-cycle rejection in Phase 2c. Write `.orchestra/plans/<session-id>/run-plan-DEADLOCK.md`. End turn for user intervention.
- **Per-feature DEADLOCK** — feature-scope cannot make progress (spec gap; verification-phase deadlock). Write `<feature-id>-DEADLOCK-<slug>.md` at `.orchestra/<service_name>/pipeline/<feature-id>/`. Frontmatter per [pipeline-artifact.schema.md](../schemas/pipeline-artifact.schema.md).
- **ESCALATE** — misrouting or unresolvable scope. Write `<feature-id>-ESCALATE-<slug>.md` (or `-ESCALATE-ADR-<NNNN>.md`). Same path + schema.

End turn after writing — main thread picks up on parent `Read`.

### Coordination protocol

orchestra agents are filesystem-coupled. Handoff: main agent writes `Agent(...)` prompt directing spawned agent to write to designated path; spawned writes; turn ends; idle fires; main agent `Read(<path>)` consumes.

**Main-thread direct-write carve-outs (narrow):**

- `.orchestra/system.yaml` via `mcp__orchestra-utils__write_system_yaml`
- `.orchestra/<service_name>/local.yaml` via `mcp__orchestra-utils__upsert_local_yaml`
- `.orchestra/<service_name>/features.yaml` via `mcp__orchestra-utils__upsert_features_yaml`
- `.orchestra/cross-features.yaml` via `mcp__orchestra-utils__upsert_cross_features_yaml`
- `<context_path>/CLAUDE.md` orchestra section via `mcp__orchestra-utils__claude_md`
- `<context_path>/docs/README.md` provenance marker via `mcp__orchestra-utils__docs_readme`
- `.orchestra/plans/<session-id>/run-plan.md` (Phase 2b Lock + Phase 2c recompose) via `Write`
- `.orchestra/plans/<session-id>/discovery/supplemental-cycle-<N>.md` (Phase 2c) via `Write`
- `.orchestra/plans/<session-id>/run-plan-DEADLOCK.md` (4th-cycle reject) via `Write`
- terminal closing event line

### Journey gate

A **journey** = one **terminal-state outcome category** of an aggregate root. Multiple state-machine loops belong to the same journey when they reach the same outcome category, even when internal paths differ.

**Outcome-category partition.** Partition aggregate's terminal states into ≤4 mutually-exclusive outcome categories. Author asks: *"From consumer's vantage, which terminal states represent the same outcome story?"* Recurrent shapes: forward-attempt vs abandonment vs reversal (value-transfer); decided vs abandoned (approval); succeeded-onboarding vs failed-or-abandoned (provisioning).

**Grouping rule.** Two candidate flows reaching SAME outcome category → same journey (fold as `alt` branch). Different → sibling journeys.

**Stub rejection.** One hop + no transition + no failure variant = sub-step, not journey. Fold into parent.

### Tool prerequisites

Tool surface splits by call-readiness:

- **Immediate** (callable without `ToolSearch`): `Read`, `Glob`, `Grep`, `Write`, `Edit`, `Bash`, `Agent`, `AskUserQuestion`.
- **`Workflow`** (immediate when native workflows are enabled): the Phase 3 swarm-dispatch preferred path under `spawn_mode: subagent` (workflow `agent()` calls are subagents). Probe availability at Phase 3; absent → Agent-fallback path. Under `spawn_mode: teams`, skip the Workflow path. Never required — the fallback covers every case.
- **Deferred** (require `ToolSearch select:<name>` before first call): `EnterPlanMode`, `ExitPlanMode`, `TaskCreate`, `TaskUpdate`, `TaskList`, all `mcp__orchestra-utils__*`, all `mcp__orchestra-probe__*`.
- Load PlanMode + task tools in one batch at the top of Phase 2a: `ToolSearch query: "select:EnterPlanMode,ExitPlanMode,TaskCreate,TaskUpdate,TaskList"`.
- Load orchestra MCP tools at bootstrap: `ToolSearch query: "select:tree,write_system_yaml,upsert_local_yaml,upsert_features_yaml,upsert_cross_features_yaml,claude_md,docs_readme"`.

## Runtime hooks

8 scripts in `hooks/hooks.json`. Do not replicate side effects.

| Hook | Events (matchers) | Side effect |
|---|---|---|
| `orchestra-preflight` | UserPromptSubmit (`^/orchestra(?::orchestra)?(\s|$)`) | Detects mode, loads cached `system.yaml` + `local.yaml`, derives `workspace_kind` + `scope_level`, reads `docs/README.md` provenance, includes `session_id`. Emits `<orchestra-preflight>` block. |
| `metrics-collector` | UserPromptSubmit / PreToolUse:Task\|Agent\|Workflow\|TeamCreate\|TeamDelete\|Skill\|Write\|Edit\|MultiEdit\|mcp__orchestra-*\|TaskCreate\|TaskUpdate / SubagentStop / Stop | Emits lifecycle events to `<cwd>/.orchestra/metrics/events.jsonl`. Groups by `session_id`. On Stop, harvests Workflow-path swarm-agent tokens from `subagents/workflows/`. |
| `pre-write-check` | PreToolUse:Write\|Edit\|MultiEdit | Secrets matcher + `locked-status-reject` + `all-sections-locked-reject` + `readers-scope-warning` + `chain-cite-reject` + `codebase-token-reject` + `workspace-sad-container-floor` + `changelog-append-only`. |
| `val-calibration` | PreToolUse:Task\|Agent | Injects `<calibration-anchor>` block into `@evaluator` spawn prompts. |
| `stop-plan-verify` | Stop | Silent-approval gate per Invariants. Returns `decision: "block"` when `ExitPlanMode` is followed by `Task` / `Agent` / `Workflow` in the same turn. |
| `agent-plan-sync` | SubagentStop | Projects each subagent's `TaskCreate` / `TaskUpdate` activity from its transcript into the session-level ledger at `.orchestra/plans/<session-id>/agent-tasks.md`. Single writer; subagents never touch the file. |
| `post-bash-lint` | PostToolUse:Bash | Surfaces source-modifying Bash to stderr (observer; never blocks). |
| `post-write-puml` | PostToolUse:Write\|Edit\|MultiEdit | Renders `.puml` → `.svg` via plantuml CLI. Warns when sibling SAD/TDD frontmatter `diagrams: [...]` omits the rendered name. |

**Typical event sequence per `/orchestra` turn (greenfield, single feature):**

```mermaid
sequenceDiagram
  participant User
  participant Main as Main thread
  participant Preflight as orchestra-preflight
  participant Metrics as metrics-collector
  participant StopVerify as stop-plan-verify
  participant Agent as Spawned @agent
  participant PreWrite as pre-write-check
  participant PostWrite as post-write-puml

  User->>Main: /orchestra spec-to-code <intent>
  Main->>Preflight: UserPromptSubmit
  Preflight-->>Main: <orchestra-preflight> block (session_id, mode, …)
  Note over Main: Phase 1 — Discovery (bootstrap; greenfield skips @explorer)
  Note over Main: Phase 2a — EnterPlanMode → compose body inline → ExitPlanMode
  Main->>StopVerify: Stop (turn ends after ExitPlanMode)
  StopVerify-->>Main: pass (no Task in same turn)
  User-->>Main: approval signal (PlanMode UI)
  Note over Main: Phase 2b — Write run-plan.md (locked)
  Note over Main: Phase 3 — ONE Workflow({...}) (preferred) or N × Agent({...}) + TaskCreate × N (fallback), in ONE message
  Main->>Metrics: PreToolUse:Agent
  Main->>Agent: spawn
  Agent->>PreWrite: PreToolUse:Write
  PreWrite-->>Agent: pass / reject (exit 2)
  Agent->>Agent: Write artifact
  Agent->>PostWrite: PostToolUse:Write
  PostWrite-->>Agent: render .puml → .svg (if applicable)
  Agent-->>Main: SubagentStop
  Note over Main: Phase 4 — @test-runner sequential → @evaluator ‖ @reviewer parallel → TSR locked
  Main->>StopVerify: Stop
  StopVerify-->>Main: pass (no ExitPlanMode in turn)
  Main->>Metrics: Stop
```

## Strategy walkthroughs (S1–S9)

Per-strategy traces live as siblings under `references/walkthroughs/`. Read the matching file during Phase 1 classification before `EnterPlanMode`.

| Strategy | Entry | Precondition | Trace |
|---|---|---|---|
| S1 | `/orchestra` (empty) | `$1` + `$ARGUMENTS` empty | [S1-empty-invocation](references/walkthroughs/S1-empty-invocation.md) |
| S2 | `/orchestra spec-to-code` | greenfield, clean `docs/` + `src/**` | [S2-greenfield-clean](references/walkthroughs/S2-greenfield-clean.md) |
| S3 | `/orchestra spec-to-code` | greenfield, partial locks / partial impl | [S3-greenfield-partial](references/walkthroughs/S3-greenfield-partial.md) |
| S4 | `/orchestra spec-to-code` | greenfield, N locked features, empty `src/**` | [S4-greenfield-multi-feature](references/walkthroughs/S4-greenfield-multi-feature.md) |
| S5 | `/orchestra code-to-spec` | brownfield, no second token (auto-scope) | [S5-brownfield-auto-scope](references/walkthroughs/S5-brownfield-auto-scope.md) |
| S6 | `/orchestra code-to-spec system` | brownfield, `workspace_kind: multi-repo`, system-wide reverse | [S6-brownfield-system-wide](references/walkthroughs/S6-brownfield-system-wide.md) |
| S7 | `/orchestra code-to-spec service:<name> --source=<path>` | brownfield, per-service reverse | [S7-brownfield-per-service](references/walkthroughs/S7-brownfield-per-service.md) |
| S8 | `/orchestra <intent>` | greenfield router (`src/**` empty) | [S8-router-greenfield](references/walkthroughs/S8-router-greenfield.md) |
| S9 | `/orchestra <intent>` | brownfield router (`src/**` present) | [S9-router-brownfield](references/walkthroughs/S9-router-brownfield.md) |

## Invariants

**Main thread owns orchestration.** All `AskUserQuestion`, `EnterPlanMode`, `ExitPlanMode`, `TaskCreate` calls run in the main agent thread. Spawned subagents cannot call them — subagent tool frame is frozen at spawn time and these tools are stripped from the subagent registry.

**One plan covers the entire pipeline.** Native PlanMode submission via `ExitPlanMode` is the single user-facing approval gate. No per-feature review gates, no per-layer approval prompts. Approval routes Phase 2a → 2b → 3; rejection routes 2a → 2c → (loop ≤3) → 2b → 3; fourth rejection halts. Phase 3 dispatches ONLY features enumerated in the locked `## Features` — adding a wave (features not in the locked plan) re-enters Phase 2a (`EnterPlanMode` → recompose `## Features` → `ExitPlanMode`) and re-locks before any spawn. A bare `AskUserQuestion` never authorizes a new feature set.

**Approval-signal routing.** Trust the native PlanMode UI as the canonical signal. Conditional clarify only when the next user message after `ExitPlanMode` carries mixed approve+reject tokens (e.g. "approved but change X" / "looks good, change X"); in that case fire ONE `AskUserQuestion` to disambiguate. Never preemptively ask after a clear approve or clear reject.

**Hook stack owns side effects.** 8 runtime hooks (see Runtime hooks table) own their events. Do not write to `<cwd>/.orchestra/metrics/events.jsonl`, hash frontmatter, project task ledgers, or duplicate any hook's work.

**`stop-plan-verify` enforces approval gate at Stop.** The `Stop` hook scans the just-ended assistant turn; an `ExitPlanMode` tool call followed by `Task`/`Agent`/`Workflow` in the SAME turn returns `decision: "block"` (the anthropics/claude-code#50110 silent-approval shape). `Workflow` is caught because the Phase 3 swarm dispatches as ONE `Workflow` call on the preferred path. Implication: never spawn the Phase 3 swarm — by either path — in the same turn as `ExitPlanMode`. Phase 2a ends with `ExitPlanMode`; Phase 2b + Phase 3 fire in the NEXT turn after approval.

**`agent-plan-sync` owns the session task ledger.** Single session-level file at `<cwd>/.orchestra/plans/<session-id>/agent-tasks.md` projects each subagent's `TaskCreate` / `TaskUpdate` activity into rows keyed on `(agent, feature_id, task_id)`. Hook fires on `SubagentStop` only.
