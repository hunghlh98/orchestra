---
name: orchestra
description: Multi-agent SDLC pipeline. Mode-detect → chain-rigor election → spec-to-code chain (PRD/FRS/SAD/ADR/TDD/openapi/code/TSR). Subcommands ship | report | resume.
argument-hint: <subcommand|natural language>
---

# /orchestra dispatcher

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

Two model-emitted channels (NOT hook output): single-line status at filesystem-coupled transitions; multi-line banner on exception artifacts. No ANSI, no emoji.

| Event | Format |
|---|---|
| Before `Agent({ subagent_type: "<role>" })` | `[orchestra] spawn @<role> → <artifact-target>` |
| After parent `Read(<path>)` returns | `[orchestra] read  @<role> wrote <filename>` |
| Before `AskUserQuestion` pause | `[orchestra] pause: <one-line question>` |
| Terminal state | `[orchestra] shutdown <terminal_state> feature=<feature-id> duration=<Ns>` |
| Cost banner (opt-in via `ORCHESTRA_METRICS_COST_BANNER=on`) | `[orchestra] [cost] <tokens-K> / $<usd> (subagents only; full total in metrics/runs/<id>.json after Stop hook)` |

Banner fires after parent `Read` returns an artifact whose basename matches `<feature-id>-DEADLOCK-*.md`, `<feature-id>-ESCALATE-*.md`, or `<feature-id>-ESCALATE-ADR-*.md`:

```
============================================================
[orchestra] <ARTIFACT_TYPE> detected
  triggered_by_<stage|agent>: <value-from-frontmatter>
  resolution: <value-from-frontmatter>
  path: <absolute path to artifact>
============================================================
```

`metrics-collector` captures structurally-equivalent events for replay; status lines + banners are the user's live signal.

## Parse arguments

First whitespace-token of `$ARGUMENTS`:

- `ship` → **/orchestra ship**
- `report` → **/orchestra report**
- `resume` → **/orchestra resume** [<feature-id>]
- `help` → usage block (below)
- otherwise → **smart router** (decision tree → spawn @lead)

## Decision tree (entry flow)

Bare `/orchestra` — script-first detection; `AskUserQuestion` only when answer cannot be inferred. Cache to one `.orchestra/` per session root: `<context_path>/.orchestra/system.yaml` (workspace-wide) + `<context_path>/.orchestra/<service_name>/local.yaml` (per-service). Re-runs don't re-prompt.

Path-tier vocabulary: `<context_path>` = session-root, captured at `claude` launch (from `${CLAUDE_PROJECT_DIR}` or `pwd`-at-session-start), persisted to `system.yaml`. `<service_name>` = elected unit's directory-basename identity (`order`, `payment-engine`), persisted to per-service `local.yaml`. One `.orchestra/` per session; multi-service workspaces accrete `<service_name>/` subfolders, never a second root.

Each step asks only when its answer cannot be inferred:

1. **Load cache.** `<context_path>/.orchestra/system.yaml` (workspace — `workspace_kind`, `context_path`) and `<context_path>/.orchestra/<service_name>/local.yaml` (per-service — all else; deferred until Step 4 elects `service_name`). Lift cached answers.
2. **Detect mode.**
   - No `<context_path>/src/` AND no build manifest (`package.json` / `pom.xml` / `go.mod` / `Cargo.toml`) → `greenfield`.
   - `<context_path>/src/` OR build manifest exists → `brownfield`.
   - Ambiguous → `AskUserQuestion` (mode).
