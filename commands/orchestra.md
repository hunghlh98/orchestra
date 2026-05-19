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
   - **`chain: reverse-pass`** — `EnterPlanMode` with the run-plan body as the plan content (`S-FEATURES-001` is the load-bearing section reviewer scans); `ExitPlanMode` collects accept/reject. Plan-mode body MUST prepend an `## Auto-mode notice` block above `S-FEATURES-001` warning the reviewer that accept flips `auto_mode: true` and skips between-phase gates, per-feature confirmations, and `DRAFT_AND_GATE` checkpoints; reject keeps them firing. Mid-run user signal "DB ready, restart" or any other external-state change AFTER a TDD has locked → before resuming, re-spawn `@lead` for a focused schema-diff pass against `S-DATA-001`; restart-first is a process violation logged in the reverse-pass run report.
   - **`chain: forward-chain`** — `AskUserQuestion(approve | revise)`.
3. Accept → `mcp__orchestra-utils__upsert_local_yaml(context_path, service_name, auto_mode: true, run_plan_status: approved)`; flip run-plan frontmatter `run_plan_status: approved` + `status: locked` via `Write` (dispatcher has unrestricted write surface; Gate-A inapplicable to `.orchestra/**`).
4. Reject/revise splits by `chain:`:
   - **`chain: reverse-pass`** — dispatcher updates the plan-mode file inline with the revised approach (plan-mode's native edit affordance — multiple edits per session, single `ExitPlanMode` on accept). Capture reviewer notes; re-spawn `@lead` only when the revision requires fresh content from upstream artifacts. Max 3 in-plan-mode revision cycles; cycle 4 → `pipeline/run-plan-ESCALATE.md`.
   - **`chain: forward-chain`** — flip frontmatter `run_plan_status: revision_requested`; capture reviewer notes; re-spawn `@lead` with notes lifted into `## Revision notes` under `S-APPROVAL-001` and `revision_cycle` incremented. Max 3 cycles; cycle 4 → `pipeline/run-plan-ESCALATE.md`.

After `auto_mode: true`: between-phase "proceed?" gates, per-feature confirmations, and `DRAFT_AND_GATE` checkpoints skip. Structural-failure halts + `ESCALATE` / `DEADLOCK` emission always preserved.

## Algorithm payloads

### spec-to-code (S2/S3/S4)

Dispatcher drives the chain via the 5-gate state machine (see `## Per-feature execution model`). First spawn (business path) goes to `@product`; subsequent spawns are dispatcher-owned between gates.

```
phase: spec-draft
spawned_agent: @product (first), then @analyst, @architect, @lead per gate-approval
feature_id: <short-service-name>-<NNN>-<slug>  (dispatcher-minted from features.yaml; service from local.yaml.service_name)
inputs: <context_path>/.orchestra/<service_name>/local.yaml + run-plan.md + features.yaml (read-only at @product) + docs/business-invariants.md (multi-repo only) + docs/<service_name>/<service_name>-BR-AC.md
linear chain: @product (PRD + features.yaml entry) → @analyst (FRS) → @architect (SAD + ADR? + TDD + openapi/asyncapi) → @lead (TASKS + run-plan) → @backend ‖ @frontend ‖ @test-author → @test-runner → @evaluator + @reviewer → TSR
```

After Gate 5 (run-plan approval), `@lead` spawns parallel fan-out (`@backend` ‖ `@frontend` ‖ `@test-author`) gated on `TDD + openapi status: locked`. Converge on `@test-runner` → `@evaluator` + `@reviewer` → `<feature-id>-TSR.md` sections locked.

**Inter-feature parallel spawn (S4).** `S-FEATURES-001` with ≥2 features, distinct aggregate roots / distinct services, no dependency edge in `features.yaml` → dispatcher spawns per-feature chains in ONE message.

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

**Per-task deliverable contract.** Every `@architect` spawn under `task: reverse-pass` MUST author the full set below for the spawn's scope. Dispatcher post-pass walks the brief's deliverable list; absent paths → `task: deliverable-gap-fill` re-spawn.

| `task:` value | Scope | Deliverable paths |
|---|---|---|
| `provenance-marker` | one-shot | `<context_path>/docs/README.md` via `mcp__orchestra-utils__docs_readme` only. |
| `workspace-sad-author` | workspace | `<context_path>/docs/SAD.md`; `<context_path>/docs/business-invariants.md`; `<context_path>/docs/adr/ADR-<NNNN>-<slug>.md`; `<context_path>/docs/diagrams/{c4-context,c4-container,erd-logical}.puml`; `sequence-inter-<flow>.puml`. |
| `per-service-narrowing` | one service | `<context_path>/docs/<service_name>/<service_name>-BR-AC.md`; `<context_path>/docs/<service_name>/adr/ADR-<service_name>-<NNN>-<slug>.md` (when newly opened); `<context_path>/docs/<service_name>/diagrams/{c4-component,c4-code,erd-logical}.puml`; per-feature `<context_path>/docs/<service_name>/<feature-id>/<feature-id>-TDD.md` (anchors `S-OVERVIEW-001`, `S-COMPONENTS-001`, `S-DATA-001`, `S-STATE-001`, `S-CONFIG-001`, `S-ARCHITECTURE-001`); `<feature-id>-openapi.yaml` / `<feature-id>-asyncapi.yaml` / `<feature-id>-clientapi.yaml`; per-feature `<feature-id>-{c4-context,c4-container,seq-<journey>,state-technical,erd-physical}.puml`. |
| `deliverable-gap-fill` | one service, list in brief | absent paths from a preceding `per-service-narrowing` pass. |
| `reverse-pass` (single-repo single-service) | one service | identical to `per-service-narrowing` row above (no `workspace-sad-author` precondition). |

**Spawn brief template (per-service-narrowing).**

```
phase: discovery
task: per-service-narrowing
feature_ids: [<feature-id>, ...]                # ids minted via features.yaml NNN + 1
source_read_root: <local.yaml.source_path>
scope_frame: per-service
service_name: <local.yaml.service_name>
deliverables:                                   # full paths per contract row above
  - <context_path>/docs/<service_name>/<service_name>-BR-AC.md
  - <context_path>/docs/<service_name>/diagrams/c4-component.puml
  - <context_path>/docs/<service_name>/diagrams/c4-code.puml
  - <context_path>/docs/<service_name>/diagrams/erd-logical.puml
  - <context_path>/docs/<service_name>/<feature-id>/<feature-id>-TDD.md          # per feature_id
  - <context_path>/docs/<service_name>/<feature-id>/<feature-id>-openapi.yaml    # per feature_id
  - <context_path>/docs/<service_name>/<feature-id>/<feature-id>-asyncapi.yaml   # per feature_id (event-emitting only)
  - <context_path>/docs/<service_name>/<feature-id>/<feature-id>-clientapi.yaml  # per feature_id (consumer of upstream only)
  - <context_path>/docs/<service_name>/<feature-id>/<feature-id>-seq-<journey>.puml
  - <context_path>/docs/<service_name>/<feature-id>/<feature-id>-state-technical.puml
  - <context_path>/docs/<service_name>/<feature-id>/<feature-id>-erd-physical.puml
```

**Post-pass deliverable check.** Dispatcher walks the brief's `deliverables:` list after `@architect` returns; absent paths → `Write(<context_path>/.orchestra/<service_name>/pipeline/<feature-id>/MISSING-DELIVERABLES-<service>.md)` listing absent paths; re-spawn `@architect` with `task: deliverable-gap-fill` carrying the list. Cycles until coverage closes.

**Provenance marker.** First run when preflight reports `docs_provenance: unknown` → spawn `@architect` with `task: provenance-marker`. `@architect` calls `mcp__orchestra-utils__docs_readme(context_path)` — the tool pins frontmatter (`id: docs-readme`, `type: README`, `generated_by: orchestra`, `status: locked`) and writes a canonical body from `hooks/references/docs-readme.template.md`. No improvisation, no `Write` author path.

**SAD pre-pass cohort.** When auto-promote AND provenance marker BOTH required on the same reverse-pass entry, dispatcher MUST spawn `@architect task: provenance-marker` + `@architect task: workspace-sad-author` in ONE message as a 2-element cohort (no read-dependency between them). Sequential spawn surfaces as `cohort.spawn.staggered` warning.

**Per-artifact classify-then-author.** For each chain artifact: Absent → `re-author`. Present + `generated_by: orchestra` AND `status: locked` → `cite-as-is`. Present + `generated_by: orchestra` AND `status: draft` → `copy-and-modify`. Present without provenance marker → `re-author`. Frontmatter `reverse_authoring_mode: <mode>` REQUIRED.

**Portability contract.** Every artifact under `docs/**/*.md` carries domain rules ONLY — no `src/**` path tokens, commit SHAs, branch names, repo URLs. PRD/FRS additionally carry no fenced code blocks. `pre-write-check.js` Gate-D-inverse enforces. Inline backtick spans (single-line snippets) always allowed.

**Reverse-pass R-gates.** Inside `code-to-spec`, dispatcher gates the reverse chain after each agent locks its derived artifact — see `## Per-feature execution model > ### Brownfield R-gates`.

### `<intent>` router (S8/S9)

Branches per preflight `mode:`:

- `greenfield` → S8: 3× `AskUserQuestion` upfront (Q1 restate intent / Q2 scope / Q3 constraints). Route to S2/S3/S4 per `docs/` state.
- `brownfield` → S9: 1× `AskUserQuestion` workspace-kind-adaptive permission gate. `no` → abort with error. `yes` → S5/S6/S7. After reverse locks: 3× `AskUserQuestion` post-reverse (now informed). Route to S2/S3/S4.

Router's questions cap further confidence-tier dialogue: downstream agents observe `intent_floor: cleared` in lead spawn prompt and skip their own intent-restate.

On S8/S9 paths the dispatcher additionally runs an LLM tech-vs-business classifier before feature-id mint — see `## Per-feature execution model > ### Intent classification`.

## Per-feature execution model

For each `<feature-id>` enumerated in run-plan `S-FEATURES-001`, dispatcher drives a 5-gate state machine (business path) or single-gate (tech path). Gates are dispatcher-owned `AskUserQuestion` calls between agent spawns; spawned agents MUST NOT call `AskUserQuestion` to gate downstream handoff — only dispatcher gates.

### Intent classification (S8/S9 path only)

`<intent>` routes run a tech-vs-business classifier BEFORE feature-id mint. Classifier prompt (run inline by dispatcher):

```
Classify the user intent into one of two paths:

- business: new user-visible feature, new endpoint, UI change, business rule change, data model change. Anything changing what users can do or see.
- tech: dependency bump, lint fix, internal refactor with zero contract change, observability tweak, build tooling, log format change. Zero observable surface delta.

DEFAULT: business. Ambiguous phrasing → business.

Confidence:
- HIGH — proceed silently to chosen path.
- LOW or MEDIUM — emit AskUserQuestion with two options labelled "Business path" and "Tech path".
```

Routes:

- `business` → 5-gate machine spawning `@product` → `@analyst` → `@architect` → `@lead`.
- `tech` → skip to `@lead` with `chain: tech-path`. Shared NNN counter with business features (one `features.yaml` entry per feature regardless of path).

`spec-to-code` and `code-to-spec` entry shapes skip the classifier — business path implied.

### Feature-id mint (manifest-aware)

Dispatcher mints `<feature-id>` BEFORE first agent spawn. Algorithm:

1. Read `<context_path>/.orchestra/<service_name>/features.yaml` (init `{ features: [] }` when absent).
2. `<short-service-name>` = `local.yaml.service_name`.
3. `<NNN>` = max numeric segment across all `features[].id` + 1, zero-padded to 3 digits (per-service ordinal; the intra-service manifest already partitions by service).
4. User supplies slug at gate 1 (or implicit from intent at HIGH classifier confidence).
5. Concatenate `<short-service-name>-<NNN>-<slug>` (e.g., `order-001-checkout`). Pass into `@product` spawn context; `@product` writes the entry via `mcp__orchestra-utils__upsert_features_yaml`.

Slug shape: tech / CRUD / lifecycle noun (`order`, `order-checkout`, `order-refund`, `<aggregate>-purchase-lifecycle`, `<aggregate>-termination`). Reject Journey-gate category labels (`forward-purchase`, `abandonment`, `reversal`) and verb-prefixed slugs (`regen-*`, `refactor-*`, `fix-*`).

### Gate state machine

```
[business path]                                       [tech path]
       │                                                     │
       ▼                                                     ▼
 Gate 1: tech | business confirmation              (classifier silent at HIGH;
  (fires only on LOW/MEDIUM classifier conf.)        no gate fires)
       │ approved (or HIGH default)                         │
       ▼                                                    │
 spawn @product                                             │
   → PRD locked + features.yaml entry upserted              │
       │                                                    │
       ▼                                                    │
 Gate 2: PRD review → FRS?                                  │
       │ approved                                           │
       ▼                                                    │
 spawn @analyst                                             │
   → FRS locked                                             │
       │                                                    │
       ▼                                                    │
 Gate 3: FRS review → TDD?                                  │
       │ approved                                           │
       ▼                                                    │
 spawn @architect                                           │
   → TDD + openapi/asyncapi locked                          │
       │                                                    │
       ▼                                                    │
 Gate 4: TDD+openapi → impl?                                │
       │ approved                                           │
       ▼                                                    ▼
 spawn @lead (business mode)        ◄─────────── spawn @lead (tech mode)
       │                                                    │
       ▼                                                    ▼
 Gate 5: run-plan approval (existing forward-chain gate per "Run-plan + approval gate")
       │ approved
       ▼
 parallel fan-out: @backend ‖ @frontend ‖ @test-author
       │
       ▼
 @test-runner → @evaluator + @reviewer
       │
       ▼
 TSR locked
```

Per-gate user response branches:

- **Approve** → spawn downstream agent.
- **Re-author** → flip upstream artifact frontmatter `status: locked` → `status: draft`. Re-spawn upstream agent with user feedback appended as `Feedback:` block in spawn-context. Agent picks up its prior artifact in draft state and revises in place.
- **Halt** → stop chain; return summary. User resumes by re-invoking `/orchestra`. Chain state recovers from filesystem (see `### Chain state recovery`).

### Chain state recovery

Dispatcher carries no state between user turns. On re-invocation, derives current chain position from filesystem per active `<feature-id>` (entry in `features.yaml` lacking a TSR verdict):

```
If <feature-id>-PRD.md absent              → gate 1 → spawn @product
If PRD locked, no FRS                      → gate 2 → spawn @analyst
If FRS locked, no TDD                      → gate 3 → spawn @architect
If TDD + openapi locked, no run-plan       → gate 4 → spawn @lead
If run-plan present + status: draft        → gate 5 (approval)
If run-plan locked, fan-out incomplete     → spawn fan-out
If fan-out complete, no TSR verdict        → @test-runner → @evaluator + @reviewer
```

`features.yaml` carries the dependency DAG; per-feature `pipeline/<feature-id>/` directory carries chain-state artifacts. No separate state file.

### Brownfield R-gates

Reverse-pass reverses the chain: `src` → `@architect` → `@analyst` → `@product`. Dispatcher gates each handoff:

```
reverse-pass plan-mode gate (existing, EnterPlanMode/ExitPlanMode on run-plan)
    │ approved
    ▼
spawn @architect (brownfield mode; reads src/**; authors TDD + openapi)
    │
    ▼
Gate R-4: extracted TDD + openapi review
    │ approved
    ▼
spawn @analyst (derives FRS from TDD + openapi)
    │
    ▼
Gate R-3: derived FRS review
    │ approved
    ▼
spawn @product (synthesizes PRD + manifest entry from FRS + TDD)
    │
    ▼
Gate R-2: synthesized PRD review → done
```

Reverse-pass writes the `features.yaml` entry at the END (when `@product` synthesizes), not the start.

**Manifest scope.** `features.yaml` carries the intra-service DAG shape only: `id, status, depends_on, supersedes, artifacts`. Semantic dimensions (slug-as-prose, outcome category, journey label, business intent) live in the run-plan `S-FEATURES-001` body and the per-feature PRD — never in `features.yaml`. The slug is already embedded in `id` per pattern `^[a-z0-9]+(-[a-z0-9]+)*-[0-9]{3}-[a-z0-9]+(-[a-z0-9]+)*$` (e.g., `order-001-checkout`); do not author a separate `slug:` field.

## Shared rules

### Phase-tag emission

Every `Agent({...})` call MUST prepend `phase: <name>` on its own line. Canonical values: `discovery`, `spec-draft`, `verification`, `gap-resolution`, `gate`.

### Parallel-spawn discipline

Cohort of N agents (feature fan-out, BR-AC fan-out, SAD pre-pass cohort, `@analyst` / `@product` reverse-pass per-feature batches) MUST emit ALL `Agent({...})` calls in ONE assistant message. Before spawning, count: are there N>1 agents at the same `phase:` with no read-dependency between them? If yes → ONE message with N tool-use blocks. Staggered spawns across multiple messages are a structural violation; `metrics-collector` flags them as `cohort.spawn.staggered` warnings on `runs/<id>.json`. Tool-call batching is one message containing N tool-use blocks — not N messages each containing one block.

### Spawn brief discipline

Spawn briefs describe what to look for, not what to find. Prescriptive findings risk fabrication; descriptive briefs let well-behaved agents flag divergences instead of confirming pre-supplied conclusions.

- ❌ `the cancel/refund path enforces X-User-Id ownership matching the order's owner (lift from BR-AC INV-*)`
- ✅ `verify whether cancel/refund endpoints enforce ownership; if observed, lift the constraint to BR-AC. If absent, raise as a divergence candidate.`

Violations surface late (only via `@analyst` resistance or `@evaluator` cross-check); model-disciplined drafters can mask them entirely.

### Preconditions to surface in run-plans

Dispatcher lifts the applicable bullets into the run-plan's `S-CONTEXT-001` body for human reviewer awareness pre-approval:

- Spawn briefs describe, never prescribe (see `### Spawn brief discipline`).
- Path-A ratification on locked chain artifacts requires `mcp__orchestra-utils__amend_locked_artifact` + `relock_artifact` (sibling tools; emit the matching `unlocked` / `re-locked` row in the same write that flips `status:`). Surface up-front if reverse-pass is likely to raise Path-A divergences.
- Single-writer surfaces (SAD `S-CONTAINERS-001`, workspace `business-invariants.md`, ADR-index) stay serial — never fan out parent-write.
- Cohort spawns (feature fan-out, BR-AC fan-out, SAD pre-pass cohort) emit ONE message (see `### Parallel-spawn discipline`).

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

### Tool prerequisites

Dispatcher tool surface splits by call-readiness:

- **Immediate** (callable without `ToolSearch`): `Read`, `Write`, `Edit`, `Bash`, `Agent`, `AskUserQuestion`.
- **Deferred** (require `ToolSearch select:<name>` before first call): `TaskCreate`, `TaskUpdate`, `EnterPlanMode`, `ExitPlanMode`, all `mcp__orchestra-utils__*`, all `mcp__orchestra-probe__*`.
- Load orchestra MCP tools in a single batch: `ToolSearch query: "select:tree,write_system_yaml,upsert_local_yaml,upsert_features_yaml,claude_md,docs_readme"` (single round-trip).

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
