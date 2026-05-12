---
name: orchestra
description: v4.0 multi-agent SDLC pipeline. Mode-detect → chain-rigor election → spec-to-code chain (PRD/FRS/SAD/ADR/TDD/openapi/code/TSR). Subcommands ship | report | resume.
argument-hint: <subcommand|natural language>
---

# /orchestra dispatcher (v4.0)

One entry surface for the spec-to-code chain. Mode-detect (greenfield vs
brownfield) and chain-rigor (Full / Standard / Light) elect which layers
fire; subcommands handle out-of-band release / observability / resume work.

## Invariants

The 6 runtime hooks (see "Runtime hooks" table below) own their events and
side effects. Do not write to `<cwd>/.orchestra/metrics/events.jsonl`
directly, hash artifact frontmatter manually, or replicate any hook's
work. Provenance and review state live in artifact frontmatter (`status`,
`verdict`, `readers`, `sections`); drift detection is `git diff` in CI.

`agent-plan-sync` owns mutation of `tasks:`, `tasks_pending`,
`tasks_in_progress`, `tasks_done`, `updated:`, top-level `status:`, and
the `## Tasks` checklist body of every per-agent PLAN file under
`<cwd>/.orchestra/tasks/<run-id>/<agent>/<feature-id>.md`. Agents author
the `## Approach` narrative and never edit those hook-owned fields by
hand.

## Status output

Two model-emitted channels (NOT hook output): single-line status updates
at filesystem-coupled transitions, and multi-line banners on exception
artifacts. No ANSI, no emoji.

| Event | Format |
|---|---|
| Before `Agent({ subagent_type: "<role>" })` | `[orchestra] spawn @<role> → <artifact-target>` |
| After parent `Read(<path>)` returns | `[orchestra] read  @<role> wrote <filename>` |
| Before `AskUserQuestion` pause | `[orchestra] pause: <one-line question>` |
| Terminal state | `[orchestra] shutdown <terminal_state> feature=<feature-id> duration=<Ns>` |
| Cost banner (opt-in via `ORCHESTRA_METRICS_COST_BANNER=on`) | `[orchestra] [cost] <tokens-K> / $<usd> (subagents only; full total in metrics/runs/<id>.json after Stop hook)` |

Banner template — fires after parent `Read` returns an artifact whose
basename matches `<feature-id>-DEADLOCK-*.md`, `<feature-id>-ESCALATE-*.md`, or `<feature-id>-ESCALATE-ADR-*.md`:

```
============================================================
[orchestra] <ARTIFACT_TYPE> detected
  triggered_by_<stage|agent>: <value-from-frontmatter>
  resolution: <value-from-frontmatter>
  path: <absolute path to artifact>
============================================================
```

`metrics-collector` captures structurally-equivalent events for replay;
status lines + banners are the user's live signal.

## Parse arguments

Look at the first whitespace-separated token of `$ARGUMENTS`:

- `ship`     → run **/orchestra ship** (release authoring; gate-verified)
- `report`   → run **/orchestra report** (observability — Gantt + cost pivots)
- `resume`   → run **/orchestra resume** [<feature-id>] (resume interrupted feature)
- `help`     → print usage block (defined below)
- otherwise  → run the **smart router** (decision tree → spawn @lead)

## Decision tree (entry flow)

Bare `/orchestra` (no subcommand) — script-first detection, then
`AskUserQuestion` only when the answer cannot be inferred. Cache locked
decisions to `<context_path>/.orchestra/system.yaml` (workspace-level)
and `<scope_path>/.orchestra/local.yaml` (per-service) so re-runs don't
re-prompt.

Path-tier vocabulary: `<context_path>` = session-root, captured at `claude` launch (resolves from `${CLAUDE_PROJECT_DIR}` or `pwd`-at-session-start), persisted to `<context_path>/.orchestra/system.yaml`. `<scope_path>` = the elected unit subset, ⊆ `<context_path>`, persisted to `<scope_path>/.orchestra/local.yaml`. Single-repo collapses both to the same path (`system.yaml` and `local.yaml` live in the same `.orchestra/` dir); multi-service and multi-repo have `<context_path>` ⊋ `<scope_path>` (two `.orchestra/` dirs, system-level at context, service-level at each scope).

Each step asks only when its answer cannot be inferred from prompt or repo state. Ask order:

1. **Load cache.** Two-tier read: `<context_path>/.orchestra/system.yaml` (workspace-level — `workspace_kind`, `context_path`, `registered_services`) and `<scope_path>/.orchestra/local.yaml` (per-service — every other field). If either file exists, lift cached answers — re-runs don't re-prompt. Pre-scope-election (workspace_kind unknown), only `system.yaml` lookup applies.
2. **Detect mode.**
   - No `<context_path>/src/` AND no build manifest (`package.json` / `pom.xml` / `go.mod` / `Cargo.toml`) → `greenfield`.
   - `<context_path>/src/` exists OR build manifest exists → `brownfield`.
   - Ambiguous (e.g., `docs/` exists but no source) → `AskUserQuestion` (mode).
3. **`workspace_kind`** (if `system.yaml.workspace_kind` missing). `AskUserQuestion`: `single-repo` | `multi-repo` | `multi-service`. On answer, create `<context_path>/.orchestra/` if absent and write `system.yaml` carrying `workspace_kind`, `context_path` (absolute), `registered_services: []` (auto-populated in Step 5).
4. **`scope_path`** (if `local.yaml.scope_path` missing).
   - `workspace_kind == single-repo` → `scope_path = context_path`; no prompt.
   - `workspace_kind ∈ {multi-repo, multi-service}` → walk `context_path` 2 levels deep for `pom.xml` / `build.gradle` / `package.json` / `go.mod`; surface every match (absolute path) as an `AskUserQuestion` option. Zero matches → `AskUserQuestion` free-text fallback. Reject any path that escapes `context_path` (`<scope_path>` MUST be `<context_path>` itself or a descendant).