3. **`workspace_kind`** (if missing in `system.yaml`). `AskUserQuestion`: `single-repo` | `multi-repo` | `multi-service`. Create `<context_path>/.orchestra/` if absent; write `system.yaml` with `workspace_kind` + `context_path` (absolute). 2-field closed allowlist.
4. **`service_name`** (if no per-service `local.yaml` exists OR not yet elected this run).
   - `single-repo` → `service_name = basename(context_path)`; confirm only when basename is ambiguous (generic `app`/`project`/`repo`).
   - `multi-repo` / `multi-service` → walk `context_path` 2 levels deep for `pom.xml` / `build.gradle` / `package.json` / `go.mod`; parent-directory basename = candidate (`services/order/pom.xml` → `order`). Surface via `AskUserQuestion`. Zero matches → free-text fallback. Reject names with `/`, `\`, whitespace, `..`, or reserved tokens (`system`, `metrics`, `legacy`, `inventory`).
5. **Placement.** Ensure `<context_path>/.orchestra/<service_name>/` exists. Per-service state (`local.yaml`, `run-plan.md`, `pipeline/`, `tasks/`) lives here. Workspace state (`system.yaml`, `inventory.md`, `metrics/`) stays at `<context_path>/.orchestra/`.
5.5. **`scope_level`** (if missing). `AskUserQuestion`: `service` | `container` | `capability`. Drives row count in `run-plan.md` `S-FEATURES-001` and `@product`'s posture vs CSD.
   - `service` — whole service (one row, sub-capabilities inline). `@architect` authors CSD; `@product` cites CSD `S-INVARIANTS-001` instead of re-narrating (keeps PRD ~150 lines).
   - `container` — bounded subset (multiple capabilities sharing one CSD). N rows, all referencing same CSD.
   - `capability` — single surface (`add-login`, `email-receipts`). One row; no CSD (CSD is service/container-grain only). PRD narrates invariants inline.

   Heuristic:
   - Workspace-action verb front (`regen`, `refactor`, `redoc`, `migrate`, `restructure`, `document`, `audit`) → `service`.
   - Bounded subset (`payment flows`, `billing pipeline`) → `container`.
   - Single surface (`add login`, `webhook ingest`) → `capability`.

   Persist to `local.yaml.scope_level`. MUST fire BEFORE Step 6 (so `brownfield-inventory` knows whether `fold-into-CSD` is admissible).
6. **`brownfield-inventory` skill.** Loads `skills/brownfield-inventory/SKILL.md`. Adaptive-depth tree scan; classifies entries; prompts per non-empty bucket; emits `<context_path>/.orchestra/inventory.md` (workspace-global singleton; stub on empty-workspace short-circuit per skill's Step 1b). Block until frontmatter `user_gate: accepted` AND `status: locked`. Greenfield passes through.
7. **`test_depth`** (if missing). `AskUserQuestion`: `stage1` (contract-only black-box; default) | `stage2` (impl-aware suite).
8. **Brownfield depth** (if `mode=brownfield` AND missing). `AskUserQuestion`: `light` | `medium` | `full`. Drives reverse-doc artifact-set (`project-discovery` skill).
9. **Chain rigor** (if missing). `AskUserQuestion`:
    - `Full` — all layers (PRD → FRS → SAD → ADR → TDD → openapi → code+tests → TSR).
    - `Standard` — skip SAD/ADR.
    - `Light` — TDD-only (TDD → openapi → code+tests → TSR; component-internal change).
10. **Greenfield language + framework** (if `mode=greenfield` AND missing). `AskUserQuestion`:
    - `primary_language`: `java | kotlin | go | python | typescript | <other>`.
    - `framework`: freeform (`spring-boot 3.x`, `gin`, `fastapi`).
11. **Spawn mode** (if missing). `AskUserQuestion`:
    - `subagent` (default) — `Agent({subagent_type, ...})`; no team coordination.
    - `teams` — dispatcher calls `TeamCreate` at run start; every `Agent` call passes `team_name`. Use for single observable timeline.
12. **Autonomy level** (if missing). Load `skills/task-breakdown/references/autonomy-diagnostic.md` ONCE; run 5-Q diagnostic against `$ARGUMENTS` + `local.yaml.discovery`; `AskUserQuestion` surfacing diagnostic suggestion as recommended:
    - `EXECUTION_ONLY` — explicit step-by-step; no logic formulation.
    - `JOINT_PROCESSING` — iterative sync loop; human co-authors.
    - `OPTION_SYNTHESIS` — AI returns bounded options; human picks (Consultant inversion).
    - `DRAFT_AND_GATE` (default) — AI drafts; human gates at each step.
    - `FULL_AUTONOMY` — AI executes end-to-end; human reviews via telemetry.

    Resolution precedence: `--autonomy=<tag>` CLI flag > `local.yaml.autonomy.level` > diagnostic suggestion > `DRAFT_AND_GATE`.
13. **Persist** across workspace + per-service split:
    - `system.yaml` — `workspace_kind`, `context_path` (2-field closed allowlist; `additionalProperties: false`). Created Step 3; this step flips `status: locked`.
    - `local.yaml` — `service_name`, `pipeline_id`, `test_depth`, `source_lock`, `tsr_gate_mode`, `auto_mode`, `run_plan_status`, `chain_rigor`, `autonomy`, `spawn_mode`, `primary_language`, `framework`, `mode`, `depth`. `source_lock.read_paths` defaults to `["<context_path>/**"]`; `source_lock.write_paths` defaults to `["<context_path>/docs/<service_name>/**", "<context_path>/.orchestra/<service_name>/**"]`.
    Unknown fields fail schema-load.
14. **Run-plan + approval gate.** Brownfield depth ≥ medium: BEFORE spawning `@lead`, fan out `@backend` (always) + `@frontend` (UI projects) + `@test` (when tests exist) in one Agent-tool-call message with `task: source-explore`. Wait for all `<stack>-intel.md` `status: locked`. Then spawn `@lead` with `task: run-plan-author` (see "Run-plan author" below). Lead writes `<context_path>/.orchestra/<service_name>/run-plan.md` against `schemas/run-plan.schema.md`. **Brownfield:** lead validates `S-FEATURE-CANDIDATES-001` inside `EnterPlanMode` + native `ExitPlanMode` approval. **Greenfield:** lead writes directly; dispatcher then `AskUserQuestion(approve|revise)`. On approval: write `auto_mode: true` + `run_plan_status: approved`. On rejection: `run_plan_status: revision_requested`, collect notes via `AskUserQuestion`, re-spawn. Max 3 cycles; cycle 4 → `run-plan-ESCALATE.md`.
15. **Bootstrap CLAUDE.md.** `node ${CLAUDE_PLUGIN_ROOT}/hooks/lib/bootstrap-consumer-claude-md.js <cwd>` via Bash. Idempotent: creates `<cwd>/CLAUDE.md` if missing; otherwise splices between `<!-- orchestra:start -->` / `<!-- orchestra:end -->` markers (preserves user content).
16. **Spawn @lead** with locked decisions: `"mode=<mode> rigor=<rigor> primary_language=<lang> service_name=<name> auto_mode=<auto_mode>"`. Chain-rigor selects layers @lead routes through (see "Chain execution").

### system.yaml schema (workspace-wide)

Canonical: `schemas/system.schema.json` (closed allowlist; `additionalProperties: false`). 2-field set at `<context_path>/.orchestra/system.yaml`:

```yaml
# system.yaml closed allowlist (2 fields + status)
workspace_kind: single-repo | multi-repo | multi-service
context_path: <abs path; session-root captured at `claude` launch>
status: draft | locked               # set `locked` after first persist
```

### Source-path token semantics

Source-tree paths in this doc and agent prompts (`<context_path>/services/<service_name>/src/main/**`, `src/test/**`) are written for `workspace_kind: multi-service`. Under `single-repo`, the `services/<service_name>/` segment collapses — source lives at `<context_path>/src/main/**` and `src/test/**`. Agents do not parameterize on `workspace_kind`; they read the literal path. Hook layer (`pre-write-check.js` Gate-D) globs `**/src/main/**` and `**/src/test/**` and catches both layouts uniformly. State paths and chain-artifact paths are unaffected.

### local.yaml schema (per-service)

Canonical: `schemas/local.schema.json` (closed allowlist; `additionalProperties: false`). Lives at `<context_path>/.orchestra/<service_name>/local.yaml`:

```yaml
# local.yaml closed allowlist (per-service partition)
service_name: <string; directory-basename identity, e.g. "order">
pipeline_id: <string>
test_depth: stage1 | stage2          # default stage1
source_lock:
  read_paths: ["<context_path>/**"]
  write_paths: ["<context_path>/docs/<service_name>/**", "<context_path>/.orchestra/<service_name>/**"]
tsr_gate_mode: blocking | deferred              # default blocking
auto_mode: true | false              # default false; flipped on run-plan approval
run_plan_status: drafted | approved | revision_requested
scope_level: service | container | capability
incomplete: true | false
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

Invariants (enforced by `scripts/validate.js`): `auto_mode: true` requires `run_plan_status: approved`; no freeform-prose fields (no `adapter_notes`, no `User elected: ...`); unknown top-level fields fail load.

`spawn_mode: subagent` (default) — agents via `Agent({subagent_type, prompt, ...})`; no `team_name`. `spawn_mode: teams` — dispatcher calls `TeamCreate({team_name: "orchestra-<run-id-short>", agent_type: "orchestra-coordinator", description: <one-line intent>})` immediately after `local.yaml` lock, before any agent spawn; every `Agent({...})` passes that `team_name`; terminal state → `TeamDelete`. Metrics hook reads both transcript layouts (sibling-dir `<parent_sid>/subagents/agent-*.jsonl` + project-root `<sid>.jsonl` fallback).

`system.yaml` locks at step 12. `local.yaml` locks at run-plan approval (same write window as `auto_mode: true` + `run_plan_status: approved`; status field last). Post-lock: `pre-write-check.js` Gate-A protects. Override: `ORCHESTRA_HOOK_PRE_WRITE_CHECK=off`.

## Run-plan author

Step 14 of decision tree. After bootstrap fields lock and `inventory.md` is `user_gate: accepted`, dispatcher spawns `@lead` with `task: run-plan-author` for one upfront plan the user signs off once — replacing N per-phase confirmations with one trust grant. Max 3 revision cycles (`revision_cycle ≤ 3`). Cycle 4 → `<context_path>/.orchestra/<service_name>/pipeline/run-plan-ESCALATE.md` (`cause: run_plan_revision_exhausted`, `revision_cycle: 4`, `resolution: pending`); user rescopes manually.

### Spawn

```
Agent({
  subagent_type: "orchestra:lead",
  prompt: "phase: discovery\n
           task: run-plan-author\n
           inputs: <context_path>/.orchestra/<service_name>/local.yaml, <context_path>/.orchestra/inventory.md\n
           output: <context_path>/.orchestra/<service_name>/run-plan.md per schemas/run-plan.schema.md\n
           Required anchors: S-CONTEXT-001, S-PHASES-001, S-FEATURES-001, S-GATES-001, S-APPROVAL-001.\n
           Emit frontmatter run_plan_status: drafted. End turn."
})
```

### Approval gate (dispatcher, not lead)

Splits by `local.yaml.mode`. Approval mechanism differs; outcomes (write `local.yaml`, revise loop, 3-cycle cap) identical.

**Brownfield** — @lead used `EnterPlanMode` + `ExitPlanMode`; user accept/reject already happened natively.

1. Check `run-plan.md` exists at canonical path.
2. **Present** (user accepted) → write `local.yaml`: `auto_mode: true`, then `run_plan_status: approved`, then `status: draft → locked` (status last). Flip `run-plan.md` frontmatter `run_plan_status: drafted → approved`, then `status: draft → locked` (via `@lead` re-spawn with `task: run-plan-lock`, or two sequential dispatcher `Edit`s in that order).
3. **Absent** (user rejected) → `AskUserQuestion` free-text for revision notes; write `run_plan_status: revision_requested`. Re-spawn `@lead` with `task: run-plan-author` + `revision_notes: <text>`; increment `revision_cycle`.

**Greenfield** — @lead wrote `run-plan.md` directly; dispatcher owns the gate.

1. `Read(run-plan.md)`.
2. `AskUserQuestion`: single-line summary (phase count + feature count + auto-gated vs preserved gate count); options: `approve` / `revise`.
3. **`approve`** — same write sequence as brownfield case 2.
4. **`revise`** — same as brownfield case 3.

### Auto-mode runtime semantics

Once `auto_mode: true` (paired with `run_plan_status: approved`), subsequent chain runs skip:

- Between-phase "proceed?" gates.
- Per-feature confirmation prompts.
- Autonomy-ladder `DRAFT_AND_GATE` intermediate checkpoints.

Reviewer-verdict gating supports per-run override via `run-plan.md` `S-GATES-001`:

- Reviewer `REVISE` / `BLOCK` / `ALLOW_WITH_GAP` — blocking UNLESS `S-GATES-001` row declares `tsr_gate_mode_override: deferred` AND user accepted at approval. Default: `blocking`. Under `deferred`: `@evaluator` + `@reviewer` run in parallel with `@lead`'s hand-back; verdicts append to TSR `S-EVAL-001` / `S-REVIEW-001` on idle. `/orchestra ship` tolerates absent verdict cells only when `tsr_gate_mode: deferred` AND `<feature-id>-DRAFT-COMPLETE.md` exists.

Always preserved:

- Structural-failure halts (allowed-set, diagram-allowlist, schema-validation).
- `ESCALATE` / `DEADLOCK` emission.

`auto_mode` is per-`pipeline_id`. Each new pipeline starts `false` until its own `run-plan.md` approval. Flipping `false` mid-run reverts to gated execution at next phase boundary.

## Feature-id minting

New `<feature-id> = <NNN>-<slug>` is minted at start of every forward-chain run (greenfield) and per major feature during brownfield reverse-doc fan-out.

1. **Compute NNN.** Walk `<cwd>/docs/` for `^(\d{3})-`. `NNN = max(matches) + 1`, zero-padded 3 digits. No matches → `001`.
2. **Derive slug.** Slugs MUST name a *feature of the service* (domain noun-phrase: `order-placement`, `payment-binding`, `cart-checkout`), never a meta-action on the codebase.
   - **Brownfield (`inventory.md.empty_workspace: false`):** slug from `run-plan.md` `S-FEATURES-001` "Feature slug" column. Fan-out targets one at a time → present unauthored rows via `AskUserQuestion`. `@lead`'s run-plan authoring rejects verb-prefixed slugs (`regen-*`, `refactor-*`, `redoc-*`, `fix-*`) at write time.
   - **Greenfield / empty-workspace stub:** lowercase user-supplied name; non-alphanumeric runs → `-`; strip leading/trailing `-`; truncate 40 chars. Reject verb-prefixed slugs; re-prompt for noun-phrase.
   - **Collisions** with existing `docs/<NNN-prior>-<slug>` → re-prompt.
3. **Persist.** Write `<feature-id>` to every subsequent agent spawn prompt; agents author under `docs/<feature-id>/` and `<cwd>/.orchestra/pipeline/<feature-id>/` with filenames `<feature-id>-<TYPE>.<ext>`.

Frontmatter `id:` MUST equal basename without extension (`001-todo-api-PRD.md` → `id: 001-todo-api-PRD`).

## Coordination protocol

8 orchestra agents (`@product`, `@architect`, `@lead`, `@backend`, `@frontend`, `@test`, `@evaluator`, `@reviewer`) are **filesystem-coupled, not message-coupled**. Tier tools omit `SendMessage` deliberately — agents communicate by writing to designated paths under `<cwd>/.orchestra/` (agent-internal) or `<cwd>/docs/` (stakeholder-readable). Parent reads paths after idle.

Handoff pattern:

```
1. Parent: Agent({ team_name, name, subagent_type, prompt: "Write your output to <designated path>. End your turn." })
2. Spawned agent writes file; turn ends; idle notification fires.
3. Parent: Read(<designated path>) to consume output.
4. Parent: optionally Agent again for next stage.
```

- No `SendMessage` (any tier). No polling — idle fires automatically. No parent-context artifact writes — every chain artifact authored inside its assigned agent's context per tier discipline.

**Parent-write carve-out** (narrowly enumerated):

- `<context_path>/.orchestra/system.yaml` (workspace cache).
- `<context_path>/.orchestra/<service_name>/local.yaml` (per-service cache).
- `<context_path>/.orchestra/<service_name>/pipeline/<run-id>-INCOMPLETE.md` (completion-parity probe; terminal only).
- `<context_path>/.orchestra/metrics/runs/<run-id>.json` `incomplete: true` patch (probe).
- `<context_path>/docs/<service_name>/<feature-id>/<feature-id>-TSR.md` frontmatter `ship:` field (`/orchestra ship` only; body untouched).
- Terminal closing event (no SUMMARY artifact; Stop hook captures terminal state).

## Shared rules (cross-agent)

### Phase-tag emission

Every `Agent({...})` call (dispatcher or agent) MUST prepend `phase: <name>` on its own line to the prompt. `metrics-collector.js` PreToolUse hook parses it into `task.subagent.invoked` and auto-emits `pipeline.phase.start` / `pipeline.phase.end` JSONL when the value differs from the prior spawn. Without this line, `/orchestra report` cost-by-phase pivots collapse to `unknown` bucket. Rule applies to bootstrap, fan-out, DEADLOCK-loop re-spawns, DIV-resolution handoffs, reverse-doc spawns, ship-gate spawns — no exceptions.

Phase taxonomy (literal values; no synonyms):

| Phase | When | Spawned agents / skills |
|---|---|---|
| `discovery` | brownfield bootstrap, source reading, run-plan authoring | `brownfield-inventory`, `project-discovery`, `@backend` / `@frontend` / `@test` with `task: source-explore` (brownfield only), `@lead` (`task: run-plan-author`), reverse-doc spawns |
| `spec-draft` | authoring chain artifacts | `@product` (PRD/FRS), `@architect` (SAD/ADR), `@lead` (TDD + openapi/asyncapi) |
| `verification` | implementing + grading + brownfield DIV resolution | `@backend`, `@frontend`, `@test` Stage-1 / Stage-2, `@evaluator`, `@reviewer`, `@architect` with `task: div-resolution` (brownfield only) |
| `gate` | release cut | `/orchestra ship` artifact spawns |

`agent_role` is auto-derived from `subagent_type` by the hook — pass `subagent_type` honestly (`@backend`-routed spawns use `subagent_type: orchestra:backend`).

### Karpathy discipline

Before authoring any artifact:

- **State assumptions** — flag what's implicit or guessed.
- **Minimum surface** — only what the task requires; nothing speculative.
- **Surgical edits** — touch only what the finding names.
- **Verifiable goals** — every assertion traces to a concrete check (test, measurement, self-audit).

### Per-agent plan discipline

Every spawned agent (`@product`, `@architect`, `@lead`, `@backend`, `@frontend`, `@test`, `@evaluator`, `@reviewer`) drops a PLAN at `<cwd>/.orchestra/tasks/<run-id>/<agent>/<feature-id>.md` BEFORE its first artifact write or substantial Bash. PLAN is the agent's working-memory record; `/orchestra resume` reads PLANs first to reconstruct interrupted state at finer granularity than `<feature-id>-TASKS.md` DAG.

PLAN frontmatter shape + lifecycle canonical in `schemas/pipeline-artifact.schema.md` under `<feature-id>.md` PLAN. The agent owns:

1. `## Approach` body (2–5 sentences naming inputs read and outputs to write).
2. Native `TaskCreate` / `TaskUpdate` per subtask as work progresses.

The `agent-plan-sync` hook (`PreToolUse:TaskCreate|TaskUpdate`, `PostToolUse:TaskCreate`, `SubagentStop`) owns:

1. Appending each `TaskCreate` as `T-NNN` entry to `tasks:` (binding Claude Code's opaque taskId).
2. Flipping `tasks[].status` on every `TaskUpdate`; recomputing `tasks_pending` / `tasks_in_progress` / `tasks_done`.
3. Top-level `status:` lifecycle: `pending → in_progress` (first task started) → `interrupted` (SubagentStop with open tasks) | `done` (all completed).
4. Mirroring `tasks:` into `## Tasks` checklist.

Agents MUST NOT manually edit `tasks:` frontmatter, count fields, `updated:`, top-level `status:`, or `## Tasks` checklist — drift against the hook's source of truth (Claude Code's native Task tool calls).

#### Autonomy gate (proceed vs confirm)

After authoring PLAN body, BEFORE first `TaskCreate`, agent reads `<cwd>/.orchestra/local.yaml` `autonomy.level` and gates per table:

| Autonomy level | Gate behavior |
|---|---|
| `EXECUTION_ONLY` | The user wrote step-by-step. Restate the plan to the user, run ONE `AskUserQuestion` ("Plan looks right? Proceed?"), wait for confirm, then begin `TaskCreate` calls. |
| `JOINT_PROCESSING` | Co-authoring loop. Restate the plan, run ONE `AskUserQuestion` ("Plan looks right? Proceed?"), wait for confirm, then begin. |
| `OPTION_SYNTHESIS` | Surface 2 plan variants via `AskUserQuestion` (the consultant inversion); user picks; the picked variant is what gets written into `## Approach`, then proceed. |
| `DRAFT_AND_GATE` (default) | Draft the plan, run ONE `AskUserQuestion` ("Plan looks right? Proceed?"); on confirm, proceed. Plan-confirmation is distinct from artifact-gate confirmation later — both fire. |
| `FULL_AUTONOMY` | No `AskUserQuestion`. Write the PLAN, begin `TaskCreate` immediately. The user reviews via `events.jsonl` + the PLAN file post-hoc. |

Autonomy gate is orthogonal to confidence-tier (next section). Confidence: *what to build* (intent). Autonomy: *how to build* (execution). Both can fire same turn.

### Chain-rigor election

Every agent reads `<cwd>/.orchestra/local.yaml` `chain_rigor` ∈ `{Full, Standard, Light}`. "Chain execution" below names which agents fire under which rigor. Spawned outside rigor band → ESCALATE. Per-rigor inputs in agent body.

### Routing-taxonomy guard

Dispatcher passes routed intent: `docs | template | hotfix | feature | review-only | refactor`. Canonical handler per intent (full chains + artifact whitelists: `schemas/routing-taxonomy.md`):

| Intent | Canonical handler chain |
|---|---|
| `feature` | `@product` → `@architect` (Full) → `@lead` → fan-out |
| `hotfix` | `@lead` → `@backend` / `@frontend` → `@test` Stage-2 → `@evaluator` |
| `template` | `@product` (triage) → `@lead` → fan-out |
| `refactor` | `@reviewer` (pre-impl) → `@lead` → `@backend` / `@frontend` → `@test` Stage-2 → `@evaluator` |
| `docs` | `@product` (triage) → `/orchestra ship` → `@reviewer` |
| `review-only` | `@reviewer` only — no downstream |

Out-of-whitelist → ESCALATE: `reason: "@<agent> spawned outside routing whitelist for intent=<intent>"`. No silent no-op.

### Confidence-tier dialogue

User-facing agents (`@product`, `@lead`) compute confidence per 5-signal rubric: intent length, prior artifacts, files-touched, language familiarity, evaluator agreement. Confidence ≠ alignment — every band asks at least once.

- **HIGH** — 1 confirmation `AskUserQuestion`: restate reading, ask to proceed.
- **MEDIUM** — 1 targeted `AskUserQuestion`.
- **LOW** — 2–3 questions, cap 3.

Stack-elicitation (greenfield language+framework) counts toward downstream cap; fires once per service per run.

3 rejection rounds → DEADLOCK.

### DEADLOCK / ESCALATE shape

- **DEADLOCK** — cannot make progress (spec gap; 3-rejection threshold). Write `<feature-id>-DEADLOCK-<slug>.md` at `<cwd>/.orchestra/pipeline/<feature-id>/`. Frontmatter: `cause:` (`spec_gap`, `consultant-mode-skipped`), `triggered_by_agent: @<agent>`, `resolution: pending`.
- **ESCALATE** — misrouting or unresolvable scope (spawn outside rigor band; scope drift). Write `<feature-id>-ESCALATE-<slug>.md` (or `-ESCALATE-ADR-<NNNN>.md` for ADR-specific) at `<cwd>/.orchestra/pipeline/<feature-id>/`. Frontmatter: `reason:`, `triggered_by_agent: @<agent>`, `resolution: pending`.

End turn after writing — `@lead` (or dispatcher under reverse-doc) picks up. Status banner fires on parent Read.

## Chain execution

Once decisions are locked, @lead routes through layers per elected rigor. Hard-sequential layers feed each other; parallel fan-out fires once `openapi.yaml` is locked.

**Hard-sequential (lift dependency):** `PRD → FRS → SAD → TDD → openapi.yaml | asyncapi.yaml`. `ADR-NNNN.md` runs parallel with TDD when independent; sequential when TDD informs it.

**Parallel fan-out** (gated on `openapi.yaml status: locked`):

- `@backend` → server code + unit tests.
- `@frontend` → UI code + unit tests (skipped if no UI).
- `@test` Stage-1 → TSR test-plan + black-box tests (SPEC-BOUND; `src/**` blocked).

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

@lead reads `local.yaml.chain_rigor` and skips elided layers. Light: component-internal changes that don't shift specs (refactor, internal behavior fix); implementer still produces tests + TSR.

**Stage-1 @test is spec-bound.** Reads only `<feature-id>-openapi.yaml` / `<feature-id>-asyncapi.yaml` + PRD + FRS — `src/**` blocked via per-stage Read allowlist (`agents/test.md`). On openapi silence: writes DEADLOCK per Shared rules; @lead picks up, re-spawns @architect or self to amend.

**Within-agent parallelism.** @backend (optionally @frontend, @test) splits large impl tasks into N parallel sub-runs via nested Agent calls when `<feature-id>-TASKS.md` has parallel-eligible nodes. Prompt-discipline only — no harness change.

## Steps (smart router)

1. **Decision tree** per above. Cache to `local.yaml`. First run with `mode: brownfield` → also invoke `project-discovery` to populate `discovery:` (mode/depth/language/framework/scope_hints); prompt for `depth` if unset (cached after).
2. **Brownfield bootstrap branch (one-shot).** If `mode == brownfield` AND `bootstrap != completed`: fan out reverse-doc spawns per `depth` BEFORE forward chain. Each major feature gets a freshly-minted `<feature-id>`.
   - **2a — source-explore fan-out (depth ∈ {medium, full}):** before any `mode: reverse-doc` spawn, fan out `@backend` (always) + `@frontend` (when UI in inventory) + `@test` (when tests detected) in one Agent-tool-call message, each with `task: source-explore`. Each writes `<context_path>/.orchestra/<service_name>/source-intel/<stack>-intel.md` (read-only; no source edits, no Bash). Wait for all locked. Skip on `depth: light`.
   - **2b — feature-id minting (depth ∈ {medium, full}):** read `backend-intel.md` `S-FEATURE-CANDIDATES-001` (+ `frontend-intel.md` when present). Mint one `<feature-id>` per accepted candidate.
   - **2c — reverse-doc fan-out per depth:**
     - `light` — `@product` per major feature with `mode: reverse-doc`. Output: `<feature-id>-PRD.md`. No intel artifacts; inventory + scope_hints only.
     - `medium` — `@product` (PRD + FRS) + `@lead` (TDD) per feature with `mode: reverse-doc`. Both read locked intel from Step 2a. PRD → FRS → TDD sequential per feature; features parallel.
     - `full` — first `@architect` (project-level SAD + accepted ADRs from visible-in-source decisions) with `mode: reverse-doc`. Then per feature: `@product` (PRD + FRS) → `@lead` (TDD + openapi). All read locked intel.

   After all reverse-doc spawns idle: parent flips `bootstrap: completed`; proceeds to Step 3. Subsequent `/orchestra` runs: no-op. Intel cached per `pipeline_id`; re-run Step 2a only when `source_lock.read_paths` changes.
3. **Spawn @lead.** Pass locked decisions; @lead routes forward chain.
4. **@lead routes layers** per rigor:
   - **Business** (Full/Standard) — @product writes `docs/<feature-id>/<feature-id>-PRD.md` then `<feature-id>-FRS.md`. Locked PRD/FRS carry no open questions; uncertainty resolves via `AskUserQuestion` / `ESCALATE` / `ESCALATE-ADR` per `agents/product.md` "Question-resolution policy" before lock.
   - **Architecture** (Full only) — @architect writes `docs/SAD.md` (singleton; first-feature bootstrap) + `docs/adr/ADR-NNNN-<slug>.md` (per ADR trigger; global, not feature-scoped). C4 L1+L2 + Logical ERD + Inter-service Sequence as `.puml` under `docs/diagrams/`.
   - **Component** (always) — @lead writes `docs/<feature-id>/<feature-id>-TDD.md` (C4 L3 + Intra-service Sequence + Technical State if applicable + Physical DB if schema touched).
   - **Boundary** (always) — @lead writes `docs/<feature-id>/<feature-id>-openapi.yaml` (or `-asyncapi.yaml`). CONTRACT narrative inline via `description:` + top-of-file `# orchestra:` comment block.
5. **openapi locked → fan-out.** @lead spawns @backend ‖ @frontend ‖ @test (Stage-1) in one Agent-tool-call message. Each spawn carries scoped Read allowlist: @test Stage-1 excludes `src/**`.
6. **Converge.** @backend writes server code + unit tests under `src/main/**` and `src/test/**`. @frontend writes UI (skipped if no UI). @test Stage-1 writes TSR `S-TEST-001` plan + black-box tests. All three idle → @lead spawns @test Stage-2 (impl-aware) + @evaluator + @reviewer in dependency order, gated by `local.yaml.verdict_mode` (default `full`):
   - `full` — spawn all three.
   - `evaluator-only` — Stage-2 + @evaluator; skip @reviewer. Write `S-REVIEW-001` body: `skipped: by-local.yaml.verdict_mode` (frontmatter `rev_verdict: ALLOW_WITH_GAP`).
   - `reviewer-only` — Stage-2 + @reviewer; skip @evaluator. Write `S-EVAL-001` body: `skipped: by-local.yaml.verdict_mode` (frontmatter `eval_verdict: PASS`, `eval_score: 0` — Stage-2 PASS/FAIL evidence authoritative).
   - `none` — Stage-2 only; both skipped markers; `/orchestra ship` accepts as `ALLOW_WITH_GAP` (same path deferred-mode uses).
   Stage-2 always runs — verdict modes elide only the grading layers.
7. **TSR multi-writer.** `docs/<feature-id>/<feature-id>-TSR.md` accretes per-writer sections enforced by `pre-write-check.js` Gate-B (per-section locks):
   - `S-TEST-001` — @test (single row; Stage-1 authors rows with empty status/evidence cells, Stage-2 fills in place; src/ blocked during Stage-1).
   - `S-EVAL-001` — @evaluator (writes `| id | verdict | reason |` keyed on S-TEST-001 row ids; no Bash; `validate.js` rejects unknown ids).
   - `S-REVIEW-001` — @reviewer (code review + ADR-review subsection when ADRs touched).
   - `S-DIVERGENCES-001` — @architect (brownfield only).
   - Final ship verdict in frontmatter `ship:` (no body section). `/orchestra ship` writes it.

   @evaluator reads only `docs/<feature-id>/*` (PRD, FRS, TDD, openapi, TSR `S-TEST-001`); `src/**` blocked. @test Stage-2 owns suite execution; @evaluator = pure inspection (no Bash) grading Stage-2's PASS/FAIL evidence.
8. **Terminal state.** After every parent `Read` in steps 6–7:
   - `RELEASE-vX.Y.Z.md` written → `terminal_state = "success"` (only via `/orchestra ship`).
   - `<feature-id>-DEADLOCK-*.md` → `terminal_state = "deadlock"`.
   - `<feature-id>-ESCALATE(-ADR)?-*.md` with `resolution: abandoned` → `terminal_state = "escalated"`.
   - else → continue Step 6–7 spawn loop.

   On terminal: run **completion-parity probe** (below); emit closing status line. Stop hook fires `events.jsonl` event with terminal state and `<run-id>.json.status` ∈ {`completed`, `aborted`, `deadlocked`}. No SUMMARY artifact — observability is source of truth.

   ### Completion-parity probe (non-blocking)

   Catches silently-partial runs: `terminal_state = "success"` without DEADLOCK / ESCALATE but features missing artifacts. Runs on every terminal state; annotates partials on `deadlock` / `escalated`.

   1. Read `run-plan.md` `S-FEATURES-001` rows. Each contributes one `<feature-slug>` expected to materialize as `docs/<service_name>/<feature-id>/`.
   2. Expected artifact set per `chain_rigor`:
      - `Full` / `Standard` — `<feature-id>-PRD.md`, `-FRS.md`, `-TDD.md`, `-TSR.md`.
      - `Light` — `<feature-id>-TDD.md`, `-TSR.md`.
   3. Glob `docs/<service_name>/<NNN>-<feature-slug>/`; verify each expected file exists AND frontmatter `status: locked`. Missing OR `status: draft` → incomplete.
   4. All pass → no-op; probe silent.
   5. Any incomplete → write `<context_path>/.orchestra/<service_name>/pipeline/<run-id>-INCOMPLETE.md`:
      ```yaml
      ---
      id: <run-id>-INCOMPLETE
      type: INCOMPLETE
      created: <ISO-8601>
      run_id: <run-id>
      service_name: <service_name>
      terminal_state: success | deadlock | escalated
      expected_features: <int>
      complete_features: <int>
      ---

      ## Missing or partial feature artifacts

      | Feature | Missing artifacts |
      |---|---|
      | <NNN>-<slug> | <feature-id>-TSR.md (absent); <feature-id>-TDD.md (status: draft) |
      | ... | ... |
      ```
      Also patch `metrics/runs/<run-id>.json` with `incomplete: true`. `status` field NOT touched — `terminal_state = "success"` AND `incomplete: true` is valid: "completed without halt, didn't fully cover planned `S-FEATURES-001` scope."
   6. Status banner lifts `path:` from INCOMPLETE artifact so user sees partial-completion warning on read.

### src/ purity (enforced)

`<context_path>/services/<service_name>/src/main/**` and `<context_path>/services/<service_name>/src/test/**` MUST NOT carry chain-artifact section-cites: `PRD` / `FRS` / `TDD` / `CONTRACT` / `TSR` / `ADR-NNNN` + section pointer; `FR-N`, `AC-N`, `C-N`, `NFR-N`, `S-XXX-NNN`; `openapi.yaml#/paths/`. `pre-write-check.js` Gate-D rejects at write time. Traceability → commits, PR descriptions, TSR verdict sections.

## /orchestra ship

Finalizes a feature's chain artifacts after gate verification; creates one commit. Lean: no release-note authoring, no smoke-testing, no version bumping. Release semantics (RELEASE.md / RUNBOOK.md / semver tagging / publishing) out of scope — those vary per team and the dispatcher should not opinionate.

Algorithm:

1. **Verify gates.** Walk artifacts; halt with failing artifact path on:
   - Open `<feature-id>-DEADLOCK-*.md` under `<context_path>/.orchestra/<service_name>/pipeline/<feature-id>/`.
   - `<feature-id>-ESCALATE*.md` with `resolution: pending`.
   - `<feature-id>-TSR.md` with `eval_verdict: FAIL`, `rev_verdict: REQUEST_CHANGES`, or `eval_score < passing_score` from openapi description.
   - `git diff`-detected drift on `status: locked` artifact.
   - **Deferred-mode tolerance:** if `tsr_gate_mode: deferred` AND `<feature-id>-DRAFT-COMPLETE.md` exists, absent `eval_verdict` / `rev_verdict` cells tolerated; feature ships `ship: ALLOW_WITH_GAP`. Other absences rejected.
2. **Set TSR `ship:` frontmatter.** Per gated feature: write `ship:` ∈ `ALLOW | ALLOW_WITH_GAP | HOLD` into `<feature-id>-TSR.md` frontmatter. TSR top-level `status` stays `draft` through this write (Gate-A only fires when top-level `status: locked`). Frontmatter-only; no body section. `ALLOW_WITH_GAP` auto-selected under deferred-mode; `ALLOW` / `HOLD` user-chosen on REVIEW verdict.
3. **Commit.** Invoke `skills/commit-message/SKILL.md` (Conventional Commits 1.0.0 + mandatory AI `Co-Authored-By:` trailer). Empty stage → halt: `[orchestra] ship: nothing staged; stage chain artifacts (and any related source) first`. `git commit -m "<message>"` against staged. **MUST NOT** `git push`, `git push --tags`, or `git tag` — pushing/tagging stays in user's hands. Print new commit SHA + message.

## /orchestra report

Observability subcommand. Reads `events.jsonl` + `tokens.jsonl` + `runs/*.json` from `<cwd>/.orchestra/metrics/`; emits Gantt timeline `.svg` + cost-by-role + cost-by-phase pivots + non-blocking readers-violations summary (Gate-C aggregation) + business-code-purity summary (Gate-D aggregation). Impl: `scripts/orchestra-report.js`.

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/orchestra-report.js \
  --metrics-dir <cwd>/.orchestra/metrics \
  --out <cwd>/.orchestra/reports/<run-id>/
```

Cadence: on invocation. Non-blocking — never fails a build.

## /orchestra resume [<feature-id>]

Resume interrupted feature run. Walks `<cwd>/.orchestra/pipeline/*/`; finds next non-`done` task; respawns owner. Idempotent — respawning a partially-completed prior turn is safe.

1. **Enumerate.** List `<cwd>/.orchestra/pipeline/*/` dirs without final `docs/<feature-id>/<feature-id>-TSR.md` carrying `ship: ALLOW`. 0 → emit `[orchestra] resume no in-flight features` + exit. 1 → auto-select. >1 → `AskUserQuestion`. If `<feature-id>` arg passed: validate against candidates; mismatch → write `<feature-id>-DEADLOCK-resume.md` + halt.
2. **Validate prerequisites.** Read `<cwd>/.orchestra/pipeline/<feature-id>/intent.yaml`. Missing → fail closed (`<feature-id>-DEADLOCK-resume.md` + halt). Scan:
   - `<feature-id>-DEADLOCK-*.md` → emit banner; needs manual rescope.
   - `<feature-id>-ESCALATE*.md` with `resolution: pending` → banner + `AskUserQuestion` ("ESCALATE pending: `<reason>`. Resolved externally?"). Reject → halt; accept → proceed.
3. **Find resume point.** Two paths — fine-grained PLAN scan first, coarse-grained TASKS.md walk as fallback. PLAN ownership + lifecycle per "Per-agent plan discipline" above; `agent-plan-sync` hook owns `status:` mutation.
   - **3a (fine):** Glob `<cwd>/.orchestra/tasks/*/<agent>/<feature-id>.md`. Any PLAN `status: interrupted` (or `in_progress` from prior session) → resume point = first non-`completed` `tasks[]` entry; owner = PLAN's `agent:` field. Respawn agent with directive to read prior PLAN and continue from first open task.
   - **3b (coarse, fallback):** No interrupted PLAN → read `<feature-id>-TASKS.md`; walk topologically:
     - `Status = done` → skip.
     - Owner read-only-tier (`@evaluator` / `@reviewer`) → derive done from TSR frontmatter (`eval_verdict ∈ {PASS, FAIL}`, `rev_verdict ∈ {APPROVED, REQUEST_CHANGES}`).
     - Owner artifact-tier → derive done from artifact existence + frontmatter `status: locked`.
     - First non-done → resume point.
4. **REQUEST_CHANGES gate.** Resume point follows TSR `rev_verdict: REQUEST_CHANGES` → do NOT auto-respawn. Emit banner + `AskUserQuestion` ("Last review verdict: REQUEST_CHANGES (`<N findings>`). Respawn @<owner> for revision, or halt?"). Accept → step 5; reject → halt.
5. **Spawn.** `Agent({ subagent_type, prompt })` with locked decisions from `local.yaml` + resume directive: "Your task is `T-<id>` in `<feature-id>-TASKS.md`. Read existing artifacts before re-writing — idempotent re-write acceptable."
6. **Continue smart-router** from resume point through terminal-state detection.

## Runtime hooks

6 hooks registered in `hooks/hooks.json`. Hooks own events per "Invariants" above — do not replicate side effects.

| Hook | Events (matchers) | Side effect |
|---|---|---|
| `metrics-collector` | UserPromptSubmit / PreToolUse:Task\|Agent\|TeamCreate\|TeamDelete\|Skill\|Write\|Edit\|MultiEdit\|mcp__orchestra-*\|TaskCreate\|TaskUpdate / SubagentStop / Stop | Emits lifecycle events to `<cwd>/.orchestra/metrics/events.jsonl` (Stream 7 retools for `agent_role` + `phase` + `subagent_session_id` join keys); `agent.plan.task` rows on Task* tool calls give a per-agent activity audit |
| `pre-write-check` | PreToolUse:Write\|Edit\|MultiEdit | Secrets matcher (8 patterns; exit 2) + 4 frontmatter gates: status-locked / sections-all-locked / readers-warning / src/ cite denylist |
| `val-calibration` | PreToolUse:Task\|Agent | Injects `<calibration-anchor>` block into `@evaluator` spawn prompts |
| `agent-plan-sync` | PreToolUse:TaskCreate\|TaskUpdate / PostToolUse:TaskCreate / SubagentStop | Owns mutation of per-agent PLAN files at `<cwd>/.orchestra/tasks/<run-id>/<agent>/<feature-id>.md` — `tasks:` array, count fields, top-level `status:` lifecycle, and the `## Tasks` checklist body. Agent body authors `## Approach` only |
| `post-bash-lint` | PostToolUse:Bash | Surfaces source-modifying Bash to stderr (observer; never blocks) |
| `post-write-puml` | PostToolUse:Write\|Edit\|MultiEdit | Renders `.puml` → `.svg` via plantuml CLI; warns when sibling `.md` lacks `![..](diagrams/<name>.svg)` reference (non-blocking) |

## /orchestra help

```
/orchestra <intent>           Smart router. Mode-detect → chain-rigor → spec-to-code chain (PRD/FRS/SAD/ADR/TDD/openapi/code+tests/TSR).
/orchestra ship               Verify gates → set TSR frontmatter `ship:` → commit (per skills/commit-message). Never pushes / tags.
/orchestra report             Render Gantt + cost-by-role + cost-by-phase from events.jsonl/tokens.jsonl/runs.
/orchestra resume [<feature-id>] Walk .orchestra/pipeline/* dirs; find non-terminal feature; respawn next non-done task.
/orchestra help               This message.
```

Flags:
- `--rigor {Full,Standard,Light}` — override `chain_rigor`.
- `--mode {greenfield,brownfield}` — override mode detection.
- `--depth {light,medium,full}` — override depth (brownfield only).
- `--autonomy {EXECUTION_ONLY,JOINT_PROCESSING,OPTION_SYNTHESIS,DRAFT_AND_GATE,FULL_AUTONOMY}` — highest-precedence autonomy resolution; bypasses `local.yaml.autonomy.level` + diagnostic suggestion.
- `--spawn-mode {subagent,teams}` — override `spawn_mode`.