5. **`.orchestra/` placement.** Two-tier in multi-* workspaces.
   - `workspace_kind == single-repo` (`scope_path == context_path`) → no-op. `system.yaml` and `local.yaml` both live at `<context_path>/.orchestra/`.
   - `workspace_kind ∈ {multi-repo, multi-service}` (`scope_path != context_path`) → ensure `<scope_path>/.orchestra/` exists (create if absent — **do NOT move from context**). System-level state stays at `<context_path>/.orchestra/`; per-service state lives at `<scope_path>/.orchestra/`. If `<scope_path>` is not already in `system.yaml.registered_services`, append it (auto-register) and re-write `system.yaml`.
   - Pre-v4.1 single-tier installs that anchored everything at `<context_path>/.orchestra/` are not migrated automatically; users hand-move `local.yaml`/`inventory.md`/`run-plan.md`/`pipeline/`/`tasks/` to `<scope_path>/.orchestra/` once and leave `metrics/` + `system.yaml` at context.
6. **Invoke `brownfield-inventory` skill.** Loads `skills/brownfield-inventory/SKILL.md`. Runs adaptive-depth tree scan on `context_path`, classifies entries, prompts per non-empty bucket, emits `<scope_path>/.orchestra/inventory.md` (or stub on empty-workspace short-circuit per the skill's Step 1b). Block here until `inventory.md` frontmatter `user_gate: accepted` AND `status: locked`. Greenfield workspaces emit the stub and pass through immediately.
7. **`test_depth`** (if `local.yaml.test_depth` missing). `AskUserQuestion`: `stage1` (contract-only black-box tests; default) | `stage2` (impl-aware suite execution).
8. **Brownfield depth** (if `mode=brownfield` AND `local.yaml.depth` missing). `AskUserQuestion`: `light` | `medium` | `full`. Drives reverse-doc artifact-set (see `project-discovery` skill).
9. **Chain rigor** (if `local.yaml.chain_rigor` missing). `AskUserQuestion`:
    - `Full` — all layers (PRD → FRS → SAD → ADR → TDD → openapi → code+tests → TSR).
    - `Standard` — skip SAD/ADR (PRD → FRS → TDD → openapi → code+tests → TSR).
    - `Light` — TDD-only (TDD → openapi → code+tests → TSR; component-internal change, no spec uplift).
10. **Greenfield language + framework** (if `mode=greenfield` AND `local.yaml.primary_language` missing). `AskUserQuestion`:
    - `primary_language`: `java | kotlin | go | python | typescript | <other>`.
    - `framework`: freeform (e.g., `spring-boot 3.x`, `gin`, `fastapi`, `express`).
11. **Spawn mode** (if `local.yaml.spawn_mode` missing). `AskUserQuestion`:
    - `subagent` (default) — agents spawn via `Agent({subagent_type, ...})`; no team coordination.
    - `teams` — dispatcher calls `TeamCreate` at run start; every `Agent` call passes `team_name`. Use for a single observable timeline across agents.
12. **Autonomy level** (if `local.yaml.autonomy.level` missing). Load `skills/task-breakdown/references/autonomy-diagnostic.md` ONCE, run the 5-Q diagnostic against `$ARGUMENTS` + `local.yaml.discovery`, then `AskUserQuestion` surfacing the diagnostic's suggested tag as recommended:
    - `EXECUTION_ONLY` — explicit step-by-step instructions; no logic formulation by AI.
    - `JOINT_PROCESSING` — iterative synchronous loop; human co-authors logic with AI.
    - `OPTION_SYNTHESIS` — AI analyzes + returns bounded option set; human picks (Consultant inversion).
    - `DRAFT_AND_GATE` (default) — AI drafts complete artifact; human approves at each gate.
    - `FULL_AUTONOMY` — AI executes end-to-end; human reviews via async telemetry only.

    Resolution precedence: `--autonomy=<tag>` CLI flag > `local.yaml.autonomy.level` > diagnostic suggestion > `DRAFT_AND_GATE`.
13. **Persist** answered fields across the two-tier split:
    - `<context_path>/.orchestra/system.yaml` — `workspace_kind`, `context_path`, `registered_services` (3-field closed allowlist; `additionalProperties: false`). Already created in Step 3 / appended in Step 5; this step flips `status: locked`.
    - `<scope_path>/.orchestra/local.yaml` — `scope_path`, `test_depth`, `source_lock`, `round_trip`, `pipeline_id`, `auto_mode`, `run_plan_status` (6-field v4.1 closed allowlist) plus pre-v4.1 carryover fields (`chain_rigor`, `autonomy`, `spawn_mode`, `primary_language`, `framework`, `mode`, `depth`) via the schema union. `source_lock.read_paths` defaults to `["<scope_path>/**"]`; `source_lock.write_paths` defaults to `["<scope_path>/docs/**", "<scope_path>/.orchestra/**"]`.
    Unknown fields fail schema-load on either file.
14. **Author run-plan.md + approval gate.** Spawn `@lead` with prompt-tag `task: run-plan-author` (see "Run-plan author" section below). Lead writes `<scope_path>/.orchestra/run-plan.md` against `schemas/run-plan.schema.md`. **Brownfield:** lead uses `EnterPlanMode` for source exploration + `ExitPlanMode` for native plan-approval (approval happens inside lead's turn). **Greenfield:** lead writes directly; dispatcher then runs `AskUserQuestion(approve|revise)`. On approval (either branch), dispatcher writes `auto_mode: true` + `run_plan_status: approved` to `local.yaml`. On rejection, dispatcher writes `run_plan_status: revision_requested`, collects revision notes via `AskUserQuestion`, re-spawns lead. Max 3 cycles; cycle 4 → write `<scope_path>/.orchestra/pipeline/run-plan-ESCALATE.md`.
15. **Bootstrap CLAUDE.md.** Run `node ${CLAUDE_PLUGIN_ROOT}/hooks/scripts/bootstrap-consumer-claude-md.js <cwd>` via Bash. Idempotent: creates `<cwd>/CLAUDE.md` if missing; otherwise splices the orchestra section between `<!-- orchestra:start -->` / `<!-- orchestra:end -->` markers (preserves user content). No-op when current.
16. **Spawn @lead** with locked decisions: `"mode=<mode> rigor=<rigor> primary_language=<lang> scope_path=<scope_path> auto_mode=<auto_mode>"`. Chain-rigor selects which layers @lead routes through (see "Chain execution" below).

### system.yaml schema (workspace-level)

Canonical shape is `schemas/system.schema.json` (closed allowlist; `additionalProperties: false`). The v4.1 three-field set lives at `<context_path>/.orchestra/system.yaml`:

```yaml
# v4.1 system.yaml closed allowlist (3 fields)
workspace_kind: single-repo | multi-repo | multi-service
context_path: <abs path; session-root captured at `claude` launch>
registered_services:                 # auto-populated in Step 5 per scope
  - <abs scope_path 1>
  - <abs scope_path 2>
status: draft | locked               # set `locked` after first persist
```

### local.yaml schema (per-service)

Canonical shape is `schemas/local.schema.json` (closed allowlist; `additionalProperties: false`). The v4.1 six-field set lives at `<scope_path>/.orchestra/local.yaml`:

```yaml
# v4.1 local.yaml closed allowlist (6 fields)
scope_path: <abs path; subset of context_path>
test_depth: stage1 | stage2          # default stage1
source_lock:
  read_paths: ["<scope_path>/**"]
  write_paths: ["<scope_path>/docs/**", "<scope_path>/.orchestra/**"]
round_trip: DEFERRED | PENDING | PASS | FAIL    # default DEFERRED
pipeline_id: <string>
auto_mode: true | false              # default false; flipped on run-plan approval
run_plan_status: drafted | approved | revision_requested

# pre-v4.1 carryover fields (still load-bearing at runtime; coexist via schema union)
mode: greenfield | brownfield
depth: light | medium | full         # brownfield only
bootstrap: pending | completed       # brownfield only
chain_rigor: Full | Standard | Light
primary_language: java | kotlin | go | python | typescript | <other>
framework: <freeform>
spawn_mode: subagent | teams         # default subagent
autonomy:
  level: EXECUTION_ONLY | JOINT_PROCESSING | OPTION_SYNTHESIS | DRAFT_AND_GATE | FULL_AUTONOMY
  resolved_by: cli_flag | local_yaml | diagnostic | default
```

Invariants enforced by `scripts/validate.js`: `auto_mode: true` requires `run_plan_status: approved`; freeform-prose fields are forbidden on both files (no `adapter_notes`, no `User elected: ...` strings); unknown top-level fields fail load on `system.yaml` or `local.yaml`.

`spawn_mode: subagent` (default) — agents spawned via `Agent({subagent_type, prompt, ...})` with no team coordination; no `team_name` field on the call. `spawn_mode: teams` — dispatcher calls `TeamCreate({team_name: "orchestra-<run-id-short>", agent_type: "orchestra-coordinator", description: <one-line intent summary>})` immediately after `local.yaml` is locked and before any agent spawn; every subsequent `Agent({...})` call passes `team_name` matching that string; on terminal state the dispatcher calls `TeamDelete` after the closing status line. The metrics hook reads both transcript layouts (sibling-dir `<parent_sid>/subagents/agent-*.jsonl` and project-root `<sid>.jsonl` fallback) regardless of mode, so observability is robust either way.

`status: locked` MUST be set on `system.yaml` AND `local.yaml` after first
answer cache so `pre-write-check.js` Gate-A protects them from accidental
rewrite. (Gate overridable via `ORCHESTRA_HOOK_PRE_WRITE_CHECK=off` if the
user wants to re-elicit.)

## Run-plan author

Step 14 of the decision tree above. After bootstrap fields lock and `inventory.md` is `user_gate: accepted`, the dispatcher spawns `@lead` with prompt-tag `task: run-plan-author` to author a single upfront plan that the user signs off once — replacing N per-phase confirmations with one trust grant.

### Spawn

```
Agent({
  subagent_type: "orchestra:lead",
  prompt: "task: run-plan-author\n
           inputs: <scope_path>/.orchestra/local.yaml, <scope_path>/.orchestra/inventory.md\n
           output: <scope_path>/.orchestra/run-plan.md per schemas/run-plan.schema.md\n
           Required anchors: S-CONTEXT-001, S-PHASES-001, S-FEATURES-001, S-GATES-001, S-APPROVAL-001.\n
           Emit frontmatter run_plan_status: drafted. End turn."
})
```

### Approval gate (dispatcher, not lead)

After `@lead` ends turn from `task: run-plan-author`, dispatcher behavior splits by `local.yaml.mode`. Approval mechanism differs; outcomes (write `local.yaml`, revise loop, 3-cycle cap) are identical.

**Brownfield (`local.yaml.mode == brownfield`)** — @lead used `EnterPlanMode` + `ExitPlanMode`; user approve / reject already happened natively inside @lead's turn.

1. Check `<scope_path>/.orchestra/run-plan.md` exists at the canonical path.
2. **If present** (user accepted in `ExitPlanMode`) — write to `local.yaml`: `auto_mode: true`, `run_plan_status: approved`. Flip `run-plan.md` frontmatter `status: draft → locked`, `run_plan_status: drafted → approved` (via `@lead` re-spawn with prompt-tag `task: run-plan-lock`, or via dispatcher `Edit` carve-out matching the local.yaml exception).
3. **If absent** (user rejected in `ExitPlanMode`) — `AskUserQuestion` free-text for revision notes; write `local.yaml`: `run_plan_status: revision_requested`. Re-spawn `@lead` with prompt-tag `task: run-plan-author` AND `revision_notes: <user text>`, incrementing `revision_cycle` in run-plan.md frontmatter.

**Greenfield (`local.yaml.mode == greenfield`)** — @lead wrote `run-plan.md` directly without plan mode; dispatcher owns the gate.

1. `Read(<scope_path>/.orchestra/run-plan.md)`.
2. `AskUserQuestion`: present a single-line summary (phase count + feature count + auto-gated vs preserved gate count); options: `approve` / `revise`.
3. **On `approve`** — write to `local.yaml`: `auto_mode: true`, `run_plan_status: approved`. Flip `run-plan.md` frontmatter `status: draft → locked`, `run_plan_status: drafted → approved` (as above).
4. **On `revise`** — `AskUserQuestion` free-text for revision notes; write `local.yaml`: `run_plan_status: revision_requested`. Re-spawn `@lead` with prompt-tag `task: run-plan-author` AND `revision_notes: <user text>`, incrementing `revision_cycle` in run-plan.md frontmatter.

### Rejection-cycle cap

Maximum 3 revision cycles (`revision_cycle ≤ 3` per the schema invariant). Cycle 4 attempt → dispatcher writes `<scope_path>/.orchestra/pipeline/run-plan-ESCALATE.md` (frontmatter: `cause: run_plan_revision_exhausted`, `revision_cycle: 4`, `resolution: pending`) and halts. User must rescope manually.

### Auto-mode runtime semantics

Once `local.yaml.auto_mode: true` (paired with `run_plan_status: approved`), subsequent chain runs skip:

- Between-phase "proceed?" gates.
- Per-feature confirmation prompts.
- Autonomy-ladder `DRAFT_AND_GATE` intermediate-draft checkpoints.

Preserved regardless of `auto_mode`:

- Reviewer `REVISE` / `BLOCK` / `ALLOW_WITH_GAP` verdicts.
- Structural-failure halts (allowed-set violations, diagram-allowlist violations, schema-validation failures).
- `ESCALATE` / `DEADLOCK` artifact emission.

`auto_mode` is per-`pipeline_id`. Each new pipeline starts at `auto_mode: false` until its own `run-plan.md` is approved. User flipping `auto_mode: false` mid-run reverts to gated execution at the next phase boundary.

## Feature-id minting

A new `<feature-id> = <NNN>-<slug>` is minted at the start of every
forward-chain run (greenfield) and per major feature during brownfield
reverse-doc fan-out. Algorithm:

1. **Compute NNN.** Walk `<cwd>/docs/` for entries matching `^(\d{3})-`.
   `NNN = max(matches) + 1`, zero-padded to 3 digits. No matches → `001`.
2. **Derive slug.** Slugs MUST name a *feature of the service* (a
   domain noun-phrase like `order-placement`, `payment-binding`,
   `cart-checkout`), never a meta-action on the codebase.
   - **Brownfield (`inventory.md.empty_workspace: false`):** the slug
     MUST come from a row in `<scope_path>/.orchestra/inventory.md`
     `S-REGEN-PLAN-001` "Feature slug" column. When fan-out targets one
     feature at a time, present the unauthored rows via `AskUserQuestion`
     and lock the user's pick. The inventory authoring rule rejects
     verb-prefixed slugs (`regen-*`, `refactor-*`, `redoc-*`, `fix-*`)
     at write time, so this step never has to.
   - **Greenfield or empty-workspace stub:** lowercase the user-supplied
     feature name; replace non-alphanumeric runs with `-`; strip
     leading/trailing `-`; truncate to 40 chars. Reject verb-prefixed
     slugs and re-prompt for a domain noun-phrase.
   - **Collisions** with an existing `docs/<NNN-prior>-<slug>` →
     re-prompt (brownfield: pick another inventory row; greenfield:
     pick another name).
3. **Persist.** Write `<feature-id>` to the spawn prompt for every
   subsequent agent in this feature's chain; agents author every artifact
   under `docs/<feature-id>/` and `<cwd>/.orchestra/pipeline/<feature-id>/`
   with filenames `<feature-id>-<TYPE>.<ext>`.

The frontmatter `id:` field MUST equal each artifact's basename without
extension (e.g., `001-todo-api-PRD.md` → `id: 001-todo-api-PRD`).

## Coordination protocol

**The 8 orchestra agents (`@product`, `@architect`, `@lead`, `@backend`,
`@frontend`, `@test`, `@evaluator`, `@reviewer`) are filesystem-coupled,
not message-coupled.** Tier tools omit `SendMessage` deliberately — agents
communicate by writing to designated paths under `<cwd>/.orchestra/` (for
agent-internal coordination) or `<cwd>/docs/` (for stakeholder-readable
artifacts). The parent reads those paths after each idle notification.

The handoff pattern:

```
1. Parent: Agent({ team_name, name, subagent_type, prompt: "Write your output to <designated path>. End your turn." })
2. Spawned agent runs; writes the file; turn ends; idle notification.
3. Parent: Read(<designated path>) to consume the agent's output.
4. Parent: optionally Agent again for the next stage.
```

Do NOT instruct spawned agents to call `SendMessage` (not in any tier).
Do NOT poll for messages — idle notification fires automatically. Do NOT
write artifacts from the parent context — every chain artifact must be
authored inside its assigned agent's context per the tier discipline.
**Carve-out**: parent writes `<cwd>/.orchestra/local.yaml` (decision-tree
cache) and the terminal closing event (no SUMMARY artifact in v4.0; the
`events.jsonl` Stop hook captures terminal state).

## Shared rules (cross-agent)

### Karpathy discipline

Before authoring any artifact:

- **State assumptions** — flag what's implicit or guessed.
- **Minimum surface** — only what the task requires; nothing speculative.
- **Surgical edits** — touch only what the finding names.
- **Verifiable goals** — every assertion traces to a concrete check (test, measurement, self-audit).

### Per-agent plan discipline

Every spawned agent — `@product`, `@architect`, `@lead`, `@backend`, `@frontend`, `@test`, `@evaluator`, `@reviewer` — drops a PLAN file at `<cwd>/.orchestra/tasks/<run-id>/<agent>/<feature-id>.md` BEFORE its first artifact write or substantial Bash. The PLAN is the agent's working-memory record of what it intends to do; `/orchestra resume` reads PLAN files first to reconstruct interrupted state at finer granularity than the global `<feature-id>-TASKS.md` DAG.

PLAN frontmatter shape and lifecycle is canonical in `schemas/pipeline-artifact.schema.md` under `<feature-id>.md` PLAN. The agent owns:

1. The `## Approach` body section (2–5 sentences naming inputs read and outputs to write).
2. Calling Claude Code's native `TaskCreate` / `TaskUpdate` for each subtask as work progresses.

The `agent-plan-sync` hook (registered on `PreToolUse:TaskCreate|TaskUpdate`, `PostToolUse:TaskCreate`, `SubagentStop`) owns:

1. Appending each `TaskCreate` call as a `T-NNN` entry to `tasks:` (binding Claude Code's opaque taskId).
2. Flipping `tasks[].status` on every `TaskUpdate` and recomputing `tasks_pending` / `tasks_in_progress` / `tasks_done`.
3. Top-level `status:` lifecycle: `pending → in_progress` (first task started) → `interrupted` (SubagentStop with open tasks) | `done` (all tasks completed).
4. Mirroring `tasks:` into the `## Tasks` checklist in the body.

Agents MUST NOT manually edit `tasks:` frontmatter, the count fields, the `updated:` field, top-level `status:`, or the `## Tasks` checklist — those drift across the hook's source of truth (Claude Code's native Task tool calls).

#### Autonomy gate (proceed vs confirm)

After authoring the PLAN body and BEFORE the first `TaskCreate`, the agent reads `<cwd>/.orchestra/local.yaml` `autonomy.level` and gates execution per the table:

| Autonomy level | Gate behavior |
|---|---|
| `EXECUTION_ONLY` | The user wrote step-by-step. Restate the plan to the user, run ONE `AskUserQuestion` ("Plan looks right? Proceed?"), wait for confirm, then begin `TaskCreate` calls. |
| `JOINT_PROCESSING` | Co-authoring loop. Restate the plan, run ONE `AskUserQuestion` ("Plan looks right? Proceed?"), wait for confirm, then begin. |
| `OPTION_SYNTHESIS` | Surface 2 plan variants via `AskUserQuestion` (the consultant inversion); user picks; the picked variant is what gets written into `## Approach`, then proceed. |
| `DRAFT_AND_GATE` (default) | Draft the plan, run ONE `AskUserQuestion` ("Plan looks right? Proceed?"); on confirm, proceed. Plan-confirmation is distinct from artifact-gate confirmation later — both fire. |
| `FULL_AUTONOMY` | No `AskUserQuestion`. Write the PLAN, begin `TaskCreate` immediately. The user reviews via `events.jsonl` + the PLAN file post-hoc. |

The autonomy gate is orthogonal to the confidence-tier dialogue (next section). Confidence tier asks about *what to build* (intent alignment); autonomy gate asks about *how to build* (execution plan alignment). Both can fire in the same agent turn.

### Chain-rigor election

Every agent reads `<cwd>/.orchestra/local.yaml` `chain_rigor` ∈ `{Full, Standard, Light}`. "Chain execution" below names which agents fire under which rigor. Agent spawned outside its rigor band → ESCALATE. Per-rigor inputs go in the agent body.

### Routing-taxonomy guard

Dispatcher passes a routed intent: `docs | template | hotfix | feature | review-only | refactor`. Each agent body lists its whitelist. Out-of-whitelist → ESCALATE with `reason: "@<agent> spawned outside routing whitelist for intent=<intent>"`. Do not no-op silently.

### Confidence-tier dialogue

User-facing agents (`@product`, `@lead`) score confidence (signals: intent length, prior artifacts, files-touched, language familiarity, evaluator agreement). Confidence ≠ alignment — every band asks at least once.

- **HIGH** — 1 confirmation `AskUserQuestion`: restate reading, ask to proceed.
- **MEDIUM** — 1 targeted `AskUserQuestion`.
- **LOW** — 2–3 questions, cap 3.

3 rejection rounds → DEADLOCK.

### DEADLOCK / ESCALATE shape

- **DEADLOCK** — cannot make progress (spec gap; 3-rejection threshold). Write `<feature-id>-DEADLOCK-<slug>.md` at `<cwd>/.orchestra/pipeline/<feature-id>/`. Frontmatter: `cause:` (`spec_gap`, `consultant-mode-skipped`), `triggered_by_agent: @<agent>`, `resolution: pending`.
- **ESCALATE** — misrouting or unresolvable scope (spawn outside rigor band; scope drift). Write `<feature-id>-ESCALATE-<slug>.md` (or `-ESCALATE-ADR-<NNNN>.md` for ADR-specific) at `<cwd>/.orchestra/pipeline/<feature-id>/`. Frontmatter: `reason:`, `triggered_by_agent: @<agent>`, `resolution: pending`.

End the turn after writing — `@lead` (or dispatcher under reverse-doc) picks up. Status banner (see "Status output" above) fires on parent Read.

## Chain execution

Once decisions are locked in `local.yaml`, @lead routes through layers
per the elected chain rigor. Hard-sequential layers feed each other; the
parallel fan-out happens once `openapi.yaml` is locked.

**Hard-sequential (lift dependency):** `PRD → FRS → SAD → TDD → openapi.yaml | asyncapi.yaml`. `ADR-NNNN.md` runs parallel with TDD when independent of TDD content; sequential when TDD informs it.

**Parallel fan-out** (gated on `openapi.yaml status: locked`):

- `@backend` → server code + unit tests.
- `@frontend` → UI code + unit tests (skipped if no UI layer).
- `@test` Stage-1 → TSR test-plan + black-box tests (SPEC-BOUND; `<consumer>/src/**` blocked).

**Converge:** all three idle → `@test` Stage-2 (impl-aware) + `@evaluator` + `@reviewer` → `<feature-id>-TSR.md` sections locked.

**Chain-rigor presets:**

| Layer | Full | Standard | Light |
|---|---|---|---|
| PRD | ✓ | ✓ | — |
| FRS | ✓ | ✓ | — |
| SAD | ✓ | — | — |
| ADR | ✓ (when triggered) | — | — |
| TDD | ✓ | ✓ | ✓ |
| openapi.yaml | ✓ | ✓ | ✓ |
| code + tests | ✓ | ✓ | ✓ |
| TSR | ✓ | ✓ | ✓ |

@lead reads `local.yaml.chain_rigor` and skips elided layers. Light rigor
is for component-internal changes that don't shift specs (e.g., refactor,
internal-only behavior fix); the implementer still produces tests and TSR
for verification.

**Stage-1 @test is spec-bound.** Reads only `<feature-id>-openapi.yaml` / `<feature-id>-asyncapi.yaml` + PRD + FRS — `<consumer>/src/**` blocked via per-stage Read allowlist (mechanism in `agents/test.md`). On openapi silence: writes DEADLOCK per Shared rules; @lead picks up and re-spawns @architect or self to amend.

**Within-agent parallelism (BL-0033).** @backend (and optionally
@frontend, @test) splits large impl tasks into N parallel sub-runs via
nested Agent calls when the task graph in `<feature-id>-TASKS.md` has
parallel-eligible nodes. Prompt-discipline only — no harness change.

## Steps (smart router)

1. **Decision tree.** Per "Decision tree" above. Cache to `local.yaml`. On first run with `mode: brownfield`, also invoke the `project-discovery` skill to populate `discovery:` (mode/depth/language/framework/scope_hints) and prompt for `depth` if unset; depth fires once and is cached.
2. **Brownfield bootstrap branch (one-shot).** If `local.yaml.mode == brownfield` AND `local.yaml.bootstrap != completed`, fan out reverse-doc spawns per the elected `depth` BEFORE entering the forward chain. Each major feature gets a freshly-minted `<feature-id>` (= `<NNN>-<slug>`; see "Feature-id minting" below).
   - `light` — spawn `@product` per major feature with prompt-tag `mode: reverse-doc`. Output: `<feature-id>-PRD.md` per feature.
   - `medium` — spawn `@product` (PRD + FRS) and `@lead` (TDD) per major feature with prompt-tag `mode: reverse-doc`. Author paths run sequentially per feature (PRD → FRS → TDD); features run in parallel.
   - `full` — first spawn `@architect` (project-level SAD + accepted ADRs based on visible-in-source decisions) with prompt-tag `mode: reverse-doc`. Then per major feature: `@product` (PRD + FRS) → `@lead` (TDD + openapi).
   After all reverse-doc spawns idle, parent flips `local.yaml.bootstrap: completed` and proceeds to Step 3. On subsequent `/orchestra` runs, this step is a no-op (greenfield-equivalent forward chain).
3. **Spawn @lead.** Pass locked decisions in prompt. @lead routes the forward chain.
4. **@lead routes through layers** per chain-rigor:
   - **Business** (Full/Standard) — @product writes `docs/<feature-id>/<feature-id>-PRD.md` then `docs/<feature-id>/<feature-id>-FRS.md`. PRD `S-OPEN-Q-001` flags open questions; FRS lifts and resolves or escalates (BL-0029).
   - **Architecture** (Full only) — @architect writes `docs/SAD.md` (singleton; first-feature bootstrap) and `docs/adr/ADR-NNNN-<slug>.md` (per ADR trigger; ADRs are global, not feature-scoped). C4 L1+L2 diagrams + Logical ERD + Inter-service Sequence as `.puml` under `docs/diagrams/`.
   - **Component** (always) — @lead writes `docs/<feature-id>/<feature-id>-TDD.md` (C4 L3 + Intra-service Sequence + Technical State if applicable + Physical DB if schema touched).
   - **Boundary** (always) — @lead writes `docs/<feature-id>/<feature-id>-openapi.yaml` (or `<feature-id>-asyncapi.yaml`). CONTRACT narrative folds inline via `description:` fields and top-of-file `# orchestra:` comment block.
5. **openapi locked → fan-out.** @lead spawns @backend ‖ @frontend ‖ @test (Stage-1) in a single Agent-tool-call message. Each spawn carries a scoped Read allowlist: @test Stage-1 excludes `<consumer>/src/**`.
6. **Converge.** @backend writes server code + unit tests under `<consumer>/src/main/**` and `<consumer>/src/test/**`. @frontend writes UI code (skipped if no UI). @test Stage-1 writes the TSR `S-TEST-001` plan + black-box tests. After all three idle, @lead spawns @test Stage-2 (impl-aware) + @evaluator + @reviewer in dependency order.
7. **TSR multi-writer.** `docs/<feature-id>/<feature-id>-TSR.md` accretes per-writer sections enforced by `pre-write-check.js` Gate-B (per-section locks):
   - `S-TEST-001` — @test (single row table; Stage-1 authors rows with empty status/evidence cells, Stage-2 fills those cells in place; src/ blocked during Stage-1)
   - `S-EVAL-001` — @evaluator (writes `| id | verdict | reason |` keyed on S-TEST-001 row ids; no Bash; `validate.js` rejects unknown ids)
   - `S-REVIEW-001` — @reviewer (code review + ADR-review subsection when ADRs touched)
   - `S-DIVERGENCES-001` — @architect (brownfield only — omitted on greenfield)
   - Final ship verdict in frontmatter `ship:` (no body section). `/orchestra ship` writes it.

   @evaluator reads only `docs/<feature-id>/*` artifacts (PRD, FRS, TDD, openapi, TSR `S-TEST-001`); `<consumer>/src/**` is blocked. @test Stage-2 owns suite execution; @evaluator becomes pure inspection (no Bash) and grades the PASS/FAIL evidence Stage-2 records.
8. **Terminal state.** After every parent `Read` in steps 6–7, evaluate:
   - `RELEASE-vX.Y.Z.md` written → `terminal_state = "success"` (only via `/orchestra ship`)
   - `<feature-id>-DEADLOCK-*.md` → `terminal_state = "deadlock"`
   - `<feature-id>-ESCALATE(-ADR)?-*.md` with frontmatter `resolution: abandoned` → `terminal_state = "escalated"`
   - otherwise → continue Step 6–7 spawn loop

   On terminal state: emit closing status line. The Stop hook fires `events.jsonl` event with the terminal state and `<run-id>.json.status` ∈ {`completed`, `aborted`, `deadlocked`}. No SUMMARY artifact write — observability is the source of truth (BL-0032).

### src/ purity (enforced)

`<consumer>/src/main/**` and `<consumer>/src/test/**` MUST NOT carry chain-artifact section-cites: `PRD` / `FRS` / `TDD` / `CONTRACT` / `TSR` / `ADR-NNNN` + section pointer; `FR-N`, `AC-N`, `C-N`, `NFR-N`, `S-XXX-NNN`; `openapi.yaml#/paths/`. `pre-write-check.js` Gate-D rejects at write time. Traceability → commits, PR descriptions, TSR verdict sections.

## /orchestra ship

Cuts release artifacts after gate verification. Smoke-test the consumer
install path BEFORE invoking (`feedback_smoke-before-release-docs`
discipline).

Algorithm:

1. **Verify gates.** Walk artifacts; halt with the failing artifact path on:
   - Open `<feature-id>-DEADLOCK-*.md` anywhere under `<cwd>/.orchestra/pipeline/<feature-id>/`.
   - Any `docs/<feature-id>/<feature-id>-TSR.md` with `eval_verdict: FAIL`, `rev_verdict: REQUEST_CHANGES`, or `eval_score < passing_score` from openapi description.
   - `<cwd>/.orchestra/pipeline/<feature-id>/<feature-id>-ESCALATE*.md` with `resolution: pending`.
   - `git diff`-detected drift on a `status: locked` artifact (use `git diff` since lockfile sidecars are gone).
2. **Smoke-test the consumer install path.** Canonical 5-step chain:
   - (a) `claude plugin validate .` — offline schema check.
   - (b) `/plugin marketplace add /absolute/path` — register local marketplace.
   - (c) `/plugin install <plugin>@<marketplace>` — deep-schema validate.
   - (d) `/orchestra help` — command surface loads.
   - (e) bootstrap test on `git init` directory — `/orchestra <intent>` writes `local.yaml` + `metrics/events.jsonl`.
   Any step fails → STOP. CI validators check our invariants, not Claude Code's plugin schemas.
3. **Author release artifacts** (parent context, narrowly carved exception):
   - `docs/releases/RELEASE-vX.Y.Z.md` — version, date, summary, included features, gates cleared, plus `S-ANNOUNCEMENT-001`.
   - `docs/runbooks/RUNBOOK-vX.Y.Z.md` — only when topology changed.
   - `docs/<feature-id>/<feature-id>-TSR.md` frontmatter `ship:` ∈ `ALLOW | ALLOW_WITH_GAP | HOLD`. No body section — the verdict is frontmatter-only.
4. **Draft release commit message** (Conventional Commits 1.0.0):
   - Read `git diff --staged --stat` and `git diff --staged`.
   - Type ∈ {`feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `ci`, `build`}; choose the dominant type.
   - Scope: load-bearing area (`api`, `infra`, `hooks`, `agents`, `skills`, `command`, `validators`, etc.).
   - Subject `≤72` chars, imperative mood, no trailing period.
   - Optional body wrapped at 72; trailers (`BREAKING CHANGE:`, `Closes #NN`, `Refs:`, `Co-Authored-By:`).
5. **Hand off to user.** User runs `git commit` / `git tag` / `git push`. This subcommand does NOT auto-commit, auto-tag, or push.

Bump VERSION via `node scripts/bump-version.js` only — never edit
`VERSION` / `package.json` / plugin manifest by hand.

## /orchestra report

Observability subcommand (Stream 7). Reads `events.jsonl` + `tokens.jsonl`
+ `runs/*.json` from `<cwd>/.orchestra/metrics/`; emits Gantt timeline
`.svg` + cost-by-role + cost-by-phase pivots, plus non-blocking
readers-violations summary (Gate-C aggregation) and business-code-purity
summary (Gate-D aggregation). Implementation: `scripts/orchestra-report.js`.

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/orchestra-report.js \
  --metrics-dir <cwd>/.orchestra/metrics \
  --out <cwd>/.orchestra/reports/<run-id>/
```

Cadence: on invocation. Non-blocking — never causes a build to fail.

## /orchestra resume [<feature-id>]

Resume an interrupted feature run. Walks `<cwd>/.orchestra/pipeline/*/`
dirs, finds the next non-`done` task, respawns the owner. Idempotent —
respawning an owner whose prior turn partially completed is safe.

Algorithm:

1. **Enumerate candidates.** List `<cwd>/.orchestra/pipeline/*/` dirs without a final `docs/<feature-id>/<feature-id>-TSR.md` carrying `ship: ALLOW`. 0 candidates → emit `[orchestra] resume no in-flight features` and exit. 1 → auto-select. >1 → `AskUserQuestion`. If `<feature-id>` arg passed, validate against candidates; mismatch → write `<feature-id>-DEADLOCK-resume.md` and halt.
2. **Validate prerequisites.** Read `<cwd>/.orchestra/pipeline/<feature-id>/intent.yaml`. Missing → fail closed: write `<feature-id>-DEADLOCK-resume.md` and halt. Then scan:
   - `<feature-id>-DEADLOCK-*.md` present → emit banner; deadlocks need manual rescope.
   - `<feature-id>-ESCALATE*.md` with `resolution: pending` → emit banner + `AskUserQuestion` ("ESCALATE pending: `<reason>`. Resolved externally?"). Reject → halt; accept → proceed.
3. **Find resume point.**
   - **3a. Per-agent PLAN scan (fine-grained).** Glob `<cwd>/.orchestra/tasks/*/<agent>/<feature-id>.md`. If any PLAN has `status: interrupted` (or `status: in_progress` from a prior session), the resume point is that PLAN's first non-`completed` `tasks[]` entry; the owner is the PLAN's `agent:` field. Resume by respawning that agent with a directive to read its prior PLAN and continue from the first open task.
   - **3b. TASKS.md walk (coarse-grained, fallback).** No interrupted PLAN found → read `<feature-id>-TASKS.md` and walk topologically. For each task in order:
     - `Status = done` → skip.
     - Owner is read-only-tier (`@evaluator` / `@reviewer`) — derive done status from TSR frontmatter (`eval_verdict ∈ {PASS, FAIL}`, `rev_verdict ∈ {APPROVED, REQUEST_CHANGES}`).
     - Owner is artifact-tier — derive done from artifact existence with frontmatter `status: locked`.
     - First non-done task → resume point.
4. **REQUEST_CHANGES gate.** If resume point follows a TSR `rev_verdict: REQUEST_CHANGES`, do NOT auto-respawn. Emit banner + `AskUserQuestion` ("Last review verdict: REQUEST_CHANGES (`<N findings>`). Respawn @<owner> for revision, or halt?"). Accept → step 5; reject → halt.
5. **Spawn.** Issue `Agent({ subagent_type, prompt })` with locked decisions from `local.yaml` plus a resume directive: "Your task is `T-<id>` in `<feature-id>-TASKS.md`. Read existing artifacts before re-writing — idempotent re-write is acceptable."
6. **Continue smart-router** from the resume point through terminal-state detection.

## Runtime hooks

6 hooks registered in `hooks/hooks.json`. Hooks own their events per
"Invariants" above — do not replicate hook side effects.

| Hook | Events (matchers) | Side effect |
|---|---|---|
| `metrics-collector` | UserPromptSubmit / PreToolUse:Task\|Agent\|TeamCreate\|TeamDelete\|Skill\|Write\|Edit\|MultiEdit\|mcp__orchestra-*\|TaskCreate\|TaskUpdate / SubagentStop / Stop | Emits lifecycle events to `<cwd>/.orchestra/metrics/events.jsonl` (Stream 7 retools for `agent_role` + `phase` + `subagent_session_id` join keys); `agent.plan.task` rows on Task* tool calls give a per-agent activity audit |
| `pre-write-check` | PreToolUse:Write\|Edit\|MultiEdit | Secrets matcher (8 patterns; exit 2) + 4 frontmatter gates: status-locked / sections-all-locked / readers-warning / src/ cite denylist |
| `val-calibration` | PreToolUse:Task\|Agent | Injects `<calibration-anchor>` block into `@evaluator` spawn prompts |
| `agent-plan-sync` | PreToolUse:TaskCreate\|TaskUpdate / PostToolUse:TaskCreate / SubagentStop | Owns mutation of per-agent PLAN files at `<cwd>/.orchestra/tasks/<run-id>/<agent>/<feature-id>.md` — `tasks:` array, count fields, top-level `status:` lifecycle, and the `## Tasks` checklist body. Agent body authors `## Approach` only |
| `post-bash-lint` | PostToolUse:Bash | Surfaces source-modifying Bash to stderr (observer; never blocks) |
| `post-write-puml` | PostToolUse:Write\|Edit\|MultiEdit | Renders `.puml` → `.svg` via plantuml CLI; warns when sibling `.md` lacks the `![..](diagrams/<name>.svg)` reference (non-blocking) |

## /orchestra help

```
/orchestra <intent>           Smart router. Mode-detect → chain-rigor → spec-to-code chain (PRD/FRS/SAD/ADR/TDD/openapi/code+tests/TSR).
/orchestra ship               Verify gates → smoke-test install → write RELEASE / RUNBOOK + set TSR frontmatter `ship:` → draft Conventional Commits message. User commits + tags manually.
/orchestra report             Render Gantt + cost-by-role + cost-by-phase from events.jsonl/tokens.jsonl/runs.
/orchestra resume [<feature-id>] Walk .orchestra/pipeline/* dirs; find non-terminal feature; respawn next non-done task.
/orchestra help               This message.
```

Flags:
- `--rigor {Full,Standard,Light}` — override `local.yaml.chain_rigor` for this run.
- `--mode {greenfield,brownfield}` — override mode detection.
- `--depth {light,medium,full}` — override depth (brownfield only).
- `--autonomy {EXECUTION_ONLY,JOINT_PROCESSING,OPTION_SYNTHESIS,DRAFT_AND_GATE,FULL_AUTONOMY}` — highest-precedence autonomy resolution; bypasses both `local.yaml.autonomy.level` and the diagnostic suggestion.
- `--spawn-mode {subagent,teams}` — override `local.yaml.spawn_mode` for this run.
